-- Read-only opaque discovery retrieval. Requires 015 and 019; no readiness proof.
begin;
create function public.d1_list_discovery_operations(
    p_namespace uuid,
    p_authorized_by text,
    p_after_cursor text default '0',
    p_limit integer default 100
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_first_ledger bigint;
    v_records jsonb;
    v_next text;
    v_more boolean;
begin
    -- Keep current membership, namespace binding and admin -> pool -> checkpoint
    -- serialization identical to the journal writer, including empty journals.
    v_lookup := public.d1_load_discovery_checkpoint(p_namespace, p_authorized_by);
    if p_after_cursor is null
       or p_after_cursor !~ '^(0|[1-9][0-9]{0,19})$'
       or p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'invalid_discovery_query' using errcode = '22023';
    end if;
    -- Cast only after the canonical bounded decimal check, never to bigint/float.
    if p_after_cursor::numeric > 18446744073709551615 then
        raise exception 'invalid_discovery_query' using errcode = '22023';
    end if;
    select first_ledger into v_first_ledger from public.d1_pools
        where namespace = p_namespace;
    select coalesce(pg_catalog.jsonb_agg(row.record order by row.cursor), '[]'::jsonb)
        into v_records
        from (
            select record, paging_token::numeric as cursor
            from public.d1_discovery_operations
            where namespace = p_namespace and paging_token::numeric > p_after_cursor::numeric
            order by paging_token::numeric
            limit p_limit
        ) as row;
    v_next := coalesce(v_records -> -1 ->> 'paging_token', p_after_cursor);
    select exists (
        select 1 from public.d1_discovery_operations
        where namespace = p_namespace and paging_token::numeric > v_next::numeric
    ) into v_more;
    return pg_catalog.jsonb_build_object(
        'kind', 'd1_discovery_operations', 'revision', 1,
        'namespace', v_lookup -> 'namespace', 'network', v_lookup -> 'network',
        'pool', v_lookup -> 'pool', 'first_ledger', v_first_ledger,
        'checkpoint', v_lookup -> 'checkpoint', 'records', v_records,
        'next_cursor', v_next, 'has_more', v_more);
end;
$$;
revoke all on function public.d1_list_discovery_operations(uuid,text,text,integer)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_list_discovery_operations(uuid,text,text,integer) to service_role;
comment on function public.d1_list_discovery_operations(uuid,text,text,integer) is
    'Admin-authorized opaque journal pagination; not verified history, donation provenance, funding or readiness.';
commit;
