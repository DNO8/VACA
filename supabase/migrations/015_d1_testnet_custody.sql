-- NEW local implementation, not original source recovery. Requires retained 014
-- and 20261011060218. No live application or pool activation is authorized.
begin;

create table public.d1_pools (
    namespace uuid primary key,
    pool text unique not null,
    first_ledger bigint not null check (first_ledger > 0)
);
create table public.d1_preparations (
    request_id uuid primary key references public.release_requests(request_id),
    namespace uuid not null references public.d1_pools(namespace),
    input jsonb not null,
    receipt jsonb not null
);
-- No alternative money counters: all capacity remains in the recovered tables.
alter table public.d1_pools enable row level security;
alter table public.d1_preparations enable row level security;
revoke all on table public.d1_pools, public.d1_preparations
    from public, anon, authenticated, service_role;

create function public.d1_activate_pool(p_namespace uuid, p_pool text, p_first_ledger bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_pool public.d1_pools%rowtype;
begin
    if p_namespace is null or not public.release_request_valid_key(p_pool)
       or p_first_ledger is null or p_first_ledger <= 0 then
        raise exception 'invalid_activation' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vaca.d1.activation', 0));
    select * into v_pool from public.d1_pools where namespace = p_namespace or pool = p_pool;
    if found then
        if v_pool.namespace <> p_namespace or v_pool.pool <> p_pool or v_pool.first_ledger <> p_first_ledger then
            raise exception 'activation_conflict' using errcode = '23505';
        end if;
    else
        -- A pool known to legacy accounting cannot become a D1 pool.
        if exists (select 1 from public.donation_payments where payment ->> 'pool' = p_pool) then
            raise exception 'historical_pool' using errcode = '22023';
        end if;
        insert into public.d1_pools values (p_namespace, p_pool, p_first_ledger);
    end if;
    return pg_catalog.jsonb_build_object('namespace', p_namespace, 'pool', p_pool, 'first_ledger', p_first_ledger);
end;
$$;

create function public.d1_prepare(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_payment jsonb;
    v_request jsonb;
    v_id uuid;
    v_admin text;
    v_pool public.d1_pools%rowtype;
    v_previous public.d1_preparations%rowtype;
    v_allocation jsonb;
    v_receipt jsonb;
    v_confirmed bigint;
    v_ledger bigint;
begin
    if pg_catalog.jsonb_typeof(p_input) is distinct from 'object' then
        raise exception 'invalid_preparation' using errcode = '22023';
    end if;
    if not (p_input ?& array['request_id','authorized_by','payment','request','confirmed_at','ledger','memo_hash'])
       or p_input - array['request_id','authorized_by','payment','request','confirmed_at','ledger','memo_hash'] <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(p_input -> 'request_id') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_input -> 'authorized_by') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_input -> 'confirmed_at') is distinct from 'number'
       or pg_catalog.jsonb_typeof(p_input -> 'ledger') is distinct from 'number'
       or (p_input ->> 'confirmed_at') !~ '^[1-9][0-9]{0,10}$'
       or (p_input ->> 'ledger') !~ '^[1-9][0-9]{0,10}$' then
        raise exception 'invalid_preparation' using errcode = '22023';
    end if;
    v_id := (p_input ->> 'request_id')::uuid;
    v_admin := p_input ->> 'authorized_by';
    if not public.release_request_valid_key(v_admin) then
        raise exception 'invalid_preparation' using errcode = '22023';
    end if;
    perform 1 from public.admin_wallets where public_key = v_admin for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    v_payment := public.donation_payment_content(p_input -> 'payment');
    v_request := public.release_request_content(p_input -> 'request');
    -- Stabilize activation and serialize local D1 preparations per pool. This is
    -- NOT a Stellar sequence lock and must not be used as an issuance guarantee.
    select * into v_pool from public.d1_pools where pool = v_payment ->> 'pool' for update;
    if not found then
        raise exception 'pool_not_activated' using errcode = '22023';
    end if;
    v_confirmed := (p_input ->> 'confirmed_at')::bigint;
    v_ledger := (p_input ->> 'ledger')::bigint;
    if v_ledger < v_pool.first_ledger or pg_catalog.to_timestamp(v_confirmed) > pg_catalog.clock_timestamp() then
        raise exception 'payment_before_activation' using errcode = '22023';
    end if;
    if p_input -> 'memo_hash' is distinct from pg_catalog.to_jsonb(pg_catalog.encode(pg_catalog.sha256(
           pg_catalog.convert_to('vaca.d1.donation.v1' || E'\n' || (v_request ->> 'incident_id'), 'UTF8')), 'hex'))
       or v_request ->> 'deadline' <> pg_catalog.to_char(
           pg_catalog.to_timestamp(v_confirmed + 300) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') then
        raise exception 'payment_binding_mismatch' using errcode = '22023';
    end if;
    select * into v_previous from public.d1_preparations where request_id = v_id;
    if found then
        if v_previous.input <> p_input then
            raise exception 'idempotency_conflict' using errcode = '23505';
        end if;
        return v_previous.receipt;
    end if;
    -- Refuse adoption of existing reservations, including historical UUIDs.
    if exists (select 1 from public.release_requests where request_id = v_id) then
        raise exception 'historical_request' using errcode = '23505';
    end if;
    -- A payment already present must belong to a previous D1 preparation.
    if exists (select 1 from public.donation_payments
               where transaction_hash = v_payment ->> 'transaction_hash' and operation_id = v_payment ->> 'operation_id')
       and not exists (select 1 from public.d1_preparations
               where input -> 'payment' = v_payment and namespace = v_pool.namespace
                 and input -> 'confirmed_at' = p_input -> 'confirmed_at'
                 and input -> 'ledger' = p_input -> 'ledger'
                 and input -> 'memo_hash' = p_input -> 'memo_hash') then
        raise exception 'historical_payment' using errcode = '23505';
    end if;
    perform public.reserve_release_request(v_id, v_admin, v_request);
    v_allocation := public.allocate_donation_to_release_request(v_id, v_admin, v_payment, v_pool.pool);
    v_receipt := pg_catalog.jsonb_build_object('revision', 1, 'state', 'allocated',
        'request_id', v_id, 'allocation', v_allocation);
    insert into public.d1_preparations values (v_id, v_pool.namespace, p_input, v_receipt);
    return v_receipt;
end;
$$;

revoke all on function public.d1_activate_pool(uuid, text, bigint), public.d1_prepare(jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_activate_pool(uuid, text, bigint), public.d1_prepare(jsonb) to service_role;
comment on table public.d1_preparations is
    'Local preparation only, not issued balances, signed intents, refunds or proof of ledger consensus.';
commit;
