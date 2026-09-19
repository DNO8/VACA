-- Wallets con rol admin para la curaduria Vaquita (web donantes).
-- La membresia se verifica server-side en vaquita-admin: la clave publica
-- debe existir aqui Y firmar un challenge valido.
create table if not exists public.admin_wallets (
    public_key text primary key,          -- strkey G... de Stellar
    label text not null default '',
    role text not null default 'curator', -- curator|owner
    created_at timestamptz not null default now()
);

alter table public.admin_wallets enable row level security;

-- Sin policies: ninguna lectura publica. Solo service_role (edge functions).
comment on table public.admin_wallets is
    'Claves publicas Stellar con permiso de curaduria Vaquita';
