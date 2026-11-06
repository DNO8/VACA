-- Opaque refund bytes and subordinate ownership, NOT financial/signing authority.
begin;
create table public.d1_refund_candidates (
    request_id uuid primary key references public.d1_unsigned_transactions(request_id),
    namespace uuid not null,
    receipt jsonb not null,
    unique (namespace, request_id),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id)
);
create table public.d1_active_refund_sequences (
    namespace uuid primary key references public.d1_pools(namespace),
    request_id uuid unique not null,
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id)
);
alter table public.d1_refund_candidates enable row level security;
alter table public.d1_active_refund_sequences enable row level security;
revoke all on table public.d1_refund_candidates, public.d1_active_refund_sequences
    from public, anon, authenticated, service_role;

create function public.d1_load_refund_candidate(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_candidate jsonb; v_active uuid;
begin
    --032 ->031 ->030 ->018: inherited guards, admin -> pool -> immutable history.
    v_scope := public.d1_load_issuance_outcome(p_request_id, p_authorized_by);
    perform public.d1_load_active_issuance_sequence((v_scope ->> 'namespace')::uuid, p_authorized_by);
    -- Pool FOR UPDATE serializes absent rows; history precedes subordinate owner.
    select receipt into v_candidate from public.d1_refund_candidates
        where request_id = p_request_id for update;
    select request_id into v_active from public.d1_active_refund_sequences
        where namespace = (v_scope ->> 'namespace')::uuid for update;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_refund_candidate_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_scope -> 'namespace','network','TESTNET',
        'pool',v_scope -> 'pool','candidate',v_candidate,'active_request_id',v_active);
end;
$$;

create function public.d1_record_refund_candidate(
    p_request_id uuid, p_authorized_by text, p_unsigned_xdr text, p_transaction_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_unsigned jsonb; v_reservation jsonb; v_parent jsonb;
    v_previous jsonb; v_outcome jsonb; v_source text; v_deadline text; v_receipt jsonb;
begin
    -- Authenticate first, preserving018's invalid request/actor error priorities.
    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    if p_unsigned_xdr is null or pg_catalog.octet_length(p_unsigned_xdr) not between 4 and 65536
       or p_unsigned_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
       or p_transaction_hash is null or p_transaction_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_refund_candidate' using errcode = '22023';
    end if;
    -- Bound before decode; remove encoder-generated LF only, never caller bytes.
    if pg_catalog.replace(pg_catalog.encode(pg_catalog.decode(p_unsigned_xdr,'base64'),'base64'), E'\n','') <> p_unsigned_xdr then
        raise exception 'invalid_refund_candidate' using errcode = '22023';
    end if;
    -- Use the persisted018 journal's reservation, not merely lookup ownership.
    v_unsigned := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by) -> 'transaction';
    v_reservation := v_unsigned -> 'reservation';
    if v_reservation is null or v_reservation = 'null'::jsonb then
        raise exception 'd1_issuance_sequence_not_found' using errcode = '22023';
    end if;
    v_parent := public.d1_load_active_issuance_sequence((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    if v_parent ->> 'request_id' is distinct from p_request_id::text then
        raise exception 'issuance_source_not_owned' using errcode = '55000';
    end if;
    if v_lookup -> 'active_request_id' <> 'null'::jsonb
       and v_lookup ->> 'active_request_id' <> p_request_id::text then
        raise exception 'refund_source_busy' using errcode = '55000';
    end if;
    v_previous := v_lookup -> 'candidate';
    if v_previous <> 'null'::jsonb then
        if v_previous ->> 'unsigned_xdr' <> p_unsigned_xdr
           or v_previous ->> 'transaction_hash' <> p_transaction_hash then
            raise exception 'refund_candidate_conflict' using errcode = '23505';
        end if;
        -- A retired active row must NEVER be recreated by historical replay.
        if v_lookup ->> 'active_request_id' is distinct from p_request_id::text then
            raise exception 'refund_source_busy' using errcode = '55000';
        end if;
        return v_previous; -- Original authorizer/bytes, even under RR/Serializable.
    end if;
    v_outcome := public.d1_load_issuance_outcome(p_request_id, p_authorized_by) -> 'outcome';
    if v_outcome is null or v_outcome = 'null'::jsonb then
        raise exception 'd1_issuance_outcome_not_found' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_candidate_isolation_required' using errcode = '25000';
    end if;
    --032 already binds success OR failed inclusion to031/030 and immutable017.
    v_source := v_reservation ->> 'transaction_sequence';
    if v_source is null or v_source !~ '^[1-9][0-9]{0,18}$'
       or v_outcome #>> '{observed_outcome,observation,sequence}' is distinct from v_source then
        raise exception 'invalid_refund_sequence' using errcode = '22023';
    end if;
    if v_source::numeric >= 9223372036854775807::numeric then
        raise exception 'invalid_refund_sequence' using errcode = '22023';
    end if;
    v_deadline := v_reservation #>> '{intent,preparation_input,request,deadline}';
    -- All dependent locks are held; recheck current membership and wall clock now.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    if pg_catalog.clock_timestamp() < v_deadline::timestamptz then
        raise exception 'refund_deadline_not_reached' using errcode = '22023';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_refund_candidate','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'initial_transaction_hash',v_outcome -> 'transaction_hash','initial_outcome_hash',v_outcome -> 'outcome_hash',
        'source_sequence',v_source,'transaction_sequence',(v_source::bigint + 1)::text,
        'deadline',v_deadline,'unsigned_xdr',p_unsigned_xdr,'transaction_hash',p_transaction_hash);
    insert into public.d1_refund_candidates (request_id, namespace, receipt)
        values (p_request_id,(v_lookup ->> 'namespace')::uuid,v_receipt);
    insert into public.d1_active_refund_sequences (namespace, request_id)
        values ((v_lookup ->> 'namespace')::uuid,p_request_id);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_refund_candidate(uuid,text),
    public.d1_record_refund_candidate(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_candidate(uuid,text),
    public.d1_record_refund_candidate(uuid,text,text,text) to service_role;
comment on table public.d1_refund_candidates is
    'Immutable opaque refund candidate history, not SDK validation, eligibility, financial authorization or settlement.';
comment on table public.d1_active_refund_sequences is
    'Exclusive subordinate owner; initial033 remains held. No release, expiry, reactivation, reassignment or retry API.';
commit;
