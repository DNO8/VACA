-- Operator-only enrollment/revocation; no principals, scheduler or lifecycle writes.
-- Requires 049 and its existing dependencies. Deployment needs separate approval.
begin;

create function public.d1_enroll_refund_service_scope(p_actor text, p_namespace uuid, p_pool text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
    v_pool text;
begin
    if p_actor is null or not public.release_request_valid_key(p_actor)
       or p_namespace is null or p_pool is null or not public.release_request_valid_key(p_pool) then
        raise exception 'invalid_refund_service_scope' using errcode = '22023';
    end if;
    -- Serialize even absent memberships before row/pool locks. Hash collisions
    -- only serialize unrelated operators; JSON framing prevents tuple ambiguity.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        pg_catalog.jsonb_build_array(p_actor, p_namespace, p_pool)::text, 0));
    begin
        insert into public.d1_refund_service_scopes(actor, namespace, pool)
            values (p_actor, p_namespace, p_pool) on conflict do nothing;
    exception when foreign_key_violation then
        raise exception 'invalid_refund_service_scope' using errcode = '22023';
    end;
    -- Reuse 049 constraints; membership precedes the authoritative pool lock.
    perform 1 from public.d1_refund_service_scopes
        where actor = p_actor and namespace = p_namespace and pool = p_pool for update;
    select pool into v_pool from public.d1_pools where namespace = p_namespace for update;
    if not found or v_pool is distinct from p_pool then
        -- Includes a newly inserted membership: statement rollback leaves no grant.
        raise exception 'invalid_refund_service_scope' using errcode = '22023';
    end if;
    return 'enrolled';
end;
$$;

create function public.d1_revoke_refund_service_scope(p_actor text, p_namespace uuid, p_pool text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
    if p_actor is null or not public.release_request_valid_key(p_actor)
       or p_namespace is null or p_pool is null or not public.release_request_valid_key(p_pool) then
        raise exception 'invalid_refund_service_scope' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        pg_catalog.jsonb_build_array(p_actor, p_namespace, p_pool)::text, 0));
    -- No pool lock or current-binding requirement: stale exact rows are revocable.
    -- DELETE waits for 049's admitted FOR SHARE holders until their transactions end.
    delete from public.d1_refund_service_scopes
        where actor = p_actor and namespace = p_namespace and pool = p_pool;
    return 'revoked';
end;
$$;

revoke all on function public.d1_enroll_refund_service_scope(text, uuid, text),
    public.d1_revoke_refund_service_scope(text, uuid, text)
    from public, anon, authenticated, service_role;
comment on function public.d1_enroll_refund_service_scope(text, uuid, text) is
    'Trusted database operator only. Idempotent exact enrollment; no application admin grant or lifecycle reset.';
comment on function public.d1_revoke_refund_service_scope(text, uuid, text) is
    'Trusted database operator only. Idempotent exact revocation, including stale bindings; waits for admitted work.';

commit;
