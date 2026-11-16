-- LOCAL UNVERIFIED SOURCE: one-shot send ownership, NOT a POST or ledger proof.
begin;
create table public.d1_remainder_submission_attempts (
    request_id uuid primary key references public.d1_signed_remainder_transactions(request_id),
    namespace uuid not null references public.d1_remainder_candidates(namespace),
    snapshot_hash text not null,
    attempt_id uuid not null unique,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id),
    foreign key (request_id, snapshot_hash) references public.d1_remainder_financial_observations(request_id, snapshot_hash)
);
alter table public.d1_remainder_submission_attempts enable row level security;
revoke all on public.d1_remainder_submission_attempts from public, anon, authenticated, service_role;
create trigger d1_remainder_submission_immutable before update or delete on public.d1_remainder_submission_attempts
    for each row execute function public.d1_reject_remainder_execution_mutation();
create trigger d1_remainder_submission_no_truncate before truncate on public.d1_remainder_submission_attempts
    for each statement execute function public.d1_reject_remainder_execution_mutation();

create function public.d1_load_remainder_submission_attempt(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    journal jsonb; signed jsonb; evidence jsonb; expected jsonb;
    attempt public.d1_remainder_submission_attempts%rowtype;
begin
    --045 authenticates CURRENT actor and verifies033/040/041 plus historical A/claim/signed joins.
    journal := public.d1_load_remainder_signing_journal(p_request_id,p_authorized_by);
    signed := journal -> 'transaction';
    select * into attempt from public.d1_remainder_submission_attempts where request_id = p_request_id for update;
    if attempt.request_id is not null then
        evidence := public.d1_load_remainder_financial_observation(p_request_id,p_authorized_by,attempt.snapshot_hash) -> 'observation';
        expected := pg_catalog.jsonb_build_object('kind','d1_remainder_submission_attempt','revision',2,
            'request_id',p_request_id,'namespace',journal -> 'namespace','network','TESTNET','pool',journal -> 'pool',
            'authorized_by',attempt.receipt -> 'authorized_by','transaction_hash',signed -> 'transaction_hash',
            'envelope_sha256',signed -> 'envelope_sha256','snapshot_hash',attempt.snapshot_hash,
            'signing_nonce',signed -> 'signing_nonce','attempt_id',attempt.attempt_id,
            'claimed_at',attempt.receipt -> 'claimed_at','expires_at',evidence #> '{snapshot,expiresAt}');
        if (pg_catalog.jsonb_typeof(signed) = 'object' and attempt.namespace::text = journal ->> 'namespace'
            and attempt.receipt = expected and public.release_request_valid_key(attempt.receipt ->> 'authorized_by')
            and pg_catalog.jsonb_typeof(evidence) = 'object' and evidence #> '{snapshot,candidate}' = journal -> 'candidate'
            and evidence -> 'authorized_by' = attempt.receipt -> 'authorized_by'
            and pg_catalog.jsonb_typeof(attempt.receipt -> 'claimed_at') = 'number'
            and (attempt.receipt ->> 'claimed_at') ~ '^(0|[1-9][0-9]{0,11})$') is not true then
            raise exception 'remainder_submission_conflict' using errcode = '23505';
        end if;
        if (attempt.receipt ->> 'claimed_at')::numeric >= (attempt.receipt ->> 'expires_at')::numeric then
            raise exception 'remainder_submission_conflict' using errcode = '23505';
        end if;
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    -- Historical B is NOT revalidated for freshness or relabeled with the requesting actor.
    return pg_catalog.jsonb_build_object('kind','d1_remainder_submission_attempt_lookup','revision',2,
        'request_id',p_request_id,'namespace',journal -> 'namespace','network','TESTNET','pool',journal -> 'pool',
        'journal',journal,'attempt',attempt.receipt);
end;
$$;

create function public.d1_claim_remainder_submission_attempt(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text, p_attempt_nonce uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare lookup jsonb; journal jsonb; signed jsonb; evidence jsonb; receipt jsonb; inserted boolean;
begin
    lookup := public.d1_load_remainder_submission_attempt(p_request_id,p_authorized_by);
    if lookup -> 'attempt' <> 'null'::jsonb then
        -- Before ANY fresh argument validation: same nonce, crash, expiry or new admin NEVER regrants.
        return pg_catalog.jsonb_build_object('kind','d1_remainder_submission_claim','revision',2,
            'claimed',false,'attempt',lookup -> 'attempt');
    end if;
    if p_attempt_nonce is null then raise exception 'invalid_remainder_submission_attempt' using errcode = '22023'; end if;
    journal := lookup -> 'journal'; signed := journal -> 'transaction';
    if pg_catalog.jsonb_typeof(signed) is distinct from 'object' then
        raise exception 'd1_signed_remainder_not_found' using errcode = '22023';
    end if;
    -- B may differ from signing A. Authentic044 binds EXACT041 body, unsigned bytes and scope;
    --045 already bound signed bytes/envelope/signing nonce to the immutable A claim.
    evidence := public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    receipt := pg_catalog.jsonb_build_object('kind','d1_remainder_submission_attempt','revision',2,
        'request_id',p_request_id,'namespace',lookup -> 'namespace','network','TESTNET','pool',lookup -> 'pool',
        'authorized_by',p_authorized_by,'transaction_hash',signed -> 'transaction_hash',
        'envelope_sha256',signed -> 'envelope_sha256','snapshot_hash',p_snapshot_hash,
        'signing_nonce',signed -> 'signing_nonce','attempt_id',p_attempt_nonce,
        'claimed_at',pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint,
        'expires_at',evidence #> '{snapshot,expiresAt}');
    insert into public.d1_remainder_submission_attempts values
        (p_request_id,(lookup ->> 'namespace')::uuid,p_snapshot_hash,p_attempt_nonce,receipt)
        on conflict (attempt_id) do nothing;
    inserted := found;
    -- AFTER global uniqueness/index waits, even conflict: full043 SAME B/042/current actor/last clock.
    -- Expiry, drift or lost admin rolls back insertion; no later locks follow a positive check.
    perform public.d1_remainder_fresh_evidence_private(p_request_id,p_authorized_by,p_snapshot_hash,journal -> 'candidate');
    if not inserted then raise exception 'remainder_submission_conflict' using errcode = '23505'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_submission_claim','revision',2,'claimed',true,'attempt',receipt);
end;
$$;
revoke all on function public.d1_load_remainder_submission_attempt(uuid,text),
    public.d1_claim_remainder_submission_attempt(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_remainder_submission_attempt(uuid,text),
    public.d1_claim_remainder_submission_attempt(uuid,text,text,uuid) to service_role;
comment on table public.d1_remainder_submission_attempts is
    'Permanent one-shot v2 send ownership. No POST, inclusion, terminal, settlement, retry, TTL or release proof; nonces/bytes stay server-only.';
commit;
