-- Separate immutable request history from active ownership; no release permission.
begin;
-- Quiesce callers before applying. DDL/backfill/function replacement are atomic.
alter table public.d1_issuance_sequences
    drop constraint d1_issuance_sequences_pkey,
    add primary key (request_id),
    add unique (namespace, request_id);
-- Keep017's request_id UNIQUE constraint:018/027/028 FKs depend on its index.
create table public.d1_active_issuance_sequences (
    namespace uuid primary key references public.d1_pools(namespace),
    request_id uuid unique not null,
    foreign key (namespace, request_id)
        references public.d1_issuance_sequences(namespace, request_id)
);
alter table public.d1_active_issuance_sequences enable row level security;
revoke all on table public.d1_active_issuance_sequences, public.d1_issuance_sequences
    from public, anon, authenticated, service_role;
-- No expiry filter: a deadline/unknown outcome never relinquishes ownership.
insert into public.d1_active_issuance_sequences (namespace, request_id)
    select namespace, request_id from public.d1_issuance_sequences;

create or replace function public.d1_reserve_issuance_sequence(
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
    if p_observed_account_sequence::numeric >= 9223372036854775807::numeric then
        raise exception 'invalid_issuance_sequence' using errcode = '22023';
    end if;
    v_observed := p_observed_account_sequence::bigint;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Same017 order: admin -> pool -> preparation/intent -> sequence ownership.
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
    -- Pool serialization protects absence. The composite FK binds owner to history.
    select s.* into v_previous from public.d1_active_issuance_sequences a
        join public.d1_issuance_sequences s
          on s.namespace = a.namespace and s.request_id = a.request_id
        where a.namespace = v_pool.namespace for update of a, s;
    if found and v_previous.request_id = p_request_id then
        if v_previous.receipt ->> 'observed_account_sequence' <> p_observed_account_sequence then
            raise exception 'issuance_sequence_conflict' using errcode = '23505';
        end if;
        return v_previous.receipt; -- Expired replay is evidence, not new permission.
    end if;
    -- Preserve FOUND and017's deadline-before-busy priority AFTER all lock waits.
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
    insert into public.d1_issuance_sequences (namespace, request_id, receipt)
        values (v_pool.namespace, p_request_id, v_receipt);
    insert into public.d1_active_issuance_sequences (namespace, request_id)
        values (v_pool.namespace, p_request_id);
    return v_receipt;
end;
$$;

create function public.d1_load_active_issuance_sequence(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt jsonb;
begin
    if p_namespace is null or not public.release_request_valid_key(p_authorized_by) then
        raise exception 'invalid_issuance_sequence' using errcode = '22023';
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Like existing loaders: stabilize current admin, then serialize even absence.
    perform 1 from public.d1_pools where namespace = p_namespace for update;
    if not found then
        raise exception 'pool_not_activated' using errcode = '22023';
    end if;
    select s.receipt into v_receipt from public.d1_active_issuance_sequences a
        join public.d1_issuance_sequences s
          on s.namespace = a.namespace and s.request_id = a.request_id
        where a.namespace = p_namespace for update of a, s;
    return v_receipt; -- Original receipt or SQL NULL; no clock/financial refresh.
end;
$$;
revoke all on function public.d1_reserve_issuance_sequence(uuid,text,text),
    public.d1_load_active_issuance_sequence(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_reserve_issuance_sequence(uuid,text,text),
    public.d1_load_active_issuance_sequence(uuid,text) to service_role;
comment on table public.d1_issuance_sequences is
    'Immutable request-keyed reservation history. Retains018/027/028 references and all-history fee accounting.';
comment on table public.d1_active_issuance_sequences is
    'Exclusive namespace owner bound to history. No TTL, release, retirement or reassignment API.';
comment on function public.d1_load_active_issuance_sequence(uuid,text) is
    'Current-admin service-role lookup of the original active reservation or NULL; never execution or refund authority.';
commit;
