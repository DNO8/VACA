# Registro de arquitectura retirada — Blockchain

## Estado

La arquitectura blockchain descrita históricamente para VACA está retirada. La aplicación, el backend autorizado, el DTN municipal y VACA Insights no dependen de Stellar, Soroban, activos digitales, wallets, NFTs, DeFi ni contratos inteligentes.

## Arquitectura vigente

La trazabilidad de entrega se resuelve mediante:

- Eventos append-only firmados por el origen.
- Bundles canónicos cifrados.
- Idempotencia transaccional en el servidor.
- Recibos firmados ligados a `messageId` y `payloadHash`.
- Auditoría institucional con controles de acceso.

Estas propiedades son suficientes para demostrar qué recibió el servidor sin publicar datos sensibles en una red pública.

## Compatibilidad futura

Si un tercero propone una integración blockchain, debe implementarse detrás de un adapter institucional independiente. No puede:

- Cambiar el modelo de identidad de la app.
- Recibir coordenadas, notas o fotografías sin una finalidad aprobada.
- Determinar elegibilidad o prioridad.
- Bloquear la captura o entrega de incidentes.
- Introducir claves financieras en relays o clientes públicos.
- Presentarse como parte vigente sin una nueva decisión normativa.

Este documento no autoriza implementación.
