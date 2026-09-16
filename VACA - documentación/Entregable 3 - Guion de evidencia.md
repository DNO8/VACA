# Evidencia del Entregable 3

Este guion produce evidencia verificable de estados de red, store-and-forward, recibo de servidor y factibilidad de biometría/Passkeys. No sustituye resultados: cada casilla se completa únicamente después de ejecutar el escenario.

## Prerrequisitos

- Proyecto Supabase enlazado y migraciones `001`–`005` aplicadas.
- Edge Functions desplegadas desde el commit evaluado.
- Secrets backend configurados fuera del repositorio.
- APK dev instalado en un Android físico.
- `SUPABASE_URL`, publishable key y trust roots públicas pasadas mediante `dart-define`.
- Un incidente de prueba sin datos personales reales.

## Despliegue backend

```powershell
supabase login
supabase link --project-ref tgqxxnldwiqisopiclmk
supabase db push
supabase functions deploy bundle-ingest --no-verify-jwt
supabase functions deploy attachment-authorize --no-verify-jwt
supabase functions deploy account-deletion --no-verify-jwt
supabase functions deploy kyc-session --no-verify-jwt
supabase functions deploy kyc-webhook --no-verify-jwt
```

No registrar secrets, notas, coordenadas, claves privadas ni bundles en capturas o terminales.

## Escenario físico obligatorio

| Paso | Acción | Evidencia esperada |
| --- | --- | --- |
| 1 | Activar modo avión | Banner `Sin conexión` |
| 2 | Crear una señal P0/P1 como invitado | Confirmación `Guardada localmente` |
| 3 | Abrir Entrega | Bundle `En cola`; no dice recibido |
| 4 | Cerrar la app desde recientes | Proceso detenido |
| 5 | Abrir nuevamente sin red | Bundle continúa en Drift |
| 6 | Desactivar modo avión | Estado conectado/sincronizando |
| 7 | Esperar respuesta backend | Estado `Recibida por el servidor` |
| 8 | Abrir el recibo | `messageId`, `payloadHash`, fecha, key ID y firma |
| 9 | Volver a reconectar/reintentar | No aparece un segundo incidente en Supabase |
| 10 | Si hay foto, interrumpir y recuperar red | Adjunto cambia a sincronizado o reintenta independientemente |

## Controles negativos

- Servidor inaccesible: permanece pendiente y programa retry; no consume `copyBudget` DTN.
- HTTP 401/403: cierra como fallo no reintentable y no muestra un botón muerto.
- Recibo con otro `messageId` o `payloadHash`: el cliente lo rechaza.
- Bundle expirado: no se transmite y el incidente queda expirado.
- Adjunto fallido con bundle recibido: se reintenta sin reenviar el incidente.
- GPS, foto, KYC o Internet ausentes: la captura urgente local continúa disponible.

## Capturas requeridas

1. `d3-01-offline.png` — banner offline y señal local.
2. `d3-02-queued.png` — outbox en cola.
3. `d3-03-syncing.png` — sincronización activa.
4. `d3-04-received.png` — recepción confirmada.
5. `d3-05-receipt.png` — recibo criptográfico sin payload sensible.
6. `d3-06-supabase.png` — mismo `message_id` en backend y una sola aceptación.

Las capturas para Shipaton se preparan adicionalmente a `1179×2556`, sin marco de dispositivo.

## Guion de video

Duración objetivo: 60–90 segundos.

1. Mostrar modo avión y banner offline.
2. Crear señal mínima como invitado.
3. Mostrar confirmación local y outbox.
4. Cerrar/reabrir para demostrar persistencia.
5. Recuperar conectividad.
6. Mostrar progreso, recepción y recibo.
7. Mostrar en Supabase un único `message_id`, sin revelar contenido sensible.
8. Cerrar con la diferencia entre recepción técnica y atención institucional.

## Paquete documental

- `Entregable 3 - Factibilidad biometría y Passkeys.pdf`.
- Capturas `d3-01` a `d3-06`.
- Video público o enlace acordado con el Chapter Lead.
- Pipeline actualizado con al menos 15 contactos y estado de seguimiento.
- Commit exacto, resultado de tests y limitaciones conocidas.

## Estado de aceptación

| Evidencia | Estado actual |
| --- | --- |
| UI offline/online/sync/error/success | Implementada; prueba física pendiente |
| Retry durable, expiración y adjuntos | Implementado con tests |
| Aceptación backend atómica | Implementada en migración `005`; despliegue pendiente |
| Supabase vivo actualizado | Bloqueado por CLI/autenticación del proyecto |
| Demo de reconexión | Pendiente de backend desplegado y teléfono conectado |
| Memo Passkeys/biometría | Completo en Markdown y PDF |
| Pipeline ≥15 contactos | Sin evidencia disponible en el repositorio |
