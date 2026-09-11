-- Migration 002: funcion segura para eliminar identidad y datos vinculados.
-- Evita exponer datos sensibles mientras se ejecuta el borrado.

create or replace function public.delete_identity_data(p_device_public_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_incident_ids text[];
    v_message_ids text[];
begin
    select array_agg(distinct i.incident_id), array_agg(distinct ie.message_id)
    into v_incident_ids, v_message_ids
    from public.incidents i
    join public.incident_events ie on ie.incident_id = i.incident_id
    where ie.signer = p_device_public_key;

    if v_incident_ids is not null then
        delete from public.attachments where incident_id = any(v_incident_ids);
        delete from public.origin_bundles where incident_id = any(v_incident_ids);
        delete from public.incident_events where incident_id = any(v_incident_ids);
        delete from public.incidents where incident_id = any(v_incident_ids);
    end if;

    if v_message_ids is not null then
        delete from public.idempotency_keys where message_id = any(v_message_ids);
        delete from public.server_receipts where message_id = any(v_message_ids);
    end if;

    delete from public.identities where device_public_key = p_device_public_key;
end;
$$;

revoke all on function public.delete_identity_data(text) from public, anon, authenticated;
grant execute on function public.delete_identity_data(text) to service_role;
