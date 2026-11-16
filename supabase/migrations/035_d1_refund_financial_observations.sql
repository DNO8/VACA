-- LOCAL UNVERIFIED SOURCE: opaque SDK evidence, NOT a signing or release permit.
begin;
create table public.d1_refund_financial_observations (
    request_id uuid not null,
    namespace uuid not null,
    transaction_hash text not null check (transaction_hash ~ '^[0-9a-f]{64}$'),
    snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    primary key (request_id, snapshot_hash),
    foreign key (namespace, request_id) references public.d1_refund_candidates(namespace, request_id)
);
alter table public.d1_refund_financial_observations enable row level security;
revoke all on public.d1_refund_financial_observations from public, anon, authenticated, service_role;

create function public.d1_load_refund_financial_observation(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lookup jsonb; v_receipt jsonb;
begin
    -- Inherit current-admin -> pool -> initial history ->033/034 locks.
    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    select receipt into v_receipt from public.d1_refund_financial_observations
        where request_id = p_request_id and snapshot_hash = p_snapshot_hash for update;
    -- Historical lookup does not renew expiry, ownership, authorizer or authority.
    return pg_catalog.jsonb_build_object('kind','d1_refund_financial_observation_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET',
        'pool',v_lookup -> 'pool','transaction_hash',v_lookup #> '{candidate,transaction_hash}',
        'snapshot_hash',p_snapshot_hash,'observation',v_receipt);
end;
$$;

create function public.d1_record_refund_financial_observation(
    p_request_id uuid, p_authorized_by text, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_candidate jsonb; v_parent jsonb; v_fee jsonb; v_history jsonb; v_credit jsonb;
    v_funding jsonb; v_observation jsonb; v_projection jsonb; v_account jsonb; v_anchor jsonb;
    v_budget jsonb; v_prepared jsonb; v_selected jsonb; v_ids jsonb; v_value jsonb; v_d jsonb;
    v_hash text; v_receipt jsonb; v_now numeric; v_observed numeric; v_expires numeric;
    v_minimum numeric; v_multiplier numeric; v_cap numeric; v_fee_amount numeric; v_other numeric;
    v_team numeric; v_physical numeric; v_required numeric; v_available numeric; v_operations integer;
begin
    v_lookup := public.d1_load_refund_candidate(p_request_id, p_authorized_by);
    v_candidate := v_lookup -> 'candidate';
    if v_candidate is null or v_candidate = 'null'::jsonb then
        raise exception 'd1_refund_candidate_not_found' using errcode = '22023';
    end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'refund_financial_observation_isolation_required' using errcode = '25000';
    end if;
    v_parent := public.d1_load_active_issuance_sequence((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    if v_parent ->> 'request_id' is distinct from p_request_id::text
       or v_lookup ->> 'active_request_id' is distinct from p_request_id::text then
        raise exception 'refund_source_not_owned' using errcode = '55000';
    end if;
    if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object'
       or pg_catalog.octet_length(p_snapshot::text) > 16777216 then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    if not (p_snapshot ?& array['kind','revision','requestId','namespace','network','pool','observedAt','expiresAt','funding'])
       or (select count(*) from pg_catalog.jsonb_object_keys(p_snapshot)) <> 9 then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    v_funding := p_snapshot -> 'funding';
    v_observation := v_funding #> '{creationObservation,observation}';
    v_projection := v_observation #> '{accounting,accounting}';
    v_account := v_observation -> 'account';
    v_budget := v_funding -> 'budget';
    v_fee := public.d1_load_issuance_fee_commitments(p_request_id, p_authorized_by);
    v_history := public.d1_load_transaction_history_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    v_credit := public.d1_load_operating_credit_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    if p_snapshot ->> 'kind' is distinct from 'd1_refund_financial_snapshot'
       or p_snapshot -> 'revision' is distinct from '1'::jsonb
       or p_snapshot -> 'requestId' is distinct from v_lookup -> 'request_id'
       or p_snapshot -> 'namespace' is distinct from v_lookup -> 'namespace'
       or p_snapshot -> 'network' is distinct from '"TESTNET"'::jsonb
       or p_snapshot -> 'pool' is distinct from v_lookup -> 'pool'
       or v_funding ->> 'kind' is distinct from 'd1_saved_refund_funding_observation'
       or v_funding -> 'revision' is distinct from '1'::jsonb
       or v_observation -> 'candidate' is distinct from v_candidate
       or v_observation #> '{accounting,held,activeOwner}' is distinct from v_parent
       or v_fee -> 'commitment' is null or v_fee -> 'commitment' = 'null'::jsonb
       or v_observation #> '{accounting,held,commitment}' is distinct from v_fee -> 'commitment'
       or v_fee #> '{commitment,reservation}' is distinct from v_parent
       or v_fee -> 'commitments' is distinct from pg_catalog.jsonb_build_array(v_fee -> 'commitment')
       or v_observation #> '{history,state}' is distinct from v_history
       or v_history -> 'coverage_complete' is distinct from 'true'::jsonb
       or pg_catalog.jsonb_typeof(v_history -> 'checkpoint') is distinct from 'object'
       or v_history -> 'income_state' is distinct from v_credit -> 'discovery_state'
       or v_projection -> 'unmatchedActivity' is distinct from '[]'::jsonb then
        raise exception 'refund_financial_observation_conflict' using errcode = '23505';
    end if;
    v_anchor := pg_catalog.jsonb_build_object('sequence',v_history #> '{checkpoint,through_ledger}',
        'hash',v_history #> '{checkpoint,ledger_hash}','closedAt',v_history #> '{checkpoint,closed_at}');
    if v_account -> 'anchor' is distinct from v_anchor
       or v_account -> 'pool' is distinct from v_lookup -> 'pool'
       or v_account ->> 'networkPassphrase' is distinct from 'Test SDF Network ; September 2015'
       or v_account -> 'sequence' is distinct from v_candidate -> 'source_sequence'
       or pg_catalog.jsonb_typeof(v_projection -> 'donations') is distinct from 'array'
       or pg_catalog.jsonb_typeof(v_funding -> 'otherUnissuedRefundOperationIds') is distinct from 'array'
       or v_observation #> '{accounting,confirmedPoolFeesSpentStroops}' is distinct from
          v_observation #> '{history,confirmedPoolFeesSpentStroops}' then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    -- Integer shapes are checked before arithmetic; no float or net-liability inputs.
    for v_value in select value from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
        v_account -> 'baseFee',v_account -> 'baseReserve',v_funding -> 'otherUnissuedRefundFeeStroops',
        v_fee #> '{commitment,future_refund_fee_stroops}',v_funding #> '{principal,physicalOperatingCap}',
        v_projection #> '{original,observedOperatingCreditStroops}',
        v_observation #> '{accounting,confirmedPoolFeesSpentStroops}',
        v_budget -> 'minimumTransactionFee',v_budget -> 'protectedSelectedExcess',v_budget -> 'requiredOperating',
        v_budget -> 'teamCap',v_budget -> 'availableOperating',v_budget -> 'remainingOperating')) loop
        if pg_catalog.jsonb_typeof(v_value) is distinct from 'string'
           or coalesce(v_value #>> '{}','') !~ '^(0|[1-9][0-9]{0,18})$' then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
        if (v_value #>> '{}')::numeric > 9223372036854775807 then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
    end loop;
    v_prepared := v_fee #> '{commitment,reservation,intent,preparation_input}';
    for v_d in select value from pg_catalog.jsonb_array_elements(v_projection -> 'donations') loop
        foreach v_hash in array array['amountStroops','issuedStroops','unissuedStroops'] loop
            v_value := v_d -> v_hash;
            if pg_catalog.jsonb_typeof(v_value) is distinct from 'string'
               or coalesce(v_value #>> '{}','') !~ '^(0|[1-9][0-9]{0,18})$' then
                raise exception 'invalid_refund_financial_observation' using errcode = '22023';
            end if;
            if (v_value #>> '{}')::numeric > 9223372036854775807 then
                raise exception 'invalid_refund_financial_observation' using errcode = '22023';
            end if;
        end loop;
        if pg_catalog.jsonb_typeof(v_d -> 'operationId') is distinct from 'string'
           or coalesce(v_d ->> 'operationId','') !~ '^[1-9][0-9]{0,19}$'
           or (v_d ->> 'operationId')::numeric > 18446744073709551615
           or (v_d ->> 'amountStroops')::numeric = 0
           or (v_d ->> 'amountStroops')::numeric <> (v_d ->> 'issuedStroops')::numeric + (v_d ->> 'unissuedStroops')::numeric then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
    end loop;
    if (select count(distinct d ->> 'operationId') from pg_catalog.jsonb_array_elements(v_projection -> 'donations') d)
       <> pg_catalog.jsonb_array_length(v_projection -> 'donations') then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    select d into v_selected from pg_catalog.jsonb_array_elements(v_projection -> 'donations') d
        where d -> 'operationId' = v_prepared #> '{payment,operation_id}';
    if v_selected is null or v_selected -> 'transactionHash' is distinct from v_prepared #> '{payment,transaction_hash}'
       or v_selected -> 'donor' is distinct from v_prepared #> '{payment,donor}'
       or v_selected -> 'asset' is distinct from v_prepared #> '{payment,asset}'
       or v_selected -> 'confirmedAt' is distinct from v_prepared -> 'confirmed_at'
       or (v_selected ->> 'amountStroops')::numeric <> (v_prepared #>> '{payment,amount}')::numeric * 10000000 then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(d.value -> 'operationId' order by d.ordinality),'[]'::jsonb) into v_ids
        from pg_catalog.jsonb_array_elements(v_projection -> 'donations') with ordinality d(value,ordinality)
        where d.value -> 'operationId' <> v_selected -> 'operationId' and (d.value ->> 'unissuedStroops')::numeric > 0;
    v_other := (v_funding ->> 'otherUnissuedRefundFeeStroops')::numeric;
    v_cap := (v_fee #>> '{commitment,future_refund_fee_stroops}')::numeric;
    v_fee_amount := v_cap - (v_budget ->> 'protectedSelectedExcess')::numeric;
    v_operations := case when v_observation -> 'claimableBalance' = 'null'::jsonb then 1 else 2 end;
    if v_ids is distinct from v_funding -> 'otherUnissuedRefundOperationIds'
       or (v_account ->> 'baseFee')::numeric <= 0
       or v_other <> pg_catalog.jsonb_array_length(v_ids) * (v_account ->> 'baseFee')::numeric
       or (v_budget ->> 'minimumTransactionFee')::numeric <> v_operations * (v_account ->> 'baseFee')::numeric
       or v_fee_amount < (v_budget ->> 'minimumTransactionFee')::numeric or v_fee_amount > v_cap then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    for v_value in select value from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
        v_account #> '{account,subentry_count}',v_account #> '{account,num_sponsoring}',v_account #> '{account,num_sponsored}')) loop
        if pg_catalog.jsonb_typeof(v_value) is distinct from 'number'
           or coalesce(v_value #>> '{}','') !~ '^(0|[1-9][0-9]{0,9})$' then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
        if (v_value #>> '{}')::numeric > 4294967295 then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
    end loop;
    v_multiplier := 2 + (v_account #>> '{account,subentry_count}')::numeric
        + (v_account #>> '{account,num_sponsoring}')::numeric - (v_account #>> '{account,num_sponsored}')::numeric;
    v_minimum := (v_account ->> 'baseReserve')::numeric * v_multiplier;
    v_team := (v_projection #>> '{original,observedOperatingCreditStroops}')::numeric
        - (v_observation #>> '{accounting,confirmedPoolFeesSpentStroops}')::numeric;
    v_physical := (v_funding #>> '{principal,physicalOperatingCap}')::numeric;
    v_required := v_minimum + v_other + v_cap;
    v_available := least(v_team,v_physical);
    if v_multiplier < 0 or v_team < 0 or v_required > 9223372036854775807
       or v_required <> (v_budget ->> 'requiredOperating')::numeric
       or v_team <> (v_budget ->> 'teamCap')::numeric or v_available <> (v_budget ->> 'availableOperating')::numeric
       or v_available < v_required or v_available - v_required <> (v_budget ->> 'remainingOperating')::numeric then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    for v_value in select value from pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
        p_snapshot -> 'observedAt',p_snapshot -> 'expiresAt',v_funding -> 'observedAt',
        v_funding #> '{creationObservation,observedAt}',v_observation -> 'observedAt',v_anchor -> 'closedAt')) loop
        if pg_catalog.jsonb_typeof(v_value) is distinct from 'number'
           or coalesce(v_value #>> '{}','') !~ '^(0|[1-9][0-9]{0,15})$' then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
        if (v_value #>> '{}')::numeric > 9007199254740991 then
            raise exception 'invalid_refund_financial_observation' using errcode = '22023';
        end if;
    end loop;
    -- Final membership and clock AFTER dependent locks, even on identical replay.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    v_now := extract(epoch from pg_catalog.clock_timestamp());
    v_observed := (p_snapshot ->> 'observedAt')::numeric; v_expires := (p_snapshot ->> 'expiresAt')::numeric;
    if v_now < extract(epoch from (v_candidate ->> 'deadline')::timestamptz)
       or p_snapshot -> 'observedAt' is distinct from v_funding -> 'observedAt'
       or (v_observation ->> 'observedAt')::numeric > (v_funding #>> '{creationObservation,observedAt}')::numeric
       or (v_funding #>> '{creationObservation,observedAt}')::numeric > v_observed
       or v_expires <= v_observed or v_observed > v_now + 2
       or (v_anchor ->> 'closedAt')::numeric > (v_observation ->> 'observedAt')::numeric + 2
       or v_expires > (v_anchor ->> 'closedAt')::numeric + 30 then
        raise exception 'invalid_refund_financial_observation' using errcode = '22023';
    end if;
    if v_expires <= v_now then raise exception 'refund_financial_observation_expired' using errcode = '22023'; end if;
    -- PostgreSQL canonical JSONB text hash, not JavaScript JSON.stringify bytes.
    v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot::text,'UTF8')),'hex');
    select receipt into v_receipt from public.d1_refund_financial_observations
        where request_id = p_request_id and snapshot_hash = v_hash for update;
    if found then return v_receipt; end if; -- Preserve original authorizer, never rewrite/extend.
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_refund_financial_observation','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool',
        'authorized_by',p_authorized_by,'transaction_hash',v_candidate -> 'transaction_hash','snapshot_hash',v_hash,
        'observed_at',p_snapshot -> 'observedAt','expires_at',p_snapshot -> 'expiresAt','snapshot',p_snapshot);
    insert into public.d1_refund_financial_observations values
        (p_request_id,(v_lookup ->> 'namespace')::uuid,v_candidate ->> 'transaction_hash',v_hash,v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_refund_financial_observation(uuid,text,text),
    public.d1_record_refund_financial_observation(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_refund_financial_observation(uuid,text,text),
    public.d1_record_refund_financial_observation(uuid,text,jsonb) to service_role;
comment on table public.d1_refund_financial_observations is
    'Immutable opaque backend SDK evidence; no direct table access, signing, submission, retry, ownership release or settlement API.';
commit;
