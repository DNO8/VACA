-- LOCAL UNVERIFIED SOURCE: immutable positive membership, NOT SDK or settlement authority.
begin;
create table public.d1_remainder_outcomes (
    request_id uuid primary key references public.d1_signed_remainder_transactions(request_id),
    namespace uuid not null,
    attempt_id uuid not null unique references public.d1_remainder_submission_attempts(attempt_id),
    transaction_hash text not null,
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id),
    foreign key (namespace, transaction_hash) references public.d1_transaction_records(namespace, transaction_hash)
);
alter table public.d1_remainder_outcomes enable row level security;
revoke all on public.d1_remainder_outcomes from public, anon, authenticated, service_role;
create trigger d1_remainder_outcome_immutable before update or delete on public.d1_remainder_outcomes
    for each row execute function public.d1_reject_remainder_execution_mutation();
create trigger d1_remainder_outcome_no_truncate before truncate on public.d1_remainder_outcomes
    for each statement execute function public.d1_reject_remainder_execution_mutation();

-- Called only after authentic046 has acquired current-admin/pool/original/033/040/041/045 locks.
-- Return the exact receipt, preserving its original actor rather than renewing any permission.
create function public.d1_remainder_outcome_receipt_private(s jsonb, actor text, o jsonb, h jsonb, current_history jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    c jsonb := s #> '{journal,candidate}'; signed jsonb := s #> '{journal,transaction}';
    a jsonb := s -> 'attempt'; u jsonb; i jsonb; selected jsonb; p jsonb; expected jsonb;
    r jsonb; incoming jsonb; issued jsonb; original jsonb; claim jsonb; discovery jsonb;
    prefix jsonb; checkpoint jsonb; shape record; k text; n numeric; count_rows bigint; cursor_value numeric;
    ns uuid := (s ->> 'namespace')::uuid; gross numeric; principal numeric;
begin
    if pg_catalog.jsonb_typeof(o) is distinct from 'object' or pg_catalog.octet_length(o::text) > 1048576
       or pg_catalog.jsonb_typeof(h) is distinct from 'object' or pg_catalog.octet_length(h::text) > 1048576 then
        raise exception 'invalid_remainder_outcome' using errcode = '22023';
    end if;
    for shape in select * from (values
        (o,'kind,revision,candidate,originalPayment,observation,transactionHash,envelopeSha256,operationIndex,outcome,donorRefundedPrincipalStroops,feePayer,feeChargedStroops'),
        (o -> 'originalPayment','donor,asset,grossAmount,confirmedAt,requestId,operationId,paymentTransactionHash,issuanceTransactionHash,outcomeHash,claimableBalanceId,sequence,namespace,network,pool')
    ) as shapes(body,keys) loop
        if (pg_catalog.jsonb_typeof(shape.body) = 'object' and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
            and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
            raise exception 'invalid_remainder_outcome' using errcode = '22023';
        end if;
    end loop;
    if (pg_catalog.jsonb_typeof(a) = 'object' and pg_catalog.jsonb_typeof(signed) = 'object'
        and o ->> 'kind' = 'd1_remainder_outcome' and o -> 'revision' = '2' and o -> 'operationIndex' = '0'
        and o -> 'candidate' = c and public.release_request_valid_key(actor)) is not true then
        raise exception 'remainder_outcome_conflict' using errcode = '23505';
    end if;
    -- These originals are already locked by046. No043/current account/fresh money checks here.
    select receipt into u from public.d1_unsigned_transactions where request_id = (s ->> 'request_id')::uuid;
    select receipt into i from public.d1_issuance_outcomes where request_id = (s ->> 'request_id')::uuid;
    select receipt into selected from public.d1_beneficiary_claims where request_id = (s ->> 'request_id')::uuid;
    p := u #> '{reservation,intent,preparation_input}'; claim := selected #> '{acquisition,claim}';
    select record into incoming from public.d1_transaction_records where namespace = ns and transaction_hash = p #>> '{payment,transaction_hash}';
    select record into issued from public.d1_transaction_records where namespace = ns and transaction_hash = i ->> 'transaction_hash';
    select record into r from public.d1_transaction_records where namespace = ns and transaction_hash = c ->> 'transaction_hash';
    for shape in select * from (values
        (c -> 'gross_stroops',9223372036854775807::numeric), (c -> 'claimed_stroops',9223372036854775807::numeric),
        (c -> 'remaining_stroops',9223372036854775807::numeric), (c -> 'source_sequence',9223372036854775806::numeric),
        (c -> 'transaction_sequence',9223372036854775807::numeric), (c -> 'valid_until',253402300799::numeric),
        (p #> '{payment,operation_id}',18446744073709551615::numeric), (issued -> 'sequence',9223372036854775807::numeric),
        (r -> 'feeBidStroops',4294967295::numeric), (r -> 'feeChargedStroops',9223372036854775807::numeric)
    ) as numbers(body,maximum) loop
        if (pg_catalog.jsonb_typeof(shape.body) = 'string' and (shape.body #>> '{}') ~ '^(0|[1-9][0-9]{0,19})$') is not true then
            raise exception 'invalid_remainder_outcome' using errcode = '22023';
        end if;
        n := (shape.body #>> '{}')::numeric;
        if n > shape.maximum then raise exception 'invalid_remainder_outcome' using errcode = '22023'; end if;
    end loop;
    foreach k in array array['initial_transaction_hash','initial_outcome_hash','acquisition_hash','claim_set_hash','transaction_hash'] loop
        if (pg_catalog.jsonb_typeof(c -> k) = 'string' and c ->> k ~ '^[0-9a-f]{64}$') is not true then
            raise exception 'invalid_remainder_outcome' using errcode = '22023';
        end if;
    end loop;
    if (pg_catalog.jsonb_typeof(p #> '{payment,amount}') = 'string' and p #>> '{payment,amount}' ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and pg_catalog.jsonb_typeof(p #> '{request,amount}') = 'string' and p #>> '{request,amount}' ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$') is not true then
        raise exception 'invalid_remainder_outcome' using errcode = '22023';
    end if;
    gross := (p #>> '{payment,amount}')::numeric * 10000000;
    principal := (p #>> '{request,amount}')::numeric * 10000000;
    expected := pg_catalog.jsonb_build_object('requestId',s -> 'request_id','attemptId',i -> 'attempt_id','outcomeHash',i -> 'outcome_hash',
        'authorizedBy',i -> 'authorized_by','donor',p #> '{payment,donor}','beneficiary',p #> '{request,beneficiary}',
        'asset',p #> '{payment,asset}','amountStroops',principal::bigint::text,'operationId',p #> '{payment,operation_id}',
        'paymentTransactionHash',p #> '{payment,transaction_hash}','deadline',u -> 'deadline','issuanceTransactionHash',i -> 'transaction_hash',
        'claimableBalanceId',i #> '{observed_outcome,claimableBalanceId}','feeChargedStroops',issued -> 'feeChargedStroops','sequence',issued -> 'sequence');
    original := pg_catalog.jsonb_build_object('donor',p #> '{payment,donor}','asset',p #> '{payment,asset}',
        'grossAmount',p #> '{payment,amount}','confirmedAt',pg_catalog.to_char(pg_catalog.to_timestamp((p ->> 'confirmed_at')::double precision)
            at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'requestId',s -> 'request_id','operationId',p #> '{payment,operation_id}',
        'paymentTransactionHash',p #> '{payment,transaction_hash}','issuanceTransactionHash',i -> 'transaction_hash',
        'outcomeHash',i -> 'outcome_hash','claimableBalanceId',i #> '{observed_outcome,claimableBalanceId}',
        'sequence',issued -> 'sequence','namespace',s -> 'namespace','network','TESTNET','pool',s -> 'pool');
    if (gross <= 9223372036854775807 and principal > 0 and principal < gross
        and c ->> 'gross_stroops' = gross::bigint::text and c ->> 'claimed_stroops' = principal::bigint::text
        and c ->> 'remaining_stroops' = (gross-principal)::bigint::text
        and claim -> 'original' = expected and claim ->> 'claimedPrincipalStroops' = principal::bigint::text
        and claim ->> 'originalGrossStroops' = gross::bigint::text and claim ->> 'grossLessThisClaimStroops' = (gross-principal)::bigint::text
        and selected -> 'namespace' = s -> 'namespace' and selected -> 'pool' = s -> 'pool' and selected ->> 'network' = 'TESTNET'
        and selected ->> 'acquisition_hash' = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((selected -> 'acquisition')::text,'UTF8')),'hex')
        and selected -> 'acquisition_hash' = c -> 'acquisition_hash' and claim #>> '{observation,outcome}' = 'success'
        and c -> 'claimable_balance_id' = expected -> 'claimableBalanceId' and c ->> 'claimable_balance_id' ~ '^00000000[0-9a-f]{64}$'
        and c -> 'initial_transaction_hash' = i -> 'transaction_hash' and u -> 'transaction_hash' = i -> 'transaction_hash'
        and c -> 'initial_outcome_hash' = i -> 'outcome_hash' and i #>> '{observed_outcome,outcome}' = 'success'
        and i ->> 'outcome_hash' = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((i -> 'observed_outcome')::text,'UTF8')),'hex')
        and i #> '{observed_outcome,observation}' = issued and issued -> 'sequence' = u #> '{reservation,transaction_sequence}'
        and incoming is not null and issued is not null
        and incoming -> 'ledger' = p -> 'ledger' and incoming -> 'closedAt' = p -> 'confirmed_at'
        and p -> 'request_id' = s -> 'request_id' and p #> '{payment,pool}' = s -> 'pool'
        and p #> '{payment,donor}' = p #> '{request,donor}' and p #> '{payment,asset}' = p #> '{request,asset}'
        and c -> 'donor' = original -> 'donor' and c -> 'asset' = original -> 'asset' and o -> 'originalPayment' = original
        and c -> 'deadline' = u -> 'deadline' and c -> 'deadline' = p #> '{request,deadline}'
        and c ->> 'deadline' = pg_catalog.to_char(pg_catalog.to_timestamp((p ->> 'confirmed_at')::double precision + 300)
            at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
        and (c ->> 'source_sequence')::numeric >= (issued ->> 'sequence')::numeric
        and (c ->> 'transaction_sequence')::numeric = (c ->> 'source_sequence')::numeric + 1
        and (p #>> '{payment,operation_id}')::numeric > 0 and (issued ->> 'sequence')::numeric > 0) is not true then
        raise exception 'remainder_outcome_original_conflict' using errcode = '23505';
    end if;
    select record into discovery from public.d1_discovery_operations where namespace = ns
        and transaction_hash = p #>> '{payment,transaction_hash}' and operation_id = p #>> '{payment,operation_id}';
    perform public.d1_remainder_envelope_sha256_private(r ->> 'resultXdr'); -- Canonical bounded bytes, NOT SDK result verification.
    if (discovery -> 'ledger' = p -> 'ledger' and discovery #>> '{operation,kind}' = 'incoming_payment'
        and incoming ->> 'outcome' = 'success' and discovery #> '{operation,raw,transaction}' = incoming #> '{raw,transaction}'
        and discovery #> '{operation,confirmed_at}' = p -> 'confirmed_at'
        and discovery #> '{operation,donor}' = p #> '{payment,donor}' and discovery #> '{operation,pool}' = s -> 'pool'
        and discovery #> '{operation,asset}' = p #> '{payment,asset}' and discovery #> '{operation,amount}' = p #> '{payment,amount}'
        and o -> 'observation' = r and o -> 'outcome' = r -> 'outcome' and r ->> 'outcome' in ('success','failed')
        and o -> 'transactionHash' = c -> 'transaction_hash' and r -> 'transactionHash' = c -> 'transaction_hash'
        and o -> 'envelopeSha256' = signed -> 'envelope_sha256' and signed -> 'envelope_sha256' = a -> 'envelope_sha256'
        and r -> 'envelopeXdr' = signed -> 'signed_xdr' and r -> 'sequence' = c -> 'transaction_sequence'
        and r -> 'source' = s -> 'pool' and r -> 'feePayer' = s -> 'pool' and o -> 'feePayer' = r -> 'feePayer'
        and o -> 'feeChargedStroops' = r -> 'feeChargedStroops' and r -> 'network' = s -> 'network'
        and r -> 'operationTypes' = '[1]' and r -> 'poolOperationSourceIndices' = '[0]'
        and (r ->> 'feeBidStroops')::numeric > 0 and (r ->> 'feeChargedStroops')::numeric <= (r ->> 'feeBidStroops')::numeric
        and o -> 'donorRefundedPrincipalStroops' = case when r ->> 'outcome' = 'success' then c -> 'remaining_stroops' else '"0"'::jsonb end
        and (r ->> 'closedAt')::numeric >= extract(epoch from (c ->> 'deadline')::timestamptz)
        and (r ->> 'closedAt')::numeric <= (c ->> 'valid_until')::numeric
        and (r ->> 'ledger')::numeric > (c #>> '{history_state,checkpoint,through_ledger}')::numeric
        and (r ->> 'pagingToken')::numeric > (c #>> '{history_state,checkpoint,cursor}')::numeric) is not true then
        raise exception 'remainder_outcome_inclusion_conflict' using errcode = '23505';
    end if;
    -- Saved complete prefixes remain valid when the current head advances, even during ingestion.
    -- Exact durable empty-page receipts bind counts and checkpoints; no current-head equality on read.
    for prefix in select value from pg_catalog.jsonb_array_elements(
        pg_catalog.jsonb_build_array(h,c -> 'history_state',selected #> '{acquisition,historyState}')) loop
        checkpoint := prefix -> 'checkpoint';
        for shape in select * from (values
            (prefix,'kind,revision,namespace,network,pool,first_ledger,income_state,checkpoint,coverage_complete,page_count,record_count'),
            (checkpoint,'through_ledger,ledger_hash,closed_at,cursor')
        ) as shapes(body,keys) loop
            if (pg_catalog.jsonb_typeof(shape.body) = 'object' and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
                and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
                raise exception 'remainder_outcome_history_conflict' using errcode = '23505';
            end if;
        end loop;
        select count(*),coalesce(max(paging_token::numeric),0) into count_rows,cursor_value
            from public.d1_transaction_records where namespace = ns and paging_token::numeric <= (checkpoint ->> 'cursor')::numeric;
        if (prefix ->> 'kind' = 'd1_transaction_history_state' and prefix -> 'revision' = '1'
            and prefix -> 'namespace' = s -> 'namespace' and prefix -> 'network' = s -> 'network' and prefix -> 'pool' = s -> 'pool'
            and prefix -> 'coverage_complete' = 'true' and prefix -> 'first_ledger' = current_history -> 'first_ledger'
            and (prefix ->> 'record_count')::numeric = count_rows and (checkpoint ->> 'cursor')::numeric = cursor_value
            and (prefix ->> 'page_count')::numeric <= (current_history ->> 'page_count')::numeric
            and (checkpoint ->> 'through_ledger')::numeric <= (current_history #>> '{checkpoint,through_ledger}')::numeric
            and (checkpoint ->> 'closed_at')::numeric <= (current_history #>> '{checkpoint,closed_at}')::numeric
            and (checkpoint -> 'through_ledger' <> current_history #> '{checkpoint,through_ledger}'
                or checkpoint - 'cursor' = (current_history -> 'checkpoint') - 'cursor')
            and prefix -> 'income_state' = pg_catalog.jsonb_build_object('kind','d1_discovery_state','revision',1,
                'namespace',s -> 'namespace','network','TESTNET','pool',s -> 'pool','checkpoint',prefix #> '{income_state,checkpoint}',
                'first_ledger',prefix -> 'first_ledger','coverage_complete',true)
            and exists (select 1 from public.d1_transaction_pages where namespace = ns and from_cursor = checkpoint ->> 'cursor'
                and page ->> 'to_cursor' = checkpoint ->> 'cursor' and page -> 'records' = '[]'
                and receipt -> 'checkpoint' = checkpoint and receipt -> 'page_count' = prefix -> 'page_count'
                and receipt -> 'record_count' = prefix -> 'record_count'
                and page -> 'through_ledger' = prefix #> '{income_state,checkpoint,through_ledger}'
                and page -> 'ledger_hash' = prefix #> '{income_state,checkpoint,ledger_hash}'
                and page -> 'closed_at' = prefix #> '{income_state,checkpoint,closed_at}')
            and exists (select 1 from public.d1_discovery_pages where namespace = ns
                and from_cursor = prefix #>> '{income_state,checkpoint,cursor}'
                and page ->> 'from_cursor' = from_cursor and page ->> 'to_cursor' = from_cursor
                -- Actual019 receipts flatten their checkpoint identity; they have NO checkpoint object.
                and receipt ->> 'kind' = 'd1_discovery_page' and receipt -> 'revision' = '1'
                and receipt -> 'namespace' = s -> 'namespace' and receipt -> 'network' = s -> 'network'
                and receipt -> 'pool' = s -> 'pool' and receipt ->> 'from_cursor' = from_cursor
                and receipt ->> 'to_cursor' = from_cursor and receipt -> 'record_count' = '0'
                and pg_catalog.jsonb_typeof(receipt -> 'page_count') = 'number' and (receipt ->> 'page_count')::numeric >= 1
                and receipt -> 'checkpoint_ledger' = checkpoint -> 'through_ledger'
                and receipt -> 'checkpoint_hash' = checkpoint -> 'ledger_hash'
                and through_ledger = (checkpoint ->> 'through_ledger')::bigint and ledger_hash = checkpoint ->> 'ledger_hash'
                and page -> 'records' = '[]' and page -> 'through_ledger' = checkpoint -> 'through_ledger'
                and page -> 'ledger_hash' = checkpoint -> 'ledger_hash' and page -> 'closed_at' = checkpoint -> 'closed_at')) is not true then
            raise exception 'remainder_outcome_history_conflict' using errcode = '23505';
        end if;
    end loop;
    if (r #> '{context,pool}' = s -> 'pool' and r #> '{context,firstLedger}' = h -> 'first_ledger'
        and (r ->> 'ledger')::numeric <= (h #>> '{checkpoint,through_ledger}')::numeric
        and (r ->> 'pagingToken')::numeric <= (h #>> '{checkpoint,cursor}')::numeric
        and (r #>> '{context,anchor,sequence}')::numeric <= (h #>> '{checkpoint,through_ledger}')::numeric
        and (r #>> '{context,anchor,closedAt}')::numeric <= (h #>> '{checkpoint,closed_at}')::numeric
        and (r #> '{context,anchor,sequence}' <> h #> '{checkpoint,through_ledger}' or r -> 'context' -> 'anchor' =
            pg_catalog.jsonb_build_object('sequence',h #> '{checkpoint,through_ledger}','hash',h #> '{checkpoint,ledger_hash}','closedAt',h #> '{checkpoint,closed_at}'))
        and c #> '{history_state,first_ledger}' = h -> 'first_ledger'
        and (c #>> '{history_state,checkpoint,through_ledger}')::numeric <= (h #>> '{checkpoint,through_ledger}')::numeric) is not true then
        raise exception 'remainder_outcome_history_conflict' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_outcome_journal','revision',2,
        'request_id',s -> 'request_id','namespace',s -> 'namespace','network','TESTNET','pool',s -> 'pool','authorized_by',actor,
        'attempt_id',a -> 'attempt_id','signing_nonce',signed -> 'signing_nonce','transaction_hash',c -> 'transaction_hash',
        'envelope_sha256',signed -> 'envelope_sha256',
        'outcome_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(o::text,'UTF8')),'hex'),
        'observed_outcome',o,'history_state',h);
end;
$$;

create function public.d1_load_remainder_outcome(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; h jsonb; expected jsonb; saved public.d1_remainder_outcomes%rowtype;
begin
    s := public.d1_load_remainder_submission_attempt(p_request_id,p_authorized_by);
    select * into saved from public.d1_remainder_outcomes where request_id = p_request_id for update;
    if saved.request_id is not null then
        h := public.d1_load_transaction_history_state((s ->> 'namespace')::uuid,p_authorized_by);
        expected := public.d1_remainder_outcome_receipt_private(s,saved.receipt ->> 'authorized_by',
            saved.receipt -> 'observed_outcome',saved.receipt -> 'history_state',h);
        if (saved.receipt = expected and saved.namespace::text = s ->> 'namespace'
            and saved.attempt_id::text = s #>> '{attempt,attempt_id}'
            and saved.transaction_hash = s #>> '{journal,candidate,transaction_hash}') is not true then
            raise exception 'remainder_outcome_conflict' using errcode = '23505';
        end if;
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_outcome_lookup','revision',2,'request_id',p_request_id,
        'namespace',s -> 'namespace','network','TESTNET','pool',s -> 'pool','outcome',saved.receipt);
end;
$$;

create function public.d1_record_remainder_outcome(
    p_request_id uuid, p_authorized_by text, p_observed_outcome jsonb, p_history_state jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare lookup jsonb; s jsonb; h jsonb; receipt jsonb; saved jsonb;
begin
    lookup := public.d1_load_remainder_outcome(p_request_id,p_authorized_by);
    saved := lookup -> 'outcome';
    if saved <> 'null'::jsonb then
        if saved -> 'observed_outcome' is distinct from p_observed_outcome or saved -> 'history_state' is distinct from p_history_state then
            raise exception 'remainder_outcome_conflict' using errcode = '23505';
        end if;
        return saved;
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'remainder_outcome_isolation_required' using errcode = '25000';
    end if;
    s := public.d1_load_remainder_submission_attempt(p_request_id,p_authorized_by);
    h := public.d1_load_transaction_history_state((s ->> 'namespace')::uuid,p_authorized_by);
    if (h = p_history_state and h -> 'coverage_complete' = 'true') is not true then
        raise exception 'remainder_outcome_history_conflict' using errcode = '23505';
    end if;
    receipt := public.d1_remainder_outcome_receipt_private(s,p_authorized_by,p_observed_outcome,p_history_state,h);
    insert into public.d1_remainder_outcomes values (p_request_id,(s ->> 'namespace')::uuid,
        (s #>> '{attempt,attempt_id}')::uuid,s #>> '{journal,candidate,transaction_hash}',receipt);
    -- After all insert/select/index waits: current actor, same046 bindings and SAME complete head.
    saved := public.d1_load_remainder_outcome(p_request_id,p_authorized_by) -> 'outcome';
    h := public.d1_load_transaction_history_state((s ->> 'namespace')::uuid,p_authorized_by);
    if (saved = receipt and h = p_history_state and h -> 'coverage_complete' = 'true') is not true then
        raise exception 'remainder_outcome_history_conflict' using errcode = '23505';
    end if;
    return saved;
end;
$$;
revoke all on function public.d1_remainder_outcome_receipt_private(jsonb,text,jsonb,jsonb,jsonb),
    public.d1_load_remainder_outcome(uuid,text), public.d1_record_remainder_outcome(uuid,text,jsonb,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_remainder_outcome(uuid,text),
    public.d1_record_remainder_outcome(uuid,text,jsonb,jsonb) to service_role;
comment on table public.d1_remainder_outcomes is
    'Immutable positive v2 membership only. SDK must verify body/signature/result/fee bid. No settlement, outgoing waiver, owner release, TTL, retry or signing authority.';
commit;
