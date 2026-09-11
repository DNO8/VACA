alter table public.server_receipts
    add column if not exists payload_hash text,
    add column if not exists server_received_at timestamptz,
    add column if not exists server_key_id text;

update public.server_receipts receipts
set payload_hash = events.payload_hash,
    server_received_at = coalesce(receipts.server_received_at, receipts.created_at),
    server_key_id = coalesce(receipts.server_key_id, 'legacy-receipt-key')
from public.incident_events events
where events.message_id = receipts.message_id
  and receipts.payload_hash is null;

update public.server_receipts
set payload_hash = coalesce(payload_hash, 'legacy-unbound'),
    server_received_at = coalesce(server_received_at, created_at),
    server_key_id = coalesce(server_key_id, 'legacy-receipt-key')
where payload_hash is null or server_received_at is null or server_key_id is null;

alter table public.server_receipts
    alter column payload_hash set not null,
    alter column server_received_at set not null,
    alter column server_key_id set not null;

create table if not exists public.request_nonces (
    nonce text primary key,
    device_public_key text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table public.identities enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.attachments enable row level security;
alter table public.origin_bundles enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.server_receipts enable row level security;
alter table public.request_nonces enable row level security;

revoke all on table public.identities from anon, authenticated;
revoke all on table public.incidents from anon, authenticated;
revoke all on table public.incident_events from anon, authenticated;
revoke all on table public.attachments from anon, authenticated;
revoke all on table public.origin_bundles from anon, authenticated;
revoke all on table public.idempotency_keys from anon, authenticated;
revoke all on table public.server_receipts from anon, authenticated;
revoke all on table public.request_nonces from anon, authenticated;

drop policy if exists "Allow server reads" on storage.objects;
drop policy if exists "Allow server inserts" on storage.objects;
drop policy if exists "Allow server updates" on storage.objects;

revoke execute on function public.delete_identity_data(text) from public, anon, authenticated;
grant execute on function public.delete_identity_data(text) to service_role;
