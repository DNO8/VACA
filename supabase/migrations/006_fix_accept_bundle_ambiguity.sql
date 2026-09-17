-- Migration 006: corrige ambiguedad de columnas en accept_bundle.
--
-- Los parametros OUT (message_id, payload_hash, ...) chocaban con los
-- objetivos ON CONFLICT (message_id), produciendo el error 42702
-- "column reference is ambiguous" en cada ingesta. Se reemplazan los
-- objetivos por nombres de constraint explicitos.

create or replace function public.accept_bundle(
    p_origin_public_key text,
    p_incident jsonb,
    p_event jsonb,
    p_bundle jsonb,
    p_attachments jsonb,
    p_receipt jsonb
)
returns table (
    receipt_id uuid,
    message_id text,
    payload_hash text,
    server_received_at timestamptz,
    server_key_id text,
    receipt_signature text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_existing public.server_receipts%rowtype;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_event ->> 'message_id', 0));

    select * into v_existing
    from public.server_receipts receipts
    where receipts.message_id = p_event ->> 'message_id';

    if found then
        if v_existing.payload_hash <> p_event ->> 'payload_hash' then
            raise exception 'idempotency_conflict' using errcode = '23505';
        end if;
        return query select
            v_existing.id,
            v_existing.message_id,
            v_existing.payload_hash,
            v_existing.server_received_at,
            v_existing.server_key_id,
            v_existing.receipt_signature;
        return;
    end if;

    if exists (
        select 1 from public.incident_events events
        where events.incident_id = p_event ->> 'incident_id'
          and events.signer <> p_origin_public_key
    ) then
        raise exception 'incident_origin_conflict' using errcode = '42501';
    end if;

    insert into public.identities (device_public_key)
    values (p_origin_public_key)
    on conflict (device_public_key) do nothing;

    insert into public.incidents (
        incident_id, reporter_credential_ref, category, priority,
        people_count, short_note, latitude, longitude, accuracy_meters,
        location_source, identity_assurance, status, updated_at
    ) values (
        p_incident ->> 'incident_id', p_incident ->> 'reporter_credential_ref',
        p_incident ->> 'category', (p_incident ->> 'priority')::integer,
        (p_incident ->> 'people_count')::integer, p_incident ->> 'short_note',
        (p_incident ->> 'latitude')::double precision,
        (p_incident ->> 'longitude')::double precision,
        (p_incident ->> 'accuracy_meters')::double precision,
        p_incident ->> 'location_source', p_incident ->> 'identity_assurance',
        p_incident ->> 'status', (p_incident ->> 'updated_at')::timestamptz
    )
    on conflict (incident_id) do update set
        reporter_credential_ref = excluded.reporter_credential_ref,
        category = excluded.category,
        priority = excluded.priority,
        people_count = excluded.people_count,
        short_note = excluded.short_note,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_meters = excluded.accuracy_meters,
        location_source = excluded.location_source,
        identity_assurance = excluded.identity_assurance,
        status = excluded.status,
        updated_at = excluded.updated_at;

    insert into public.incident_events (
        incident_id, event_type, message_id, payload_hash,
        signer, signature, timestamp
    ) values (
        p_event ->> 'incident_id', p_event ->> 'event_type',
        p_event ->> 'message_id', p_event ->> 'payload_hash',
        p_event ->> 'signer', p_event ->> 'signature',
        (p_event ->> 'timestamp')::timestamptz
    ) on conflict on constraint incident_events_message_id_key do nothing;

    insert into public.attachments (incident_id, content_hash, size_bytes, kind)
    select
        p_incident ->> 'incident_id', item.content_hash,
        item.size_bytes, item.kind
    from jsonb_to_recordset(coalesce(p_attachments, '[]'::jsonb))
        as item(content_hash text, size_bytes bigint, kind text)
    on conflict (incident_id, content_hash) do nothing;

    insert into public.origin_bundles (
        message_id, incident_id, event_id, protocol_version,
        canonical_header, ciphertext, wrapped_key, payload_hash,
        origin_public_key, expires_at, state
    ) values (
        p_event ->> 'message_id', p_event ->> 'incident_id',
        p_event ->> 'message_id', (p_bundle ->> 'protocol_version')::integer,
        p_bundle ->> 'canonical_header', p_bundle ->> 'ciphertext',
        p_bundle ->> 'wrapped_key', p_event ->> 'payload_hash',
        p_origin_public_key, (p_bundle ->> 'expires_at')::timestamptz,
        'received'
    ) on conflict on constraint origin_bundles_message_id_key do nothing;

    insert into public.idempotency_keys (message_id, payload_hash, status)
    values (p_event ->> 'message_id', p_event ->> 'payload_hash', 'received')
    on conflict on constraint idempotency_keys_pkey do nothing;

    insert into public.server_receipts (
        id, message_id, payload_hash, server_received_at,
        server_key_id, receipt_signature
    ) values (
        (p_receipt ->> 'receipt_id')::uuid, p_event ->> 'message_id',
        p_event ->> 'payload_hash', (p_receipt ->> 'server_received_at')::timestamptz,
        p_receipt ->> 'server_key_id', p_receipt ->> 'receipt_signature'
    );

    return query select
        (p_receipt ->> 'receipt_id')::uuid,
        p_event ->> 'message_id',
        p_event ->> 'payload_hash',
        (p_receipt ->> 'server_received_at')::timestamptz,
        p_receipt ->> 'server_key_id', p_receipt ->> 'receipt_signature';
end;
$$;

revoke all on function public.accept_bundle(text, jsonb, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.accept_bundle(text, jsonb, jsonb, jsonb, jsonb, jsonb)
to service_role;
