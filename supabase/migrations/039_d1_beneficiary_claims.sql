-- LOCAL UNVERIFIED SOURCE: opaque positive membership, never spending authority.
begin;
create table public.d1_beneficiary_claims (
    request_id uuid primary key references public.d1_unsigned_transactions(request_id),
    namespace uuid not null references public.d1_pools(namespace),
    claimable_balance_id text not null unique,
    transaction_hash text not null,
    operation_index integer not null check (operation_index between 0 and 99),
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (request_id) references public.d1_issuance_outcomes(request_id),
    unique (transaction_hash, operation_index)
);
alter table public.d1_beneficiary_claims enable row level security;
revoke all on public.d1_beneficiary_claims from public, anon, authenticated, service_role;

create function public.d1_load_beneficiary_claim(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_scope jsonb; v_receipt jsonb;
begin
    --032 ->031 ->030 ->018: current admin -> pool -> original journals;
    --024 history precedes039. Pool serialization protects absent rows too.
    v_scope := public.d1_load_issuance_outcome(p_request_id,p_authorized_by);
    perform public.d1_load_transaction_history_state((v_scope ->> 'namespace')::uuid,p_authorized_by);
    select receipt into v_receipt from public.d1_beneficiary_claims where request_id = p_request_id for update;
    return pg_catalog.jsonb_build_object('kind','d1_beneficiary_claim_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_scope -> 'namespace','network','TESTNET','pool',v_scope -> 'pool','claim',v_receipt);
end;
$$;

create function public.d1_record_beneficiary_claim(p_request_id uuid, p_authorized_by text, p_acquisition jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_receipt jsonb; a jsonb; c jsonb; o jsonb; r jsonb; t jsonb; h jsonb;
    u jsonb; i jsonb; p jsonb; s jsonb; incoming jsonb; issued jsonb; member jsonb; expected jsonb;
    shape record; k text; n numeric; gross numeric; principal numeric; op integer;
begin
    v_lookup := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by);
    -- Later reader admission must not authorize this writer, including exact replay.
    -- Match053: retain a current-admin membership lock through transaction completion.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    v_receipt := v_lookup -> 'claim';
    if v_receipt <> 'null'::jsonb then
        if v_receipt -> 'acquisition' is distinct from p_acquisition then
            raise exception 'beneficiary_claim_conflict' using errcode = '23505';
        end if;
        return v_receipt; -- Exact original actor/blob, not a fresh financial permit.
    end if;
    if pg_catalog.jsonb_typeof(p_acquisition) is distinct from 'object'
       or pg_catalog.octet_length(p_acquisition::text) > 2097152 then
        raise exception 'invalid_beneficiary_claim' using errcode = '22023';
    end if;
    a := p_acquisition -> 'acquisition'; c := p_acquisition -> 'claim'; o := c -> 'original'; r := c -> 'observation';
    -- Exact protocol/DTO keys; provider raw DTOs remain extensible, bounded opaque JSON.
    for shape in select * from (values
        (p_acquisition,'kind,revision,positiveAcquisition,provenance,claim,historyState,acquisition'),
        (a,'kind,version,origin,network,namespace,beneficiary,pool,requestId,firstLedger,anchor,claimableBalanceId,transactionHash,operationIndex,pages,records,evidence,executionAuthority,settlementAuthority'),
        (c,'kind,revision,requestId,namespace,network,pool,original,claimedPrincipalStroops,asset,originalGrossStroops,grossLessThisClaimStroops,claimOperationIndex,feePayer,feeChargedStroops,observation'),
        (o,'requestId,attemptId,outcomeHash,authorizedBy,donor,beneficiary,asset,amountStroops,operationId,paymentTransactionHash,deadline,issuanceTransactionHash,claimableBalanceId,feeChargedStroops,sequence'),
        (r,'network,transactionHash,source,sequence,feePayer,feeChargedStroops,feeBidStroops,outcome,ledger,ledgerHash,closedAt,pagingToken,envelopeXdr,resultXdr,operationTypes,poolOperationSourceIndices,raw,context'),
        (a -> 'evidence','raw,parsed'), (r -> 'raw','transaction,ledger'),
        (r -> 'context','pool,firstLedger,anchor'), (a -> 'anchor','sequence,hash,closedAt')
    ) as shapes(body,keys) loop
        if (pg_catalog.jsonb_typeof(shape.body) = 'object'
            and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
            and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
    end loop;
    if (p_acquisition ->> 'kind' = 'd1_beneficiary_claim_acquisition' and p_acquisition -> 'revision' = '1'
        and p_acquisition ->> 'positiveAcquisition' = 'pinned_testnet_horizon_beneficiary_transactions'
        and p_acquisition ->> 'provenance' = 'authenticated_saved_original_and_supplied_raw_inclusion'
        and a ->> 'kind' = 'd1_pinned_beneficiary_acquisition' and a -> 'version' = '1'
        and a ->> 'origin' = 'https://horizon-testnet.stellar.org' and a ->> 'network' = 'TESTNET'
        and a -> 'executionAuthority' = 'false' and a -> 'settlementAuthority' = 'false'
        and c ->> 'kind' = 'd1_positive_beneficiary_claim' and c -> 'revision' = '1'
        and c ->> 'network' = 'TESTNET' and r ->> 'network' = 'TESTNET' and r ->> 'outcome' = 'success'
        and pg_catalog.jsonb_typeof(r -> 'raw' -> 'transaction') = 'object'
        and pg_catalog.jsonb_typeof(r -> 'raw' -> 'ledger') = 'object') is not true then
        raise exception 'invalid_beneficiary_claim' using errcode = '22023';
    end if;
    foreach k in array array['pages','records','operationIndex'] loop
        if (pg_catalog.jsonb_typeof(a -> k) = 'number' and (a ->> k) ~ '^(0|[1-9][0-9]{0,2})$') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
    end loop;
    if (a ->> 'pages')::integer not between 1 and 5 or (a ->> 'records')::integer not between 1 and 500
       or (a ->> 'records')::integer > (a ->> 'pages')::integer * 100 or (a ->> 'operationIndex')::integer > 99 then
        raise exception 'invalid_beneficiary_claim' using errcode = '22023';
    end if;
    op := (a ->> 'operationIndex')::integer;
    foreach k in array array['claimedPrincipalStroops','originalGrossStroops','grossLessThisClaimStroops'] loop
        if (pg_catalog.jsonb_typeof(c -> k) = 'string' and (c ->> k) ~ '^(0|[1-9][0-9]{0,18})$') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
        if (c ->> k)::numeric > 9223372036854775807 then raise exception 'invalid_beneficiary_claim' using errcode = '22023'; end if;
    end loop;
    foreach k in array array['ledger','closedAt'] loop
        if (pg_catalog.jsonb_typeof(r -> k) = 'number' and (r ->> k) ~ '^(0|[1-9][0-9]{0,11})$') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
    end loop;
    foreach k in array array['pagingToken','sequence','feeChargedStroops','feeBidStroops'] loop
        if (pg_catalog.jsonb_typeof(r -> k) = 'string' and (r ->> k) ~ '^(0|[1-9][0-9]{0,19})$') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
        n := (r ->> k)::numeric;
        if n > (case when k = 'pagingToken' then 18446744073709551615 else 9223372036854775807 end)
           or (k <> 'feeChargedStroops' and n = 0) then raise exception 'invalid_beneficiary_claim' using errcode = '22023'; end if;
    end loop;
    foreach k in array array['envelopeXdr','resultXdr'] loop
        if (pg_catalog.jsonb_typeof(r -> k) = 'string' and length(r ->> k) between 4 and 65536
            and (r ->> k) ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$') is not true then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
        if pg_catalog.replace(pg_catalog.encode(pg_catalog.decode(r ->> k,'base64'),'base64'),E'\n','') <> r ->> k then
            raise exception 'invalid_beneficiary_claim' using errcode = '22023';
        end if;
    end loop;
    if pg_catalog.octet_length(r::text) > 131072
       or pg_catalog.jsonb_typeof(r -> 'transactionHash') is distinct from 'string'
       or pg_catalog.jsonb_typeof(r -> 'ledgerHash') is distinct from 'string'
       or pg_catalog.jsonb_typeof(r -> 'operationTypes') is distinct from 'array'
       or pg_catalog.jsonb_typeof(r -> 'poolOperationSourceIndices') is distinct from 'array' then
        raise exception 'invalid_beneficiary_claim' using errcode = '22023';
    end if;
    if exists (select 1 from pg_catalog.jsonb_array_elements(r -> 'operationTypes') x
        where pg_catalog.jsonb_typeof(x) <> 'number' or x::text !~ '^([0-9]|1[0-9]|2[0-3])$') then
        raise exception 'invalid_beneficiary_claim' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'beneficiary_claim_isolation_required' using errcode = '25000';
    end if;
    u := public.d1_load_unsigned_transaction(p_request_id,p_authorized_by) -> 'transaction';
    i := public.d1_load_issuance_outcome(p_request_id,p_authorized_by) -> 'outcome';
    p := u #> '{reservation,intent,preparation_input}';
    s := public.d1_load_transaction_history_state((v_lookup ->> 'namespace')::uuid,p_authorized_by);
    select record into incoming from public.d1_transaction_records where namespace = (v_lookup ->> 'namespace')::uuid
        and transaction_hash = p #>> '{payment,transaction_hash}';
    select record into issued from public.d1_transaction_records where namespace = (v_lookup ->> 'namespace')::uuid
        and transaction_hash = i ->> 'transaction_hash';
    select record into member from public.d1_transaction_records where namespace = (v_lookup ->> 'namespace')::uuid
        and transaction_hash = r ->> 'transactionHash';
    if (u -> 'transaction_hash' = i -> 'transaction_hash' and i #>> '{observed_outcome,outcome}' = 'success'
        and i #> '{observed_outcome,observation}' = issued and incoming is not null and issued is not null
        and p ->> 'request_id' = p_request_id::text and p #> '{payment,pool}' = v_lookup -> 'pool'
        and incoming -> 'ledger' = p -> 'ledger' and incoming -> 'closedAt' = p -> 'confirmed_at'
        and p #> '{payment,donor}' = p #> '{request,donor}' and p #> '{payment,asset}' = p #> '{request,asset}'
        and u -> 'deadline' = p #> '{request,deadline}'
        and s = p_acquisition -> 'historyState' and s -> 'coverage_complete' = 'true'
        and pg_catalog.jsonb_typeof(s -> 'checkpoint') = 'object'
        and pg_catalog.jsonb_typeof(p #> '{payment,amount}') = 'string' and (p #>> '{payment,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and pg_catalog.jsonb_typeof(p #> '{request,amount}') = 'string' and (p #>> '{request,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$') is not true then
        raise exception 'beneficiary_claim_conflict' using errcode = '23505';
    end if;
    gross := (p #>> '{payment,amount}')::numeric * 10000000; principal := (p #>> '{request,amount}')::numeric * 10000000;
    if principal <= 0 or principal > gross or gross > 9223372036854775807 then
        raise exception 'beneficiary_claim_conflict' using errcode = '23505';
    end if;
    expected := pg_catalog.jsonb_build_object('requestId',p_request_id,'attemptId',i -> 'attempt_id','outcomeHash',i -> 'outcome_hash',
        'authorizedBy',i -> 'authorized_by','donor',p #> '{payment,donor}','beneficiary',p #> '{request,beneficiary}',
        'asset',p #> '{payment,asset}','amountStroops',principal::bigint::text,'operationId',p #> '{payment,operation_id}',
        'paymentTransactionHash',p #> '{payment,transaction_hash}','deadline',u -> 'deadline','issuanceTransactionHash',i -> 'transaction_hash',
        'claimableBalanceId',i #> '{observed_outcome,claimableBalanceId}','feeChargedStroops',issued -> 'feeChargedStroops','sequence',issued -> 'sequence');
    t := r #> '{raw,transaction}'; h := r #> '{raw,ledger}';
    if (o = expected and principal > 0 and principal <= gross and gross <= 9223372036854775807
        and c ->> 'claimedPrincipalStroops' = principal::bigint::text and c ->> 'originalGrossStroops' = gross::bigint::text
        and c ->> 'grossLessThisClaimStroops' = (gross-principal)::bigint::text and c -> 'asset' = o -> 'asset'
        and a -> 'namespace' = v_lookup -> 'namespace' and c -> 'namespace' = v_lookup -> 'namespace'
        and a -> 'pool' = v_lookup -> 'pool' and c -> 'pool' = v_lookup -> 'pool'
        and a ->> 'requestId' = p_request_id::text and c ->> 'requestId' = p_request_id::text
        and a -> 'beneficiary' = o -> 'beneficiary' and a -> 'claimableBalanceId' = o -> 'claimableBalanceId'
        and (a ->> 'claimableBalanceId') ~ '^00000000[0-9a-f]{64}$' and (r ->> 'transactionHash') ~ '^[0-9a-f]{64}$'
        and (r ->> 'ledgerHash') ~ '^[0-9a-f]{64}$' and a -> 'transactionHash' = r -> 'transactionHash'
        and a -> 'operationIndex' = c -> 'claimOperationIndex' and c -> 'feePayer' = r -> 'feePayer'
        and c -> 'feeChargedStroops' = r -> 'feeChargedStroops' and r -> 'feePayer' = r -> 'source'
        and public.release_request_valid_key(r ->> 'source') and public.release_request_valid_key(o ->> 'beneficiary')
        and a -> 'firstLedger' = s -> 'first_ledger' and a -> 'anchor' = pg_catalog.jsonb_build_object(
            'sequence',s #> '{checkpoint,through_ledger}','hash',s #> '{checkpoint,ledger_hash}','closedAt',s #> '{checkpoint,closed_at}')
        and r -> 'context' = pg_catalog.jsonb_build_object('pool',v_lookup -> 'pool','firstLedger',s -> 'first_ledger','anchor',a -> 'anchor')
        and a #> '{evidence,parsed}' = r and a #> '{evidence,raw}' = (r -> 'raw') || pg_catalog.jsonb_build_object('context',r -> 'context')
        and (member is null or member = r) and (r ->> 'ledger')::bigint between (s ->> 'first_ledger')::bigint and (s #>> '{checkpoint,through_ledger}')::bigint
        and (r ->> 'closedAt')::bigint <= (s #>> '{checkpoint,closed_at}')::bigint
        and ((r -> 'ledger') <> s #> '{checkpoint,through_ledger}' or (r -> 'ledgerHash' = s #> '{checkpoint,ledger_hash}' and r -> 'closedAt' = s #> '{checkpoint,closed_at}'))
        and (r ->> 'pagingToken')::numeric > (issued ->> 'pagingToken')::numeric
        and trunc((r ->> 'pagingToken')::numeric/4294967296) = (r ->> 'ledger')::numeric
        and mod((r ->> 'pagingToken')::numeric,4096) = 0 and mod(trunc((r ->> 'pagingToken')::numeric/4096),1048576) > 0
        and (r ->> 'closedAt')::bigint >= (issued ->> 'closedAt')::bigint and (r ->> 'closedAt')::bigint >= (p ->> 'confirmed_at')::bigint
        and (r ->> 'closedAt')::bigint < extract(epoch from (u ->> 'deadline')::timestamptz)
        and extract(epoch from (u ->> 'deadline')::timestamptz) = (p ->> 'confirmed_at')::bigint + 300
        and pg_catalog.jsonb_typeof(r -> 'operationTypes') = 'array' and pg_catalog.jsonb_typeof(r -> 'poolOperationSourceIndices') = 'array'
        and pg_catalog.jsonb_array_length(r -> 'operationTypes') between 1 and 100
        and t -> 'operation_count' = pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(r -> 'operationTypes'))
        and (r -> 'operationTypes' -> op) = '15' and (r ->> 'feeChargedStroops')::numeric <= (r ->> 'feeBidStroops')::numeric
        and t @> pg_catalog.jsonb_build_object('hash',r -> 'transactionHash','paging_token',r -> 'pagingToken','ledger',r -> 'ledger',
            'source_account',r -> 'source','source_account_sequence',r -> 'sequence','fee_account',r -> 'feePayer',
            'fee_charged',r -> 'feeChargedStroops','max_fee',r -> 'feeBidStroops','successful',true,'envelope_xdr',r -> 'envelopeXdr','result_xdr',r -> 'resultXdr')
        and h @> pg_catalog.jsonb_build_object('sequence',r -> 'ledger','hash',r -> 'ledgerHash','closed_at',pg_catalog.to_char(
            pg_catalog.to_timestamp((r ->> 'closedAt')::double precision) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        and t -> 'created_at' = h -> 'closed_at' and not (t ?| array['source_account_muxed','fee_account_muxed'])) is not true then
        raise exception 'beneficiary_claim_conflict' using errcode = '23505';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_beneficiary_claim_journal','revision',1,'request_id',p_request_id,
        'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'acquisition_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_acquisition::text,'UTF8')),'hex'),'acquisition',p_acquisition);
    insert into public.d1_beneficiary_claims values (p_request_id,(v_lookup ->> 'namespace')::uuid,a ->> 'claimableBalanceId',r ->> 'transactionHash',op,v_receipt);
    -- Recheck original scope after unique-index waits; the independent admin lock remains held.
    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by);
    return v_receipt;
end;
$$;

create function public.d1_list_beneficiary_claim_set(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; receipts jsonb; dataset jsonb; n bigint; bytes bigint;
begin
    s := public.d1_load_transaction_history_state(p_namespace,p_authorized_by);
    select count(*),coalesce(sum(pg_catalog.octet_length(receipt::text)),0) into n,bytes
        from public.d1_beneficiary_claims where namespace = p_namespace;
    if n > 1000 or bytes > 33554432 then raise exception 'beneficiary_claim_set_limit' using errcode = '54000'; end if;
    select coalesce(pg_catalog.jsonb_agg(receipt order by request_id),'[]'::jsonb) into receipts
        from public.d1_beneficiary_claims where namespace = p_namespace;
    dataset := pg_catalog.jsonb_build_object('namespace',p_namespace,'network','TESTNET','pool',s -> 'pool','history_state',s,'count',n,'receipts',receipts);
    return dataset || pg_catalog.jsonb_build_object('kind','d1_beneficiary_claim_set','revision',1,
        'set_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(dataset::text,'UTF8')),'hex'));
end;
$$;
revoke all on function public.d1_load_beneficiary_claim(uuid,text), public.d1_record_beneficiary_claim(uuid,text,jsonb),
    public.d1_list_beneficiary_claim_set(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_beneficiary_claim(uuid,text), public.d1_record_beneficiary_claim(uuid,text,jsonb),
    public.d1_list_beneficiary_claim_set(uuid,text) to service_role;
comment on table public.d1_beneficiary_claims is 'Immutable opaque positive beneficiary evidence; no025 beneficiary-tx FK, SDK/provider proof, absence-zero, settlement, retry, release or owner retirement.';
commit;
