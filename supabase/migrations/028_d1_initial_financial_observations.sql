-- Opaque backend SDK evidence, NOT a signer permit or a second source owner.
begin;
create table public.d1_initial_financial_observations (
    request_id uuid not null references public.d1_issuance_sequences(request_id),
    snapshot_hash text not null, receipt jsonb not null, primary key (request_id, snapshot_hash)
);
alter table public.d1_initial_financial_observations enable row level security;
revoke all on public.d1_initial_financial_observations from public, anon, authenticated, service_role;
create function public.d1_load_initial_financial_observation(p_request_id uuid, p_authorized_by text, p_snapshot_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lookup jsonb; v_receipt jsonb;
begin
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    select receipt into v_receipt from public.d1_initial_financial_observations where request_id = p_request_id and snapshot_hash = p_snapshot_hash for update;
    return pg_catalog.jsonb_build_object('kind','d1_initial_financial_observation_lookup','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool',
        'transaction_hash',v_lookup #> '{transaction,transaction_hash}','snapshot_hash',p_snapshot_hash,'observation',v_receipt);
end;
$$;
create function public.d1_record_initial_financial_observation(p_request_id uuid, p_authorized_by text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_previous jsonb; v_fee jsonb; v_history jsonb; v_credit jsonb; v_anchor jsonb;
    v_hash text; v_deadline timestamptz; v_now numeric; v_observed numeric; v_expires numeric;
    v_d jsonb; v_ids jsonb; v_receipt jsonb;
begin
    --018 retains current-admin -> pool -> preparation/intent -> owner/journal locks.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    if v_lookup -> 'reservation' = 'null'::jsonb then raise exception 'd1_issuance_sequence_not_found' using errcode = '22023'; end if;
    if v_lookup -> 'transaction' = 'null'::jsonb then raise exception 'd1_unsigned_transaction_not_found' using errcode = '22023'; end if;
    if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' or pg_catalog.octet_length(p_snapshot::text) > 1048576 then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    if not (p_snapshot ?& array['kind','revision','namespace','network','pool','requestId','anchor','observedAt','expiresAt','commitment','historyState','creditState','creation','account','obligations','originalDonation','unissuedRefundOperationIds','unissuedRefundFeeStroops','budget'])
       or (select count(*) from pg_catalog.jsonb_object_keys(p_snapshot)) <> 19 then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot::text,'UTF8')),'hex');
    select receipt into v_previous from public.d1_initial_financial_observations where request_id = p_request_id and snapshot_hash = v_hash for update;
    if found then return v_previous; end if; -- Historical evidence, never refreshed signing permission.
    -- New writes cannot claim fresh membership from a retained RR/Serializable snapshot.
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'initial_financial_observation_isolation_required' using errcode = '25000';
    end if;
    v_fee := public.d1_load_issuance_fee_commitments(p_request_id, p_authorized_by);
    v_history := public.d1_load_transaction_history_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    v_credit := public.d1_load_operating_credit_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    if p_snapshot ->> 'kind' is distinct from 'd1_initial_financial_snapshot' or p_snapshot -> 'revision' is distinct from '1'::jsonb
       or p_snapshot -> 'requestId' is distinct from v_lookup -> 'request_id' or p_snapshot -> 'namespace' is distinct from v_lookup -> 'namespace'
       or p_snapshot -> 'network' is distinct from '"TESTNET"'::jsonb or p_snapshot -> 'pool' is distinct from v_lookup -> 'pool'
       or v_fee -> 'commitment' = 'null'::jsonb or p_snapshot -> 'commitment' is distinct from v_fee -> 'commitment'
       or v_fee -> 'commitments' is distinct from pg_catalog.jsonb_build_array(v_fee -> 'commitment')
       or p_snapshot -> 'historyState' is distinct from v_history or p_snapshot -> 'creditState' is distinct from v_credit
       or v_history -> 'coverage_complete' is distinct from 'true'::jsonb
       or v_history -> 'income_state' is distinct from v_credit -> 'discovery_state' then
        raise exception 'initial_financial_observation_conflict' using errcode = '23505';
    end if;
    v_anchor := pg_catalog.jsonb_build_object('sequence',v_history #> '{checkpoint,through_ledger}',
        'hash',v_history #> '{checkpoint,ledger_hash}','closedAt',v_history #> '{checkpoint,closed_at}');
    if p_snapshot -> 'anchor' is distinct from v_anchor or p_snapshot #> '{account,anchor}' is distinct from v_anchor
       or p_snapshot #> '{account,pool}' is distinct from v_lookup -> 'pool'
       or p_snapshot #>> '{account,networkPassphrase}' is distinct from 'Test SDF Network ; September 2015'
       or p_snapshot #> '{account,sequence}' is distinct from v_lookup #> '{reservation,observed_account_sequence}'
       or pg_catalog.jsonb_typeof(p_snapshot -> 'observedAt') is distinct from 'number' or pg_catalog.jsonb_typeof(p_snapshot -> 'expiresAt') is distinct from 'number'
       or coalesce(p_snapshot ->> 'observedAt','') !~ '^(0|[1-9][0-9]{0,15})$' or coalesce(p_snapshot ->> 'expiresAt','') !~ '^(0|[1-9][0-9]{0,15})$'
       or pg_catalog.jsonb_typeof(p_snapshot #> '{obligations,donations}') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_snapshot -> 'unissuedRefundOperationIds') is distinct from 'array'
       or pg_catalog.jsonb_typeof(p_snapshot #> '{account,baseFee}') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_snapshot -> 'unissuedRefundFeeStroops') is distinct from 'string'
       or coalesce(p_snapshot #>> '{account,baseFee}','') !~ '^[1-9][0-9]{0,18}$'
       or coalesce(p_snapshot ->> 'unissuedRefundFeeStroops','') !~ '^(0|[1-9][0-9]{0,18})$'
       or p_snapshot #> '{budget,otherFutureFees}' is distinct from p_snapshot -> 'unissuedRefundFeeStroops'
       or p_snapshot #> '{budget,transactionFee}' is distinct from v_fee #> '{commitment,issuance_fee_stroops}'
       or p_snapshot #> '{budget,newFutureRefundFee}' is distinct from v_fee #> '{commitment,future_refund_fee_stroops}' then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_snapshot #> '{obligations,donations}') > 1000
       or (select count(*) from pg_catalog.jsonb_array_elements(p_snapshot #> '{obligations,donations}') d where d = p_snapshot -> 'originalDonation') <> 1
       or p_snapshot #> '{originalDonation,operationId}' is distinct from v_lookup #> '{reservation,intent,preparation_input,payment,operation_id}'
       or p_snapshot #> '{originalDonation,transactionHash}' is distinct from v_lookup #> '{reservation,intent,preparation_input,payment,transaction_hash}'
       or p_snapshot #> '{originalDonation,donor}' is distinct from v_lookup #> '{reservation,intent,preparation_input,payment,donor}'
       or p_snapshot #> '{originalDonation,asset}' is distinct from v_lookup #> '{reservation,intent,preparation_input,payment,asset}'
       or p_snapshot #> '{originalDonation,confirmedAt}' is distinct from v_lookup #> '{reservation,intent,preparation_input,confirmed_at}' then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    for v_d in select value from pg_catalog.jsonb_array_elements(p_snapshot #> '{obligations,donations}') loop
        if pg_catalog.jsonb_typeof(v_d -> 'amountStroops') is distinct from 'string' or pg_catalog.jsonb_typeof(v_d -> 'operationId') is distinct from 'string'
           or coalesce(v_d ->> 'amountStroops','') !~ '^[1-9][0-9]{0,18}$' or coalesce(v_d ->> 'operationId','') !~ '^[1-9][0-9]{0,19}$' then
            raise exception 'invalid_initial_financial_observation' using errcode = '22023';
        end if;
        if (v_d ->> 'amountStroops')::numeric > 9223372036854775807 or (v_d ->> 'operationId')::numeric > 18446744073709551615 then
            raise exception 'invalid_initial_financial_observation' using errcode = '22023';
        end if;
    end loop;
    if (select count(distinct d ->> 'operationId') from pg_catalog.jsonb_array_elements(p_snapshot #> '{obligations,donations}') d) <> pg_catalog.jsonb_array_length(p_snapshot #> '{obligations,donations}')
       or (p_snapshot #>> '{originalDonation,amountStroops}')::numeric <> (v_lookup #>> '{reservation,intent,preparation_input,payment,amount}')::numeric * 10000000 then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(d.value -> 'operationId' order by d.ordinality),'[]'::jsonb) into v_ids
        from pg_catalog.jsonb_array_elements(p_snapshot #> '{obligations,donations}') with ordinality d(value, ordinality)
        where (d.value ->> 'amountStroops')::numeric > case when d.value = p_snapshot -> 'originalDonation'
            then (v_lookup #>> '{reservation,intent,preparation_input,request,amount}')::numeric * 10000000 else 0 end;
    if v_ids is distinct from p_snapshot -> 'unissuedRefundOperationIds'
       or (p_snapshot ->> 'unissuedRefundFeeStroops')::numeric <> pg_catalog.jsonb_array_length(v_ids) * (p_snapshot #>> '{account,baseFee}')::numeric
       or (p_snapshot ->> 'unissuedRefundFeeStroops')::numeric > 9223372036854775807
       or (p_snapshot #>> '{account,baseFee}')::numeric > 9223372036854775807 then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    select (input #>> '{request,deadline}')::timestamptz into strict v_deadline from public.d1_preparations where request_id = p_request_id;
    v_now := extract(epoch from pg_catalog.clock_timestamp()); v_observed := (p_snapshot ->> 'observedAt')::numeric; v_expires := (p_snapshot ->> 'expiresAt')::numeric;
    if v_now >= extract(epoch from v_deadline) then raise exception 'deadline_expired' using errcode = '22023'; end if;
    if v_expires <= v_observed or v_observed > v_now + 2 or v_observed + 2 < (v_anchor ->> 'closedAt')::numeric or v_expires > (v_anchor ->> 'closedAt')::numeric + 30
       or v_expires > extract(epoch from v_deadline) then raise exception 'invalid_initial_financial_observation' using errcode = '22023'; end if;
    if v_expires <= v_now then raise exception 'initial_financial_observation_expired' using errcode = '22023'; end if;
    v_receipt := pg_catalog.jsonb_build_object('kind','d1_initial_financial_observation','revision',1,'request_id',p_request_id,
        'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool','authorized_by',p_authorized_by,
        'transaction_hash',v_lookup #> '{transaction,transaction_hash}','snapshot_hash',v_hash,'snapshot',p_snapshot);
    insert into public.d1_initial_financial_observations values (p_request_id, v_hash, v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_initial_financial_observation(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.d1_record_initial_financial_observation(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_initial_financial_observation(uuid,text,text) to service_role;
grant execute on function public.d1_record_initial_financial_observation(uuid,text,jsonb) to service_role;
commit;
