-- Opaque included-result evidence, NOT SDK approval or terminal accounting.
begin;
create table public.d1_issuance_outcomes (
    request_id uuid primary key references public.d1_submission_attempts(request_id),
    attempt_id uuid not null references public.d1_submission_attempts(attempt_id),
    receipt jsonb not null
);
alter table public.d1_issuance_outcomes enable row level security;
revoke all on table public.d1_issuance_outcomes from public, anon, authenticated, service_role;

create function public.d1_load_issuance_outcome(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_receipt jsonb;
begin
    --031 ->030 ->018 authenticates and serializes the pool/owner even if absent.
    v_scope := public.d1_load_submission_attempt(p_request_id, p_authorized_by);
    select receipt into v_receipt from public.d1_issuance_outcomes
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_issuance_outcome_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_scope -> 'namespace','network','TESTNET',
        'pool',v_scope -> 'pool','outcome',v_receipt);
end;
$$;

create function public.d1_record_issuance_outcome(
    p_request_id uuid, p_authorized_by text, p_observed_outcome jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_receipt jsonb; v_attempt jsonb; v_signed jsonb; v_record jsonb;
begin
    v_lookup := public.d1_load_issuance_outcome(p_request_id, p_authorized_by);
    v_receipt := v_lookup -> 'outcome';
    if v_receipt <> 'null'::jsonb then
        if v_receipt -> 'observed_outcome' is distinct from p_observed_outcome then
            raise exception 'issuance_outcome_conflict' using errcode = '23505';
        end if;
        return v_receipt; -- Original actor; historical evidence, never permission.
    end if;
    if pg_catalog.jsonb_typeof(p_observed_outcome) is distinct from 'object'
       or pg_catalog.octet_length(p_observed_outcome::text) > 1048576 then
        raise exception 'invalid_issuance_outcome' using errcode = '22023';
    end if;
    if (p_observed_outcome ?& array['kind','revision','observation','outcome','claimableBalanceId']
        and p_observed_outcome - array['kind','revision','observation','outcome','claimableBalanceId'] = '{}'
        and p_observed_outcome ->> 'kind' = 'd1_initial_issuance_outcome'
        and p_observed_outcome -> 'revision' = '1'::jsonb
        and pg_catalog.jsonb_typeof(p_observed_outcome -> 'observation') = 'object'
        and ((p_observed_outcome ->> 'outcome' = 'success'
            and pg_catalog.jsonb_typeof(p_observed_outcome -> 'claimableBalanceId') = 'string'
            and (p_observed_outcome ->> 'claimableBalanceId') ~ '^00000000[0-9a-f]{64}$')
          or (p_observed_outcome ->> 'outcome' = 'failed'
            and p_observed_outcome -> 'claimableBalanceId' = 'null'::jsonb))) is not true then
        raise exception 'invalid_issuance_outcome' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'issuance_outcome_isolation_required' using errcode = '25000';
    end if;
    v_attempt := public.d1_load_submission_attempt(p_request_id, p_authorized_by) -> 'attempt';
    if v_attempt = 'null'::jsonb then
        raise exception 'd1_submission_attempt_not_found' using errcode = '22023';
    end if;
    v_signed := public.d1_load_signed_transaction(p_request_id, p_authorized_by) -> 'transaction';
    -- Pool lock is shared with024 ingestion. Stored records cannot be rewritten.
    select record into v_record from public.d1_transaction_records
        where namespace = (v_lookup ->> 'namespace')::uuid
          and transaction_hash = v_attempt ->> 'transaction_hash';
    if not found then
        raise exception 'd1_transaction_observation_not_found' using errcode = '22023';
    end if;
    if v_signed -> 'transaction_hash' is distinct from v_attempt -> 'transaction_hash'
       or v_signed -> 'envelope_hash' is distinct from v_attempt -> 'envelope_hash'
       or v_signed -> 'reservation' is distinct from v_attempt -> 'reservation'
       or p_observed_outcome -> 'observation' is distinct from v_record
       or p_observed_outcome -> 'outcome' is distinct from v_record -> 'outcome'
       or v_record -> 'context' -> 'pool' is distinct from v_lookup -> 'pool'
       or v_record -> 'source' is distinct from v_lookup -> 'pool'
       or v_record -> 'feePayer' is distinct from v_lookup -> 'pool'
       or v_record -> 'sequence' is distinct from v_attempt #> '{reservation,transaction_sequence}'
       or v_record -> 'envelopeXdr' is distinct from v_signed -> 'signed_xdr'
       or v_record -> 'operationTypes' is distinct from '[14]'::jsonb
       or v_record -> 'poolOperationSourceIndices' is distinct from '[0]'::jsonb then
        raise exception 'issuance_outcome_conflict' using errcode = '23505';
    end if;
    -- No clock/fresh-spending call: recording a past result may legitimately be late.
    -- Opaque SQL checks do NOT verify signatures, deterministic CB IDs or consensus.
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_issuance_outcome_journal','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','authorized_by',p_authorized_by,'attempt_id',v_attempt -> 'attempt_id',
        'transaction_hash',v_attempt -> 'transaction_hash','envelope_hash',v_attempt -> 'envelope_hash',
        'outcome_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_observed_outcome::text,'UTF8')),'hex'),
        'observed_outcome',p_observed_outcome);
    insert into public.d1_issuance_outcomes values (p_request_id,(v_attempt ->> 'attempt_id')::uuid,v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_issuance_outcome(uuid,text)
    from public, anon, authenticated, service_role;
revoke all on function public.d1_record_issuance_outcome(uuid,text,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_issuance_outcome(uuid,text) to service_role;
grant execute on function public.d1_record_issuance_outcome(uuid,text,jsonb) to service_role;
comment on table public.d1_issuance_outcomes is
    'Immutable opaque observation bound to031 attempt,030 bytes and024 record. NOT SDK/consensus proof, financial settlement, release, refund or retry authority.';
commit;
