import 'dart:typed_data';

/// Capa de transporte abstracta de VACA.
///
/// El resto de la app NUNCA habla de "BLE mesh" ni de "HTTP": sólo consume
/// esta interfaz. Detrás se enchufan transportes intercambiables (Internet,
/// BLE Mesh, WiFi Direct, LoRa, satélite) sin tocar el modelo de datos ni la UI.
///
/// Fuente de verdad: `Especificaciones/mesh-comunicaciones.md` §3 y §7 (Opción D).
/// En el MVP existe una única implementación: `InternetTransport`.

/// Disponibilidad de un transporte.
enum TransportAvailability { available, unavailable, degraded }

/// Salud de la red de un transporte (para UI de estado).
class TransportStatus {
  const TransportStatus({
    required this.availability,
    this.peerCount = 0,
    this.detail,
  });

  final TransportAvailability availability;
  final int peerCount;
  final String? detail;

  bool get isAvailable => availability == TransportAvailability.available;
}

/// Paquete que viaja por un transporte. El `id` es la clave de idempotencia
/// (UUID del registro/operación) y habilita el dedupe seguro en gossip.
class TransportPacket {
  const TransportPacket({
    required this.id,
    required this.payload,
    required this.payloadHash,
    this.recipientId,
  });

  final String id;
  final Uint8List payload;
  final Uint8List payloadHash;

  /// Destinatario para mensajes directos; null para broadcast/gossip.
  final String? recipientId;
}

/// Resultado de un intento de envío.
enum DeliveryState { queued, sent, delivered, failed }

class DeliveryResult {
  const DeliveryResult(
    this.packetId,
    this.state, {
    this.error,
    this.receipt,
  });

  final String packetId;
  final DeliveryState state;
  final Object? error;
  final DeliveryReceipt? receipt;
}

class DeliveryReceipt {
  const DeliveryReceipt({
    required this.receiptId,
    required this.messageId,
    required this.payloadHash,
    required this.serverReceivedAt,
    required this.serverKeyId,
    required this.signature,
  });

  final String receiptId;
  final String messageId;
  final Uint8List payloadHash;
  final DateTime serverReceivedAt;
  final String serverKeyId;
  final Uint8List signature;
}

/// Contrato base de un transporte.
abstract interface class Transport {
  /// Nombre estable del transporte (p. ej. 'internet', 'ble-mesh').
  String get name;

  Future<void> start();
  Future<void> stop();

  /// Envía un paquete. Devuelve el resultado inicial (puede quedar `queued`).
  Future<DeliveryResult> send(TransportPacket packet);

  /// Paquetes entrantes.
  Stream<TransportPacket> get incoming;

  /// Confirmaciones de entrega (ej. ACK de gateway en gossip).
  Stream<DeliveryResult> get deliveries;

  /// Estado/salud del transporte para la UI.
  Stream<TransportStatus> get status;
}

/// Contrato específico del transporte mesh (fase posterior — no implementado
/// en el MVP). Añade el descubrimiento de peers sobre el contrato base.
/// El Mesh Engine (Kotlin/Swift) implementa Discovery, Routing, TTL, Gossip,
/// ACK y Relay; Dart sólo consume estos eventos de alto nivel.
abstract interface class MeshTransport implements Transport {
  /// Peer descubierto.
  Stream<MeshPeer> get onPeerFound;

  /// Peer perdido.
  Stream<MeshPeer> get onPeerLost;
}

/// Peer del mesh (identidad efímera, sin PII).
class MeshPeer {
  const MeshPeer({required this.peerId, this.displayName});
  final String peerId;
  final String? displayName;
}
