# Protocolo de coordinación — VACA

## Alcance

Este protocolo describe cómo una señal pasa de observación local a información disponible para un receptor autorizado. No sustituye protocolos oficiales, no activa automáticamente recursos y no determina beneficios.

## 1. Preparación

1. La persona conoce propósito, límites y canales oficiales.
2. Registra consentimiento.
3. El dispositivo crea material de autenticación protegido.
4. Puede completar KYC o permanecer no verificada.
5. La app verifica espacio, permisos y configuración sin bloquear el acceso crítico.

## 2. Captura

1. Seleccionar categoría.
2. Derivar prioridad P0–P4.
3. Obtener ubicación o registrar fallback manual/no disponible.
4. Ingresar datos mínimos.
5. Persistir incidente, evento y bundle en una transacción.
6. Mostrar `savedLocally`.
7. Procesar fotografía como adjunto independiente.

## 3. Propagación

La app ofrece bundles al coordinador DTN:

- HTTPS cuando el servidor es alcanzable.
- Relay BLE en builds municipales autorizados.
- Cola local mientras no exista enlace elegible.

Cada transferencia respeta expiración, hop limit, copy budget, prioridad, dedupe y límites de recursos.

## 4. Recepción

1. El servidor autentica al origen.
2. Valida versión, firma, credencial, tamaño, expiración y hash.
3. Aplica idempotencia y autorización.
4. Persiste transaccionalmente.
5. Firma un recibo ligado al bundle.
6. El origen verifica el recibo antes de mostrar `receivedByServer`.

## 5. Revisión institucional

La institución receptora puede revisar, enriquecer o reconocer la señal en un sistema separado. Este acuse no se infiere del recibo técnico y nunca se presenta como despacho garantizado.

## 6. Actualización, cancelación y cierre

Toda modificación crea un evento append-only. Las cancelaciones se sincronizan de forma idempotente. La expiración detiene propagación, pero la visibilidad y eliminación siguen la política de retención.

## 7. Reglas de seguridad

- KYC no bloquea P0/P1.
- Prioridad no equivale a verdad.
- Relay/gateway no descifra payload.
- No se registran coordenadas, notas, medios, tokens o claves en logs.
- Estado local, custodia, recibo y acuse institucional se comunican por separado.
- No existe activación automática de drones, ambulancias, policías, bomberos o ayuda financiera.

## Resultado

El protocolo garantiza trazabilidad técnica de la señal y de su entrega, no el resultado operativo de una emergencia.
