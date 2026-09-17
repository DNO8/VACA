-- Migration 007: permite a service_role insertar/limpiar request_nonces.
--
-- authenticateDeviceRequest inserta el nonce via PostgREST con el rol
-- service_role; la tabla existia pero sin privilegios, por lo que cada
-- request autenticado respondia 401 unauthorized (42501 permission denied).

grant select, insert, delete on table public.request_nonces to service_role;
