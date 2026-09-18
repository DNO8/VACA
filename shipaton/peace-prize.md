# Descripción de beneficio social — Peace Prize (Shipaton)

## Español

VACA es infraestructura civil de resiliencia para emergencias. Cuando las
redes fallan —terremoto, inundación, corte prolongado— la gente queda
incomunicada justo cuando más necesita coordinar ayuda. VACA permite emitir
una señal de incidente sin conexión: el paquete queda cifrado y persistido
en el dispositivo, se reintenta de forma durable y viaja cuando aparece
cualquier canal disponible (hoy HTTPS; la arquitectura ya contempla relay
BLE/mesh como piloto municipal).

Diferenciador frente a una app de formularios: cada entrega produce un
**recibo firmado criptográficamente** que el propio teléfono verifica. La
persona no tiene que creer que su señal llegó: puede comprobarlo. El mismo
principio habilita rendición auditable para donantes, aseguradoras y
respondedores institucionales, sin vender datos de incidentes crudos.

Beneficio social concreto:

- La señal funciona **sin conectividad** y sin cuenta verificada para
  prioridades de vida (P0/P1).
- Recepción verificable end-to-end: la prueba la emite el servidor y la
  valida el dispositivo.
- Diseñado para operar en canales de último recurso (BLE, WiFi, SMS)
  donde un mensaje pequeño puede salvar vidas.
- KYC opcional con proveedor auditable (Didit), nunca como barrera de
  emergencia.

## English (para el formulario de Shipaton)

VACA is civic resilience infrastructure for emergencies. When networks
fail —earthquake, flood, prolonged outage— people lose communication
exactly when coordination matters most. VACA lets anyone emit an incident
signal while fully offline: the encrypted bundle is persisted on-device,
retries durably, and travels whenever any channel appears (HTTPS today;
a BLE/mesh relay pilot is already in the architecture).

Unlike a forms app, every delivery produces a **cryptographically signed
receipt that the phone itself verifies**. The user does not have to trust
that the signal arrived: they can prove it. The same primitive enables
auditable reporting for donors, insurers and institutional responders
without selling raw incident data.

Concrete social benefit:

- Signals work **without connectivity**, and unverified users can emit
  life-critical (P0/P1) signals.
- Verifiable end-to-end reception: the server issues the proof and the
  device validates it.
- Built to operate over last-resort channels (BLE, WiFi, SMS) where a
  small message can save lives.
- Optional KYC via an auditable provider (Didit), never an emergency
  barrier.
