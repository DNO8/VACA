-- LOCAL UNVERIFIED SOURCE. SQL membership/arithmetic, NOT SDK/provider truth or permission.
begin;
create function public.d1_revalidate_remainder_financial_snapshot_private(
    p_request_id uuid, p_authorized_by text, p_snapshot jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
    facts jsonb; fresh jsonb; f jsonb; c jsonb; h jsonb; cp jsonb; a jsonb; anchor jsonb;
    ns uuid; pool text; original jsonb; claim jsonb; enc jsonb; credit jsonb; obs jsonb;
    operations jsonb; operations_after jsonb; tx jsonb; r jsonb; op jsonb; asset jsonb;
    shape record; operand record; field text; id text; donations jsonb := '[]';
    cumulative jsonb := '[]'; allocated jsonb := '[]';
    unexplained jsonb := '[]'; unmatched jsonb := '[]'; selected jsonb; creation jsonb; expected jsonb;
    original_projection jsonb; accounting_projection jsonb; operating jsonb; budget jsonb;
    seen jsonb := '{}'; credit_ids jsonb := '[]'; other_ids jsonb := '[]'; donation jsonb; b jsonb;
    gross numeric; principal numeric; remaining numeric; n numeric; credits numeric := 0; spent numeric := 0;
    native_gross numeric := 0; native_debt numeric := 0; debt numeric; issued_gross jsonb := '[]';
    base numeric; reserve numeric; minimum numeric; cap numeric; other numeric; physical numeric; team numeric;
    required numeric; available numeric; sequence_value numeric := null; previous_cursor numeric := 0;
    first_donation numeric; index_value integer; count_value bigint; byte_count bigint;
    capture_now numeric; final_now numeric; started numeric; observed numeric; expires numeric; age numeric; tolerance numeric;
    deadline numeric; first_ledger numeric; current_ledger numeric; closed numeric; selected_id text;
    max_money constant numeric := 9223372036854775807;
begin
    capture_now := extract(epoch from pg_catalog.clock_timestamp());
    facts := public.d1_remainder_financial_membership_private(p_request_id,p_authorized_by,p_snapshot);
    ns := (facts ->> 'namespace')::uuid; pool := facts ->> 'pool';
    f := p_snapshot -> 'funding'; c := facts -> 'candidate'; h := facts -> 'history'; cp := h -> 'checkpoint';
    a := f -> 'account'; original := facts -> 'original'; claim := facts #> '{claim,acquisition,claim}'; enc := claim -> 'original';
    select input into expected from public.d1_preparations where request_id = p_request_id and namespace = ns;
    if expected is distinct from original then raise exception 'remainder_preparation_conflict' using errcode = '23505'; end if;
    -- All JSON numbers, even nested opaque DTO numbers, must survive JS safe-integer transport.
    if (with recursive nodes(v,depth) as (
        select p_snapshot,0 union all
        select child.v,nodes.depth+1 from nodes cross join lateral (
            select value as v from pg_catalog.jsonb_each(case when pg_catalog.jsonb_typeof(nodes.v) = 'object' then nodes.v else '{}' end)
            union all select value from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(nodes.v) = 'array' then nodes.v else '[]' end)
        ) child where nodes.depth <= 60
    ) select count(*) > 200000 or pg_catalog.bool_or(depth > 60 or case when pg_catalog.jsonb_typeof(v) = 'number' then
        v::text::numeric <> trunc(v::text::numeric) or abs(v::text::numeric) > 9007199254740991 else false end) from nodes) then
        raise exception 'invalid_remainder_money_number' using errcode = '22023';
    end if;
    for shape in select * from (values
        (a,'pool,networkPassphrase,anchor,baseFee,baseReserve,sequence,lastModifiedLedger,native,issuedBalances,account'),
        (a -> 'anchor','sequence,hash,closedAt'), (a -> 'native','balance,sellingLiabilities'),
        (a -> 'account','subentry_count,num_sponsoring,num_sponsored'),
        (f -> 'creation','kind,revision,namespace,network,pool,firstLedger,anchor,creation'),
        (f #> '{creation,creation}','transactionHash,operationId,operationIndex,ledger,closedAt,funder,startingBalanceStroops'),
        (f -> 'originals','namespace,pool,firstLedger,anchor,transactions,operatingCredits,issuances'),
        (f -> 'credits','state,receipts,observedCreditStroops'),
        (f -> 'accounting','context,history'),
        (f #> '{accounting,context}','kind,revision,accounting,included,confirmedPoolFeesSpentStroops,held'),
        (f #> '{accounting,context,held}','commitment,activeOwner'),
        (f #> '{accounting,history}','state,records,confirmedPoolFeesSpentStroops')
    ) s(body,keys) loop
        if (pg_catalog.jsonb_typeof(shape.body) = 'object' and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
            and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
            raise exception 'invalid_remainder_money_shape' using errcode = '22023';
        end if;
    end loop;
    for operand in select * from (values
        (f -> 'startedAt',253402300799),(f -> 'observedAt',253402300799),(f -> 'expiresAt',253402300799),
        (f -> 'maximumAgeSeconds',30),(f -> 'futureToleranceSeconds',2),(p_snapshot -> 'observedAt',253402300799),
        (p_snapshot -> 'expiresAt',253402300799),(cp -> 'through_ledger',4294967295),(cp -> 'closed_at',253402300799),
        (h -> 'first_ledger',4294967295),(a -> 'lastModifiedLedger',4294967295),
        (a #> '{account,subentry_count}',4294967295),(a #> '{account,num_sponsoring}',4294967295),
        (a #> '{account,num_sponsored}',4294967295),(original -> 'confirmed_at',253402300799)
    ) s(body,maximum) loop
        if (pg_catalog.jsonb_typeof(operand.body) = 'number' and operand.body::text ~ '^(0|[1-9][0-9]*)$') is not true then
            raise exception 'invalid_remainder_money_number' using errcode = '22023';
        end if;
        if operand.body::text::numeric > operand.maximum then raise exception 'invalid_remainder_money_number' using errcode = '22023'; end if;
    end loop;
    started := (f ->> 'startedAt')::numeric; observed := (f ->> 'observedAt')::numeric; expires := (f ->> 'expiresAt')::numeric;
    age := (f ->> 'maximumAgeSeconds')::numeric; tolerance := (f ->> 'futureToleranceSeconds')::numeric;
    first_ledger := (h ->> 'first_ledger')::numeric; current_ledger := (cp ->> 'through_ledger')::numeric; closed := (cp ->> 'closed_at')::numeric;
    anchor := pg_catalog.jsonb_build_object('sequence',cp -> 'through_ledger','hash',cp -> 'ledger_hash','closedAt',cp -> 'closed_at');
    deadline := (original ->> 'confirmed_at')::numeric + 300;
    if (age >= 1 and first_ledger >= 1 and current_ledger >= first_ledger and started <= observed
        and observed <= capture_now + tolerance and observed - started <= age and capture_now - started <= age
        and observed - closed <= age and closed - observed <= tolerance and capture_now - closed < age
        and closed - capture_now <= tolerance and expires = closed + age and observed < expires
        and p_snapshot -> 'observedAt' = f -> 'observedAt' and p_snapshot -> 'expiresAt' = f -> 'expiresAt'
        and a ->> 'pool' = pool and a ->> 'networkPassphrase' = 'Test SDF Network ; September 2015'
        and a -> 'anchor' = anchor and (a ->> 'lastModifiedLedger')::numeric between first_ledger and current_ledger
        and c ->> 'deadline' = pg_catalog.to_char(pg_catalog.to_timestamp(deadline::double precision) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
        and capture_now >= deadline and pg_catalog.jsonb_typeof(a -> 'issuedBalances') = 'array') is not true then
        raise exception 'remainder_money_window_conflict' using errcode = '23505';
    end if;
    -- Canonical operands BEFORE casts; JSON null and missing values never become zero.
    for operand in select body from (values
        (a -> 'baseFee'),(a -> 'baseReserve'),(a -> 'sequence'),(a #> '{native,balance}'),(a #> '{native,sellingLiabilities}'),
        (c -> 'source_sequence'),(c -> 'transaction_sequence'),(c -> 'gross_stroops'),(c -> 'claimed_stroops'),(c -> 'remaining_stroops'),
        (claim -> 'claimedPrincipalStroops'),(claim -> 'originalGrossStroops'),(claim -> 'grossLessThisClaimStroops'),
        (facts #> '{fees,commitment,issuance_fee_stroops}'),(facts #> '{fees,commitment,future_refund_fee_stroops}')
    ) s(body) loop
        if (pg_catalog.jsonb_typeof(operand.body) = 'string' and operand.body #>> '{}' ~ '^(0|[1-9][0-9]{0,18})$') is not true then
            raise exception 'invalid_remainder_money_operand' using errcode = '22023';
        end if;
        if (operand.body #>> '{}')::numeric > max_money then raise exception 'invalid_remainder_money_operand' using errcode = '22023'; end if;
    end loop;
    if (pg_catalog.jsonb_typeof(c -> 'valid_until') = 'string' and (c ->> 'valid_until') ~ '^(0|[1-9][0-9]{0,11})$'
        and pg_catalog.jsonb_typeof(original #> '{payment,amount}') = 'string'
        and (original #>> '{payment,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and pg_catalog.jsonb_typeof(original #> '{request,amount}') = 'string'
        and (original #>> '{request,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$') is not true then
        raise exception 'invalid_remainder_money_operand' using errcode = '22023';
    end if;
    gross := (original #>> '{payment,amount}')::numeric * 10000000;
    principal := (original #>> '{request,amount}')::numeric * 10000000; remaining := gross - principal;
    if (gross <= max_money and principal > 0 and remaining > 0 and c ->> 'gross_stroops' = gross::bigint::text
        and c ->> 'claimed_stroops' = principal::bigint::text and c ->> 'remaining_stroops' = remaining::bigint::text
        and claim ->> 'claimedPrincipalStroops' = principal::bigint::text and claim ->> 'originalGrossStroops' = gross::bigint::text
        and claim ->> 'grossLessThisClaimStroops' = remaining::bigint::text and enc ->> 'amountStroops' = principal::bigint::text
        and c -> 'donor' = original #> '{payment,donor}' and c -> 'asset' = original #> '{payment,asset}'
        and (c ->> 'valid_until')::numeric <= 253402300799 and (c ->> 'valid_until')::numeric > capture_now) is not true then
        raise exception 'remainder_money_principal_conflict' using errcode = '23505';
    end if;
    --019 was NOT enumerated by042. Obtain the WHOLE namespace set independently.
    select count(*),coalesce(sum(pg_catalog.octet_length(record::text)),0) into count_value,byte_count
        from public.d1_discovery_operations where namespace = ns;
    if count_value > 100000 or byte_count > 33554432 then raise exception 'remainder_money_limit' using errcode = '54000'; end if;
    select coalesce(pg_catalog.jsonb_agg(record order by paging_token::numeric),'[]') into operations
        from public.d1_discovery_operations where namespace = ns;
    -- Every normalized operation must bind an actual whole025 successful transaction/index/raw envelope.
    for r in select value from pg_catalog.jsonb_array_elements(operations) loop
        op := r -> 'operation'; id := r ->> 'operation_id';
        if (pg_catalog.jsonb_typeof(r -> 'operation_id') = 'string' and id ~ '^[1-9][0-9]{0,19}$'
            and r -> 'paging_token' = r -> 'operation_id' and pg_catalog.jsonb_typeof(op) = 'object') is not true then
            raise exception 'invalid_remainder_income' using errcode = '22023';
        end if;
        if id::numeric > 18446744073709551615 or seen ? id then raise exception 'invalid_remainder_income' using errcode = '22023'; end if;
        seen := seen || pg_catalog.jsonb_build_object(id,true);
        select value into tx from pg_catalog.jsonb_array_elements(facts #> '{datasets,transactions}')
            where value -> 'transactionHash' = r -> 'transaction_hash';
        index_value := mod(id::numeric,4096)::integer - 1;
        if (tx ->> 'outcome' = 'success' and r -> 'ledger' = tx -> 'ledger' and index_value between 0 and 99
            and id::numeric = (tx ->> 'pagingToken')::numeric + index_value + 1
            and op #> '{raw,transaction}' = tx #> '{raw,transaction}' and op -> 'confirmed_at' = tx -> 'closedAt'
            and op -> 'sdk_type' = tx -> 'operationTypes' -> index_value
            and op #> '{raw,operation,id}' = r -> 'operation_id'
            and op #> '{raw,operation,transaction_hash}' = tx -> 'transactionHash'
            and op #> '{raw,operation,transaction_successful}' = 'true'
            and op #> '{raw,operation,source_account}' = op -> 'source'
            and public.release_request_valid_key(op ->> 'source')
            and ((op ->> 'source' = pool) = (tx -> 'poolOperationSourceIndices' @> pg_catalog.jsonb_build_array(index_value)))) is not true then
            raise exception 'remainder_income_identity_conflict' using errcode = '23505';
        end if;
    end loop;
    -- Credit exclusions are positive full022 identities, never memo-only or caller-selected.
    for credit in select value from pg_catalog.jsonb_array_elements(facts #> '{datasets,credits}') loop
        obs := credit -> 'observation'; id := obs ->> 'operationId';
        select value into r from pg_catalog.jsonb_array_elements(operations) where value ->> 'operation_id' = id;
        op := r -> 'operation';
        if (credit ->> 'kind' = 'd1_operating_credit_observation' and credit -> 'revision' = '1'
            and obs ->> 'namespace' = ns::text and obs ->> 'network' = 'TESTNET' and obs ->> 'pool' = pool
            and obs -> 'record' = r and obs -> 'transactionHash' = r -> 'transaction_hash'
            and obs -> 'ledger' = r -> 'ledger' and obs -> 'funder' = op -> 'source' and obs ->> 'funder' <> pool
            and op -> 'memo' = '{"type":"text","value":"D1OPS"}'
            and op #>> '{raw,transaction,memo_type}' = 'text' and op #>> '{raw,transaction,memo}' = 'D1OPS'
            and (obs #>> '{anchor,sequence}')::numeric between (obs ->> 'ledger')::numeric and current_ledger
            and (obs #>> '{anchor,closedAt}')::numeric between (op ->> 'confirmed_at')::numeric and closed
            and case when obs #> '{anchor,sequence}' = cp -> 'through_ledger' then obs -> 'anchor' = anchor
                else (obs #>> '{anchor,closedAt}')::numeric < closed end
            and (op ->> 'kind' = 'account_created' or (op ->> 'kind' = 'incoming_payment' and op -> 'asset' = '{"type":"native"}'))
            and not (credit_ids ? id) and pg_catalog.jsonb_typeof(obs -> 'amountStroops') = 'string'
            and (obs ->> 'amountStroops') ~ '^[1-9][0-9]{0,18}$') is not true then
            raise exception 'remainder_credit_identity_conflict' using errcode = '23505';
        end if;
        n := (obs ->> 'amountStroops')::numeric;
        field := case when op ->> 'kind' = 'account_created' then 'starting_balance' else 'amount' end;
        if (pg_catalog.jsonb_typeof(op -> field) = 'string' and (op ->> field) ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$') is not true then
            raise exception 'invalid_remainder_credit' using errcode = '22023';
        end if;
        if n > max_money or n <> (op ->> field)::numeric * 10000000 or exists (
            select 1 from public.donation_payments where transaction_hash = obs ->> 'transactionHash' and operation_id = id) then
            raise exception 'remainder_credit_identity_conflict' using errcode = '23505';
        end if;
        credit_ids := credit_ids || pg_catalog.jsonb_build_array(id); credits := credits + n;
    end loop;
    -- Derive all positive original income, preserving every OTHER donor's entire gross.
    for r in select value from pg_catalog.jsonb_array_elements(operations) loop
        op := r -> 'operation'; id := r ->> 'operation_id';
        if op ->> 'kind' not in ('incoming_payment','account_created') then continue; end if;
        field := case when op ->> 'kind' = 'account_created' then 'starting_balance' else 'amount' end;
        asset := case when field = 'starting_balance' then '{"type":"native"}'::jsonb else op -> 'asset' end;
        if (op ->> 'pool' = pool and op ->> 'source' <> pool and public.release_request_valid_key(op ->> 'source')
            and pg_catalog.jsonb_typeof(op -> field) = 'string' and (op ->> field) ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
            and (asset = '{"type":"native"}' or (pg_catalog.jsonb_typeof(asset) = 'object' and asset ->> 'type' = 'issued'
                and asset - array['type','code','issuer'] = '{}' and pg_catalog.jsonb_typeof(asset -> 'code') = 'string'
                and pg_catalog.jsonb_typeof(asset -> 'issuer') = 'string' and (asset ->> 'code') ~ '^[A-Za-z0-9]{1,12}$'
                and public.release_request_valid_key(asset ->> 'issuer')))
            and op -> (case when field = 'starting_balance' then 'funder' else 'donor' end) = op -> 'source'
            and op ->> 'sdk_type' = case when field = 'starting_balance' then '0' else '1' end) is not true then
            raise exception 'invalid_remainder_income' using errcode = '22023';
        end if;
        n := (op ->> field)::numeric * 10000000;
        if n <= 0 or n > max_money then raise exception 'invalid_remainder_income' using errcode = '22023'; end if;
        -- Bind SQL-visible normalized operands to the concrete Horizon operation too.
        if (op #> array['raw','operation',field] = op -> field and op #>> '{raw,operation,type}' =
            case when field = 'starting_balance' then 'create_account' else 'payment' end
            and op #> array['raw','operation',case when field = 'starting_balance' then 'funder' else 'from' end] = op -> 'source'
            and op #>> array['raw','operation',case when field = 'starting_balance' then 'account' else 'to' end] = pool
            and (field = 'starting_balance' or case when asset ->> 'type' = 'native' then
                op #>> '{raw,operation,asset_type}' = 'native' else
                op #> '{raw,operation,asset_code}' = asset -> 'code' and op #> '{raw,operation,asset_issuer}' = asset -> 'issuer'
                and op #>> '{raw,operation,asset_type}' = case when length(asset ->> 'code') <= 4 then 'credit_alphanum4' else 'credit_alphanum12' end end)) is not true then
            raise exception 'remainder_income_raw_conflict' using errcode = '23505';
        end if;
        if credit_ids ? id then continue; end if;
        if field = 'starting_balance' then raise exception 'uncredited_remainder_creation' using errcode = '23505'; end if;
        donation := pg_catalog.jsonb_build_object('donor',op -> 'source','asset',asset,'amountStroops',n::bigint::text,
            'operationId',id,'transactionHash',r -> 'transaction_hash','confirmedAt',op -> 'confirmed_at');
        donations := donations || pg_catalog.jsonb_build_array(donation);
        if first_donation is null then first_donation := id::numeric; end if;
        if asset = '{"type":"native"}' then native_gross := native_gross + n; end if;
        if id = original #>> '{payment,operation_id}' then
            if (r -> 'transaction_hash' = original #> '{payment,transaction_hash}' and op -> 'source' = original #> '{payment,donor}'
                and asset = original #> '{payment,asset}' and n = gross and op -> 'confirmed_at' = original -> 'confirmed_at'
                and r -> 'ledger' = original -> 'ledger') is not true then
                raise exception 'remainder_selected_income_conflict' using errcode = '23505';
            end if;
            selected_id := id;
        end if;
    end loop;
    if selected_id is null then raise exception 'remainder_selected_income_missing' using errcode = '23505'; end if;
    -- Creation must really be the first observed history transaction AND a022 credit.
    tx := facts #> '{datasets,transactions,0}'; creation := f #> '{creation,creation}';
    select value into credit from pg_catalog.jsonb_array_elements(facts #> '{datasets,credits}')
        where value #> '{observation,operationId}' = creation -> 'operationId';
    obs := credit -> 'observation';
    expected := pg_catalog.jsonb_build_object('transactionHash',tx -> 'transactionHash','operationId',obs -> 'operationId',
        'operationIndex',((obs ->> 'operationId')::numeric - (tx ->> 'pagingToken')::numeric - 1),
        'ledger',tx -> 'ledger','closedAt',tx -> 'closedAt','funder',obs -> 'funder','startingBalanceStroops',obs -> 'amountStroops');
    select count(*) into count_value from pg_catalog.jsonb_array_elements(operations) where value #>> '{operation,kind}' = 'account_created';
    if (creation = expected and credit is not null and count_value = 1 and obs #>> '{record,operation,kind}' = 'account_created'
        and tx ->> 'outcome' = 'success' and tx -> 'ledger' = h -> 'first_ledger'
        and f -> 'creation' = pg_catalog.jsonb_build_object('kind','d1_pool_creation_evidence','revision',1,'namespace',ns,
            'network','TESTNET','pool',pool,'firstLedger',h -> 'first_ledger','anchor',anchor,'creation',creation)
        and f #> '{originals,namespace}' = facts -> 'namespace' and f #>> '{originals,pool}' = pool
        and f #> '{originals,firstLedger}' = h -> 'first_ledger' and f #> '{originals,anchor}' = anchor) is not true then
        raise exception 'remainder_creation_conflict' using errcode = '23505';
    end if;
    -- Whole025: fees include failed transactions; no skipping external fee payers or pool sequences.
    for tx in select value from pg_catalog.jsonb_array_elements(facts #> '{datasets,transactions}') loop
        foreach field in array array['sequence','feeChargedStroops','feeBidStroops','pagingToken'] loop
            if (pg_catalog.jsonb_typeof(tx -> field) = 'string' and (tx ->> field) ~ '^(0|[1-9][0-9]{0,19})$') is not true then
                raise exception 'invalid_remainder_transaction' using errcode = '22023';
            end if;
            if (tx ->> field)::numeric > (case when field = 'pagingToken' then 18446744073709551615 else max_money end) then
                raise exception 'invalid_remainder_transaction' using errcode = '22023';
            end if;
        end loop;
        if (tx ->> 'sequence')::numeric <= 0 or (tx ->> 'feeBidStroops')::numeric <= 0
            or (tx ->> 'feeChargedStroops')::numeric > (tx ->> 'feeBidStroops')::numeric
            or (tx ->> 'pagingToken')::numeric <= previous_cursor then raise exception 'invalid_remainder_transaction' using errcode = '22023'; end if;
        previous_cursor := (tx ->> 'pagingToken')::numeric;
        if (tx ->> 'network' = 'TESTNET' and tx #>> '{context,pool}' = pool and tx -> 'feePayer' = tx -> 'source'
            and tx ->> 'outcome' in ('success','failed') and tx #> '{raw,transaction,fee_charged}' = tx -> 'feeChargedStroops'
            and tx #> '{raw,transaction,max_fee}' = tx -> 'feeBidStroops' and tx #> '{raw,transaction,source_account_sequence}' = tx -> 'sequence'
            and tx #> '{raw,transaction,envelope_xdr}' = tx -> 'envelopeXdr' and tx #> '{raw,transaction,result_xdr}' = tx -> 'resultXdr'
            and tx #> '{raw,transaction,hash}' = tx -> 'transactionHash'
            and tx #> '{raw,transaction,successful}' = pg_catalog.to_jsonb(tx ->> 'outcome' = 'success')
            and pg_catalog.jsonb_typeof(tx -> 'operationTypes') = 'array'
            and tx #> '{raw,transaction,operation_count}' = pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(tx -> 'operationTypes'))
            and (tx ->> 'ledger')::numeric between first_ledger and current_ledger and (tx ->> 'closedAt')::numeric <= closed
            and tx #> '{context,firstLedger}' = h -> 'first_ledger'
            and (tx #>> '{context,anchor,sequence}')::numeric <= current_ledger
            and case when tx #> '{context,anchor,sequence}' = cp -> 'through_ledger' then tx #> '{context,anchor}' = anchor
                else (tx #>> '{context,anchor,closedAt}')::numeric < closed end) is not true then
            raise exception 'remainder_transaction_conflict' using errcode = '23505';
        end if;
        if tx ->> 'feePayer' = pool then spent := spent + (tx ->> 'feeChargedStroops')::numeric; end if;
        if tx ->> 'source' = pool then
            if (tx -> 'transactionHash' = facts #> '{outcome,transaction_hash}'
                or (tx = claim -> 'observation' and tx -> 'operationTypes' = '[15]' and claim -> 'claimOperationIndex' = '0')) is not true
                or (sequence_value is not null and (tx ->> 'sequence')::numeric <> sequence_value + 1) then
                raise exception 'unknown_remainder_pool_sequence' using errcode = '23505';
            end if;
            sequence_value := (tx ->> 'sequence')::numeric;
        end if;
        if tx ->> 'outcome' = 'failed' then continue; end if;
        for index_value in 0..pg_catalog.jsonb_array_length(tx -> 'operationTypes')-1 loop
            select value into r from pg_catalog.jsonb_array_elements(operations)
                where (value ->> 'operation_id')::numeric = (tx ->> 'pagingToken')::numeric + index_value + 1;
            op := r -> 'operation'; n := (tx -> 'operationTypes' ->> index_value)::numeric;
            -- Missing monetary operations are never inferred unrelated. Unsupported effects fail closed.
            if r is null and n <> 10 then raise exception 'remainder_operation_coverage_missing' using errcode = '23505'; end if;
            if tx -> 'poolOperationSourceIndices' @> pg_catalog.jsonb_build_array(index_value) then
                if n = 6 and (r ->> 'operation_id')::numeric < first_donation then continue; end if;
                expected := pg_catalog.jsonb_build_object('transactionHash',tx -> 'transactionHash','operationIndex',index_value,'reason','unexplained_pool_operation');
                unexplained := unexplained || pg_catalog.jsonb_build_array(expected);
                if tx -> 'transactionHash' = facts #> '{outcome,transaction_hash}' and index_value = 0 and n = 14 then continue; end if;
                unmatched := unmatched || pg_catalog.jsonb_build_array(expected);
                if (tx = claim -> 'observation' and claim -> 'claimOperationIndex' = pg_catalog.to_jsonb(index_value)
                    and n = 15 and tx -> 'operationTypes' = '[15]') is not true then
                    raise exception 'unknown_remainder_outgoing' using errcode = '23505';
                end if;
            elsif n not in (0,1,10) then
                expected := pg_catalog.jsonb_build_object('transactionHash',tx -> 'transactionHash','operationIndex',index_value,'reason','unsupported_operation');
                unexplained := unexplained || pg_catalog.jsonb_build_array(expected); unmatched := unmatched || pg_catalog.jsonb_build_array(expected);
                if (tx = claim -> 'observation' and claim -> 'claimOperationIndex' = pg_catalog.to_jsonb(index_value) and n = 15) is not true then
                    raise exception 'unknown_remainder_operation' using errcode = '23505';
                end if;
            elsif n in (0,1) and (op ->> 'kind' in ('incoming_payment','account_created')) is not true then
                raise exception 'unknown_remainder_income' using errcode = '23505';
            end if;
        end loop;
    end loop;
    if sequence_value is null or sequence_value >= max_money or a ->> 'sequence' <> sequence_value::bigint::text
        or c ->> 'source_sequence' <> sequence_value::bigint::text or c ->> 'transaction_sequence' <> (sequence_value+1)::bigint::text then
        raise exception 'remainder_current_sequence_conflict' using errcode = '23505';
    end if;
    for donation in select value from pg_catalog.jsonb_array_elements(donations) loop
        id := donation ->> 'operationId'; n := (donation ->> 'amountStroops')::numeric;
        debt := n - case when id = selected_id then principal else 0 end;
        expected := donation || pg_catalog.jsonb_build_object('verifiedBeneficiaryPrincipalStroops',case when id = selected_id then principal::bigint::text else '0' end,
            'verifiedSuccessfulDonorRefundStroops','0','observedReturnedPrincipalStroops',null,'remainingProtectedPrincipalStroops',debt::bigint::text,
            'returnUnresolved',true,'positivelyClaimedBalanceIds',case when id = selected_id then pg_catalog.jsonb_build_array(enc -> 'claimableBalanceId') else '[]'::jsonb end);
        cumulative := cumulative || pg_catalog.jsonb_build_array(expected);
        allocated := allocated || pg_catalog.jsonb_build_array(donation || pg_catalog.jsonb_build_object(
            'issuedStroops',case when id = selected_id then principal::bigint::text else '0' end,'unissuedStroops',debt::bigint::text));
        if id = selected_id then selected := expected; else other_ids := other_ids || pg_catalog.jsonb_build_array(id); end if;
        if donation -> 'asset' = '{"type":"native"}' then native_debt := native_debt + debt; end if;
    end loop;
    -- Every issued asset is covered; every account trustline has an explicit obligation (even zero).
    seen := '{}';
    for b in select value from pg_catalog.jsonb_array_elements(a -> 'issuedBalances') loop
        if (pg_catalog.jsonb_typeof(b) = 'object' and b ?& array['code','issuer','balance','sellingLiabilities']
            and b - array['code','issuer','balance','sellingLiabilities'] = '{}' and pg_catalog.jsonb_typeof(b -> 'code') = 'string'
            and pg_catalog.jsonb_typeof(b -> 'issuer') = 'string' and (b ->> 'code') ~ '^[A-Za-z0-9]{1,12}$'
            and public.release_request_valid_key(b ->> 'issuer')) is not true then raise exception 'invalid_remainder_balance' using errcode = '22023'; end if;
        foreach field in array array['balance','sellingLiabilities'] loop
            if (pg_catalog.jsonb_typeof(b -> field) = 'string' and (b ->> field) ~ '^(0|[1-9][0-9]{0,18})$') is not true then
                raise exception 'invalid_remainder_balance' using errcode = '22023'; end if;
            if (b ->> field)::numeric > max_money then raise exception 'invalid_remainder_balance' using errcode = '22023'; end if;
        end loop;
        id := (b ->> 'code') || ':' || (b ->> 'issuer');
        if seen ? id then raise exception 'duplicate_remainder_balance' using errcode = '22023'; end if;
        seen := seen || pg_catalog.jsonb_build_object(id,true);
        select coalesce(sum((value ->> 'remainingProtectedPrincipalStroops')::numeric),0) into debt
            from pg_catalog.jsonb_array_elements(cumulative) where value -> 'asset' = pg_catalog.jsonb_build_object('type','issued','code',b -> 'code','issuer',b -> 'issuer');
        if (b ->> 'balance')::numeric - (b ->> 'sellingLiabilities')::numeric < debt or debt > max_money then
            raise exception 'remainder_issued_principal_uncovered' using errcode = '23505'; end if;
    end loop;
    for asset in select distinct value -> 'asset' from pg_catalog.jsonb_array_elements(donations) where value #>> '{asset,type}' = 'issued' loop
        if not (seen ? ((asset ->> 'code') || ':' || (asset ->> 'issuer'))) then raise exception 'remainder_trustline_missing' using errcode = '23505'; end if;
        select sum((value ->> 'amountStroops')::numeric) into n from pg_catalog.jsonb_array_elements(donations) where value -> 'asset' = asset;
        if n > max_money then raise exception 'invalid_remainder_money_total' using errcode = '22023'; end if;
        issued_gross := issued_gross || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code',asset -> 'code','issuer',asset -> 'issuer','amountStroops',n::bigint::text));
    end loop;
    -- Compare canonical asset sets, not PostgreSQL collation versus SDK localeCompare ordering.
    select coalesce(pg_catalog.jsonb_agg(value order by value::text),'[]') into issued_gross from pg_catalog.jsonb_array_elements(issued_gross);
    expected := f #> '{accounting,context,accounting,original,issuedDonorLiabilities}';
    if pg_catalog.jsonb_typeof(expected) is distinct from 'array' then raise exception 'invalid_remainder_issued_projection' using errcode = '22023'; end if;
    select coalesce(pg_catalog.jsonb_agg(value order by value::text),'[]') into b from pg_catalog.jsonb_array_elements(expected);
    if b is distinct from issued_gross then raise exception 'remainder_issued_projection_conflict' using errcode = '23505'; end if;
    issued_gross := expected; -- Values/uniqueness independently checked above; preserve SDK array order only.
    original_projection := pg_catalog.jsonb_build_object('nativeDonorLiabilityStroops',native_gross::bigint::text,'issuedDonorLiabilities',issued_gross,
        'donations',donations,'observedOperatingCreditStroops',credits::bigint::text,'operatingOperationIds',credit_ids,'unexplainedActivity',unexplained);
    accounting_projection := pg_catalog.jsonb_build_object('kind','d1_issuance_encumbrances','revision',1,'original',original_projection,
        'donations',allocated,'encumbrances',pg_catalog.jsonb_build_array(enc),'failedIssuances','[]'::jsonb,'unmatchedActivity',unmatched);
    base := (a ->> 'baseFee')::numeric; reserve := (a ->> 'baseReserve')::numeric;
    minimum := reserve * (2 + (a #>> '{account,subentry_count}')::numeric + (a #>> '{account,num_sponsoring}')::numeric - (a #>> '{account,num_sponsored}')::numeric);
    cap := (facts #>> '{fees,commitment,future_refund_fee_stroops}')::numeric;
    other := pg_catalog.jsonb_array_length(other_ids) * base;
    physical := (a #>> '{native,balance}')::numeric - (a #>> '{native,sellingLiabilities}')::numeric - native_debt;
    team := credits - spent; available := least(team,physical); required := minimum + other + cap;
    for n in select unnest(array[credits,spent,native_gross,native_debt,base,reserve,minimum,cap,other,physical,team,available,required,available-required,cap-base,other+cap-base]) loop
        if n is null or n < 0 or n > max_money then raise exception 'remainder_money_insufficient' using errcode = '23505'; end if;
    end loop;
    if base <= 0 or reserve <= 0 or cap < base or base > 4294967295 or reserve > 4294967295
        or (facts #>> '{fees,commitment,issuance_fee_stroops}')::numeric <= 0 then
        raise exception 'invalid_remainder_fee_reserve' using errcode = '22023'; end if;
    operating := pg_catalog.jsonb_build_object('currentMinimum',minimum::bigint::text,'otherFutureFees',(other+cap-base)::bigint::text,
        'newClaimantReserve','0','transactionFee',base::bigint::text,'newFutureRefundFee','0','requiredOperating',required::bigint::text,
        'teamCap',team::bigint::text,'physicalCap',physical::bigint::text,'availableOperating',available::bigint::text,'remainingOperating',(available-required)::bigint::text);
    budget := pg_catalog.jsonb_build_object('minimumTransactionFee',base::bigint::text,'protectedSelectedExcess',(cap-base)::bigint::text,
        'requiredOperating',required::bigint::text,'teamCap',team::bigint::text,'availableOperating',available::bigint::text,'remainingOperating',(available-required)::bigint::text);
    if (f #> '{accounting,context,accounting}' = accounting_projection and f -> 'selected' = selected
        and f -> 'cumulative' = pg_catalog.jsonb_build_object('kind','d1_cumulative_remainders','revision',1,'executionAuthority',false,
            'settlementAuthority',false,'donations',cumulative,'unmatchedActivity',unmatched)
        and f #> '{credits,observedCreditStroops}' = pg_catalog.to_jsonb(credits::bigint::text)
        and f #> '{accounting,context,kind}' = '"d1_issuance_accounting_context"' and f #> '{accounting,context,revision}' = '1'
        and f #> '{accounting,context,included}' = pg_catalog.jsonb_build_object('feeChargedStroops',enc -> 'feeChargedStroops','sequence',enc -> 'sequence','claimableBalanceId',enc -> 'claimableBalanceId')
        and f #> '{accounting,context,confirmedPoolFeesSpentStroops}' = pg_catalog.to_jsonb(spent::bigint::text)
        and f #> '{accounting,history,confirmedPoolFeesSpentStroops}' = pg_catalog.to_jsonb(spent::bigint::text)
        and f -> 'otherRefundOperationIds' = other_ids and f -> 'otherHeldFees' = pg_catalog.to_jsonb(other::bigint::text)
        and f -> 'operating' = operating and f -> 'budget' = budget) is not true then
        raise exception 'remainder_money_projection_conflict' using errcode = '23505';
    end if;
    -- No historical proof renews: reload complete memberships and independent019 again.
    fresh := public.d1_remainder_financial_membership_private(p_request_id,p_authorized_by,p_snapshot);
    select input into expected from public.d1_preparations where request_id = p_request_id and namespace = ns;
    if expected is distinct from original then raise exception 'remainder_preparation_conflict' using errcode = '23505'; end if;
    select coalesce(pg_catalog.jsonb_agg(record order by paging_token::numeric),'[]') into operations_after
        from public.d1_discovery_operations where namespace = ns;
    if fresh is distinct from facts or operations_after is distinct from operations then raise exception 'remainder_money_current_conflict' using errcode = '23505'; end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    final_now := extract(epoch from pg_catalog.clock_timestamp());
    if final_now < capture_now or final_now < deadline or final_now >= expires or final_now >= (c ->> 'valid_until')::numeric
        or final_now - started > age or final_now - closed >= age or closed - final_now > tolerance then
        raise exception 'remainder_money_expired' using errcode = '22023';
    end if;
end;
$$;
revoke all on function public.d1_revalidate_remainder_financial_snapshot_private(uuid,text,jsonb)
    from public, anon, authenticated, service_role;
commit;
