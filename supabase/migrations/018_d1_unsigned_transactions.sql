-- Local opaque unsigned-byte journal. Requires 015-017; no Stellar validation.
begin;

create table public.d1_unsigned_transactions (
    request_id uuid primary key references public.d1_issuance_sequences(request_id),
    receipt jsonb not null
);
alter table public.d1_unsigned_transactions enable row level security;
revoke all on table public.d1_unsigned_transactions from public, anon, authenticated, service_role;

create function public.d1_load_unsigned_transaction(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_namespace uuid;
    v_pool public.d1_pools%rowtype;
    v_reservation jsonb;
    v_transaction jsonb;
begin
    if p_request_id is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception 'invalid_unsigned_transaction' using errcode = '22023';
    end if;
    -- Always authenticate current membership, even for missing/expired evidence.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Unlocked discovery only; preserve admin -> pool -> preparation/intent ->
    -- sequence -> journal ordering. Pool serialization also protects absent rows.
    select namespace into v_namespace from public.d1_preparations where request_id = p_request_id;
    if not found then
        raise exception 'd1_preparation_not_found' using errcode = '22023';
    end if;
    select * into strict v_pool from public.d1_pools where namespace = v_namespace for update;
    perform 1 from public.d1_preparations
        where request_id = p_request_id and namespace = v_pool.namespace for share;
    perform 1 from public.d1_issuance_intents where request_id = p_request_id for share;
    -- A prepared request can legitimately have no intent or owned reservation.
    select receipt into v_reservation from public.d1_issuance_sequences
        where namespace = v_pool.namespace and request_id = p_request_id for update;
    select receipt into v_transaction from public.d1_unsigned_transactions
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object(
        'kind', 'd1_unsigned_transaction_lookup', 'revision', 1,
        'request_id', p_request_id, 'namespace', v_pool.namespace,
        'network', 'TESTNET', 'pool', v_pool.pool,
        'reservation', v_reservation, 'transaction', v_transaction
    );
end;
$$;

create function public.d1_save_unsigned_transaction(
    p_request_id uuid, p_authorized_by text, p_unsigned_xdr text, p_transaction_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_previous jsonb;
    v_reservation jsonb;
    v_deadline text;
    v_receipt jsonb;
begin
    -- Shape only: max 65536 Base64 characters (49152 decoded bytes), no whitespace.
    -- Bound before decode; roundtrip rejects noncanonical pad bits. PostgreSQL's
    -- Base64 encoder inserts LF every 76 characters; remove ONLY those encoder LFs.
    if p_unsigned_xdr is null or pg_catalog.octet_length(p_unsigned_xdr) not between 4 and 65536
       or p_unsigned_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
       or p_transaction_hash is null or p_transaction_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_unsigned_transaction' using errcode = '22023';
    end if;
    if pg_catalog.replace(pg_catalog.encode(pg_catalog.decode(p_unsigned_xdr, 'base64'), 'base64'), E'\n', '')
       <> p_unsigned_xdr then
        raise exception 'invalid_unsigned_transaction' using errcode = '22023';
    end if;
    -- Reuse the complete lookup authorization, derivation and lock protocol.
    -- These locks survive the nested function until the caller's transaction ends.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    v_reservation := v_lookup -> 'reservation';
    if v_reservation = 'null'::jsonb then
        raise exception 'd1_issuance_sequence_not_found' using errcode = '22023';
    end if;
    v_previous := v_lookup -> 'transaction';
    if v_previous <> 'null'::jsonb then
        if v_previous ->> 'unsigned_xdr' <> p_unsigned_xdr
           or v_previous ->> 'transaction_hash' <> p_transaction_hash then
            raise exception 'unsigned_transaction_conflict' using errcode = '23505';
        end if;
        return v_previous; -- Expired replay is evidence, never signing authority.
    end if;
    select input -> 'request' ->> 'deadline' into strict v_deadline
        from public.d1_preparations where request_id = p_request_id;
    -- First write must still be eligible AFTER all lock waits, including journal.
    if v_deadline::timestamptz <= pg_catalog.clock_timestamp() then
        raise exception 'deadline_expired' using errcode = '22023';
    end if;
    v_receipt := pg_catalog.jsonb_build_object(
        'kind', 'd1_unsigned_transaction_journal', 'revision', 1,
        'request_id', p_request_id, 'namespace', v_lookup -> 'namespace',
        'network', 'TESTNET', 'pool', v_lookup -> 'pool', 'deadline', v_deadline,
        'transaction_sequence', v_reservation -> 'transaction_sequence',
        'reservation', v_reservation, 'unsigned_xdr', p_unsigned_xdr,
        'transaction_hash', p_transaction_hash
    );
    insert into public.d1_unsigned_transactions values (p_request_id, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_unsigned_transaction(uuid, text)
    from public, anon, authenticated, service_role;
revoke all on function public.d1_save_unsigned_transaction(uuid, text, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_unsigned_transaction(uuid, text) to service_role;
grant execute on function public.d1_save_unsigned_transaction(uuid, text, text, text) to service_role;
comment on table public.d1_unsigned_transactions is
    'Immutable opaque unsigned bytes/hash shape and stored bindings only. No XDR semantics, hash verification, signing or ledger proof.';
commit;
