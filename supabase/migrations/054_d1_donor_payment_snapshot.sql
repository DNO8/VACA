-- Private raw evidence only. Source-only: no host authentication or financial authority.
begin;
create function public.d1_capture_donor_payment(
    p_namespace uuid, p_pool text, p_transaction_hash text, p_operation_id text, p_verified_donor text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_capture jsonb; v_identity jsonb; v_scope_ok boolean; v_bindings_ok boolean;
begin
    if p_namespace is null or not public.release_request_valid_key(p_pool)
       or not public.release_request_valid_key(p_verified_donor)
       or p_transaction_hash is null or p_transaction_hash collate pg_catalog."C" !~ '^[0-9a-f]{64}$'
       or p_operation_id is null or p_operation_id collate pg_catalog."C" !~ '^[1-9][0-9]{0,18}$' then
        raise exception 'donor_payment_unavailable' using errcode = '22023';
    end if;
    if p_operation_id::numeric > 9223372036854775807 then
        raise exception 'donor_payment_unavailable' using errcode = '22023';
    end if;
    -- STABLE also pins this read to the caller's statement snapshot. No locking
    -- readers, administrator substitution, purpose flag or service-scope mutation.
    with configured as materialized (
        select * from public.d1_pools where namespace = p_namespace and pool = p_pool
    ), identity as materialized (
        select * from public.donation_payments
        where transaction_hash = p_transaction_hash and operation_id = p_operation_id
    ), owned as materialized (
        select i.* from identity i where i.payment ->> 'donor' = p_verified_donor
          and i.payment ->> 'pool' = p_pool and exists(select 1 from configured)
    ), allocations as materialized (
        select a.* from public.donation_allocations a
        where exists(select 1 from owned p where p.transaction_hash = a.transaction_hash and p.operation_id = a.operation_id)
    ), captured as materialized (
        select a.request_id, (p.request_id is null or (p.namespace = p_namespace
            and p.input #>> '{payment,pool}' = p_pool and p.input #>> '{payment,donor}' = p_verified_donor
            and p.input #>> '{payment,transaction_hash}' = p_transaction_hash
            and p.input #>> '{payment,operation_id}' = p_operation_id))
            and (s.request_id is null or s.namespace = p_namespace) as binding_ok,
        pg_catalog.jsonb_build_object(
            'donation_allocations',pg_catalog.to_jsonb(a) || pg_catalog.jsonb_build_object('allocated_stroops',a.allocated_stroops::text),
            'release_requests',pg_catalog.to_jsonb(r) || pg_catalog.jsonb_build_object('request',r.request::text),
            'd1_preparations',pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object('input',p.input::text,'receipt',p.receipt::text),
            'd1_issuance_intents',pg_catalog.to_jsonb(i) || pg_catalog.jsonb_build_object('receipt',i.receipt::text),
            'd1_issuance_sequences',pg_catalog.to_jsonb(s) || pg_catalog.jsonb_build_object('receipt',s.receipt::text),
            'd1_unsigned_transactions',pg_catalog.to_jsonb(u) || pg_catalog.jsonb_build_object('receipt',u.receipt::text),
            'd1_issuance_fee_commitments',pg_catalog.to_jsonb(f) || pg_catalog.jsonb_build_object('receipt',f.receipt::text),
            'd1_initial_financial_observations',coalesce((select pg_catalog.jsonb_agg(
                pg_catalog.to_jsonb(o) || pg_catalog.jsonb_build_object('receipt',o.receipt::text) order by o.snapshot_hash collate pg_catalog."C")
                from public.d1_initial_financial_observations o where o.request_id = a.request_id),'[]'::jsonb),
            'd1_signed_transactions',pg_catalog.to_jsonb(g) || pg_catalog.jsonb_build_object('receipt',g.receipt::text),
            'd1_submission_attempts',pg_catalog.to_jsonb(t) || pg_catalog.jsonb_build_object('receipt',t.receipt::text),
            'd1_issuance_outcomes',pg_catalog.to_jsonb(o) || pg_catalog.jsonb_build_object('receipt',o.receipt::text)) as row
        from allocations a
        left join public.release_requests r on r.request_id = a.request_id
        left join public.d1_preparations p on p.request_id = a.request_id
        left join public.d1_issuance_intents i on i.request_id = a.request_id
        left join public.d1_issuance_sequences s on s.request_id = a.request_id
        left join public.d1_unsigned_transactions u on u.request_id = a.request_id
        left join public.d1_issuance_fee_commitments f on f.request_id = a.request_id
        left join public.d1_signed_transactions g on g.request_id = a.request_id
        left join public.d1_submission_attempts t on t.request_id = a.request_id
        left join public.d1_issuance_outcomes o on o.request_id = a.request_id
    )
    select exists(select 1 from configured), (select payment from identity),
        not exists(select 1 from captured where binding_ok is not true),
        pg_catalog.jsonb_build_object('kind','d1_donor_payment_capture','revision',1,
        'scope',pg_catalog.jsonb_build_object('namespace',p_namespace,'network','TESTNET','pool',p_pool,
            'verifiedDonor',p_verified_donor,'transactionHash',p_transaction_hash,'operationId',p_operation_id),
        'dbReadAt',floor(extract(epoch from pg_catalog.statement_timestamp()))::bigint,
        'payment',(select pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
            'payment',p.payment::text,'donation_stroops',p.donation_stroops::text,'allocated_stroops',p.allocated_stroops::text) from owned p),
        'allocations',coalesce((select pg_catalog.jsonb_agg(row order by request_id) from captured),'[]'::jsonb),
        -- CASE is the execution gate: absent/foreign lookups never inspect the
        -- namespace's descendant journals (even malformed or oversized ones).
        'evidence',case when exists(select 1 from owned) then pg_catalog.jsonb_build_object(
            'd1_pools',(select pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('first_ledger',c.first_ledger::text) from configured c),
            'd1_discovery_checkpoints',(select pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object(
                'checkpoint',c.checkpoint::text,'page_count',c.page_count::text) from public.d1_discovery_checkpoints c where c.namespace=p_namespace),
            'd1_discovery_pages',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
                'through_ledger',p.through_ledger::text,'page',p.page::text,'receipt',p.receipt::text)
                order by p.from_cursor collate pg_catalog."C",p.through_ledger,p.ledger_hash collate pg_catalog."C")
                from public.d1_discovery_pages p where p.namespace=p_namespace),'[]'::jsonb),
            'd1_discovery_operations',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(o) || pg_catalog.jsonb_build_object('record',o.record::text)
                order by o.paging_token collate pg_catalog."C") from public.d1_discovery_operations o where o.namespace=p_namespace),'[]'::jsonb),
            'd1_transaction_checkpoints',(select pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object(
                'checkpoint',c.checkpoint::text,'page_count',c.page_count::text,'record_count',c.record_count::text)
                from public.d1_transaction_checkpoints c where c.namespace=p_namespace),
            'd1_transaction_pages',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
                'through_ledger',p.through_ledger::text,'page',p.page::text,'receipt',p.receipt::text)
                order by p.from_cursor collate pg_catalog."C",p.through_ledger,p.ledger_hash collate pg_catalog."C")
                from public.d1_transaction_pages p where p.namespace=p_namespace),'[]'::jsonb),
            'd1_transaction_records',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) || pg_catalog.jsonb_build_object('record',r.record::text)
                order by r.paging_token collate pg_catalog."C") from public.d1_transaction_records r where r.namespace=p_namespace),'[]'::jsonb),
            'd1_operating_credit_observations',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('receipt',c.receipt::text)
                order by c.operation_id collate pg_catalog."C") from public.d1_operating_credit_observations c where c.namespace=p_namespace),'[]'::jsonb)
        ) else null end)
    into v_scope_ok,v_identity,v_bindings_ok,v_capture;
    if not v_scope_ok or not v_bindings_ok then
        raise exception 'donor_payment_unavailable' using errcode = '22023';
    end if;
    -- Missing/invalid ownership cannot be certified as foreign or absent.
    if v_identity is not null and (not public.release_request_valid_key(v_identity ->> 'donor')
        or not public.release_request_valid_key(v_identity ->> 'pool')) then
        raise exception 'donor_payment_unavailable' using errcode = '22023';
    end if;
    if v_capture -> 'payment' <> 'null'::jsonb then
        perform public.donation_payment_content(v_identity);
        if v_identity ->> 'transaction_hash' <> p_transaction_hash or v_identity ->> 'operation_id' <> p_operation_id then
            raise exception 'donor_payment_unavailable' using errcode = '22023';
        end if;
    end if;
    if pg_catalog.jsonb_array_length(v_capture -> 'allocations') > 100
       or pg_catalog.octet_length(pg_catalog.convert_to(v_capture::text,'UTF8')) > 4194304 then
        raise exception 'donor_payment_unavailable' using errcode = '22023';
    end if;
    return v_capture;
exception when sqlstate '22023' then
    raise exception 'donor_payment_unavailable' using errcode = '22023';
end;
$$;
alter function public.d1_capture_donor_payment(uuid,text,text,text,text) owner to postgres;
revoke all on function public.d1_capture_donor_payment(uuid,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.d1_capture_donor_payment(uuid,text,text,text,text) to service_role;
comment on function public.d1_capture_donor_payment(uuid,text,text,text,text) is
    'Private raw snapshot, not wallet authentication, public status, chain coverage or financial authority. Trusted host must verify personal proof and configured scope first.';
commit;
