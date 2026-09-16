import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../result/result.dart';
import '../security/identity_key_source.dart';
import 'server_contract.dart';
import 'transport.dart';

/// Transporte por internet. Única implementación de [Transport] en el MVP.
///
/// Comprueba la conectividad y delega el envío real de bundles en
/// [ServerContract]. Si no hay red, deja el paquete encolado. Si hay red
/// pero el contrato no está configurado o rechaza el paquete, falla cerrado.
class InternetTransport implements Transport {
  InternetTransport({
    required ServerContract contract,
    required IdentityKeySource keySource,
    Connectivity? connectivity,
  })  : _contract = contract,
        _keySource = keySource,
        _connectivity = connectivity ?? Connectivity();

  final ServerContract _contract;
  final IdentityKeySource _keySource;
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
    final results = await _connectivity.checkConnectivity();
    final online = results.any((r) => r != ConnectivityResult.none);
    if (!online) {
      return DeliveryResult(packet.id, DeliveryState.queued);
    }

    final originPublicKey = await _originPublicKey();
    if (originPublicKey == null || originPublicKey.isEmpty) {
      return DeliveryResult(
        packet.id,
        DeliveryState.failed,
        failure: const DeliveryFailure(
          'origin_public_key_missing',
          retryable: false,
        ),
      );
    }

    return _contract.sendBundle(
      packet.id,
      packet.payload,
      packet.payloadHash,
      originPublicKey,
    );
  }

  Future<Uint8List?> _originPublicKey() async {
    final pair = await _keySource.getOrCreateKeyPair();
    if (pair.isFailure) return null;
    final publicKeyBase64 = (pair as Success<DeviceKeyPair>).value.publicKey;
    try {
      return base64Decode(publicKeyBase64);
    } catch (_) {
      return null;
    }
  }

  @override
  Stream<TransportPacket> get incoming => _incoming.stream;

  @override
  Stream<DeliveryResult> get deliveries => _deliveries.stream;

  @override
  Stream<TransportStatus> get status => _status.stream;
}
