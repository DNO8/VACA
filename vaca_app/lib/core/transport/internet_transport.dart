import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

import 'transport.dart';

/// Transporte por internet. Única implementación de [Transport] en el MVP.
///
/// En el MVP el envío real de datos lo hace el motor de sincronización contra
/// Supabase (`POST /reports`, ver flujo-app §F4); esta clase expone la
/// disponibilidad de red a la capa de transporte y sirve de punto de enganche
/// para el ruteo inteligente. El envío efectivo se completará en el Deliverable 3.
class InternetTransport implements Transport {
  InternetTransport({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  final _incoming = StreamController<TransportPacket>.broadcast();
  final _deliveries = StreamController<DeliveryResult>.broadcast();
  final _status = StreamController<TransportStatus>.broadcast();
  StreamSubscription<List<ConnectivityResult>>? _connSub;

  @override
  String get name => 'internet';

  @override
  Future<void> start() async {
    _connSub = _connectivity.onConnectivityChanged.listen(_emitStatus);
    _emitStatus(await _connectivity.checkConnectivity());
  }

  @override
  Future<void> stop() async {
    await _connSub?.cancel();
    _connSub = null;
  }

  void _emitStatus(List<ConnectivityResult> results) {
    final online = results.any((r) => r != ConnectivityResult.none);
    _status.add(
      TransportStatus(
        availability: online
            ? TransportAvailability.available
            : TransportAvailability.unavailable,
        detail: online ? 'Conectado' : 'Sin conexión',
      ),
    );
  }

  @override
  Future<DeliveryResult> send(TransportPacket packet) async {
    // TODO(D3): drenar el SyncQueueItem contra Supabase (POST /reports).
    // Placeholder del MVP: deja el paquete encolado para el motor de sync.
    return DeliveryResult(packet.id, DeliveryState.queued);
  }

  @override
  Stream<TransportPacket> get incoming => _incoming.stream;

  @override
  Stream<DeliveryResult> get deliveries => _deliveries.stream;

  @override
  Stream<TransportStatus> get status => _status.stream;
}
