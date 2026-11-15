-- Inert TESTNET service membership: no principal provisioning or production callers.
-- Requires retained014/20261011060218 and015. Apply only under separate authorization.
begin;

create table public.d1_refund_service_scopes (
    actor text not null check (public.release_request_valid_key(actor)),
    namespace uuid not null references public.d1_pools(namespace),
    pool text not null check (public.release_request_valid_key(pool)),
    primary key (actor, namespace, pool)
);
alter table public.d1_refund_service_scopes enable row level security;
revoke all on table public.d1_refund_service_scopes from public, anon, authenticated, service_role;

create function public.d1_assert_refund_service_scope_private(p_actor text, p_namespace uuid, p_pool text)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_pool text;
begin
    if p_actor is null or not public.release_request_valid_key(p_actor)
       or p_namespace is null or p_pool is null or not public.release_request_valid_key(p_pool) then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Membership precedes pool/evidence locks. Held until transaction completion,
    -- including when a revoker is waiting; revocation does not cancel admitted work.
    perform 1 from public.d1_refund_service_scopes
        where actor = p_actor and namespace = p_namespace and pool = p_pool for share;
    if not found then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
    -- Recheck the authoritative binding after acquiring its lock, not a stale
    -- caller-supplied scope or pre-wait pool observation. No network/purpose override.
    select pool into v_pool from public.d1_pools where namespace = p_namespace for update;
    if not found or v_pool is distinct from p_pool then
        raise exception 'unauthorized_admin_wallet' using errcode = '42501';
    end if;
end;
$$;
revoke all on function public.d1_assert_refund_service_scope_private(text, uuid, text)
    from public, anon, authenticated, service_role;
comment on table public.d1_refund_service_scopes is
    'Empty-by-default TESTNET refund/reconciliation service scopes. Row deletion revokes future admission. No self-enrollment.';
comment on function public.d1_assert_refund_service_scope_private(text, uuid, text) is
    'Private scope assertion, not identity authentication or a production permission grant. Lock order: service membership, pool, evidence.';

commit;
