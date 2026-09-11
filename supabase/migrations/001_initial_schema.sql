-- Migration 001: esquema base para contrato de servidor autorizado (Slice C3).
--
-- Las credenciales (SERVER_BUNDLE_KEY, SERVER_RECEIPT_PRIVATE_KEY, etc.)
-- viven en los secrets de Supabase, nunca en el repo.

-- Habilitar RLS por defecto.
alter table if exists public.identities enable row level security;
alter table if exists public.incidents enable row level security;
alter table if exists public.incident_events enable row level security;
alter table if exists public.attachments enable row level security;
alter table if exists public.origin_bundles enable row level security;
alter table if exists public.idempotency_keys enable row level security;

-- Perfiles de identidad opacos. El KYC es solo una referencia externa.
create table if not exists public.identities (
    id uuid primary key default gen_random_uuid(),
    device_public_key text not null unique,
    kyc_provider text,
    kyc_external_id text,
    kyc_assurance text,
    kyc_verified_at timestamptz,
    created_at timestamptz not null default now()
);

-- Incidentes recibidos por bundles. El servidor no conoce la identidad real
-- del denunciante; el incident_id es el que genero el dispositivo.
create table if not exists public.incidents (
    id uuid primary key default gen_random_uuid(),
    incident_id text not null unique,
    reporter_credential_ref text not null,
    category text not null,
    priority integer not null default 0,
    people_count integer,
    short_note text,
    latitude double precision,
    longitude double precision,
    accuracy_meters double precision,
    location_source text,
    identity_assurance text,
    status text not null default 'received',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    cancelled_at timestamptz
);

-- Eventos append-only del incidente (create/update/cancel).
create table if not exists public.incident_events (
    id uuid primary key default gen_random_uuid(),
    incident_id text not null references public.incidents(incident_id) on delete cascade,
    event_type text not null,
    message_id text not null unique,
    payload_hash text not null,
    signer text not null,
    signature text not null,
    timestamp timestamptz not null default now(),
    created_at timestamptz not null default now()
);

-- Adjuntos referenciados en el bundle. El contenido se sube aparte a Storage.
create table if not exists public.attachments (
    id uuid primary key default gen_random_uuid(),
    incident_id text not null references public.incidents(incident_id) on delete cascade,
    content_hash text not null,
    size_bytes bigint not null,
    kind text not null,
    storage_path text,
    created_at timestamptz not null default now(),
    unique(incident_id, content_hash)
);

-- Bundles origen tal cual llegan; util para auditoria y reconciliacion.
create table if not exists public.origin_bundles (
    id uuid primary key default gen_random_uuid(),
    message_id text not null unique,
    incident_id text not null references public.incidents(incident_id) on delete cascade,
    event_id text references public.incident_events(message_id) on delete set null,
    protocol_version integer not null,
    canonical_header text not null,
    ciphertext text not null,
    wrapped_key text not null,
    payload_hash text not null,
    origin_public_key text not null,
    expires_at timestamptz not null,
    state text not null default 'received',
    server_receipt_id text,
    created_at timestamptz not null default now()
);

-- Idempotencia: message_id + payload_hash define un bundle unico.
create table if not exists public.idempotency_keys (
    message_id text primary key,
    payload_hash text not null,
    status text not null,
    created_at timestamptz not null default now()
);

-- Recibos firmados por el servidor.
create table if not exists public.server_receipts (
    id uuid primary key default gen_random_uuid(),
    message_id text not null unique,
    payload_hash text not null,
    server_received_at timestamptz not null,
    server_key_id text not null,
    receipt_signature text not null,
    created_at timestamptz not null default now()
);

-- Indices de consulta.
create index if not exists idx_incidents_status on public.incidents(status);
create index if not exists idx_incident_events_incident on public.incident_events(incident_id);
create index if not exists idx_attachments_incident on public.attachments(incident_id);
create index if not exists idx_origin_bundles_incident on public.origin_bundles(incident_id);

-- Trigger para updated_at en incidents.
create or replace function public.update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger incidents_updated_at
before update on public.incidents
for each row execute function public.update_updated_at();

-- Bucket para adjuntos de incidentes.
insert into storage.buckets (id, name, public)
values ('incident-attachments', 'incident-attachments', false)
on conflict (id) do nothing;

-- Politicas de Storage: solo el servidor puede leer/escribir. Los dispositivos
-- suban mediante URLs firmadas generadas por la Edge Function.
create policy "Allow server reads" on storage.objects
  for select using (bucket_id = 'incident-attachments');

create policy "Allow server inserts" on storage.objects
  for insert with check (bucket_id = 'incident-attachments');

create policy "Allow server updates" on storage.objects
  for update using (bucket_id = 'incident-attachments')
  with check (bucket_id = 'incident-attachments');
