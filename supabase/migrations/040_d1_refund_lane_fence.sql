-- LOCAL UNVERIFIED SOURCE: permanent ownership only, never spending permission.
begin;
-- Maintenance/quiesced installation required. Drain admin/pool users BEFORE
-- locking journals, avoiding a pool-owner waiting on our journal DDL lock.
lock table public.admin_wallets, public.d1_pools in access exclusive mode;
lock table public.d1_refund_candidates, public.d1_refund_signing_attempts,
    public.d1_signed_refund_transactions, public.d1_refund_submission_attempts
    in access exclusive mode;
create table public.d1_refund_lane_fences (
    namespace uuid primary key references public.d1_pools(namespace),
    request_id uuid not null references public.d1_unsigned_transactions(request_id),
    lane text not null check (lane in ('full_gross_v1','verified_remainder_v2')),
    candidate_hash text not null check (candidate_hash ~ '^[0-9a-f]{64}$'),
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id)
        references public.d1_issuance_sequences(namespace, request_id)
);
alter table public.d1_refund_lane_fences enable row level security;
revoke all on public.d1_refund_lane_fences from public, anon, authenticated, service_role;

-- Private shared implementation: no caller may choose a lane via an RPC grant.
create function public.d1_acquire_refund_lane_fence_private(
    p_namespace uuid, p_request_id uuid, p_authorized_by text,
    p_candidate_hash text, p_lane text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_owner jsonb; v_previous public.d1_refund_lane_fences%rowtype; v_receipt jsonb;
begin
    --032 ->031 ->030 ->018: admitted actor -> pool FOR UPDATE -> history.
    -- Later readers admit service scopes; callers must enforce write authority.
    -- These private helpers remain ungranted to all API roles.
    v_scope := public.d1_load_issuance_outcome(p_request_id, p_authorized_by);
    if p_namespace is distinct from (v_scope ->> 'namespace')::uuid
       or p_candidate_hash is null or p_candidate_hash !~ '^[0-9a-f]{64}$'
       or p_lane is null or p_lane not in ('full_gross_v1','verified_remainder_v2') then
        raise exception 'invalid_refund_lane_fence' using errcode = '22023';
    end if;
    v_owner := public.d1_load_active_issuance_sequence(p_namespace, p_authorized_by);
    if v_owner ->> 'request_id' is distinct from p_request_id::text then
        raise exception 'issuance_source_not_owned' using errcode = '55000';
    end if;
    select * into v_previous from public.d1_refund_lane_fences
        where namespace = p_namespace for update;
    if found then
        if v_previous.request_id is distinct from p_request_id
           or v_previous.lane is distinct from p_lane
           or v_previous.candidate_hash is distinct from p_candidate_hash then
            raise exception 'refund_lane_fence_conflict' using errcode = '23505';
        end if;
        return v_previous.receipt; -- Authenticated historical read, NOT authority.
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_lane_fence_isolation_required' using errcode = '25000';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_refund_lane_fence','revision',1,
        'namespace',p_namespace,'request_id',p_request_id,'network','TESTNET',
        'pool',v_scope -> 'pool','authorized_by',p_authorized_by,
        'lane',p_lane,'candidate_hash',p_candidate_hash);
    insert into public.d1_refund_lane_fences values
        (p_namespace,p_request_id,p_lane,p_candidate_hash,v_receipt);
    return v_receipt;
end;
$$;

-- Future verified-candidate SECURITY DEFINER RPC must derive these arguments
-- from its actual DB scope and SDK-verified candidate, never a caller actor DTO.
create function public.d1_acquire_verified_remainder_fence_private(
    p_namespace uuid, p_request_id uuid, p_authorized_by text, p_candidate_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
    return public.d1_acquire_refund_lane_fence_private(
        p_namespace,p_request_id,p_authorized_by,p_candidate_hash,'verified_remainder_v2');
end;
$$;

create function public.d1_guard_legacy_refund_lane_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_candidate jsonb; v_scope jsonb; v_actor text; v_hash text;
begin
    -- All four actual tables have NEW.request_id, NEW.namespace, NEW.receipt.
    -- The receipt actor is the current RPC actor (037 may differ from signer).
    v_actor := new.receipt ->> 'authorized_by';
    v_scope := public.d1_load_issuance_outcome(new.request_id, v_actor);
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_lane_fence_isolation_required' using errcode = '25000';
    end if;
    if new.namespace is distinct from (v_scope ->> 'namespace')::uuid
       or new.receipt ->> 'request_id' is distinct from new.request_id::text
       or new.receipt ->> 'namespace' is distinct from new.namespace::text
       or new.receipt ->> 'network' is distinct from 'TESTNET'
       or new.receipt -> 'pool' is distinct from v_scope -> 'pool' then
        raise exception 'invalid_refund_lane_fence' using errcode = '22023';
    end if;
    if tg_table_name = 'd1_refund_candidates' then
        v_candidate := new.receipt;
    else
        -- Never source a signing/send candidate hash from a caller parameter.
        select receipt into v_candidate from public.d1_refund_candidates
            where namespace = new.namespace and request_id = new.request_id for update;
    end if;
    v_hash := v_candidate ->> 'transaction_hash';
    if v_hash is null or new.receipt ->> 'transaction_hash' is distinct from v_hash then
        raise exception 'refund_lane_fence_conflict' using errcode = '23505';
    end if;
    perform public.d1_acquire_refund_lane_fence_private(
        new.namespace,new.request_id,v_actor,v_hash,'full_gross_v1');
    return new;
end;
$$;
create trigger d1_candidate_lane_fence before insert on public.d1_refund_candidates
    for each row execute function public.d1_guard_legacy_refund_lane_insert();
create trigger d1_signing_lane_fence before insert on public.d1_refund_signing_attempts
    for each row execute function public.d1_guard_legacy_refund_lane_insert();
create trigger d1_signed_lane_fence before insert on public.d1_signed_refund_transactions
    for each row execute function public.d1_guard_legacy_refund_lane_insert();
create trigger d1_submission_lane_fence before insert on public.d1_refund_submission_attempts
    for each row execute function public.d1_guard_legacy_refund_lane_insert();

-- Backfill creates NEW records only. No historical actor needs current membership.
-- All candidates count, not just the active/latest candidate; ambiguity aborts.
do $$
begin
    if exists (select namespace from public.d1_refund_candidates
        group by namespace having count(*) > 1) then
        raise exception 'refund_lane_fence_history_conflict' using errcode = '23505';
    end if;
    if exists (
        select 1 from public.d1_refund_candidates c
        join public.d1_pools p on p.namespace = c.namespace
        where c.receipt ->> 'request_id' is distinct from c.request_id::text
           or c.receipt ->> 'namespace' is distinct from c.namespace::text
           or c.receipt ->> 'network' is distinct from 'TESTNET'
           or c.receipt ->> 'pool' is distinct from p.pool
           or coalesce(c.receipt ->> 'transaction_hash','') !~ '^[0-9a-f]{64}$'
           or not coalesce(public.release_request_valid_key(c.receipt ->> 'authorized_by'),false)
    ) then
        raise exception 'invalid_refund_lane_fence_history' using errcode = '22023';
    end if;
end;
$$;
insert into public.d1_refund_lane_fences (namespace,request_id,lane,candidate_hash,receipt)
    select c.namespace,c.request_id,'full_gross_v1',c.receipt ->> 'transaction_hash',
        pg_catalog.jsonb_build_object('kind','d1_refund_lane_fence','revision',1,
            'namespace',c.namespace,'request_id',c.request_id,'network','TESTNET',
            'pool',c.receipt -> 'pool','authorized_by',c.receipt -> 'authorized_by',
            'lane','full_gross_v1','candidate_hash',c.receipt -> 'transaction_hash')
    from public.d1_refund_candidates c;

create function public.d1_reject_refund_lane_fence_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    raise exception 'refund_lane_fence_immutable' using errcode = '55000';
end;
$$;
create trigger d1_refund_lane_fence_immutable before update or delete
    on public.d1_refund_lane_fences for each row
    execute function public.d1_reject_refund_lane_fence_mutation();
create trigger d1_refund_lane_fence_no_truncate before truncate
    on public.d1_refund_lane_fences for each statement
    execute function public.d1_reject_refund_lane_fence_mutation();

create function public.d1_load_refund_lane_fence(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_fence jsonb;
begin
    v_scope := public.d1_load_issuance_outcome(p_request_id,p_authorized_by);
    select receipt into v_fence from public.d1_refund_lane_fences
        where namespace = (v_scope ->> 'namespace')::uuid;
    -- Namespace lookup may show another original request; never relabel it.
    return pg_catalog.jsonb_build_object('kind','d1_refund_lane_fence_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_scope -> 'namespace','network','TESTNET',
        'pool',v_scope -> 'pool','fence',v_fence);
end;
$$;
revoke all on function public.d1_acquire_refund_lane_fence_private(uuid,uuid,text,text,text),
    public.d1_acquire_verified_remainder_fence_private(uuid,uuid,text,text),
    public.d1_guard_legacy_refund_lane_insert(), public.d1_reject_refund_lane_fence_mutation(),
    public.d1_load_refund_lane_fence(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_lane_fence(uuid,text) to service_role;
comment on table public.d1_refund_lane_fences is
    'Permanent cross-lane namespace ownership. No release, expiry, reassignment, retry or financial/signing/send authority.';
commit;
