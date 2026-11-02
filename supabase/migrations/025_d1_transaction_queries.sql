-- Private bounded reads of024 observations; no SDK or financial approval.
begin;
create function public.d1_list_transaction_records(
    p_namespace uuid, p_authorized_by text, p_after text default '0', p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_state jsonb;
    v_records jsonb;
    v_after numeric;
    v_next text;
    v_more boolean;
begin
    -- Authenticate first and retain024's pool lock through the entire read.
    v_state := public.d1_load_transaction_history_state(p_namespace, p_authorized_by);
    if p_after is null or p_after !~ '^(0|[1-9][0-9]{0,19})$'
       or p_limit is null or p_limit < 1 or p_limit > 100 then
        raise exception 'invalid_transaction_query' using errcode = '22023';
    end if;
    v_after := p_after::numeric;
    if v_after > 18446744073709551615 or (v_after <> 0 and
        (mod(v_after,4096) <> 0 or mod(trunc(v_after/4096),1048576) = 0
         or trunc(v_after/4294967296) = 0)) then
        raise exception 'invalid_transaction_query' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(q.record order by q.paging_token::numeric), '[]'::jsonb)
        into v_records from (
            select r.paging_token, r.record from public.d1_transaction_records r
            where r.namespace = p_namespace and r.paging_token::numeric > v_after
            order by r.paging_token::numeric limit p_limit
        ) q;
    v_next := case when pg_catalog.jsonb_array_length(v_records) = 0 then p_after
        else v_records -> -1 ->> 'pagingToken' end;
    select exists (select 1 from public.d1_transaction_records r where r.namespace = p_namespace
        and r.paging_token::numeric > v_next::numeric) into v_more;
    return pg_catalog.jsonb_build_object('kind','d1_transaction_records','revision',1,
        'namespace',p_namespace,'network','TESTNET','pool',v_state -> 'pool',
        'from_cursor',p_after,'next_cursor',v_next,'records',v_records,'has_more',v_more,
        'history_state',v_state);
end;
$$;
revoke all on function public.d1_list_transaction_records(uuid,text,text,integer)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_list_transaction_records(uuid,text,text,integer) to service_role;
commit;
