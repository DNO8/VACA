-- LOCAL UNVERIFIED SOURCE: current saved membership only, never financial approval.
begin;
create function public.d1_remainder_membership_query_private(
    p_name text, p_args jsonb, p_request_id uuid, p_namespace uuid, p_actor text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare keys text[]; family text; h text; after_cursor text;
begin
    -- Classify BEFORE any call. No caller-controlled SQL or identifiers execute.
    case p_name
        when 'd1_load_issuance_outcome', 'd1_load_submission_attempt',
             'd1_load_signed_transaction', 'd1_load_unsigned_transaction',
             'd1_load_issuance_fee_commitments', 'd1_load_beneficiary_claim',
             'd1_load_refund_outcome', 'd1_load_refund_candidate',
             'd1_load_refund_submission_attempt' then family := 'request';
        when 'd1_load_initial_financial_observation',
             'd1_load_refund_financial_observation' then family := 'hash';
        when 'd1_load_active_issuance_sequence', 'd1_load_transaction_history_state',
             'd1_load_discovery_state', 'd1_load_operating_credit_state',
             'd1_list_beneficiary_claim_set' then family := 'namespace';
        when 'd1_list_transaction_records', 'd1_list_operating_credits' then family := 'page';
        when 'd1_load_operating_credit' then family := 'credit';
        else raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end case;
    keys := case when family in ('request','hash') then array['p_request_id','p_authorized_by']
        else array['p_namespace','p_authorized_by'] end;
    if family = 'hash' then keys := keys || array['p_snapshot_hash']; end if;
    if family = 'page' then keys := keys || array['p_after','p_limit']; end if;
    if family = 'credit' then keys := keys || array['p_operation_id']; end if;
    if (pg_catalog.jsonb_typeof(p_args) = 'object' and p_args ?& keys and p_args - keys = '{}'
        and p_args -> 'p_authorized_by' = pg_catalog.to_jsonb(p_actor)
        and case when family in ('request','hash') then
            p_args -> 'p_request_id' = pg_catalog.to_jsonb(p_request_id)
            else p_args -> 'p_namespace' = pg_catalog.to_jsonb(p_namespace) end) is not true then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    h := p_args ->> 'p_snapshot_hash'; after_cursor := p_args ->> 'p_after';
    if family = 'hash' and (pg_catalog.jsonb_typeof(p_args -> 'p_snapshot_hash') = 'string'
        and h ~ '^[0-9a-f]{64}$') is not true then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    if family = 'page' and (pg_catalog.jsonb_typeof(p_args -> 'p_after') = 'string'
        and after_cursor ~ '^(0|[1-9][0-9]{0,19})$' and p_args -> 'p_limit' = '100') is not true then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    if family = 'credit' and (pg_catalog.jsonb_typeof(p_args -> 'p_operation_id') = 'string'
        and (p_args ->> 'p_operation_id') ~ '^[1-9][0-9]{0,19}$') is not true then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    if (family = 'page' and after_cursor::numeric > 18446744073709551615)
       or (family = 'credit' and (p_args ->> 'p_operation_id')::numeric > 18446744073709551615) then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    if p_name = 'd1_list_transaction_records' and after_cursor::numeric <> 0 and
        (mod(after_cursor::numeric,4096) <> 0 or mod(trunc(after_cursor::numeric/4096),1048576) = 0
         or trunc(after_cursor::numeric/4294967296) = 0) then
        raise exception 'invalid_remainder_membership_query' using errcode = '22023';
    end if;
    -- Actual signatures, including request, actor, snapshot hash in that order.
    case p_name
        when 'd1_load_issuance_outcome' then return public.d1_load_issuance_outcome(p_request_id,p_actor);
        when 'd1_load_submission_attempt' then return public.d1_load_submission_attempt(p_request_id,p_actor);
        when 'd1_load_signed_transaction' then return public.d1_load_signed_transaction(p_request_id,p_actor);
        when 'd1_load_unsigned_transaction' then return public.d1_load_unsigned_transaction(p_request_id,p_actor);
        when 'd1_load_issuance_fee_commitments' then return public.d1_load_issuance_fee_commitments(p_request_id,p_actor);
        when 'd1_load_beneficiary_claim' then return public.d1_load_beneficiary_claim(p_request_id,p_actor);
        when 'd1_load_refund_outcome' then return public.d1_load_refund_outcome(p_request_id,p_actor);
        when 'd1_load_refund_candidate' then return public.d1_load_refund_candidate(p_request_id,p_actor);
        when 'd1_load_refund_submission_attempt' then return public.d1_load_refund_submission_attempt(p_request_id,p_actor);
        when 'd1_load_initial_financial_observation' then return public.d1_load_initial_financial_observation(p_request_id,p_actor,h);
        when 'd1_load_refund_financial_observation' then return public.d1_load_refund_financial_observation(p_request_id,p_actor,h);
        when 'd1_load_active_issuance_sequence' then return public.d1_load_active_issuance_sequence(p_namespace,p_actor);
        when 'd1_load_transaction_history_state' then return public.d1_load_transaction_history_state(p_namespace,p_actor);
        when 'd1_load_discovery_state' then return public.d1_load_discovery_state(p_namespace,p_actor);
        when 'd1_load_operating_credit_state' then return public.d1_load_operating_credit_state(p_namespace,p_actor);
        when 'd1_list_beneficiary_claim_set' then return public.d1_list_beneficiary_claim_set(p_namespace,p_actor);
        when 'd1_list_transaction_records' then return public.d1_list_transaction_records(p_namespace,p_actor,after_cursor,100);
        when 'd1_list_operating_credits' then return public.d1_list_operating_credits(p_namespace,p_actor,after_cursor,100);
        when 'd1_load_operating_credit' then return public.d1_load_operating_credit(p_namespace,p_actor,p_args ->> 'p_operation_id');
    end case;
end;
$$;

create function public.d1_remainder_financial_membership_private(
    p_request_id uuid, p_authorized_by text, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    lookup jsonb; candidate jsonb; fence jsonb; owner jsonb; unsigned_journal jsonb; outcome jsonb;
    claims jsonb; selected jsonb; fees jsonb; history jsonb; credits jsonb; funding jsonb;
    datasets jsonb := '{}'; seen jsonb := '{}'; reads jsonb := '{}'; coverage jsonb := '{}';
    entry jsonb; args jsonb; actual jsonb; shape record; source record; item jsonb;
    ns uuid; name text; key text; cursor_value text; next_value text; field text; total integer; pages integer;
    count_value bigint; byte_count bigint; listed jsonb; page jsonb; original jsonb; incoming jsonb; issued jsonb;
    saved jsonb; observation jsonb; expected jsonb; prefix_count bigint; prefix_cursor numeric;
begin
    -- Reuse041's039 ->032 ->031 ->030 ->018 auth/pool/original/history,
    -- then033 owner ->040 fence ->041 locks; retain them to transaction end.
    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);
    ns := (lookup ->> 'namespace')::uuid; candidate := lookup -> 'candidate'; fence := lookup -> 'fence';
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'remainder_membership_isolation_required' using errcode = '25000';
    end if;
    if p_snapshot is null or pg_catalog.octet_length(p_snapshot::text) > 33554432 then
        raise exception 'invalid_remainder_membership' using errcode = '22023';
    end if;
    funding := p_snapshot -> 'funding';
    for shape in select * from (values
        (p_snapshot,'kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,candidate,funding'),
        (funding,'kind,revision,executionAuthority,settlementAuthority,scope,startedAt,observedAt,expiresAt,maximumAgeSeconds,futureToleranceSeconds,accounting,claimSet,credits,creation,account,originals,cumulative,selected,otherRefundOperationIds,otherHeldFees,operating,budget,membership'),
        (candidate,'kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,acquisition_hash,claimable_balance_id,claim_set_hash,claim_set_count,history_state,gross_stroops,claimed_stroops,remaining_stroops,asset,donor,deadline,source_sequence,transaction_sequence,valid_until,unsigned_xdr,transaction_hash')
    ) as shapes(body,keys) loop
        if (pg_catalog.jsonb_typeof(shape.body) = 'object'
            and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
            and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
            raise exception 'invalid_remainder_membership' using errcode = '22023';
        end if;
    end loop;
    owner := public.d1_load_active_issuance_sequence(ns,p_authorized_by);
    unsigned_journal := public.d1_load_unsigned_transaction(p_request_id,p_authorized_by) -> 'transaction';
    outcome := public.d1_load_issuance_outcome(p_request_id,p_authorized_by) -> 'outcome';
    claims := public.d1_list_beneficiary_claim_set(ns,p_authorized_by);
    selected := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by) -> 'claim';
    fees := public.d1_load_issuance_fee_commitments(p_request_id,p_authorized_by);
    history := public.d1_load_transaction_history_state(ns,p_authorized_by);
    credits := public.d1_load_operating_credit_state(ns,p_authorized_by);
    if (p_snapshot ->> 'kind' = 'd1_remainder_financial_snapshot' and p_snapshot -> 'revision' = '2'
        and p_snapshot -> 'requestId' = lookup -> 'request_id' and p_snapshot -> 'namespace' = lookup -> 'namespace'
        and p_snapshot -> 'network' = '"TESTNET"' and p_snapshot -> 'pool' = lookup -> 'pool'
        and p_snapshot -> 'candidate' = candidate and candidate ->> 'kind' = 'd1_remainder_candidate'
        and candidate -> 'revision' = '2' and candidate -> 'request_id' = lookup -> 'request_id'
        and candidate -> 'namespace' = lookup -> 'namespace' and candidate -> 'pool' = lookup -> 'pool'
        and candidate ->> 'network' = 'TESTNET' and owner ->> 'request_id' = p_request_id::text
        and owner = unsigned_journal -> 'reservation' and fence ->> 'lane' = 'verified_remainder_v2'
        and fence -> 'request_id' = candidate -> 'request_id' and fence -> 'namespace' = candidate -> 'namespace'
        and fence -> 'pool' = candidate -> 'pool' and fence ->> 'network' = 'TESTNET'
        and fence -> 'candidate_hash' = candidate -> 'transaction_hash'
        and funding ->> 'kind' = 'd1_current_remainder_funding_observation' and funding -> 'revision' = '1'
        and funding -> 'executionAuthority' = 'false' and funding -> 'settlementAuthority' = 'false'
        and funding -> 'scope' = pg_catalog.jsonb_build_object('namespace',ns,'pool',lookup -> 'pool',
            'requestId',p_request_id,'authenticatedAdmin',p_authorized_by)
        and claims -> 'history_state' = history and claims -> 'count' = '1'
        and candidate -> 'claim_set_hash' = claims -> 'set_hash' and candidate -> 'claim_set_count' = claims -> 'count'
        and candidate -> 'history_state' = history and candidate -> 'acquisition_hash' = selected -> 'acquisition_hash'
        and history -> 'coverage_complete' = 'true' and pg_catalog.jsonb_typeof(history -> 'checkpoint') = 'object'
        and history -> 'income_state' = credits -> 'discovery_state'
        and credits #> '{discovery_state,coverage_complete}' = 'true'
        and pg_catalog.jsonb_typeof(funding -> 'membership') = 'array') is not true then
        raise exception 'remainder_membership_conflict' using errcode = '23505';
    end if;
    -- Independent whole current sets; bounds BEFORE aggregation, not caller counts.
    for source in select * from (values ('transactions'),('credits'),('claims'),('commitments'),('history_pages')) s(label) loop
        with dataset_rows as (
            select record as body from public.d1_transaction_records where namespace = ns and source.label = 'transactions'
            union all select receipt from public.d1_operating_credit_observations where namespace = ns and source.label = 'credits'
            union all select receipt from public.d1_beneficiary_claims where namespace = ns and source.label = 'claims'
            union all select c.receipt from public.d1_issuance_fee_commitments c
                join public.d1_issuance_sequences s on s.request_id = c.request_id where s.namespace = ns and source.label = 'commitments'
            union all select t.page from public.d1_transaction_pages t where t.namespace = ns and source.label = 'history_pages'
        ) select count(*),coalesce(sum(pg_catalog.octet_length(body::text)),0) into count_value,byte_count from dataset_rows;
        if count_value > 1000 or byte_count > 33554432 then
            raise exception 'remainder_membership_limit' using errcode = '54000';
        end if;
    end loop;
    select coalesce(pg_catalog.jsonb_agg(record order by paging_token::numeric),'[]') into actual
        from public.d1_transaction_records where namespace = ns;
    datasets := pg_catalog.jsonb_build_object('transactions',actual);
    select coalesce(pg_catalog.jsonb_agg(receipt order by operation_id::numeric),'[]') into actual
        from public.d1_operating_credit_observations where namespace = ns;
    datasets := datasets || pg_catalog.jsonb_build_object('credits',actual);
    select coalesce(pg_catalog.jsonb_agg(receipt order by request_id),'[]') into actual
        from public.d1_beneficiary_claims where namespace = ns;
    datasets := datasets || pg_catalog.jsonb_build_object('claims',actual);
    select coalesce(pg_catalog.jsonb_agg(c.receipt order by c.request_id),'[]') into actual
        from public.d1_issuance_fee_commitments c join public.d1_issuance_sequences s on s.request_id = c.request_id where s.namespace = ns;
    datasets := datasets || pg_catalog.jsonb_build_object('commitments',actual);
    select coalesce(pg_catalog.jsonb_agg(t.page order by t.through_ledger,t.from_cursor::numeric),'[]') into actual
        from public.d1_transaction_pages t where t.namespace = ns;
    datasets := datasets || pg_catalog.jsonb_build_object('history_pages',actual);
    if pg_catalog.jsonb_array_length(funding -> 'membership') not between 16 and 10000 then
        raise exception 'remainder_membership_limit' using errcode = '54000';
    end if;
    for entry in select value from pg_catalog.jsonb_array_elements(funding -> 'membership') loop
        if (pg_catalog.jsonb_typeof(entry) = 'object' and entry ?& array['name','args','data']
            and entry - array['name','args','data'] = '{}' and pg_catalog.jsonb_typeof(entry -> 'name') = 'string') is not true then
            raise exception 'invalid_remainder_membership' using errcode = '22023';
        end if;
        name := entry ->> 'name'; args := entry -> 'args'; key := name || args::text;
        actual := public.d1_remainder_membership_query_private(name,args,p_request_id,ns,p_authorized_by);
        if seen ? key or actual is distinct from entry -> 'data' then
            raise exception 'remainder_membership_conflict' using errcode = '23505';
        end if;
        seen := seen || pg_catalog.jsonb_build_object(key,actual);
        reads := reads || pg_catalog.jsonb_build_object(name,actual);
    end loop;
    -- All unparameterized source reads MUST have been captured, even absent v1.
    if not (reads ?& array['d1_load_issuance_outcome','d1_load_submission_attempt','d1_load_signed_transaction',
        'd1_load_unsigned_transaction','d1_load_issuance_fee_commitments','d1_load_beneficiary_claim','d1_load_refund_outcome',
        'd1_load_refund_candidate','d1_load_refund_submission_attempt','d1_load_active_issuance_sequence',
        'd1_load_transaction_history_state','d1_load_discovery_state','d1_load_operating_credit_state','d1_list_beneficiary_claim_set']) then
        raise exception 'remainder_membership_incomplete' using errcode = '23505';
    end if;
    -- Require each actual original signed/attempt snapshot, not an arbitrary hash.
    for item in select value from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
        reads #> '{d1_load_signed_transaction,transaction}',reads #> '{d1_load_submission_attempt,attempt}')) loop
        args := pg_catalog.jsonb_build_object('p_request_id',p_request_id,'p_authorized_by',p_authorized_by,'p_snapshot_hash',item -> 'snapshot_hash');
        actual := seen -> ('d1_load_initial_financial_observation' || args::text);
        if (pg_catalog.jsonb_typeof(item) = 'object' and pg_catalog.jsonb_typeof(actual -> 'observation') = 'object') is not true then
            raise exception 'remainder_membership_incomplete' using errcode = '23505';
        end if;
    end loop;
    -- Canonical full reader pagination starts at zero, limit100, ends at the
    -- independently enumerated dataset. Extra disconnected pages are rejected.
    foreach name in array array['d1_list_transaction_records','d1_list_operating_credits'] loop
        field := case when name = 'd1_list_transaction_records' then 'records' else 'receipts' end;
        cursor_value := '0'; listed := '[]'; pages := 0;
        loop
            args := pg_catalog.jsonb_build_object('p_namespace',ns,'p_authorized_by',p_authorized_by,'p_after',cursor_value,'p_limit',100);
            page := seen -> (name || args::text); pages := pages + 1;
            if page is null or pages > 11 then raise exception 'remainder_membership_incomplete' using errcode = '23505'; end if;
            listed := listed || (page -> field); next_value := page ->> 'next_cursor';
            exit when page -> 'has_more' = 'false';
            if next_value = cursor_value then raise exception 'remainder_membership_incomplete' using errcode = '23505'; end if;
            cursor_value := next_value;
        end loop;
        select count(*) into total from pg_catalog.jsonb_array_elements(funding -> 'membership') e where e ->> 'name' = name;
        if pages <> total or listed is distinct from datasets -> (case when field = 'records' then 'transactions' else 'credits' end) then
            raise exception 'remainder_membership_incomplete' using errcode = '23505';
        end if;
        coverage := coverage || pg_catalog.jsonb_build_object(name,pages);
    end loop;
    for item in select value from pg_catalog.jsonb_array_elements(datasets -> 'credits') loop
        args := pg_catalog.jsonb_build_object('p_namespace',ns,'p_authorized_by',p_authorized_by,'p_operation_id',item #> '{observation,operationId}');
        if seen #> array['d1_load_operating_credit' || args::text,'receipt'] is distinct from item then
            raise exception 'remainder_membership_incomplete' using errcode = '23505';
        end if;
    end loop;
    select count(*) into total from pg_catalog.jsonb_array_elements(funding -> 'membership') e
        where e ->> 'name' = 'd1_load_operating_credit';
    if total <> pg_catalog.jsonb_array_length(datasets -> 'credits') then
        raise exception 'remainder_membership_incomplete' using errcode = '23505';
    end if;
    --039's saved acquisition prefix must still be a genuine complete024 head.
    saved := selected #> '{acquisition,historyState}'; observation := selected #> '{acquisition,claim,observation}';
    select count(*),coalesce(max(paging_token::numeric),0) into prefix_count,prefix_cursor
        from public.d1_transaction_records where namespace = ns
        and paging_token::numeric <= (saved #>> '{checkpoint,cursor}')::numeric;
    if (saved -> 'namespace' = history -> 'namespace' and saved -> 'pool' = history -> 'pool'
        and saved -> 'first_ledger' = history -> 'first_ledger' and saved -> 'coverage_complete' = 'true'
        and prefix_count = (saved ->> 'record_count')::bigint and prefix_cursor = (saved #>> '{checkpoint,cursor}')::numeric
        and (saved ->> 'page_count')::bigint <= (history ->> 'page_count')::bigint
        and (saved #>> '{checkpoint,through_ledger}')::bigint <= (history #>> '{checkpoint,through_ledger}')::bigint
        and (saved #>> '{checkpoint,closed_at}')::bigint <= (history #>> '{checkpoint,closed_at}')::bigint
        and exists (select 1 from public.d1_transaction_pages t where t.namespace = ns
            and t.from_cursor = saved #>> '{checkpoint,cursor}' and t.page -> 'records' = '[]'
            and t.page -> 'through_ledger' = saved #> '{checkpoint,through_ledger}'
            and t.page -> 'ledger_hash' = saved #> '{checkpoint,ledger_hash}' and t.page -> 'closed_at' = saved #> '{checkpoint,closed_at}')
        and not exists (select 1 from public.d1_transaction_records where namespace = ns
            and transaction_hash = observation ->> 'transactionHash' and record <> observation)) is not true then
        raise exception 'remainder_claim_history_conflict' using errcode = '23505';
    end if;
    original := unsigned_journal #> '{reservation,intent,preparation_input}';
    select record into incoming from public.d1_transaction_records where namespace = ns and transaction_hash = original #>> '{payment,transaction_hash}';
    select record into issued from public.d1_transaction_records where namespace = ns and transaction_hash = outcome ->> 'transaction_hash';
    expected := pg_catalog.jsonb_build_object('requestId',p_request_id,'attemptId',outcome -> 'attempt_id',
        'outcomeHash',outcome -> 'outcome_hash','authorizedBy',outcome -> 'authorized_by',
        'donor',original #> '{payment,donor}','beneficiary',original #> '{request,beneficiary}',
        'asset',original #> '{payment,asset}','amountStroops',candidate -> 'claimed_stroops',
        'operationId',original #> '{payment,operation_id}','paymentTransactionHash',original #> '{payment,transaction_hash}',
        'deadline',unsigned_journal -> 'deadline','issuanceTransactionHash',outcome -> 'transaction_hash',
        'claimableBalanceId',outcome #> '{observed_outcome,claimableBalanceId}',
        'feeChargedStroops',issued -> 'feeChargedStroops','sequence',issued -> 'sequence');
    select coalesce(pg_catalog.jsonb_agg(r.value order by (r.value ->> 'pagingToken')::numeric),'[]') into actual
        from pg_catalog.jsonb_array_elements(datasets -> 'history_pages') p,
             lateral pg_catalog.jsonb_array_elements(p -> 'records') r;
    if (actual = datasets -> 'transactions'
        and pg_catalog.jsonb_array_length(actual) = (history ->> 'record_count')::bigint
        and coalesce(actual -> -1 ->> 'pagingToken','0') = history #>> '{checkpoint,cursor}'
        and pg_catalog.jsonb_array_length(datasets -> 'history_pages') = (history ->> 'page_count')::bigint
        and datasets -> 'claims' = claims -> 'receipts' and datasets -> 'claims' = pg_catalog.jsonb_build_array(selected)
        and datasets -> 'commitments' = fees -> 'commitments' and fees -> 'commitments' = pg_catalog.jsonb_build_array(fees -> 'commitment')
        and fees #> '{commitment,reservation}' = owner and funding #> '{accounting,context,held,commitment}' = fees -> 'commitment'
        and funding #> '{accounting,context,held,activeOwner}' = owner
        and funding #> '{accounting,history,state}' = history and funding #> '{accounting,history,records}' = actual
        and funding -> 'claimSet' = claims and funding #> '{credits,state}' = credits
        and datasets -> 'credits' = funding #> '{credits,receipts}'
        and pg_catalog.jsonb_array_length(datasets -> 'credits') = (credits ->> 'receipt_count')::bigint
        and funding #> '{originals,transactions}' = actual and funding #> '{originals,operatingCredits}' = datasets -> 'credits'
        and funding #> '{originals,issuances}' = pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('unsignedJournal',unsigned_journal,'outcomeReceipt',outcome))
        and incoming is not null and issued is not null and outcome #> '{observed_outcome,observation}' = issued
        and outcome #>> '{observed_outcome,outcome}' = 'success' and unsigned_journal -> 'transaction_hash' = outcome -> 'transaction_hash'
        and candidate -> 'initial_transaction_hash' = outcome -> 'transaction_hash' and candidate -> 'initial_outcome_hash' = outcome -> 'outcome_hash'
        and candidate -> 'claimable_balance_id' = selected #> '{acquisition,claim,original,claimableBalanceId}'
        and selected #> '{acquisition,claim,original}' = expected
        and selected #> '{acquisition,claim,claimedPrincipalStroops}' = candidate -> 'claimed_stroops'
        and selected #>> '{acquisition,claim,claimedPrincipalStroops}' ~ '^[1-9][0-9]{0,18}$'
        and incoming -> 'closedAt' = original -> 'confirmed_at' and incoming -> 'ledger' = original -> 'ledger'
        and original ->> 'request_id' = p_request_id::text and original #> '{payment,pool}' = lookup -> 'pool'
        and reads #> '{d1_load_refund_candidate,candidate}' = 'null'
        and reads #> '{d1_load_refund_outcome,outcome}' = 'null'
        and reads #> '{d1_load_refund_submission_attempt,attempt}' = 'null'
        and reads #> '{d1_load_refund_submission_attempt,journal,claim}' = 'null'
        and reads #> '{d1_load_refund_submission_attempt,journal,transaction}' = 'null') is not true then
        raise exception 'remainder_membership_conflict' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_current_membership_facts','revision',2,
        'request_id',p_request_id,'namespace',ns,'network','TESTNET','pool',lookup -> 'pool','authorized_by',p_authorized_by,
        'candidate',candidate,'owner',owner,'fence',fence,'unsigned',unsigned_journal,'outcome',outcome,'original',original,
        'claim',selected,'claim_set',claims,'history',history,'credit_state',credits,'fees',fees,'datasets',datasets,
        'reads',reads,'memberships',seen,'membership_count',pg_catalog.jsonb_array_length(funding -> 'membership'),'page_coverage',coverage);
end;
$$;
revoke all on function public.d1_remainder_membership_query_private(text,jsonb,uuid,uuid,text),
    public.d1_remainder_financial_membership_private(uuid,text,jsonb) from public, anon, authenticated, service_role;
commit;
