-- Migration 008: devuelve privilegios de tablas a service_role.
--
-- Las edge functions consultan/actualizan tablas directamente via PostgREST
-- con el rol service_role (p.ej. attachment-authorize lee origin_bundles y
-- attachments). Migration 004 revoco todos los privilegios y nunca se
-- reotorgaron: las llamadas RPC con security definer seguian funcionando
-- (corren como owner), pero las queries directas fallaban con 42501
-- "permission denied", tragadas como resultados vacios (404/401).
--
-- service_role es el rol backend de confianza; RLS sigue aplicando para
-- anon/authenticated.

grant select, insert, update, delete
on all tables in schema public
to service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to service_role;
