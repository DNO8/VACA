-- Opaque backend-only signed-byte persistence, NOT SDK/signature/chain proof.
begin;
create table public.d1_signed_transactions (
    request_id uuid primary key references public.d1_unsigned_transactions(request_id),
    snapshot_hash text not null,
    receipt jsonb not null,
    foreign key (request_id, snapshot_hash)
        references public.d1_initial_financial_observations(request_id, snapshot_hash)
);
alter table public.d1_signed_transactions enable row level security;
revoke all on table public.d1_signed_transactions from public, anon, authenticated, service_role;

create function public.d1_load_signed_transaction(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lookup jsonb; v_transaction jsonb;
begin
    -- Reuse018: current admin -> pool -> preparation/intent -> owner/unsigned.
    -- The pool row serializes absent signed rows too, until transaction end.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    select receipt into v_transaction from public.d1_signed_transactions
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_signed_transaction_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace',
        'network','TESTNET','pool',v_lookup -> 'pool','transaction',v_transaction);
end;
$$;

create function public.d1_record_signed_transaction(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_signed_xdr text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_signed jsonb; v_previous jsonb; v_lookup jsonb; v_observation jsonb;
    v_fresh jsonb; v_bytes bytea; v_receipt jsonb;
begin
    -- Authenticate BEFORE payload validation, including historical replay.
    -- Reuse the signed loader rather than introducing another lock protocol.
    v_signed := public.d1_load_signed_transaction(p_request_id, p_authorized_by);
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$'
       or p_signed_xdr is null or pg_catalog.octet_length(p_signed_xdr) not between 1 and 65536
       or p_signed_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
        raise exception 'invalid_signed_transaction' using errcode = '22023';
    end if;
    v_bytes := pg_catalog.decode(p_signed_xdr, 'base64');
    -- Bound before decode; roundtrip rejects whitespace and noncanonical pad bits.
    -- Strip only encoder-generated LF, never normalize caller-supplied bytes.
    if pg_catalog.replace(pg_catalog.encode(v_bytes, 'base64'), E'\n', '') <> p_signed_xdr then
        raise exception 'invalid_signed_transaction' using errcode = '22023';
    end if;
    v_previous := v_signed -> 'transaction';
    if v_previous <> 'null'::jsonb then
        if v_previous ->> 'snapshot_hash' is distinct from p_snapshot_hash
           or v_previous ->> 'signed_xdr' is distinct from p_signed_xdr then
            raise exception 'signed_transaction_conflict' using errcode = '23505';
        end if;
        -- Immutable historical evidence: original actor survives rotation/expiry.
        -- This returns BEFORE new-write isolation/freshness, never new permission.
        return v_previous;
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'signed_transaction_isolation_required' using errcode = '25000';
    end if;
    -- Reentrant018 locks are already held; derive all scope and owner facts there.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    if v_lookup -> 'reservation' = 'null'::jsonb then
        raise exception 'd1_issuance_sequence_not_found' using errcode = '22023';
    end if;
    if v_lookup -> 'transaction' = 'null'::jsonb then
        raise exception 'd1_unsigned_transaction_not_found' using errcode = '22023';
    end if;
    v_observation := public.d1_load_initial_financial_observation(
        p_request_id, p_authorized_by, p_snapshot_hash) -> 'observation';
    if v_observation = 'null'::jsonb then
        raise exception 'd1_initial_financial_observation_not_found' using errcode = '22023';
    end if;
    -- MUST use029, not just028's historical hash replay.029 rechecks current
    -- owner/unsigned hash/fees/history/credits and clock AFTER all lock waits.
    -- Supplying the loaded original snapshot cannot create a different snapshot.
    v_fresh := public.d1_record_fresh_initial_financial_observation(
        p_request_id, p_authorized_by, v_observation -> 'snapshot');
    if v_fresh -> 'observation' is distinct from v_observation
       or v_fresh ->> 'snapshot_hash' is distinct from p_snapshot_hash then
        raise exception 'initial_financial_observation_conflict' using errcode = '23505';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_signed_transaction_journal','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',v_lookup #> '{transaction,transaction_hash}',
        'snapshot_hash',p_snapshot_hash,'signed_xdr',p_signed_xdr,
        'envelope_hash',pg_catalog.encode(pg_catalog.sha256(v_bytes),'hex'),
        'reservation',v_lookup -> 'reservation');
    insert into public.d1_signed_transactions values (p_request_id, p_snapshot_hash, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_signed_transaction(uuid,text)
    from public, anon, authenticated, service_role;
revoke all on function public.d1_record_signed_transaction(uuid,text,text,text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_signed_transaction(uuid,text) to service_role;
grant execute on function public.d1_record_signed_transaction(uuid,text,text,text) to service_role;
comment on table public.d1_signed_transactions is
    'Immutable backend-only opaque signed bytes and decoded-envelope SHA256. Not XDR/body/signature validation, chain proof or fresh execution permission. Never expose signed bytes over HTTP.';
commit;
