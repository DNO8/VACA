# Solución — VACA

VACA es una infraestructura cívica offline-first para registrar y entregar señales de incidentes con estados honestos, privacidad y tolerancia a interrupciones.

## 1. Aplicación pública

La aplicación Android/iOS permite:

- Preparar identidad y consentimiento.
- Continuar como persona no verificada.
- Crear señales P0–P4 sin Internet.
- Registrar ubicación disponible, conteo acotado, nota breve y fotografía opcional.
- Conservar la señal antes de cualquier transmisión.
- Actualizar, cancelar y eliminar datos mediante flujos explícitos.
- Ver la diferencia entre guardado local, cola, relay, recibo del servidor y acuse institucional.

VACA no reproduce formularios oficiales, no determina elegibilidad, no reemplaza teléfonos de emergencia y no promete despacho de recursos.

## 2. Entrega resiliente

Cada evento produce un bundle canónico, cifrado y firmado. El outbox durable intenta entregar por los enlaces autorizados:

1. HTTPS en la aplicación pública.
2. BLE DTN en despliegues municipales Android autorizados.

Los reintentos son idempotentes. Relays y gateways conservan copias cifradas sin claves de descifrado. Sólo un recibo firmado del servidor confirma entrega.

## 3. Identidad proporcional

KYC es un adapter externo de aseguramiento de identidad. Sus secretos y respuestas completas permanecen en backend. La app recibe una credencial opaca, revocable y con vencimiento.

KYC no demuestra la verdad del incidente y nunca bloquea el guardado local de P0/P1.

## 4. Servidor autorizado

El backend:

- Autentica dispositivos y usuarios.
- Valida firmas, credenciales, límites y expiración.
- Deduplica por `messageId + payloadHash`.
- Persiste eventos y adjuntos privados.
- Firma recibos ligados al payload aceptado.
- Aplica autorización por rol, retención y eliminación.

## 5. Capa institucional

Herramientas institucionales pueden visualizar señales autorizadas, coordinar revisión y producir analítica agregada. El acuse institucional es posterior y distinto del recibo técnico.

## Diferenciador

VACA no depende de una tecnología financiera ni de un proveedor de identidad. Su valor central es que la información crítica pueda sobrevivir, avanzar y demostrar dónde se encuentra sin exponer su contenido a intermediarios.
