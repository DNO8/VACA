-- LOCAL UNVERIFIED SOURCE: immutable partial bytes, never financial/signing authority.
begin;
create table public.d1_remainder_candidates (
    request_id uuid primary key references public.d1_beneficiary_claims(request_id),
    namespace uuid not null unique references public.d1_refund_lane_fences(namespace),
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    foreign key (request_id) references public.d1_issuance_outcomes(request_id),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id)
);
alter table public.d1_remainder_candidates enable row level security;
revoke all on public.d1_remainder_candidates from public, anon, authenticated, service_role;

create function public.d1_load_remainder_candidate(p_request_id uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; f jsonb; c jsonb;
begin
    --039 ->032 ->031 ->030 ->018: admin -> pool -> originals ->024 history.
    -- Then033 owner ->040 fence ->041. Pool lock serializes absent rows too.
    s := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by);
    perform public.d1_load_active_issuance_sequence((s ->> 'namespace')::uuid,p_authorized_by);
    f := public.d1_load_refund_lane_fence(p_request_id,p_authorized_by) -> 'fence';
    select receipt into c from public.d1_remainder_candidates where request_id = p_request_id for update;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_candidate_lookup','revision',2,
        'request_id',p_request_id,'namespace',s -> 'namespace','network','TESTNET','pool',s -> 'pool','candidate',c,'fence',f);
end;
$$;

create function public.d1_record_remainder_candidate(
    p_request_id uuid, p_authorized_by text, p_unsigned_xdr text, p_transaction_hash text,
    p_source_sequence text, p_valid_until text, p_claim_set_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    lookup jsonb; previous jsonb; u jsonb; i jsonb; p jsonb; owner jsonb;
    claims jsonb; selected jsonb; c jsonb; original jsonb; expected jsonb; history jsonb;
    entry jsonb; saved jsonb; observation jsonb; member jsonb; incoming jsonb; issued jsonb;
    receipt jsonb; ns uuid; gross numeric; principal numeric; prefix_count bigint; prefix_cursor numeric;
    deadline text; initial_sequence text; now_seconds numeric;
begin
    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);
    previous := lookup -> 'candidate';
    -- Historical exact replay deliberately precedes current set/clock/owner checks.
    -- No refresh of old set hash, actor, bytes, fence or time bounds is permitted.
    if previous <> 'null'::jsonb then
        if previous ->> 'unsigned_xdr' is distinct from p_unsigned_xdr
           or previous ->> 'transaction_hash' is distinct from p_transaction_hash
           or previous ->> 'source_sequence' is distinct from p_source_sequence
           or previous ->> 'valid_until' is distinct from p_valid_until
           or previous ->> 'claim_set_hash' is distinct from p_claim_set_hash then
            raise exception 'remainder_candidate_conflict' using errcode = '23505';
        end if;
        return previous;
    end if;
    if p_unsigned_xdr is null or pg_catalog.octet_length(p_unsigned_xdr) not between 4 and 65536
       or p_unsigned_xdr !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
       or p_transaction_hash is null or p_transaction_hash !~ '^[0-9a-f]{64}$'
       or p_claim_set_hash is null or p_claim_set_hash !~ '^[0-9a-f]{64}$'
       or p_source_sequence is null or p_source_sequence !~ '^(0|[1-9][0-9]{0,18})$'
       or p_valid_until is null or p_valid_until !~ '^(0|[1-9][0-9]{0,11})$' then
        raise exception 'invalid_remainder_candidate' using errcode = '22023';
    end if;
    if pg_catalog.replace(pg_catalog.encode(pg_catalog.decode(p_unsigned_xdr,'base64'),'base64'),E'\n','') <> p_unsigned_xdr
       or p_source_sequence::numeric >= 9223372036854775807 or p_valid_until::numeric > 253402300799 then
        raise exception 'invalid_remainder_candidate' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'remainder_candidate_isolation_required' using errcode = '25000';
    end if;
    ns := (lookup ->> 'namespace')::uuid;
    u := public.d1_load_unsigned_transaction(p_request_id,p_authorized_by) -> 'transaction';
    i := public.d1_load_issuance_outcome(p_request_id,p_authorized_by) -> 'outcome';
    owner := public.d1_load_active_issuance_sequence(ns,p_authorized_by);
    if owner ->> 'request_id' is distinct from p_request_id::text
       or owner is distinct from u -> 'reservation' then
        raise exception 'issuance_source_not_owned' using errcode = '55000';
    end if;
    claims := public.d1_list_beneficiary_claim_set(ns,p_authorized_by);
    history := claims -> 'history_state';
    selected := public.d1_load_beneficiary_claim(p_request_id,p_authorized_by) -> 'claim';
    if (claims ->> 'set_hash' = p_claim_set_hash and claims ->> 'kind' = 'd1_beneficiary_claim_set'
        and claims -> 'revision' = '1' and claims -> 'namespace' = lookup -> 'namespace'
        and claims -> 'network' = '"TESTNET"' and claims -> 'pool' = lookup -> 'pool'
        and (claims ->> 'count')::bigint = pg_catalog.jsonb_array_length(claims -> 'receipts')
        and history -> 'coverage_complete' = 'true' and pg_catalog.jsonb_typeof(history -> 'checkpoint') = 'object'
        and selected <> 'null'::jsonb and claims -> 'receipts' @> pg_catalog.jsonb_build_array(selected)) is not true then
        raise exception 'remainder_claim_set_conflict' using errcode = '23505';
    end if;
    -- Every039 member retains its actual saved history prefix, not a renewed DTO.
    for entry in select value from pg_catalog.jsonb_array_elements(claims -> 'receipts') loop
        saved := entry #> '{acquisition,historyState}';
        observation := entry #> '{acquisition,claim,observation}';
        select record into member from public.d1_transaction_records where namespace = ns
            and transaction_hash = observation ->> 'transactionHash';
        select count(*),coalesce(max(paging_token::numeric),0) into prefix_count,prefix_cursor
            from public.d1_transaction_records where namespace = ns
            and paging_token::numeric <= (saved #>> '{checkpoint,cursor}')::numeric;
        if (entry -> 'namespace' = lookup -> 'namespace' and entry -> 'pool' = lookup -> 'pool'
            and entry ->> 'network' = 'TESTNET' and saved -> 'coverage_complete' = 'true'
            and saved -> 'first_ledger' = history -> 'first_ledger' and saved -> 'namespace' = history -> 'namespace'
            and (saved ->> 'page_count')::bigint <= (history ->> 'page_count')::bigint
            and (saved ->> 'record_count')::bigint = prefix_count and prefix_cursor = (saved #>> '{checkpoint,cursor}')::numeric
            and prefix_count <= (history ->> 'record_count')::bigint
            and prefix_cursor <= (history #>> '{checkpoint,cursor}')::numeric
            and (saved #>> '{checkpoint,through_ledger}')::bigint <= (history #>> '{checkpoint,through_ledger}')::bigint
            and (saved #>> '{checkpoint,closed_at}')::bigint <= (history #>> '{checkpoint,closed_at}')::bigint
            and case when saved #> '{checkpoint,through_ledger}' = history #> '{checkpoint,through_ledger}' then
                saved #> '{checkpoint,ledger_hash}' = history #> '{checkpoint,ledger_hash}'
                and saved #> '{checkpoint,closed_at}' = history #> '{checkpoint,closed_at}'
                else (saved #>> '{checkpoint,closed_at}')::bigint < (history #>> '{checkpoint,closed_at}')::bigint end
            and (member is null or member = observation)
            and exists (select 1 from public.d1_transaction_pages where namespace = ns
                and from_cursor = saved #>> '{checkpoint,cursor}' and page -> 'records' = '[]'
                and page -> 'through_ledger' = saved #> '{checkpoint,through_ledger}'
                and page -> 'ledger_hash' = saved #> '{checkpoint,ledger_hash}'
                and page -> 'closed_at' = saved #> '{checkpoint,closed_at}')) is not true then
            raise exception 'remainder_claim_history_conflict' using errcode = '23505';
        end if;
    end loop;
    p := u #> '{reservation,intent,preparation_input}';
    c := selected #> '{acquisition,claim}'; original := c -> 'original';
    initial_sequence := u #>> '{reservation,transaction_sequence}'; deadline := u ->> 'deadline';
    select record into incoming from public.d1_transaction_records where namespace = ns
        and transaction_hash = p #>> '{payment,transaction_hash}';
    select record into issued from public.d1_transaction_records where namespace = ns and transaction_hash = i ->> 'transaction_hash';
    if (pg_catalog.jsonb_typeof(p #> '{payment,amount}') = 'string'
        and (p #>> '{payment,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and pg_catalog.jsonb_typeof(p #> '{request,amount}') = 'string'
        and (p #>> '{request,amount}') ~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$'
        and initial_sequence ~ '^[1-9][0-9]{0,18}$') is not true then
        raise exception 'invalid_remainder_original' using errcode = '22023';
    end if;
    gross := (p #>> '{payment,amount}')::numeric * 10000000;
    principal := (p #>> '{request,amount}')::numeric * 10000000;
    expected := pg_catalog.jsonb_build_object('requestId',p_request_id,'attemptId',i -> 'attempt_id','outcomeHash',i -> 'outcome_hash',
        'authorizedBy',i -> 'authorized_by','donor',p #> '{payment,donor}','beneficiary',p #> '{request,beneficiary}',
        'asset',p #> '{payment,asset}','amountStroops',principal::text,'operationId',p #> '{payment,operation_id}',
        'paymentTransactionHash',p #> '{payment,transaction_hash}','deadline',u -> 'deadline','issuanceTransactionHash',i -> 'transaction_hash',
        'claimableBalanceId',i #> '{observed_outcome,claimableBalanceId}','feeChargedStroops',issued -> 'feeChargedStroops','sequence',issued -> 'sequence');
    -- Numeric multiplication preserves scale; canonicalize only after int64 bounds.
    if principal <= 0 or principal >= gross or gross > 9223372036854775807 then
        raise exception 'invalid_remainder_amount' using errcode = '22023';
    end if;
    expected := pg_catalog.jsonb_set(expected,'{amountStroops}',pg_catalog.to_jsonb(principal::bigint::text));
    if (original = expected and u -> 'transaction_hash' = i -> 'transaction_hash'
        and i #>> '{observed_outcome,outcome}' = 'success' and i #> '{observed_outcome,observation}' = issued
        and incoming is not null and issued is not null and incoming -> 'closedAt' = p -> 'confirmed_at'
        and incoming -> 'ledger' = p -> 'ledger' and p ->> 'request_id' = p_request_id::text
        and p #> '{payment,pool}' = lookup -> 'pool' and p #> '{payment,donor}' = p #> '{request,donor}'
        and p #> '{payment,asset}' = p #> '{request,asset}' and u -> 'deadline' = p #> '{request,deadline}'
        and deadline = pg_catalog.to_char(pg_catalog.to_timestamp((p ->> 'confirmed_at')::bigint + 300)
            at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
        and c ->> 'claimedPrincipalStroops' = principal::bigint::text and c ->> 'originalGrossStroops' = gross::bigint::text
        and c ->> 'grossLessThisClaimStroops' = (gross-principal)::bigint::text and c -> 'asset' = original -> 'asset'
        and selected #> '{acquisition,acquisition,claimableBalanceId}' = i #> '{observed_outcome,claimableBalanceId}'
        and issued ->> 'sequence' = initial_sequence and p_source_sequence::numeric >= initial_sequence::numeric
        and selected ->> 'acquisition_hash' ~ '^[0-9a-f]{64}$') is not true then
        raise exception 'remainder_original_conflict' using errcode = '23505';
    end if;
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    now_seconds := extract(epoch from pg_catalog.clock_timestamp());
    if now_seconds < extract(epoch from deadline::timestamptz) then
        raise exception 'refund_deadline_not_reached' using errcode = '22023';
    end if;
    if p_valid_until::numeric <= now_seconds or p_valid_until::numeric <= extract(epoch from deadline::timestamptz) then
        raise exception 'remainder_candidate_expired' using errcode = '22023';
    end if;
    receipt := pg_catalog.jsonb_build_object('kind','d1_remainder_candidate','revision',2,
        'request_id',p_request_id,'namespace',ns,'network','TESTNET','pool',lookup -> 'pool','authorized_by',p_authorized_by,
        'initial_transaction_hash',i -> 'transaction_hash','initial_outcome_hash',i -> 'outcome_hash',
        'acquisition_hash',selected -> 'acquisition_hash','claimable_balance_id',original -> 'claimableBalanceId',
        'claim_set_hash',p_claim_set_hash,'claim_set_count',claims -> 'count','history_state',history,
        'gross_stroops',gross::bigint::text,'claimed_stroops',principal::bigint::text,'remaining_stroops',(gross-principal)::bigint::text,
        'asset',original -> 'asset','donor',original -> 'donor','deadline',deadline,
        'source_sequence',p_source_sequence,'transaction_sequence',(p_source_sequence::bigint+1)::text,
        'valid_until',p_valid_until,'unsigned_xdr',p_unsigned_xdr,'transaction_hash',p_transaction_hash);
    -- Acquisition is private, same transaction, AFTER all candidate checks. Never v1.
    perform public.d1_acquire_verified_remainder_fence_private(ns,p_request_id,p_authorized_by,p_transaction_hash);
    insert into public.d1_remainder_candidates values (p_request_id,ns,receipt);
    perform public.d1_load_issuance_outcome(p_request_id,p_authorized_by);
    if extract(epoch from pg_catalog.clock_timestamp()) >= p_valid_until::numeric then
        raise exception 'remainder_candidate_expired' using errcode = '22023';
    end if;
    return receipt;
end;
$$;
create function public.d1_reject_remainder_candidate_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    raise exception 'remainder_candidate_immutable' using errcode = '55000';
end;
$$;
create trigger d1_remainder_candidate_immutable before update or delete on public.d1_remainder_candidates
    for each row execute function public.d1_reject_remainder_candidate_mutation();
create trigger d1_remainder_candidate_no_truncate before truncate on public.d1_remainder_candidates
    for each statement execute function public.d1_reject_remainder_candidate_mutation();
revoke all on function public.d1_load_remainder_candidate(uuid,text),
    public.d1_record_remainder_candidate(uuid,text,text,text,text,text,text), public.d1_reject_remainder_candidate_mutation()
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_remainder_candidate(uuid,text),
    public.d1_record_remainder_candidate(uuid,text,text,text,text,text,text) to service_role;
comment on table public.d1_remainder_candidates is
    'Permanent opaque v2 partial candidate; SDK must verify single donor payment, body/hash/sequence/window. No signing, financial, chain, retry or release authority.';
commit;
