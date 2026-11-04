-- Private one-shot submission acknowledgement, NOT broadcast or ledger evidence.
begin;
create table public.d1_submission_attempts (
    request_id uuid primary key references public.d1_signed_transactions(request_id),
    attempt_id uuid not null unique,
    receipt jsonb not null
);
alter table public.d1_submission_attempts enable row level security;
revoke all on table public.d1_submission_attempts from public, anon, authenticated, service_role;

create function public.d1_load_submission_attempt(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lookup jsonb; v_attempt jsonb;
begin
    --030 ->018: current admin, pool, preparation/intent, owner, unsigned, signed.
    -- Pool serialization protects absent attempts as well as existing rows.
    v_lookup := public.d1_load_signed_transaction(p_request_id, p_authorized_by);
    select receipt into v_attempt from public.d1_submission_attempts
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_submission_attempt_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace',
        'network','TESTNET','pool',v_lookup -> 'pool','attempt',v_attempt);
end;
$$;

create function public.d1_claim_submission_attempt(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_attempt jsonb; v_unsigned jsonb; v_signed jsonb;
    v_observation jsonb; v_fresh jsonb; v_now numeric;
begin
    -- Authenticate before inspecting even NULL metadata or historical receipts.
    v_lookup := public.d1_load_submission_attempt(p_request_id, p_authorized_by);
    v_attempt := v_lookup -> 'attempt';
    if v_attempt <> 'null'::jsonb then
        -- Never rearm: ANY subsequent call acknowledges only the original row.
        -- Return before new-write validation, isolation and freshness checks.
        return pg_catalog.jsonb_build_object('kind','d1_submission_claim','revision',1,
            'claimed',false,'attempt',v_attempt);
    end if;
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' or p_attempt_id is null then
        raise exception 'invalid_submission_attempt' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'submission_attempt_isolation_required' using errcode = '25000';
    end if;
    v_signed := public.d1_load_signed_transaction(p_request_id, p_authorized_by) -> 'transaction';
    if v_signed = 'null'::jsonb then
        raise exception 'd1_signed_transaction_not_found' using errcode = '22023';
    end if;
    v_unsigned := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    if v_signed -> 'request_id' is distinct from v_lookup -> 'request_id'
       or v_signed -> 'namespace' is distinct from v_lookup -> 'namespace'
       or v_signed -> 'network' is distinct from v_lookup -> 'network'
       or v_signed -> 'pool' is distinct from v_lookup -> 'pool'
       or v_signed -> 'transaction_hash' is distinct from v_unsigned #> '{transaction,transaction_hash}'
       or v_signed -> 'reservation' is distinct from v_unsigned -> 'reservation' then
        raise exception 'initial_financial_observation_conflict' using errcode = '23505';
    end if;
    v_observation := public.d1_load_initial_financial_observation(
        p_request_id, p_authorized_by, p_snapshot_hash) -> 'observation';
    if v_observation = 'null'::jsonb then
        raise exception 'd1_initial_financial_observation_not_found' using errcode = '22023';
    end if;
    -- Snapshot B may differ from signed A;029 binds B to the SAME current unsigned
    -- transaction, owner and fees, rechecking history/credits/deadline after locks.
    v_fresh := public.d1_record_fresh_initial_financial_observation(
        p_request_id, p_authorized_by, v_observation -> 'snapshot');
    if v_fresh -> 'observation' is distinct from v_observation
       or v_fresh ->> 'snapshot_hash' is distinct from p_snapshot_hash then
        raise exception 'initial_financial_observation_conflict' using errcode = '23505';
    end if;
    v_now := extract(epoch from pg_catalog.clock_timestamp());
    if v_now >= (v_fresh ->> 'expires_at')::numeric then
        raise exception 'initial_financial_observation_expired' using errcode = '22023';
    end if;
    v_attempt := pg_catalog.jsonb_build_object('kind','d1_submission_attempt','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',v_signed -> 'transaction_hash','envelope_hash',v_signed -> 'envelope_hash',
        'snapshot_hash',p_snapshot_hash,'attempt_id',p_attempt_id,
        'claimed_at',pg_catalog.floor(v_now)::bigint,'reservation',v_unsigned -> 'reservation');
    -- Handle ONLY global nonce uniqueness, never swallow unrelated failures.
    insert into public.d1_submission_attempts values (p_request_id, p_attempt_id, v_attempt)
        on conflict (attempt_id) do nothing;
    if not found then
        raise exception 'submission_attempt_conflict' using errcode = '23505';
    end if;
    -- A unique-index contender can itself wait. Roll back even that insertion if
    -- its acknowledgement would be expired; never leave an expired first claim.
    if extract(epoch from pg_catalog.clock_timestamp()) >= (v_fresh ->> 'expires_at')::numeric then
        raise exception 'initial_financial_observation_expired' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_submission_claim','revision',1,
        'claimed',true,'attempt',v_attempt);
end;
$$;
revoke all on function public.d1_load_submission_attempt(uuid,text)
    from public, anon, authenticated, service_role;
revoke all on function public.d1_claim_submission_attempt(uuid,text,text,uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_submission_attempt(uuid,text) to service_role;
grant execute on function public.d1_claim_submission_attempt(uuid,text,text,uuid) to service_role;
comment on table public.d1_submission_attempts is
    'Immutable one-shot private claim, not broadcast, confirmation, failure or CB proof. Unknown acknowledgement retains ownership; no retry, reset or release permission.';
commit;
