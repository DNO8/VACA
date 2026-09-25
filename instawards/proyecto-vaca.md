# VACA — Overview del proyecto

## Qué es VACA

VACA es infraestructura civil de resiliencia para emergencias: una
aplicación Android (Flutter) que permite emitir una **señal de incidente
sin conexión a Internet**. El paquete queda cifrado y persistido en el
dispositivo, se reintenta de forma durable y viaja cuando aparece
cualquier canal disponible (HTTPS hoy; relay BLE municipal como
arquitectura de siguiente fase).

Diferenciador: cada entrega produce un **recibo firmado
criptográficamente** que el propio teléfono verifica. La persona no tiene
que creer que su señal llegó: puede comprobarlo.

## El problema

Cuando las redes fallan —terremoto, inundación, corte prolongado— la
gente queda incomunicada justo cuando más necesita coordinar ayuda. Las
soluciones existentes asumen conectividad (formularios web, apps con
sync optimista) o asumen confianza sin prueba (mensajería). VACA opera
en el escenario real: **offline primero, prueba de recepción siempre**.

## Vaquita: de la señal a la ayuda directa

Las señales verificadas pueden convertirse en destino de donaciones:

- **Lucero**: señal visible en el mapa web (coordenadas fuzzeadas), no
  apta para donaciones.
- **Vaquita Comunitaria**: elevada por votos de wallets (hoy: cooldown
  on-chain; objetivo: KYC o antigüedad mínima anti-Sybil).
- **Vaquita verificada**: curada por VACA.

El donante paga en XLM a un pool; al promoverse/liberarse, el sistema
crea un **Claimable Balance nativo de Stellar** hacia la wallet pública
del reportante (embebida cifrada en el bundle del incidente). El
beneficiario lo reclama desde la app cuando se conecta — **no requiere
estar en línea al momento de la donación**, coherente con el modelo
offline-first.

## Por qué Stellar

- Claimable Balances nativos: donación pendiente de claim sin custodia
  intermedia.
- Costo/tiempo adecuados para micro-donaciones de emergencia.
- Memos on-chain (`vq:<incidentId>`) trazables públicamente — cada
  donación y claim es verificable en Stellar Expert.
- Wallet autocustodiada creada automáticamente en onboarding
  (stellar_flutter_sdk), invisible para el usuario que no la usa.
- Credenciales seudónimas: la wallet seudónima es la cuenta receptora;
  KYC nunca es barrera de emergencia.

## Estado actual (Septiembre 2026)

- App Android `cl.vaca.app` con flavors `dev` / `public` /
  `municipalPilot`; AAB firmado listo para Play Console.
- Flujo offline→entrega→recibo firmado verificado end-to-end real
  (4 bundles, idempotencia comprobada, adjuntos independientes).
- Vaquita funcionando en **Stellar Testnet** end-to-end: donación →
  pool → claimable balance → claim desde la app.
- Web demo pública (globo + cards + voto on-chain + panel admin +
  i18n ES/EN): `github.com/DNO8/VACA-web`.
- Backend Supabase: migraciones 001–013, Edge Functions
  `bundle-ingest`, `vaquita-feed`, `vaquita-admin`, `vaquita-vote`.

## Modelo de negocio (contexto)

Verificación criptográfica e infraestructura de auditoría para donantes,
aseguradoras, gobiernos y financiadores de respuesta a emergencias —
**no** venta de datos crudos de incidentes. El uso Stellar es cauteloso:
testnet hasta revisión legal del marco de donaciones (Ley de Donaciones
Chile / AML transfronterizo).
