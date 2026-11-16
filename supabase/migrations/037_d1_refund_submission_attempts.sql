-- LOCAL UNVERIFIED SOURCE: private one-shot send ownership, NOT network/ledger proof.
begin;
create table public.d1_refund_submission_attempts (
    request_id uuid primary key references public.d1_signed_refund_transactions(request_id),
    namespace uuid not null,
    snapshot_hash text not null,
    attempt_id uuid not null unique,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id),
    foreign key (request_id, snapshot_hash)
        references public.d1_refund_financial_observations(request_id, snapshot_hash)
);
alter table public.d1_refund_submission_attempts enable row level security;
revoke all on public.d1_refund_submission_attempts from public, anon, authenticated, service_role;

create function public.d1_load_refund_submission_attempt(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_journal jsonb; v_attempt jsonb;
begin
    --036 ->034: current admin, pool, original initial history and033/034 context.
    -- Pool FOR UPDATE serializes missing attempts as well as existing rows.
    v_journal := public.d1_load_refund_signing_journal(p_request_id, p_authorized_by);
    -- Independent authorization: scoped evidence reads never authorize disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    select receipt into v_attempt from public.d1_refund_submission_attempts
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_refund_submission_attempt_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_journal -> 'namespace','network','TESTNET',
        'pool',v_journal -> 'pool','journal',v_journal,'attempt',v_attempt);
end;
$$;

create function public.d1_claim_refund_submission_attempt(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_journal jsonb; v_candidate jsonb; v_claim jsonb; v_signed jsonb;
    v_attempt jsonb; v_observation jsonb; v_fresh jsonb; v_now numeric;
begin
    -- Authenticate even historical acknowledgements, before metadata inspection.
    v_lookup := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
    -- Independently gate existing-attempt replay, validation and new send ownership.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    v_attempt := v_lookup -> 'attempt';
    if v_attempt <> 'null'::jsonb then
        -- ANY later call, including the original nonce, can NEVER send again.
        -- Return original immutable evidence, not a new grant or renewed expiry.
        return pg_catalog.jsonb_build_object('kind','d1_refund_submission_claim','revision',1,
            'claimed',false,'attempt',v_attempt);
    end if;
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' or p_attempt_id is null then
        raise exception 'invalid_refund_submission_attempt' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_submission_attempt_isolation_required' using errcode = '25000';
    end if;
    v_journal := v_lookup -> 'journal';
    v_candidate := v_journal -> 'candidate';
    v_claim := v_journal -> 'claim';
    v_signed := v_journal -> 'transaction';
    if v_candidate is null or v_candidate = 'null'::jsonb
       or v_claim is null or v_claim = 'null'::jsonb
       or v_signed is null or v_signed = 'null'::jsonb then
        raise exception 'd1_signed_refund_transaction_not_found' using errcode = '22023';
    end if;
    if v_claim ->> 'kind' is distinct from 'd1_refund_signing_attempt'
       or v_claim -> 'revision' is distinct from '1'::jsonb
       or v_signed ->> 'kind' is distinct from 'd1_signed_refund_transaction'
       or v_signed -> 'revision' is distinct from '1'::jsonb
       or v_signed -> 'request_id' is distinct from v_lookup -> 'request_id'
       or v_signed -> 'namespace' is distinct from v_lookup -> 'namespace'
       or v_signed -> 'network' is distinct from v_lookup -> 'network'
       or v_signed -> 'pool' is distinct from v_lookup -> 'pool'
       or v_claim -> 'request_id' is distinct from v_signed -> 'request_id'
       or v_claim -> 'namespace' is distinct from v_signed -> 'namespace'
       or v_claim -> 'network' is distinct from v_signed -> 'network'
       or v_claim -> 'pool' is distinct from v_signed -> 'pool'
       or v_claim -> 'authorized_by' is distinct from v_signed -> 'authorized_by'
       or v_claim -> 'transaction_hash' is distinct from v_signed -> 'transaction_hash'
       or v_claim -> 'financial_snapshot_hash' is distinct from v_signed -> 'financial_snapshot_hash'
       or v_claim -> 'signing_nonce' is distinct from v_signed -> 'signing_nonce'
       or v_signed -> 'transaction_hash' is distinct from v_candidate -> 'transaction_hash'
       or coalesce(v_signed ->> 'envelope_hash','') !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(v_signed -> 'signed_xdr') is distinct from 'string'
       or pg_catalog.octet_length(v_signed ->> 'signed_xdr') not between 4 and 65536 then
        raise exception 'refund_submission_attempt_conflict' using errcode = '23505';
    end if;
    if pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(v_signed ->> 'signed_xdr','base64')),'hex')
       is distinct from v_signed ->> 'envelope_hash' then
        raise exception 'refund_submission_attempt_conflict' using errcode = '23505';
    end if;
    v_observation := public.d1_load_refund_financial_observation(
        p_request_id, p_authorized_by, p_snapshot_hash) -> 'observation';
    if v_observation is null or v_observation = 'null'::jsonb then
        raise exception 'd1_refund_financial_observation_not_found' using errcode = '22023';
    end if;
    -- Fresh B may differ from signing A; NEVER renew A or change its signed bytes.
    --035 rechecks current admin/BOTH owners/full027/history/credits/money/clock.
    v_fresh := public.d1_record_refund_financial_observation(
        p_request_id, p_authorized_by, v_observation -> 'snapshot');
    if v_fresh is distinct from v_observation
       or v_fresh ->> 'snapshot_hash' is distinct from p_snapshot_hash
       or v_fresh -> 'transaction_hash' is distinct from v_signed -> 'transaction_hash'
       or v_fresh #> '{snapshot,funding,creationObservation,observation,candidate}' is distinct from v_candidate then
        raise exception 'refund_submission_attempt_conflict' using errcode = '23505';
    end if;
    v_now := extract(epoch from pg_catalog.clock_timestamp());
    if v_now >= (v_fresh ->> 'expires_at')::numeric then
        raise exception 'refund_financial_observation_expired' using errcode = '22023';
    end if;
    v_attempt := pg_catalog.jsonb_build_object('kind','d1_refund_submission_attempt','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',v_signed -> 'transaction_hash','envelope_hash',v_signed -> 'envelope_hash',
        'snapshot_hash',p_snapshot_hash,'signing_nonce',v_signed -> 'signing_nonce',
        'attempt_id',p_attempt_id,'claimed_at',pg_catalog.floor(v_now)::bigint,'expires_at',v_fresh -> 'expires_at');
    -- Handle ONLY global nonce uniqueness, never swallow other constraint failures.
    insert into public.d1_refund_submission_attempts values
        (p_request_id,(v_lookup ->> 'namespace')::uuid,p_snapshot_hash,p_attempt_id,v_attempt)
        on conflict (attempt_id) do nothing;
    if not found then
        raise exception 'refund_submission_attempt_conflict' using errcode = '23505';
    end if;
    -- A contender in ANOTHER pool can delay the unique index insert above.
    -- Revalidate after that wait; rejection rolls back the entire new attempt.
    v_fresh := public.d1_record_refund_financial_observation(
        p_request_id, p_authorized_by, v_observation -> 'snapshot');
    if v_fresh is distinct from v_observation then
        raise exception 'refund_submission_attempt_conflict' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_refund_submission_claim','revision',1,
        'claimed',true,'attempt',v_attempt);
end;
$$;
revoke all on function public.d1_load_refund_submission_attempt(uuid,text),
    public.d1_claim_refund_submission_attempt(uuid,text,text,uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_submission_attempt(uuid,text),
    public.d1_claim_refund_submission_attempt(uuid,text,text,uuid) to service_role;
comment on table public.d1_refund_submission_attempts is
    'Immutable one-shot send ownership, not broadcast, inclusion, payment, failure, release or settlement evidence. Lost acknowledgement holds; no retry/TTL/reset/replan API. Internal nonces never public HTTP.';
commit;
