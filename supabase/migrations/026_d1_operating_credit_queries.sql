-- Opaque authorized receipt enumeration, NOT SDK validation or approval to spend.
begin;
create function public.d1_load_operating_credit_state(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_discovery jsonb;
    v_count bigint;
    v_hash text;
begin
    -- Same current-admin -> pool -> checkpoint locks as the022 writer.
    v_discovery := public.d1_load_discovery_state(p_namespace, p_authorized_by);
    select count(*), pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        p_namespace::text || ':' || (v_discovery ->> 'pool') || ':' ||
        coalesce(pg_catalog.string_agg(pg_catalog.encode(pg_catalog.sha256(
            pg_catalog.convert_to(r.receipt::text, 'UTF8')), 'hex'), '' order by r.operation_id::numeric), ''),
        'UTF8')), 'hex') into v_count, v_hash
        from public.d1_operating_credit_observations r where r.namespace = p_namespace;
    return pg_catalog.jsonb_build_object('kind','d1_operating_credit_state','revision',1,
        'namespace',p_namespace,'network','TESTNET','pool',v_discovery -> 'pool',
        'receipt_count',v_count,'set_hash',v_hash,'discovery_state',v_discovery);
end;
$$;
create function public.d1_list_operating_credits(
    p_namespace uuid, p_authorized_by text, p_after text default '0', p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_state jsonb;
    v_receipts jsonb;
    v_after numeric;
    v_next text;
    v_more boolean;
begin
    -- Authenticate before validating cursors, retain the pool lock for the read.
    v_state := public.d1_load_operating_credit_state(p_namespace, p_authorized_by);
    if p_after is null or p_after !~ '^(0|[1-9][0-9]{0,19})$'
       or p_limit is null or p_limit < 1 or p_limit > 100 then
        raise exception 'invalid_operating_credit_query' using errcode = '22023';
    end if;
    v_after := p_after::numeric;
    if v_after > 18446744073709551615 then
        raise exception 'invalid_operating_credit_query' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(q.receipt order by q.operation_id::numeric), '[]'::jsonb)
        into v_receipts from (
            select r.operation_id, r.receipt from public.d1_operating_credit_observations r
            where r.namespace = p_namespace and r.operation_id::numeric > v_after
            order by r.operation_id::numeric limit p_limit
        ) q;
    v_next := case when pg_catalog.jsonb_array_length(v_receipts) = 0 then p_after
        else v_receipts -> -1 #>> '{observation,operationId}' end;
    select exists(select 1 from public.d1_operating_credit_observations r
        where r.namespace = p_namespace and r.operation_id::numeric > v_next::numeric) into v_more;
    return pg_catalog.jsonb_build_object('kind','d1_operating_credits','revision',1,
        'namespace',p_namespace,'network','TESTNET','pool',v_state -> 'pool',
        'from_cursor',p_after,'next_cursor',v_next,'receipts',v_receipts,'has_more',v_more,
        'credit_state',v_state);
end;
$$;
revoke all on function public.d1_load_operating_credit_state(uuid,text)
    from public, anon, authenticated, service_role;
revoke all on function public.d1_list_operating_credits(uuid,text,text,integer)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_operating_credit_state(uuid,text) to service_role;
grant execute on function public.d1_list_operating_credits(uuid,text,text,integer) to service_role;
commit;
