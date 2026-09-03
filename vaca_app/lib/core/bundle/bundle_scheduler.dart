import 'dart:async';

import '../../data/local/enums.dart' as local;
import '../transport/transport.dart';
import 'bundle_queue_service.dart';

/// Coordina el envio de bundles desde el dispositivo origen.
///
/// - Escucha el estado de [Transport] y vacia la cola cuando hay red.
/// - Programa reintentos con backoff exponencial.
/// - Registra intentos de entrega y actualiza el estado de los bundles.
class BundleScheduler {
  BundleScheduler({
    required BundleQueueService queue,
    required Transport transport,
    this.batchSize = 5,
    this.baseRetrySeconds = 30,
    this.maxRetrySeconds = 3600,
  })  : _queue = queue,
        _transport = transport;

  final BundleQueueService _queue;
  final Transport _transport;
  final int batchSize;
  final int baseRetrySeconds;
  final int maxRetrySeconds;

  StreamSubscription<TransportStatus>? _statusSub;
  Timer? _retryTimer;

  /// Inicia el scheduler escuchando conectividad.
  Future<void> start() async {
    await _transport.start();
    _statusSub = _transport.status.listen(_onStatusChanged);
    // Primer intento al arrancar.
    await processQueue();
  }

  /// Detiene el scheduler.
  Future<void> stop() async {
    _retryTimer?.cancel();
    _retryTimer = null;
    await _statusSub?.cancel();
    _statusSub = null;
    await _transport.stop();
  }

  void _onStatusChanged(TransportStatus status) {
    if (status.availability == TransportAvailability.available) {
      processQueue();
    }
  }

  /// Procesa la cola de bundles pendientes.
  ///
  /// Dispara un envio por cada bundle contra [Transport]. El estado final
  /// se actualiza segun el [DeliveryResult] devuelto.
  Future<void> processQueue() async {
    _retryTimer?.cancel();

    final pending = await _queue.pendingBundles(limit: batchSize);
    if (pending.isEmpty) return;

    for (final row in pending) {
      final bytes = await _queue.bundleBytes(row.id);
      if (bytes == null || bytes.isEmpty) {
        await _queue.markFailed(
          row.id,
          local.DeliveryOutcome.nonRetryable,
          errorCode: 'bundle_bytes_missing',
        );
        continue;
      }

      final packet = TransportPacket(
        id: row.id,
        payload: bytes,
      );

      final result = await _transport.send(packet);
      await _handleDeliveryResult(row.id, result);
    }

    await _scheduleRetryIfNeeded();
  }

  Future<void> _handleDeliveryResult(String bundleId, DeliveryResult result) async {
    final state = result.state;
    if (state == DeliveryState.queued) {
      // El transporte aun no pudo enviar; queda en cola.
      return;
    }
    if (state == DeliveryState.sent) {
      await _queue.markSent(bundleId);
      return;
    }
    if (state == DeliveryState.delivered) {
      await _queue.markDelivered(bundleId);
      return;
    }
    if (state == DeliveryState.failed) {
      final outcome = _isRetryable(result.error)
          ? local.DeliveryOutcome.retryable
          : local.DeliveryOutcome.nonRetryable;
      await _queue.markFailed(
        bundleId,
        outcome,
        errorCode: _errorCode(result.error),
      );
      return;
    }
  }

  Future<void> _scheduleRetryIfNeeded() async {
    final stillPending = await _queue.pendingBundles(limit: 1);
    if (stillPending.isEmpty) return;

    final row = stillPending.first;
    final attempts = await _queue.countDeliveryAttempts(row.id);
    final delay = _backoffDelay(attempts);

    _retryTimer = Timer(Duration(seconds: delay), processQueue);
  }

  int _backoffDelay(int attempts) {
    final delay = baseRetrySeconds * (1 << attempts.clamp(0, 8));
    return delay > maxRetrySeconds ? maxRetrySeconds : delay;
  }

  bool _isRetryable(Object? error) {
    if (error == null) return true;
    final message = error.toString().toLowerCase();
    final nonRetryable = [
      'unauthorized',
      'forbidden',
      'invalid',
      'not found',
      'gone',
      'permanent',
    ];
    return !nonRetryable.any(message.contains);
  }

  String? _errorCode(Object? error) {
    if (error == null) return null;
    final text = error.toString();
    return text.length > 100 ? '${text.substring(0, 100)}...' : text;
  }
}
