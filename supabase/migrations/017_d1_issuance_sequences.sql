-- Local Testnet source ownership only. Requires 015/016; no ledger operations.
begin;

create table public.d1_issuance_sequences (
    namespace uuid primary key references public.d1_pools(namespace),
    request_id uuid unique not null references public.d1_issuance_intents(request_id),
    receipt jsonb not null
);
alter table public.d1_issuance_sequences enable row level security;
revoke all on table public.d1_issuance_sequences from public, anon, authenticated, service_role;

create function public.d1_reserve_issuance_sequence(
    p_request_id uuid, p_authorized_by text, p_observed_account_sequence text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_namespace uuid;
    v_pool public.d1_pools%rowtype;
    v_preparation public.d1_preparations%rowtype;
    v_intent jsonb;
    v_previous public.d1_issuance_sequences%rowtype;
    v_observed bigint;
    v_receipt jsonb;
begin
    if p_request_id is null or not public.release_request_valid_key(p_authorized_by)
       or p_observed_account_sequence is null
       or p_observed_account_sequence !~ '^(0|[1-9][0-9]{0,18})$' then
        raise exception 'invalid_issuance_sequence' using errcode = '22023';
    end if;
    -- Bounded decimal text before casting; numeric comparison avoids bigint overflow.
    -- Match the planner: observed < signed int64 max, leaving room for next sequence.
    if p_observed_account_sequence::numeric >= 9223372036854775807::numeric then
        raise exception 'invalid_issuance_sequence' using errcode = '22023';
    end if;
    v_observed := p_observed_account_sequence::bigint;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Unlocked lookup only; preserve admin -> pool -> preparation/intent -> sequence.
    select namespace into v_namespace from public.d1_preparations where request_id = p_request_id;
    if not found then
        raise exception 'd1_preparation_not_found' using errcode = '22023';
    end if;
    select * into strict v_pool from public.d1_pools where namespace = v_namespace for update;
    select * into strict v_preparation from public.d1_preparations
        where request_id = p_request_id and namespace = v_pool.namespace for share;
    select receipt into v_intent from public.d1_issuance_intents
        where request_id = p_request_id for share;
    if not found then
        raise exception 'd1_issuance_intent_not_found' using errcode = '22023';
    end if;
    select * into v_previous from public.d1_issuance_sequences
        where namespace = v_pool.namespace for update;
    if found and v_previous.request_id = p_request_id then
        if v_previous.receipt ->> 'observed_account_sequence' <> p_observed_account_sequence then
            raise exception 'issuance_sequence_conflict' using errcode = '23505';
        end if;
        -- Expired replay is immutable evidence, never authority to plan/sign/submit.
        return v_previous.receipt;
    end if;
    -- Check DB time AFTER every lock wait; deadlines never release existing ownership.
    if (v_preparation.input -> 'request' ->> 'deadline')::timestamptz <= pg_catalog.clock_timestamp() then
        raise exception 'deadline_expired' using errcode = '22023';
    end if;
    if found then
        raise exception 'issuance_source_busy' using errcode = '55000';
    end if;
    v_receipt := pg_catalog.jsonb_build_object(
        'kind', 'd1_issuance_sequence_reservation', 'revision', 1,
        'request_id', p_request_id, 'namespace', v_pool.namespace,
        'network', 'TESTNET', 'pool', v_pool.pool,
        'observed_account_sequence', p_observed_account_sequence,
        'transaction_sequence', (v_observed + 1)::text, 'intent', v_intent
    );
    insert into public.d1_issuance_sequences values (v_pool.namespace, p_request_id, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_reserve_issuance_sequence(uuid, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_reserve_issuance_sequence(uuid, text, text) to service_role;
comment on table public.d1_issuance_sequences is
    'Exclusive immutable Testnet source ownership. No TTL/release/reassignment, consensus proof or ledger idempotency.';
commit;
