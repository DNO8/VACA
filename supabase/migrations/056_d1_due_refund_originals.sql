-- SOURCE ONLY / UNVERIFIED. Requires015 and the exact private049 assertion.
-- Enumeration is not reservation, lane selection or financial admission.
begin;
do $migration$
begin
    if not exists (select 1 from pg_catalog.pg_proc p
        where p.oid = pg_catalog.to_regprocedure('public.d1_assert_refund_service_scope_private(text,uuid,text)')
        and pg_catalog.md5(p.prosrc) = 'bbec1aadce4b0635983aec5f25c6e649'
        and p.proowner = 'postgres'::regrole and p.prorettype = 'void'::regtype
        and p.prolang = (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
        and p.prokind = 'f' and p.provolatile = 'v' and p.proparallel = 'u'
        and p.prosecdef and not p.proisstrict and not p.proleakproof and not p.proretset
        and p.proconfig = array['search_path=""']
        and p.proargnames = array['p_actor','p_namespace','p_pool']
        and p.pronargs = 3 and p.pronargdefaults = 0 and p.proargdefaults is null
        and p.proallargtypes is null and p.proargmodes is null
        and p.probin is null and p.prosqlbody is null
        and p.procost = 100 and p.prorows = 0 and p.prosupport = 0
        and pg_catalog.cardinality(p.proacl) = 1
        and p.proacl @> array['postgres=X/postgres']::aclitem[]) then
        raise exception 'unexpected_d1_refund_service_scope_definition' using errcode = 'P0001';
    end if;
end;
$migration$;

create function public.d1_list_due_refund_originals(
    p_namespace uuid, p_pool text, p_actor text,
    p_after_request_id uuid, p_limit integer
) returns jsonb language plpgsql volatile parallel unsafe security definer set search_path = '' as $$
declare
    v_row record;
    v_pool text;
    v_observed timestamptz;
    v_confirmed bigint;
    v_deadline timestamptz;
    v_ids uuid[] := array[]::uuid[];
    v_next uuid := null;
    v_scanned integer := 0;
    v_last_scanned uuid := null;
begin
    -- No admin fallback.049 locks membership FOR SHARE, then pool FOR UPDATE.
    -- It rechecks the binding after waiting; no evidence read precedes admission.
    perform public.d1_assert_refund_service_scope_private(p_actor, p_namespace, p_pool);
    if p_limit is null or p_limit < 1 or p_limit > 50 then
        raise exception 'invalid_due_refund_page' using errcode = '22023';
    end if;
    -- Read the authoritative binding under the already-held049 pool lock.
    select pool into v_pool from public.d1_pools where namespace = p_namespace;
    if not found or v_pool is distinct from p_pool then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    v_observed := pg_catalog.clock_timestamp();
    -- Validate BEFORE testing due time: malformed stored deadlines cannot become
    -- eligible via a fallback or disappear through a SQL NULL/filter comparison.
    -- Bound the original window BEFORE due filtering, including future rows.
    for v_row in
        select request_id, input from public.d1_preparations
        where namespace = p_namespace
          and (p_after_request_id is null or request_id > p_after_request_id)
        order by request_id
        limit p_limit + 1
    loop
        -- The extra original proves continuation but is processed next page.
        if v_scanned = p_limit then
            v_next := v_last_scanned;
            exit;
        end if;
        v_scanned := v_scanned + 1;
        v_last_scanned := v_row.request_id;
        if pg_catalog.jsonb_typeof(v_row.input) is distinct from 'object'
           or pg_catalog.jsonb_typeof(v_row.input -> 'request_id') is distinct from 'string'
           or pg_catalog.jsonb_typeof(v_row.input -> 'payment') is distinct from 'object'
           or v_row.input #> '{payment,pool}' is distinct from pg_catalog.to_jsonb(v_pool)
           or pg_catalog.jsonb_typeof(v_row.input -> 'request') is distinct from 'object'
           or pg_catalog.jsonb_typeof(v_row.input #> '{request,deadline}') is distinct from 'string'
           or pg_catalog.jsonb_typeof(v_row.input -> 'confirmed_at') is distinct from 'number'
           or (v_row.input ->> 'confirmed_at') !~ '^[1-9][0-9]{0,10}$' then
            raise exception 'invalid_due_refund_preparation' using errcode = '22023';
        end if;
        if (v_row.input ->> 'request_id')::uuid is distinct from v_row.request_id then
            raise exception 'invalid_due_refund_preparation' using errcode = '22023';
        end if;
        v_confirmed := (v_row.input ->> 'confirmed_at')::bigint;
        v_deadline := pg_catalog.to_timestamp(v_confirmed + 300);
        -- Exact015 construction, not a permissive cast of arbitrary date text.
        if v_row.input #>> '{request,deadline}' is distinct from pg_catalog.to_char(
            v_deadline at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') then
            raise exception 'invalid_due_refund_preparation' using errcode = '22023';
        end if;
        if v_deadline <= v_observed then
            v_ids := pg_catalog.array_append(v_ids, v_row.request_id);
        end if;
    end loop;
    -- Cursor tracks the scanned window, not just returned due IDs. Empty due
    -- pages may have a continuation; exhaustion alone returns NULL.
    return pg_catalog.jsonb_build_object(
        'kind', 'd1_due_refund_originals', 'revision', 1,
        'namespace', p_namespace, 'pool', v_pool, 'network', 'TESTNET',
        'dbObservedAt', pg_catalog.to_char(v_observed at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'requestIds', pg_catalog.to_jsonb(v_ids), 'nextAfterRequestId', v_next
    );
end;
$$;
alter function public.d1_list_due_refund_originals(uuid,text,text,uuid,integer) owner to postgres;
revoke all on function public.d1_list_due_refund_originals(uuid,text,text,uuid,integer)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_list_due_refund_originals(uuid,text,text,uuid,integer) to service_role;
comment on function public.d1_list_due_refund_originals(uuid,text,text,uuid,integer) is
    'Private scoped TESTNET due-original enumeration only. NULL cursor starts/resweeps; no issuance/failure/lane verdict. No writes or reservations.';
commit;
