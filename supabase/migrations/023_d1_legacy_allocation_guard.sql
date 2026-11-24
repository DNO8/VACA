-- Local only. Quiescent application required; no live migration is authorized.
begin;
create table public.d1_legacy_pool_fences (
    pool text primary key,
    activated boolean not null,
    has_legacy_payment boolean not null default false
);
alter table public.d1_legacy_pool_fences owner to postgres;
alter table public.d1_legacy_pool_fences enable row level security;
revoke all on table public.d1_legacy_pool_fences from public, anon, authenticated, service_role;
-- Stable historical rows avoid writes/unique-key contention on ordinary allocation.
insert into public.d1_legacy_pool_fences
select payment ->> 'pool', false, true from public.donation_payments
where payment ->> 'pool' is not null group by payment ->> 'pool';
insert into public.d1_legacy_pool_fences(pool, activated) select pool, true from public.d1_pools
on conflict (pool) do update set activated = true;

do $migration$
declare
    v_allocator regprocedure := 'public.allocate_donation_to_release_request(uuid,text,jsonb,text)'::regprocedure;
    v_activation regprocedure := 'public.d1_activate_pool(uuid,text,bigint)'::regprocedure;
    v_prepare regprocedure := 'public.d1_prepare(jsonb)'::regprocedure;
    v_definition text;
    v_function record;
    v_header text;
    v_body text;
    v_anchor constant text := E'    else\n        if (v_request.request ->> ''deadline'')::timestamptz <= pg_catalog.clock_timestamp() then';
    v_call constant text := 'v_allocation := public.allocate_donation_to_release_request(v_id, v_admin, v_payment, v_pool.pool);';
begin
    -- Pin source AND metadata before replacing any function. These are the exact
    -- retained allocator and 015 bodies, not hashes of caller-supplied definitions.
    for v_function in select * from (values
        (v_allocator, '5f50741a7f39c06676dc16ab72822c9d', array['p_request_id','p_authorized_by','p_payment','p_expected_pool']),
        (v_activation, '4d729eaff57d3ce402459d08595c25e5', array['p_namespace','p_pool','p_first_ledger']),
        (v_prepare, 'a93605ccb407b82cfc6e4f683b620dfd', array['p_input'])
    ) as expected(oid, digest, args) loop
        if not exists (select 1 from pg_catalog.pg_proc p where p.oid = v_function.oid
            and pg_catalog.md5(p.prosrc) = v_function.digest and p.prosecdef
            and p.proconfig = array['search_path=""'] and p.proargnames = v_function.args
            and p.pronargdefaults = 0 and p.proowner = 'postgres'::regrole
            and p.prorettype = 'jsonb'::regtype and p.provolatile = 'v') then
            raise exception 'unexpected_d1_guard_definition';
        end if;
    end loop;
    -- Copy definitions, never rename: preserve public OIDs, headers and ACLs.
    for v_function in select * from (values
        (v_allocator, 'allocate_donation_to_release_request', 'd1_allocate_donation_private', 'uuid,text,jsonb,text'),
        (v_activation, 'd1_activate_pool', 'd1_activate_pool_private', 'uuid,text,bigint')
    ) as copies(oid, original, private_name, args) loop
        v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
        v_header := 'CREATE OR REPLACE FUNCTION public.' || v_function.original || '(';
        if pg_catalog.left(v_definition, pg_catalog.length(v_header)) <> v_header then
            raise exception 'unexpected_d1_guard_header';
        end if;
        execute pg_catalog.replace(v_definition, v_header, 'CREATE FUNCTION public.' || v_function.private_name || '(');
        execute 'alter function public.' || v_function.private_name || '(' || v_function.args || ') owner to postgres';
        execute 'revoke all on function public.' || v_function.private_name || '(' || v_function.args || ') from public, anon, authenticated, service_role';
    end loop;
    v_definition := pg_catalog.pg_get_functiondef(v_allocator);
    if (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_anchor, ''))) <> pg_catalog.length(v_anchor) then
        raise exception 'unexpected_d1_guard_anchor';
    end if;
    -- Keep original validation/admin/replay/conflicts ahead of this NEW-only guard.
    -- Share locks coexist across historical allocations. An activation tuple update
    -- makes stale RR/Serializable snapshots fail natively instead of missing it.
    execute pg_catalog.replace(v_definition, v_anchor, E'    else\n'
        || E'        insert into public.d1_legacy_pool_fences(pool, activated, has_legacy_payment)\n'
        || E'            select p_expected_pool, false, true where not exists (select 1 from public.d1_legacy_pool_fences where pool = p_expected_pool)\n'
        || E'            on conflict (pool) do nothing;\n'
        || E'        -- Write ONCE on a previously virgin fence: stale activation must conflict too.\n'
        || E'        if exists (select 1 from public.d1_legacy_pool_fences where pool = p_expected_pool and not activated and not has_legacy_payment) then\n'
        || E'            update public.d1_legacy_pool_fences set has_legacy_payment = true\n'
        || E'                where pool = p_expected_pool and not activated and not has_legacy_payment;\n'
        || E'        end if;\n'
        || E'        perform 1 from public.d1_legacy_pool_fences where pool = p_expected_pool for share;\n'
        || E'        if exists (select 1 from public.d1_legacy_pool_fences where pool = p_expected_pool and activated) then\n'
        || E'            raise exception ''d1_legacy_allocation_forbidden'' using errcode = ''22023'';\n'
        || E'        end if;\n'
        || E'        if (v_request.request ->> ''deadline'')::timestamptz <= pg_catalog.clock_timestamp() then');
    v_definition := pg_catalog.pg_get_functiondef(v_activation);
    select prosrc into v_body from pg_catalog.pg_proc where oid = v_activation;
    if (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_body, ''))) <> pg_catalog.length(v_body) then
        raise exception 'unexpected_d1_guard_anchor';
    end if;
    -- Retain 015 validation and global advisory order before the per-pool lock.
    -- The private original retains every historical/conflict/replay decision.
    execute pg_catalog.replace(v_definition, v_body, $activation$
declare
    v_receipt jsonb;
begin
    if p_namespace is null or not public.release_request_valid_key(p_pool)
       or p_first_ledger is null or p_first_ledger <= 0 then
        raise exception 'invalid_activation' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vaca.d1.activation', 0));
    insert into public.d1_legacy_pool_fences(pool, activated)
        select p_pool, false where not exists (select 1 from public.d1_legacy_pool_fences where pool = p_pool)
        on conflict (pool) do nothing;
    perform 1 from public.d1_legacy_pool_fences where pool = p_pool for update;
    v_receipt := public.d1_activate_pool_private(p_namespace, p_pool, p_first_ledger);
    update public.d1_legacy_pool_fences set activated = true where pool = p_pool and not activated;
    return v_receipt;
end;
$activation$);
    v_definition := pg_catalog.pg_get_functiondef(v_prepare);
    if (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_call, ''))) <> pg_catalog.length(v_call) then
        raise exception 'unexpected_d1_guard_anchor';
    end if;
    -- Only the verified prepare path can reach the original allocator as owner.
    execute pg_catalog.replace(v_definition, v_call,
        'v_allocation := public.d1_allocate_donation_private(v_id, v_admin, v_payment, v_pool.pool);');
end;
$migration$;
commit;
