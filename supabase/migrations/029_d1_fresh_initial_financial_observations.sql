-- Fresh storage validation is not independently SDK/balance/signing proof.
begin;
create function public.d1_record_fresh_initial_financial_observation(p_request_id uuid, p_authorized_by text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb; v_observation jsonb; v_saved jsonb; v_fee jsonb; v_history jsonb; v_credit jsonb;
    v_now numeric; v_deadline timestamptz;
begin
    -- Same serialization boundary as018/028; do not change their historical APIs.
    v_lookup := public.d1_load_unsigned_transaction(p_request_id, p_authorized_by);
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'initial_financial_observation_isolation_required' using errcode = '25000';
    end if;
    v_observation := public.d1_record_initial_financial_observation(p_request_id, p_authorized_by, p_snapshot);
    v_saved := v_observation -> 'snapshot';
    v_fee := public.d1_load_issuance_fee_commitments(p_request_id, p_authorized_by);
    v_history := public.d1_load_transaction_history_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    v_credit := public.d1_load_operating_credit_state((v_lookup ->> 'namespace')::uuid, p_authorized_by);
    select (input #>> '{request,deadline}')::timestamptz into strict v_deadline from public.d1_preparations where request_id = p_request_id;
    -- These checks ALWAYS run, including exact historical hash reuse.
    v_now := extract(epoch from pg_catalog.clock_timestamp());
    if v_now >= extract(epoch from v_deadline) then raise exception 'deadline_expired' using errcode = '22023'; end if;
    if v_now >= (v_saved ->> 'expiresAt')::numeric then
        raise exception 'initial_financial_observation_expired' using errcode = '22023';
    end if;
    if (v_saved ->> 'observedAt')::numeric > v_now + 2 then
        raise exception 'invalid_initial_financial_observation' using errcode = '22023';
    end if;
    if v_observation -> 'request_id' is distinct from v_lookup -> 'request_id'
       or v_observation -> 'namespace' is distinct from v_lookup -> 'namespace'
       or v_observation -> 'pool' is distinct from v_lookup -> 'pool'
       or v_observation -> 'network' is distinct from '"TESTNET"'::jsonb
       or v_observation -> 'transaction_hash' is distinct from v_lookup #> '{transaction,transaction_hash}'
       or v_saved #> '{commitment,reservation}' is distinct from v_lookup -> 'reservation'
       or v_saved -> 'commitment' is distinct from v_fee -> 'commitment'
       or v_fee -> 'commitments' is distinct from pg_catalog.jsonb_build_array(v_fee -> 'commitment')
       or v_saved -> 'historyState' is distinct from v_history or v_saved -> 'creditState' is distinct from v_credit then
        raise exception 'initial_financial_observation_conflict' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('kind','d1_fresh_initial_financial_observation','revision',1,
        'request_id',p_request_id,'namespace',v_lookup -> 'namespace','network','TESTNET','pool',v_lookup -> 'pool',
        'authorized_by',p_authorized_by,'transaction_hash',v_observation -> 'transaction_hash',
        'snapshot_hash',v_observation -> 'snapshot_hash','validated_at',pg_catalog.floor(v_now)::bigint,
        'expires_at',v_saved -> 'expiresAt','observation',v_observation);
end;
$$;
revoke all on function public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.d1_record_fresh_initial_financial_observation(uuid,text,jsonb) to service_role;
commit;
