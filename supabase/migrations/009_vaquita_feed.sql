-- Escalera de donaciones de un incidente (vision Vaquita).
-- signal    = señal registrada, visible en el mapa publico (lucero).
-- community = Vaquita Comunitaria, elevada por voto comunitario (mock).
-- vaquita   = curada por VACA, apta para donaciones verificadas (orbe).
alter table public.incidents
    add column if not exists donation_status text not null default 'signal';

comment on column public.incidents.donation_status is
    'signal|community|vaquita — fase de donaciones del incidente';

create index if not exists incidents_donation_status_idx
    on public.incidents (donation_status);
