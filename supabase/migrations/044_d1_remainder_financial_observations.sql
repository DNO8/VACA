-- LOCAL UNVERIFIED SOURCE: immutable evidence, NOT signing or submission authority.
begin;
create table public.d1_remainder_financial_observations (
    request_id uuid not null references public.d1_remainder_candidates(request_id),
    namespace uuid not null references public.d1_remainder_candidates(namespace),
    transaction_hash text not null check (transaction_hash ~ '^[0-9a-f]{64}$'),
    snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
    receipt jsonb not null check (pg_catalog.jsonb_typeof(receipt) = 'object'),
    primary key (request_id, snapshot_hash),
    foreign key (namespace, request_id) references public.d1_issuance_sequences(namespace, request_id)
);
--041 has separate request PK and namespace UNIQUE, not a composite candidate FK.
-- The actual033 composite key binds those references to the SAME request/pool namespace.
alter table public.d1_remainder_financial_observations enable row level security;
alter table public.d1_remainder_financial_observations force row level security;
revoke all on public.d1_remainder_financial_observations from public, anon, authenticated, service_role;

create function public.d1_load_remainder_financial_observation(
    p_request_id uuid, p_authorized_by text, p_snapshot_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    lookup jsonb; candidate jsonb; saved public.d1_remainder_financial_observations%rowtype;
    observation jsonb; snapshot jsonb; shape record;
begin
    -- Retain actual041's current admin -> pool -> originals/history ->033 ->040 ->041 order.
    -- Historical reads deliberately do NOT invoke042/043 or renew money/clock evidence.
    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);
    candidate := lookup -> 'candidate';
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'remainder_financial_observation_isolation_required' using errcode = '25000';
    end if;
    if p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_remainder_financial_observation' using errcode = '22023';
    end if;
    select * into saved from public.d1_remainder_financial_observations
        where request_id = p_request_id and snapshot_hash = p_snapshot_hash for update;
    if found then
        observation := saved.receipt; snapshot := observation -> 'snapshot';
        if snapshot is null or pg_catalog.octet_length(snapshot::text) > 33554432 then
            raise exception 'invalid_remainder_financial_observation' using errcode = '22023';
        end if;
        for shape in select * from (values
            (observation,'kind,revision,request_id,namespace,network,pool,authorized_by,transaction_hash,snapshot_hash,snapshot'),
            (snapshot,'kind,revision,requestId,namespace,network,pool,observedAt,expiresAt,candidate,funding'),
            (snapshot -> 'funding','kind,revision,executionAuthority,settlementAuthority,scope,startedAt,observedAt,expiresAt,maximumAgeSeconds,futureToleranceSeconds,accounting,claimSet,credits,creation,account,originals,cumulative,selected,otherRefundOperationIds,otherHeldFees,operating,budget,membership'),
            (snapshot -> 'candidate','kind,revision,request_id,namespace,network,pool,authorized_by,initial_transaction_hash,initial_outcome_hash,acquisition_hash,claimable_balance_id,claim_set_hash,claim_set_count,history_state,gross_stroops,claimed_stroops,remaining_stroops,asset,donor,deadline,source_sequence,transaction_sequence,valid_until,unsigned_xdr,transaction_hash')
        ) s(body,keys) loop
            if (pg_catalog.jsonb_typeof(shape.body) = 'object'
                and shape.body ?& pg_catalog.string_to_array(shape.keys,',')
                and shape.body - pg_catalog.string_to_array(shape.keys,',') = '{}') is not true then
                raise exception 'invalid_remainder_financial_observation' using errcode = '22023';
            end if;
        end loop;
        -- Digest is SHA256 of PostgreSQL JSONB text UTF8, NEVER JS serialization.
        if (saved.namespace::text = lookup ->> 'namespace'
            and saved.transaction_hash = candidate ->> 'transaction_hash'
            and observation ->> 'kind' = 'd1_remainder_financial_observation' and observation -> 'revision' = '2'
            and observation -> 'request_id' = lookup -> 'request_id' and observation -> 'namespace' = lookup -> 'namespace'
            and observation -> 'network' = '"TESTNET"' and observation -> 'pool' = lookup -> 'pool'
            and pg_catalog.jsonb_typeof(observation -> 'authorized_by') = 'string'
            and public.release_request_valid_key(observation ->> 'authorized_by')
            and observation ->> 'transaction_hash' = saved.transaction_hash
            and observation ->> 'snapshot_hash' = p_snapshot_hash
            and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(snapshot::text,'UTF8')),'hex') = p_snapshot_hash
            and snapshot ->> 'kind' = 'd1_remainder_financial_snapshot' and snapshot -> 'revision' = '2'
            and snapshot -> 'requestId' = lookup -> 'request_id' and snapshot -> 'namespace' = lookup -> 'namespace'
            and snapshot -> 'network' = '"TESTNET"' and snapshot -> 'pool' = lookup -> 'pool'
            and snapshot -> 'candidate' = candidate and candidate ->> 'kind' = 'd1_remainder_candidate'
            and candidate -> 'revision' = '2' and candidate -> 'request_id' = lookup -> 'request_id'
            and candidate -> 'namespace' = lookup -> 'namespace' and candidate -> 'pool' = lookup -> 'pool'
            and candidate -> 'network' = '"TESTNET"'
            and snapshot #>> '{funding,kind}' = 'd1_current_remainder_funding_observation'
            and snapshot #> '{funding,revision}' = '1'
            and snapshot #> '{funding,executionAuthority}' = 'false'
            and snapshot #> '{funding,settlementAuthority}' = 'false'
            and snapshot #> '{funding,scope}' = pg_catalog.jsonb_build_object('namespace',lookup -> 'namespace',
                'pool',lookup -> 'pool','requestId',p_request_id,'authenticatedAdmin',observation -> 'authorized_by')
            and snapshot -> 'observedAt' = snapshot #> '{funding,observedAt}'
            and snapshot -> 'expiresAt' = snapshot #> '{funding,expiresAt}') is not true then
            raise exception 'remainder_financial_observation_conflict' using errcode = '23505';
        end if;
    end if;
    -- Current requester must remain admin; original observation actor need not remain admin.
    perform 1 from public.admin_wallets where public_key = p_authorized_by for share;
    if not found then raise exception 'unauthorized_admin_wallet' using errcode = '42501'; end if;
    return pg_catalog.jsonb_build_object('kind','d1_remainder_financial_observation_lookup','revision',2,
        'request_id',p_request_id,'namespace',lookup -> 'namespace','network','TESTNET','pool',lookup -> 'pool',
        'transaction_hash',candidate -> 'transaction_hash','snapshot_hash',p_snapshot_hash,'observation',observation);
end;
$$;

create function public.d1_record_remainder_financial_observation(
    p_request_id uuid, p_authorized_by text, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare lookup jsonb; candidate jsonb; snapshot_hash_value text; receipt jsonb; saved jsonb;
begin
    -- Full actual043 includes042 whole memberships, independent money, current admin and LAST clock.
    -- This is mandatory even when an identical snapshot is already recorded.
    perform public.d1_revalidate_remainder_financial_snapshot_private(p_request_id,p_authorized_by,p_snapshot);
    lookup := public.d1_load_remainder_candidate(p_request_id,p_authorized_by);
    candidate := lookup -> 'candidate';
    snapshot_hash_value := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_snapshot::text,'UTF8')),'hex');
    receipt := pg_catalog.jsonb_build_object('kind','d1_remainder_financial_observation','revision',2,
        'request_id',p_request_id,'namespace',lookup -> 'namespace','network','TESTNET','pool',lookup -> 'pool',
        'authorized_by',p_authorized_by,'transaction_hash',candidate -> 'transaction_hash',
        'snapshot_hash',snapshot_hash_value,'snapshot',p_snapshot);
    -- One insert only. No UPDATE, actor rotation, timestamp refresh or replay bypass.
    insert into public.d1_remainder_financial_observations
        (request_id,namespace,transaction_hash,snapshot_hash,receipt)
        values (p_request_id,(lookup ->> 'namespace')::uuid,candidate ->> 'transaction_hash',snapshot_hash_value,receipt)
        on conflict (request_id,snapshot_hash) do nothing;
    -- Actual loader selects FOR UPDATE after index wait, validates digest/scope/candidate and original actor.
    saved := public.d1_load_remainder_financial_observation(p_request_id,p_authorized_by,snapshot_hash_value) -> 'observation';
    if (pg_catalog.jsonb_typeof(saved) = 'object' and saved -> 'snapshot' = p_snapshot
        and saved -> 'transaction_hash' = candidate -> 'transaction_hash'
        and saved ->> 'snapshot_hash' = snapshot_hash_value) is not true then
        raise exception 'remainder_financial_observation_conflict' using errcode = '23505';
    end if;
    -- AFTER every insert/index/select lock wait, including identical replay: SAME complete input,
    -- not a historical load or old proof. Any rejection rolls back the new row atomically.
    perform public.d1_revalidate_remainder_financial_snapshot_private(p_request_id,p_authorized_by,p_snapshot);
    return saved;
end;
$$;

create function public.d1_reject_remainder_financial_observation_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    raise exception 'remainder_financial_observation_immutable' using errcode = '55000';
end;
$$;
create trigger d1_remainder_financial_observation_immutable
    before update or delete on public.d1_remainder_financial_observations
    for each row execute function public.d1_reject_remainder_financial_observation_mutation();
create trigger d1_remainder_financial_observation_no_truncate
    before truncate on public.d1_remainder_financial_observations
    for each statement execute function public.d1_reject_remainder_financial_observation_mutation();
revoke all on function public.d1_load_remainder_financial_observation(uuid,text,text),
    public.d1_record_remainder_financial_observation(uuid,text,jsonb),
    public.d1_reject_remainder_financial_observation_mutation() from public, anon, authenticated, service_role;
grant execute on function public.d1_load_remainder_financial_observation(uuid,text,text),
    public.d1_record_remainder_financial_observation(uuid,text,jsonb) to service_role;
comment on table public.d1_remainder_financial_observations is
    'Immutable v2 historical evidence only; no key/sign/send, caller financial approval, retry, TTL, settlement or ownership release authority.';
commit;
