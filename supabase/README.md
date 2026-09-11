# Supabase backend de referencia — Slice C3

Este directorio contiene el **backend de referencia** autorizado para recibir bundles VACA a traves de Supabase.

> Aclaracion: este es un backend de demostracion y desarrollo. No contiene credenciales; todas las claves y tokens se inyectan por variables de entorno (`dart-define` en el cliente y `supabase secrets` en el servidor).

## Estructura

```
supabase/
├── config.toml              # Configuracion de la CLI de Supabase
├── .env.example             # Variables de entorno (copiar a .env)
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_delete_identity.sql
└── functions/
    ├── _shared/
    │   ├── encoding.ts      # Base64 sin dependencias
    │   └── bundle.ts        # CBOR, Ed25519, AES-GCM
    ├── bundle-ingest/       # Ingesta de bundles y recibo firmado
    ├── attachment-authorize/# URLs firmadas de subida de adjuntos
    ├── account-deletion/    # Borrado de cuenta
    └── kyc-webhook/         # Actualizacion de identidad por proveedor KYC
```

## Flujo de un bundle

1. El cliente `SupabaseServerContract` lee `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SERVER_RECEIPT_PUBLIC_KEY` desde `dart-define`.
2. `InternetTransport` verifica conectividad y delega el envio al `SupabaseServerContract`.
3. El contrato realiza un `POST` a `https://<supabase>/functions/v1/bundle-ingest`.
4. La Edge Function:
   - Verifica la firma Ed25519 del dispositivo.
   - Deriva una clave envolvente con X25519/HKDF y descifra el payload AES-256-GCM con `SERVER_BUNDLE_PRIVATE_KEY`.
   - Valida idempotencia con `message_id`.
   - Persiste incidente, evento, adjuntos y bundle origen.
   - Firma un recibo con `SERVER_RECEIPT_PRIVATE_KEY`.
5. El cliente verifica el recibo con `SERVER_RECEIPT_PUBLIC_KEY`.

## Despliegue

```bash
# Instalar la CLI de Supabase si no la tienes.
npm install -g supabase

# Loguearse.
supabase login

# Inicializar/iniciar el proyecto local.
supabase start

# Aplicar migraciones.
supabase db reset

# Configurar secretos del servidor (no incluir espacios en los valores base64).
supabase secrets set SUPABASE_ANON_KEY="..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
supabase secrets set SERVER_BUNDLE_PRIVATE_KEY="..."
supabase secrets set SERVER_RECEIPT_PRIVATE_KEY="..."
supabase secrets set SERVER_RECEIPT_KEY_ID="receipt-key-2026-01"
supabase secrets set DIDIT_API_KEY="..."
supabase secrets set DIDIT_WORKFLOW_ID="..."
supabase secrets set DIDIT_CALLBACK_URL="..."
supabase secrets set KYC_WEBHOOK_SECRET="..."

# Desplegar funciones.
supabase functions deploy
```

## Generacion de claves

El servidor conserva `SERVER_BUNDLE_PRIVATE_KEY` y el cliente recibe únicamente `SERVER_BUNDLE_PUBLIC_KEY` (X25519, 32 bytes base64). El par Ed25519 de recibos es independiente; el cliente recibe sólo `SERVER_RECEIPT_PUBLIC_KEY`.

Generar ambos pares desde el proyecto Flutter:

```bash
cd vaca_app
dart run tool/generate_server_keys.dart
```

## Notas tecnicas

- Las funciones usan `npm:` para importar librerias compatibles con Deno (`cbor-x`, `@noble/curves`, `@noble/ciphers`, `@supabase/supabase-js`).
- Las columnas binarias se almacenan como `text` en base64 para simplificar la serializacion en Deno.
- `origin_bundles` conserva el bundle canonico para auditoria.
- `idempotency_keys` evita procesar el mismo `message_id` dos veces.

## Limitaciones conocidas

- El `account-deletion` implementa un borrado en cascada via RPC (`delete_identity_data`).
- `attachment-authorize` requiere que el bundle ya haya sido ingerido para conocer el `incident_id`.
- Las politicas de Storage son restrictivas; los dispositivos suben a traves de URLs firmadas.
