# Pitch Deck — VACA: infraestructura cívica de resiliencia

> El nombre histórico del archivo se conserva por compatibilidad. Stellar no forma parte de la arquitectura activa.

## Diapositiva 1 — Visión

**VACA: la información es el primer alivio.**

Infraestructura offline-first para que las señales críticas sobrevivan a la pérdida de conectividad y lleguen a receptores autorizados con privacidad y evidencia de entrega.

## Diapositiva 2 — El problema

- Durante una emergencia aparecen islas locales de información.
- Los sistemas conectados dejan de funcionar precisamente cuando más se necesitan.
- “Guardado”, “enviado” y “recibido” suelen confundirse.
- La consolidación manual produce retrasos, duplicados y pérdida de contexto.
- Ubicación y evidencia pueden exponer a personas vulnerables.

## Diapositiva 3 — La solución

- Aplicación pública Android/iOS.
- Captura de incidentes P0–P4 sin Internet.
- KYC opcional y no bloqueante.
- Persistencia previa a transmisión.
- Actualizaciones y cancelaciones append-only.
- Estados honestos y recibo verificable.

VACA no reemplaza servicios oficiales, no determina elegibilidad y no promete despacho.

## Diapositiva 4 — Cómo viaja una señal

1. El dispositivo crea y guarda el incidente.
2. Produce un bundle cifrado y firmado.
3. El outbox espera un enlace elegible.
4. Entrega por HTTPS o BLE municipal autorizado.
5. El servidor valida y deduplica.
6. El servidor firma un recibo ligado al payload.
7. La app confirma recepción sólo después de verificarlo.

## Diapositiva 5 — Resiliencia sin infraestructura

El despliegue municipal Android incorpora:

- BLE discovery y sesión autenticada.
- Store-carry-forward.
- Caché durable.
- Routing acotado por prioridad, expiración y copias.
- Gateway certificado.
- Relays incapaces de descifrar el incidente.

## Diapositiva 6 — Valor institucional

- Señales tempranas con procedencia y estado.
- Integración con sistemas municipales mediante adapters.
- Consola operativa con RBAC.
- Analítica agregada de cobertura y latencia.
- Retención, eliminación y auditoría.
- Sin apropiarse de la autoridad institucional.

## Diapositiva 7 — Sostenibilidad

- Aplicación gratuita para ciudadanía.
- Licencias y operación institucional B2G/B2B.
- Integraciones, soporte y capacitación.
- VACA Insights con privacidad.
- Grants para construir y validar infraestructura cívica.

Los datos personales no son el producto.

## Diapositiva 8 — Evidencia de madurez

- Modo avión → captura → reinicio → reconexión → recibo.
- Reintentos sin duplicados.
- Usuario no verificado capaz de guardar P0/P1.
- Android/iOS con flujo público común.
- Piloto origen → relay → gateway → servidor.
- Pruebas de confidencialidad, autorización y accesibilidad.

## Diapositiva 9 — Visión regional

VACA puede crecer mediante estándares abiertos, despliegues municipales e integraciones regulatorias por territorio. Su ventaja no es una tecnología de moda: es una arquitectura diseñada para mantener información crítica disponible, protegida y verificable en el peor escenario.
