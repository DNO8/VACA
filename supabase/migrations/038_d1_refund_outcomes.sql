-- LOCAL UNVERIFIED SOURCE: positive historical membership, NOT SDK/terminal authority.
begin;
create table public.d1_refund_outcomes (
    request_id uuid primary key references public.d1_signed_refund_transactions(request_id),
    namespace uuid not null,
    attempt_id uuid not null references public.d1_refund_submission_attempts(attempt_id),
    transaction_hash text not null,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (request_id) references public.d1_unsigned_transactions(request_id),
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id),
    foreign key (namespace, transaction_hash) references public.d1_transaction_records(namespace, transaction_hash)
);
alter table public.d1_refund_outcomes enable row level security;
revoke all on public.d1_refund_outcomes from public, anon, authenticated, service_role;

create function public.d1_load_refund_outcome(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_receipt jsonb;
begin
    --037 ->036 ->034 ->032 ->018: current admin, pool, initial history,
    --033/034 owners, signing and send journals, then this outcome row.
    v_scope := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
    -- Independent authorization: scoped evidence reads never authorize outcome disclosure.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    select receipt into v_receipt from public.d1_refund_outcomes
        where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_refund_outcome_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_scope -> 'namespace','network','TESTNET',
        'pool',v_scope -> 'pool','outcome',v_receipt);
end;
$$;

create function public.d1_record_refund_outcome(
    p_request_id uuid, p_authorized_by text, p_observed_outcome jsonb, p_history_state jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_receipt jsonb; v_scope jsonb; v_journal jsonb; v_candidate jsonb;
    v_claim jsonb; v_signed jsonb; v_attempt jsonb; v_unsigned jsonb; v_initial jsonb;
    v_prepared jsonb; v_original jsonb; v_record jsonb; v_history jsonb; v_incoming jsonb;
    v_initial_record jsonb; v_key text; v_value jsonb; v_balance jsonb;
begin
    -- Authentication and existing lock order precede even historical replay.
    v_lookup := public.d1_load_refund_outcome(p_request_id, p_authorized_by);
    -- Independently gate exact replay, validation and new outcome evidence.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    v_receipt := v_lookup -> 'outcome';
    if v_receipt <> 'null'::jsonb then
        if v_receipt -> 'observed_outcome' is distinct from p_observed_outcome
           or v_receipt -> 'history_state' is distinct from p_history_state then
            raise exception 'refund_outcome_conflict' using errcode = '23505';
        end if;
        return v_receipt; -- Original actor, exact stored bytes, no fresh authority.
    end if;
    if pg_catalog.jsonb_typeof(p_observed_outcome) is distinct from 'object'
       or pg_catalog.octet_length(p_observed_outcome::text) > 262144
       or pg_catalog.jsonb_typeof(p_history_state) is distinct from 'object'
       or pg_catalog.octet_length(p_history_state::text) > 1048576 then
        raise exception 'invalid_refund_outcome' using errcode = '22023';
    end if;
    if (p_observed_outcome ?& array['kind','revision','observation','originalPayment','outcome','donorRefundedAmount','claimedBalanceId']
        and p_observed_outcome - array['kind','revision','observation','originalPayment','outcome','donorRefundedAmount','claimedBalanceId'] = '{}'
        and p_observed_outcome ->> 'kind' = 'd1_refund_outcome'
        and p_observed_outcome -> 'revision' = '1'::jsonb
        and pg_catalog.jsonb_typeof(p_observed_outcome -> 'observation') = 'object'
        and p_observed_outcome ->> 'outcome' in ('success','failed')
        and pg_catalog.jsonb_typeof(p_observed_outcome -> 'donorRefundedAmount') = 'string') is not true then
        raise exception 'invalid_refund_outcome' using errcode = '22023';
    end if;
    v_original := p_observed_outcome -> 'originalPayment';
    if (pg_catalog.jsonb_typeof(v_original) = 'object'
        and v_original ?& array['donor','asset','grossAmount','confirmedAt']
        and v_original - array['donor','asset','grossAmount','confirmedAt'] = '{}'
        and public.release_request_valid_key(v_original ->> 'donor')
        and pg_catalog.jsonb_typeof(v_original -> 'grossAmount') = 'string'
        and (v_original ->> 'grossAmount') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and pg_catalog.jsonb_typeof(v_original -> 'confirmedAt') = 'string'
        and (v_original ->> 'confirmedAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$') is not true then
        raise exception 'invalid_refund_outcome' using errcode = '22023';
    end if;
    if (v_original ->> 'grossAmount')::numeric <= 0
       or (v_original ->> 'grossAmount')::numeric * 10000000 > 9223372036854775807 then
        raise exception 'invalid_refund_outcome' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_outcome_isolation_required' using errcode = '25000';
    end if;
    v_scope := public.d1_load_refund_submission_attempt(p_request_id, p_authorized_by);
    v_journal := v_scope -> 'journal'; v_candidate := v_journal -> 'candidate';
    v_claim := v_journal -> 'claim'; v_signed := v_journal -> 'transaction'; v_attempt := v_scope -> 'attempt';
    if v_candidate is null or v_candidate = 'null'::jsonb or v_claim is null or v_claim = 'null'::jsonb
       or v_signed is null or v_signed = 'null'::jsonb or v_attempt is null or v_attempt = 'null'::jsonb then
        raise exception 'd1_refund_submission_attempt_not_found' using errcode = '22023';
    end if;
    v_unsigned := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by) -> 'transaction';
    v_initial := public.d1_load_issuance_outcome(p_request_id, p_authorized_by) -> 'outcome';
    v_prepared := v_unsigned #> '{reservation,intent,preparation_input}';
    -- Same024/025 history lock protocol; no035 money/clock/replanner call.
    v_history := public.d1_load_transaction_history_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    if v_history is distinct from p_history_state
       or v_history -> 'coverage_complete' is distinct from 'true'::jsonb
       or pg_catalog.jsonb_typeof(v_history -> 'checkpoint') is distinct from 'object' then
        raise exception 'refund_outcome_history_conflict' using errcode = '23505';
    end if;
    select record into v_record from public.d1_transaction_records
        where namespace = (v_lookup ->> 'namespace')::uuid and transaction_hash = v_candidate ->> 'transaction_hash';
    if not found then raise exception 'd1_transaction_observation_not_found' using errcode = '22023'; end if;
    select record into v_incoming from public.d1_transaction_records
        where namespace = (v_lookup ->> 'namespace')::uuid and transaction_hash = v_prepared #>> '{payment,transaction_hash}';
    select record into v_initial_record from public.d1_transaction_records
        where namespace = (v_lookup ->> 'namespace')::uuid and transaction_hash = v_initial ->> 'transaction_hash';
    foreach v_key in array array['request_id','namespace','network','pool','transaction_hash','signing_nonce'] loop
        if v_claim -> v_key is distinct from v_signed -> v_key
           or v_attempt -> v_key is distinct from v_signed -> v_key then
            raise exception 'refund_outcome_conflict' using errcode = '23505';
        end if;
    end loop;
    foreach v_key in array array['request_id','namespace','network','pool','transaction_hash'] loop
        if v_signed -> v_key is distinct from v_candidate -> v_key then
            raise exception 'refund_outcome_conflict' using errcode = '23505';
        end if;
    end loop;
    foreach v_key in array array['transaction_hash','initial_transaction_hash','initial_outcome_hash'] loop
        v_value := v_candidate -> v_key;
        if pg_catalog.jsonb_typeof(v_value) is distinct from 'string' or coalesce(v_value #>> '{}','') !~ '^[0-9a-f]{64}$' then
            raise exception 'invalid_refund_outcome' using errcode = '22023';
        end if;
    end loop;
    if v_claim -> 'authorized_by' is distinct from v_signed -> 'authorized_by'
       or v_claim -> 'financial_snapshot_hash' is distinct from v_signed -> 'financial_snapshot_hash'
       or v_signed -> 'envelope_hash' is distinct from v_attempt -> 'envelope_hash'
       or v_signed ->> 'envelope_hash' is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(v_signed ->> 'signed_xdr','base64')),'hex')
       or v_unsigned -> 'transaction_hash' is distinct from v_candidate -> 'initial_transaction_hash'
       or v_initial -> 'transaction_hash' is distinct from v_candidate -> 'initial_transaction_hash'
       or v_initial -> 'outcome_hash' is distinct from v_candidate -> 'initial_outcome_hash'
       or v_initial #> '{observed_outcome,observation}' is distinct from v_initial_record
       or v_incoming is null or v_initial_record is null
       or v_incoming -> 'ledger' is distinct from v_prepared -> 'ledger'
       or v_incoming -> 'closedAt' is distinct from v_prepared -> 'confirmed_at'
       or v_unsigned #> '{reservation,transaction_sequence}' is distinct from v_candidate -> 'source_sequence'
       or v_initial_record -> 'sequence' is distinct from v_candidate -> 'source_sequence'
       or v_unsigned -> 'deadline' is distinct from v_candidate -> 'deadline'
       or v_prepared #> '{request,deadline}' is distinct from v_candidate -> 'deadline'
       or v_prepared ->> 'request_id' is distinct from p_request_id::text
       or v_prepared #> '{payment,pool}' is distinct from v_lookup -> 'pool'
       or v_original -> 'donor' is distinct from v_prepared #> '{payment,donor}'
       or v_original -> 'asset' is distinct from v_prepared #> '{payment,asset}'
       or v_original -> 'grossAmount' is distinct from v_prepared #> '{payment,amount}'
       or v_original ->> 'confirmedAt' is distinct from pg_catalog.to_char(pg_catalog.to_timestamp((v_prepared ->> 'confirmed_at')::double precision) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
       or extract(epoch from (v_candidate ->> 'deadline')::timestamptz) <> (v_prepared ->> 'confirmed_at')::numeric + 300
       or p_observed_outcome -> 'observation' is distinct from v_record
       or p_observed_outcome -> 'outcome' is distinct from v_record -> 'outcome'
       or v_record -> 'transactionHash' is distinct from v_candidate -> 'transaction_hash'
       or v_record #> '{context,pool}' is distinct from v_lookup -> 'pool'
       or v_record -> 'source' is distinct from v_lookup -> 'pool'
       or v_record -> 'feePayer' is distinct from v_lookup -> 'pool'
       or v_record -> 'sequence' is distinct from v_candidate -> 'transaction_sequence'
       or v_record -> 'envelopeXdr' is distinct from v_signed -> 'signed_xdr'
       or (v_record ->> 'ledger')::numeric > (v_history #>> '{checkpoint,through_ledger}')::numeric
       or (v_record ->> 'pagingToken')::numeric > (v_history #>> '{checkpoint,cursor}')::numeric
       or v_record #> '{context,firstLedger}' is distinct from v_history -> 'first_ledger'
       or (v_record #>> '{context,anchor,sequence}')::numeric > (v_history #>> '{checkpoint,through_ledger}')::numeric
       or (v_record #>> '{context,anchor,closedAt}')::numeric > (v_history #>> '{checkpoint,closed_at}')::numeric
       or ((v_record #> '{context,anchor,sequence}') = v_history #> '{checkpoint,through_ledger}'
           and (v_record #> '{context,anchor,hash}' is distinct from v_history #> '{checkpoint,ledger_hash}'
             or v_record #> '{context,anchor,closedAt}' is distinct from v_history #> '{checkpoint,closed_at}'))
       or (v_record ->> 'closedAt')::numeric < extract(epoch from (v_candidate ->> 'deadline')::timestamptz) then
        raise exception 'refund_outcome_conflict' using errcode = '23505';
    end if;
    v_balance := v_initial #> '{observed_outcome,claimableBalanceId}';
    if (case when v_balance = 'null'::jsonb then
            v_record -> 'operationTypes' = '[1]'::jsonb and v_record -> 'poolOperationSourceIndices' = '[0]'::jsonb
        else v_record -> 'operationTypes' = '[15,1]'::jsonb and v_record -> 'poolOperationSourceIndices' = '[0,1]'::jsonb end
        and ((p_observed_outcome ->> 'outcome' = 'success'
            and p_observed_outcome -> 'donorRefundedAmount' = v_original -> 'grossAmount'
            and p_observed_outcome -> 'claimedBalanceId' = v_balance)
          or (p_observed_outcome ->> 'outcome' = 'failed'
            and p_observed_outcome ->> 'donorRefundedAmount' = '0.0000000'
            and p_observed_outcome -> 'claimedBalanceId' = 'null'::jsonb))) is not true then
        raise exception 'refund_outcome_conflict' using errcode = '23505';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_refund_outcome_journal','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool',
        'authorized_by',p_authorized_by,'attempt_id',v_attempt -> 'attempt_id','signing_nonce',v_signed -> 'signing_nonce',
        'transaction_hash',v_candidate -> 'transaction_hash','envelope_hash',v_signed -> 'envelope_hash',
        'initial_transaction_hash',v_candidate -> 'initial_transaction_hash','initial_outcome_hash',v_candidate -> 'initial_outcome_hash',
        'outcome_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_observed_outcome::text,'UTF8')),'hex'),
        'observed_outcome',p_observed_outcome,'history_state',p_history_state);
    insert into public.d1_refund_outcomes values
        (p_request_id,(v_lookup ->> 'namespace')::uuid,(v_attempt ->> 'attempt_id')::uuid,v_candidate ->> 'transaction_hash',v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_refund_outcome(uuid,text), public.d1_record_refund_outcome(uuid,text,jsonb,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_outcome(uuid,text), public.d1_record_refund_outcome(uuid,text,jsonb,jsonb) to service_role;
comment on table public.d1_refund_outcomes is
    'Immutable positive included-history membership only. NOT SDK/consensus truth, settlement, discharge, zero outstanding, release or retry authority. Fees remain separate;033/034 owners remain held.';
commit;
