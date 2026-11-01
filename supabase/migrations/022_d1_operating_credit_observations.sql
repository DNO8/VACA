-- Private authorized observations, NOT approved credit or financial readiness.
begin;
create table public.d1_operating_credit_observations (
    namespace uuid not null references public.d1_pools(namespace),
    operation_id text not null,
    receipt jsonb not null,
    primary key (namespace, operation_id)
);
alter table public.d1_operating_credit_observations enable row level security;
revoke all on table public.d1_operating_credit_observations from public, anon, authenticated, service_role;

create function public.d1_load_operating_credit(p_namespace uuid, p_authorized_by text, p_operation_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_state jsonb;
    v_receipt jsonb;
begin
    -- Existing current-admin -> pool -> checkpoint locks, including absent rows.
    v_state := public.d1_load_discovery_checkpoint(p_namespace, p_authorized_by);
    if p_operation_id is null or p_operation_id !~ '^[1-9][0-9]{0,19}$' then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    if p_operation_id::numeric > 18446744073709551615 then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    select receipt into v_receipt from public.d1_operating_credit_observations
        where namespace = p_namespace and operation_id = p_operation_id;
    return pg_catalog.jsonb_build_object('kind', 'd1_operating_credit_lookup', 'revision', 1,
        'namespace', p_namespace, 'network', 'TESTNET', 'pool', v_state -> 'pool',
        'operation_id', p_operation_id, 'receipt', v_receipt);
end;
$$;

create function public.d1_record_operating_credit(p_namespace uuid, p_authorized_by text, p_observation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_state jsonb;
    v_cp jsonb;
    v_record jsonb;
    v_op jsonb;
    v_raw jsonb;
    v_amount text;
    v_stroops numeric;
    v_id numeric;
    v_ledger numeric;
    v_receipt jsonb;
begin
    v_lookup := public.d1_load_operating_credit(p_namespace, p_authorized_by, p_observation ->> 'operationId');
    if v_lookup -> 'receipt' <> 'null'::jsonb then
        if v_lookup #> '{receipt,observation}' is distinct from p_observation then
            raise exception 'operating_credit_conflict' using errcode = '23505';
        end if;
        return v_lookup -> 'receipt'; -- Original authorizer/anchor survive rotation/advance.
    end if;
    v_state := public.d1_load_discovery_state(p_namespace, p_authorized_by);
    v_cp := v_state -> 'checkpoint';
    v_record := p_observation -> 'record';
    v_op := v_record -> 'operation';
    v_raw := v_op -> 'raw';
    v_id := (p_observation ->> 'operationId')::numeric;
    v_ledger := pg_catalog.div(v_id, 4294967296);
    if pg_catalog.jsonb_typeof(p_observation) is distinct from 'object'
       or p_observation is distinct from pg_catalog.jsonb_build_object(
           'namespace', p_namespace, 'network', 'TESTNET', 'pool', v_state -> 'pool',
           'funder', p_observation -> 'funder', 'operationId', v_lookup -> 'operation_id',
           'transactionHash', v_record -> 'transaction_hash', 'ledger', v_record -> 'ledger',
           'amountStroops', p_observation -> 'amountStroops',
           'anchor', pg_catalog.jsonb_build_object('sequence', v_cp -> 'through_ledger',
               'hash', v_cp -> 'ledger_hash', 'closedAt', v_cp -> 'closed_at'), 'record', v_record)
       or v_state -> 'coverage_complete' is distinct from 'true'::jsonb
       or v_ledger < (v_state ->> 'first_ledger')::numeric
       or v_ledger > (v_cp ->> 'through_ledger')::numeric
       or v_id > (v_cp ->> 'cursor')::numeric
       or pg_catalog.mod(v_id, 4096) = 0
       or pg_catalog.mod(pg_catalog.div(v_id, 4096), 1048576) = 0
       or pg_catalog.jsonb_typeof(p_observation -> 'operationId') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_observation -> 'funder') is distinct from 'string'
       or not public.release_request_valid_key(p_observation ->> 'funder')
       or p_observation -> 'funder' = v_state -> 'pool'
       or v_record is distinct from pg_catalog.jsonb_build_object(
           'paging_token', v_lookup -> 'operation_id', 'operation_id', v_lookup -> 'operation_id',
           'transaction_hash', v_record -> 'transaction_hash', 'ledger', v_ledger, 'operation', v_op)
       or pg_catalog.jsonb_typeof(v_record -> 'transaction_hash') is distinct from 'string'
       or (v_record ->> 'transaction_hash') !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(v_op) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_op -> 'confirmed_at') is distinct from 'number'
       or (v_op ->> 'confirmed_at') !~ '^(0|[1-9][0-9]{0,11})$'
       or pg_catalog.jsonb_typeof(v_raw) is distinct from 'object'
       or v_raw - array['operation','transaction'] <> '{}'
       or pg_catalog.jsonb_typeof(v_raw -> 'operation') is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_raw -> 'transaction') is distinct from 'object'
       or pg_catalog.octet_length(v_op::text) > 16384 then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    if (v_op ->> 'confirmed_at')::numeric > (v_cp ->> 'closed_at')::numeric
       or (v_ledger = (v_cp ->> 'through_ledger')::numeric and v_op -> 'confirmed_at' <> v_cp -> 'closed_at') then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    -- Equality enforces exact classification keys/types, memo, source and pool.
    if v_op ->> 'kind' = 'incoming_payment' then
        v_amount := v_op ->> 'amount';
        v_receipt := pg_catalog.jsonb_build_object('kind', 'incoming_payment', 'donor', p_observation -> 'funder',
            'asset', pg_catalog.jsonb_build_object('type', 'native'), 'amount', v_amount, 'sdk_type', 1);
    elsif v_op ->> 'kind' = 'account_created' then
        v_amount := v_op ->> 'starting_balance';
        v_receipt := pg_catalog.jsonb_build_object('kind', 'account_created', 'funder', p_observation -> 'funder',
            'starting_balance', v_amount, 'sdk_type', 0);
    else
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    if v_op is distinct from (v_receipt || pg_catalog.jsonb_build_object('pool', v_state -> 'pool',
           'source', p_observation -> 'funder', 'confirmed_at', v_op -> 'confirmed_at',
           'memo', pg_catalog.jsonb_build_object('type', 'text', 'value', 'D1OPS'), 'raw', v_raw))
       or v_amount is null or v_amount !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{7}$' then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    v_stroops := pg_catalog.replace(v_amount, '.', '')::numeric;
    if v_stroops <= 0 or v_stroops > 9223372036854775807
       or p_observation -> 'amountStroops' is distinct from pg_catalog.to_jsonb(v_stroops::bigint::text)
       or not exists (select 1 from public.d1_discovery_operations where namespace = p_namespace
           and paging_token = p_observation ->> 'operationId' and record = v_record)
       or exists (select 1 from public.donation_payments where transaction_hash = v_record ->> 'transaction_hash'
           and operation_id = p_observation ->> 'operationId') then
        raise exception 'invalid_operating_credit' using errcode = '22023';
    end if;
    v_receipt := pg_catalog.jsonb_build_object('kind', 'd1_operating_credit_observation', 'revision', 1,
        'authorized_by', p_authorized_by, 'observation', p_observation);
    insert into public.d1_operating_credit_observations values (p_namespace, p_observation ->> 'operationId', v_receipt);
    return v_receipt;
end;
$$;
revoke all on function public.d1_load_operating_credit(uuid,text,text),
    public.d1_record_operating_credit(uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.d1_load_operating_credit(uuid,text,text),
    public.d1_record_operating_credit(uuid,text,jsonb) to service_role;
comment on table public.d1_operating_credit_observations is
    'Immutable admin-authorized observations only; backend must first observe with configured funders. Not approved spending.';
commit;
