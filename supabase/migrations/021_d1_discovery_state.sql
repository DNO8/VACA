-- Durable opaque ingestion state only; requires 015 and 019. No readiness proof.
begin;
create function public.d1_load_discovery_state(p_namespace uuid, p_authorized_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_lookup jsonb;
    v_checkpoint jsonb;
    v_first_ledger bigint;
    v_covered boolean;
begin
    -- Reuse current-admin validation and admin -> pool -> checkpoint locks,
    -- including serialization when no checkpoint exists. Do not duplicate auth.
    v_lookup := public.d1_load_discovery_checkpoint(p_namespace, p_authorized_by);
    v_checkpoint := v_lookup -> 'checkpoint';
    select first_ledger into v_first_ledger from public.d1_pools
        where namespace = p_namespace;
    select exists (
        select 1 from public.d1_discovery_pages
        where namespace = p_namespace
          and from_cursor = v_checkpoint ->> 'cursor'
          and page ->> 'from_cursor' = v_checkpoint ->> 'cursor'
          and page ->> 'to_cursor' = v_checkpoint ->> 'cursor'
          and pg_catalog.to_jsonb(through_ledger) = v_checkpoint -> 'through_ledger'
          and page -> 'through_ledger' = v_checkpoint -> 'through_ledger'
          and ledger_hash = v_checkpoint ->> 'ledger_hash'
          and page -> 'ledger_hash' = v_checkpoint -> 'ledger_hash'
          and page -> 'closed_at' = v_checkpoint -> 'closed_at'
          and page -> 'records' = '[]'::jsonb
    ) into v_covered;
    return pg_catalog.jsonb_build_object(
        'kind', 'd1_discovery_state', 'revision', 1,
        'namespace', v_lookup -> 'namespace', 'network', v_lookup -> 'network',
        'pool', v_lookup -> 'pool', 'checkpoint', v_checkpoint,
        'first_ledger', v_first_ledger, 'coverage_complete', v_covered);
end;
$$;
revoke all on function public.d1_load_discovery_state(uuid,text)
    from public, anon, authenticated, service_role;
grant execute on function public.d1_load_discovery_state(uuid,text) to service_role;
comment on function public.d1_load_discovery_state(uuid,text) is
    'Admin-authorized opaque ingestion checkpoint and exact empty-page marker; not verified chain/history, funding or readiness.';
commit;
