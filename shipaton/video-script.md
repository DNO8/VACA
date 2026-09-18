# Guion de video Shipaton — máximo 2 minutos

Versión extendida del guion D3 (60–90 s). Misma evidencia, mismo orden;
el cierre agrega el porqué social.

## Escena 1 — Offline real (0:00–0:15)

- Modo avión visible en el teléfono.
- Abrir VACA: banner offline.
- “Cuando la red cae, la coordinación también. VACA nace para ese momento.”

## Escena 2 — Captura sin conexión (0:15–0:35)

- “Nueva señal de incidente”: categoría SOS.
- Paso ubicación: spinner “Sincronizando GPS” → GPS activo (o manual).
- Detalles mínimos: personas, nota corta. Foto opcional.
- Guardar: “Guardada localmente” — señal persistida, no enviada.

## Escena 3 — Persistencia durable (0:35–0:50)

- Cerrar la app por completo y reabrirla.
- La señal sigue en outbox (badge “1” en Entrega).
- “Sobrevive al reinicio: el dato es del usuario hasta que llega.”

## Escena 4 — Reconexión y entrega (0:50–1:15)

- Quitar modo avión.
- Al volver la red, los bundles se reintentan solos: “Sincronizando” →
  “Recibida por el servidor”.
- Abrir el recibo: `messageId`, `payloadHash`, fecha, key ID, firma.
- “El teléfono verifica la firma. Recepción comprobable, no prometida.”

## Escena 5 — Anti-duplicados y adjuntos (1:15–1:35)

- Reintentar envío del mismo incidente: sin duplicar en backend
  (idempotencia por `messageId` + dedup por contenido en cliente).
- Adjunto de foto sube de forma independiente tras el recibo.

## Cierre — el porqué (1:35–2:00)

- Supabase: un solo `message_id`, una sola aceptación.
- Texto final en pantalla:
  - “Recepción verificable ≠ atención institucional.”
  - “La próxima parada: la misma señal viajando por BLE/SMS entre
    dispositivos — resiliencia que no depende de la red.”
- Marca: VACA — infraestructura civil de resiliencia.

## Notas de grabación

- No exponer claves, payloads ni datos personales reales.
- En el recibo, `messageId`/`payloadHash`/`keyId` son seguros de mostrar.
- Grabar en modo avión real, no simulado: la evidencia es más fuerte.
