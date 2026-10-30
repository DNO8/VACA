-- NEW local Testnet request intent only. Requires 015; no signing or ledger writes.
begin;

create table public.d1_issuance_intents (
    request_id uuid primary key references public.d1_preparations(request_id),
    receipt jsonb not null
);
alter table public.d1_issuance_intents enable row level security;
revoke all on table public.d1_issuance_intents from public, anon, authenticated, service_role;

create function public.d1_register_issuance_intent(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_namespace uuid;
    v_pool public.d1_pools%rowtype;
    v_preparation public.d1_preparations%rowtype;
    v_receipt jsonb;
begin
    if p_request_id is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception 'invalid_issuance_intent' using errcode = '22023';
    end if;
    -- Current membership is required even for an expired, previously saved receipt.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Unlocked lookup only: never take a preparation lock before the pool lock.
    select namespace into v_namespace from public.d1_preparations where request_id = p_request_id;
    if not found then
        raise exception 'd1_preparation_not_found' using errcode = '22023';
    end if;
    -- Match 015's admin -> pool -> preparation/intent ordering. This serializes
    -- same-request creation, but is NOT Stellar source-sequence ownership.
    select * into strict v_pool from public.d1_pools where namespace = v_namespace for update;
    select * into strict v_preparation from public.d1_preparations
        where request_id = p_request_id and namespace = v_pool.namespace for share;
    select receipt into v_receipt from public.d1_issuance_intents where request_id = p_request_id;
    if found then
        return v_receipt;
    end if;
    if (v_preparation.input -> 'request' ->> 'deadline')::timestamptz <= pg_catalog.clock_timestamp() then
        raise exception 'deadline_expired' using errcode = '22023';
    end if;
    -- The Testnet invariant belongs to 015, never a caller-supplied network.
    -- Snapshot all persisted verified facts and the unchanged allocation receipt.
    v_receipt := pg_catalog.jsonb_build_object(
        'kind', 'd1_issuance_request_intent', 'revision', 1,
        'request_id', v_preparation.request_id, 'namespace', v_preparation.namespace,
        'network', 'TESTNET', 'pool', v_pool.pool,
        'preparation_input', v_preparation.input, 'preparation', v_preparation.receipt
    );
    insert into public.d1_issuance_intents values (p_request_id, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_register_issuance_intent(uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_register_issuance_intent(uuid, text) to service_role;
comment on table public.d1_issuance_intents is
    'Immutable request-intent evidence only. No signing authority, sequence, envelope, submission or ledger idempotency.';
commit;
