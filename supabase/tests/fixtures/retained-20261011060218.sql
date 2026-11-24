-- T03.3 LOCAL SOURCE ONLY: not applied or runtime-verified.
-- Backend-declared payment facts, not Horizon consensus or wallet-signature proof.
create table public.donation_payments (
    transaction_hash text not null,
    operation_id text not null,
    payment jsonb not null,
    donation_stroops bigint not null check (donation_stroops > 0),
    allocated_stroops bigint not null default 0,
    primary key (transaction_hash, operation_id),
    check (allocated_stroops >= 0 and allocated_stroops <= donation_stroops)
);
create table public.donation_allocations (
    request_id uuid primary key references public.release_requests(request_id),
    authorized_by text not null,
    transaction_hash text not null,
    operation_id text not null,
    allocated_stroops bigint not null check (allocated_stroops > 0),
    allocated_at timestamptz(3) not null default pg_catalog.clock_timestamp(),
    foreign key (transaction_hash, operation_id)
        references public.donation_payments(transaction_hash, operation_id)
);
alter table public.donation_payments owner to postgres;
alter table public.donation_allocations owner to postgres;
alter table public.donation_payments enable row level security;
alter table public.donation_allocations enable row level security;
-- ALL includes inherited mutation/TRUNCATE/REFERENCES/TRIGGER privileges.
revoke all on table public.donation_payments, public.donation_allocations
    from public, anon, authenticated, service_role;
grant select on table public.donation_payments, public.donation_allocations to service_role;

create function public.donation_payment_content(p_payment jsonb)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
    v_field text;
begin
    if pg_catalog.jsonb_typeof(p_payment) is distinct from 'object' then
        raise exception 'invalid_donation_payment' using errcode = '22023';
    end if;
    if not (p_payment ?& array['transaction_hash','operation_id','donor','pool','asset','amount'])
       or p_payment - array['transaction_hash','operation_id','donor','pool','asset','amount'] <> '{}'::jsonb then
        raise exception 'invalid_donation_payment' using errcode = '22023';
    end if;
    foreach v_field in array array['transaction_hash','operation_id','donor','pool','amount'] loop
        if pg_catalog.jsonb_typeof(p_payment -> v_field) is distinct from 'string' then
            raise exception 'invalid_donation_payment' using errcode = '22023';
        end if;
    end loop;
    if (p_payment ->> 'transaction_hash') collate pg_catalog."C" !~ '^[0-9a-f]{64}$'
       or (p_payment ->> 'operation_id') collate pg_catalog."C" !~ '^[1-9][0-9]{0,18}$' then
        raise exception 'invalid_donation_payment' using errcode = '22023';
    end if;
    if (p_payment ->> 'operation_id')::numeric > 9223372036854775807 then
        raise exception 'invalid_donation_payment' using errcode = '22023';
    end if;
    -- Reuse immutable 014 validators privately without altering their grants.
    -- The synthetic object is validation only, never a reservation or TTL default.
    begin
        perform public.release_request_content(pg_catalog.jsonb_build_object(
            'version', 1, 'incident_id', 'donation-validation',
            'donor', p_payment -> 'donor', 'beneficiary', p_payment -> 'pool',
            'asset', p_payment -> 'asset', 'amount', p_payment -> 'amount',
            'deadline', '2000-01-01T00:00:00Z'
        ));
    exception when sqlstate '22023' then
        raise exception 'invalid_donation_payment' using errcode = '22023';
    end;
    return p_payment;
end;
$$;
alter function public.donation_payment_content(jsonb) owner to postgres;
revoke all on function public.donation_payment_content(jsonb) from public, anon, authenticated, service_role;

create function public.allocate_donation_to_release_request(
    p_request_id uuid, p_authorized_by text, p_payment jsonb, p_expected_pool text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_payment jsonb;
    v_request public.release_requests%rowtype;
    v_existing public.donation_allocations%rowtype;
    v_paid public.donation_payments%rowtype;
    v_requested bigint;
begin
    if p_request_id is null or not public.release_request_valid_key(p_authorized_by)
       or not public.release_request_valid_key(p_expected_pool) then
        raise exception 'invalid_donation_binding' using errcode = '22023';
    end if;
    v_payment := public.donation_payment_content(p_payment);
    if v_payment ->> 'pool' <> p_expected_pool then
        raise exception 'donation_pool_mismatch' using errcode = '22023';
    end if;
    -- Always lock the existing request before any payment lock; never create one.
    select * into v_request from public.release_requests r
        where r.request_id = p_request_id for update;
    if not found then
        raise exception 'release_request_not_found' using errcode = '22023';
    end if;
    -- Share lock stabilizes current membership until transaction completion.
    perform 1 from public.admin_wallets a where a.public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    if v_request.authorized_by <> p_authorized_by then
        raise exception 'donation_binding_conflict' using errcode = '23505';
    end if;
    perform public.release_request_content(v_request.request);
    v_requested := ((v_request.request ->> 'amount')::numeric * 10000000)::bigint;
    select * into v_existing from public.donation_allocations a where a.request_id = p_request_id;
    if found then
        select * into strict v_paid from public.donation_payments p
            where p.transaction_hash = v_existing.transaction_hash and p.operation_id = v_existing.operation_id;
        if v_existing.authorized_by <> p_authorized_by or v_paid.payment <> v_payment
           or v_existing.allocated_stroops <> v_requested then
            raise exception 'donation_binding_conflict' using errcode = '23505';
        end if;
        -- Replay precedes new temporal eligibility. No aggregate counter in reply.
    else
        if (v_request.request ->> 'deadline')::timestamptz <= pg_catalog.clock_timestamp() then
            raise exception 'deadline_expired' using errcode = '22023';
        end if;
        if v_request.request ->> 'donor' <> v_payment ->> 'donor'
           or v_request.request -> 'asset' <> v_payment -> 'asset' then
            raise exception 'donation_request_mismatch' using errcode = '22023';
        end if;
        insert into public.donation_payments(transaction_hash, operation_id, payment, donation_stroops)
            values (v_payment ->> 'transaction_hash', v_payment ->> 'operation_id', v_payment,
                    ((v_payment ->> 'amount')::numeric * 10000000)::bigint)
            on conflict (transaction_hash, operation_id) do nothing;
        select * into strict v_paid from public.donation_payments p
            where p.transaction_hash = v_payment ->> 'transaction_hash'
              and p.operation_id = v_payment ->> 'operation_id' for update;
        if v_paid.payment <> v_payment then
            raise exception 'donation_payment_conflict' using errcode = '23505';
        end if;
        -- Actual row mutation, not SUM-only snapshot validation. NUMERIC avoids
        -- bigint overflow at int64 boundary. Repeatable Read conflict may raise
        -- 40001; propagate, never convert to success or silently retry.
        update public.donation_payments p
            set allocated_stroops = (p.allocated_stroops::numeric + v_requested::numeric)::bigint
            where p.transaction_hash = v_paid.transaction_hash and p.operation_id = v_paid.operation_id
              and p.allocated_stroops::numeric + v_requested::numeric <= p.donation_stroops::numeric;
        if not found then
            raise exception 'donation_capacity_exceeded' using errcode = '22023';
        end if;
        insert into public.donation_allocations(request_id, authorized_by, transaction_hash, operation_id, allocated_stroops)
            values (p_request_id, p_authorized_by, v_paid.transaction_hash, v_paid.operation_id, v_requested)
            returning * into v_existing;
    end if;
    -- Any raised error rolls back the function statement, counter and link together.
    return pg_catalog.jsonb_build_object(
        'reservation', pg_catalog.jsonb_build_object(
            'request_id', v_request.request_id, 'authorized_by', v_request.authorized_by,
            'request', v_request.request, 'state', v_request.state,
            'reserved_at', pg_catalog.to_char(v_request.reserved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
        'payment', v_paid.payment, 'allocated_amount', v_request.request ->> 'amount',
        'state', 'allocated',
        'allocated_at', pg_catalog.to_char(v_existing.allocated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
end;
$$;
alter function public.allocate_donation_to_release_request(uuid, text, jsonb, text) owner to postgres;
revoke all on function public.allocate_donation_to_release_request(uuid, text, jsonb, text)
    from public, anon, authenticated, service_role;
grant execute on function public.allocate_donation_to_release_request(uuid, text, jsonb, text) to service_role;
comment on table public.donation_payments is
    'Private immutable backend payment facts with atomic capacity counter; not chain or wallet proof.';
comment on table public.donation_allocations is
    'One immutable allocation per request. No cascading deletion, expiry freeing, signing or refunds.';
