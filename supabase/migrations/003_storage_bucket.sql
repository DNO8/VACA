-- Migration 003: bucket de almacenamiento para adjuntos de incidentes.
-- El acceso es privado; el servidor genera signed URLs para subida y descarga.

insert into storage.buckets (id, name, public)
values ('incident-attachments', 'incident-attachments', false)
on conflict (id) do nothing;
