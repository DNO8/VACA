import 'dart:async';
import 'dart:typed_data';

import '../../data/local/enums.dart' as local;
import '../transport/server_contract.dart';
import '../transport/transport.dart';
import 'bundle_queue_service.dart';

/// Coordina el envío de bundles desde el dispositivo origen.
///
/// - Escucha el estado de [Transport] y vacia la cola cuando hay red.
/// - Programa reintentos con backoff exponencial.
/// - Registra intentos de entrega y actualiza el estado de los bundles.
class BundleScheduler {
  BundleScheduler({
    required BundleQueueService queue,
    required Transport transport,
    required ServerContract serverContract,
    this.batchSize = 5,
    this.baseRetrySeconds = 30,
    this.maxRetrySeconds = 3600,
  })  : _queue = queue,
        _transport = transport,
        _serverContract = serverContract;

  final BundleQueueService _queue;
  final Transport _transport;
  final ServerContract _serverContract;
  final int batchSize;
  final int baseRetrySeconds;
  final int maxRetrySeconds;

  StreamSubscription<TransportStatus>? _statusSub;
  Timer? _retryTimer;
  bool _processing = false;

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
  /// Dispara un envío por cada bundle contra [Transport]. El estado final
  /// se actualiza según el [DeliveryResult] devuelto.
  Future<void> processQueue() async {
    if (_processing) return;
    _processing = true;
    _retryTimer?.cancel();
    try {
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

        final payloadHash = _decodeHex(row.payloadHash);
        if (payloadHash == null) {
          await _queue.markFailed(
            row.id,
            local.DeliveryOutcome.nonRetryable,
            errorCode: 'payload_hash_invalid',
          );
          continue;
        }
        final packet = TransportPacket(
          id: row.id,
          payload: bytes,
          payloadHash: payloadHash,
        );

        final result = await _transport.send(packet);
        await _handleDeliveryResult(row.id, result);
      }

      await _scheduleRetryIfNeeded();
    } finally {
      _processing = false;
    }
  }

  Future<void> _handleDeliveryResult(
    String bundleId,
    DeliveryResult result,
  ) async {
    final state = result.state;
    if (state == DeliveryState.queued) {
      // El transporte aún no pudo enviar; queda en cola.
      return;
    }
    if (state == DeliveryState.sent) {
      await _queue.markSent(bundleId);
      return;
    }
    if (state == DeliveryState.delivered && result.receipt != null) {
      final persisted = await _queue.markDelivered(bundleId, result.receipt!);
      if (persisted.isSuccess) await _uploadAttachments(bundleId);
      return;
    }
    if (state == DeliveryState.delivered) {
      await _queue.markFailed(
        bundleId,
        local.DeliveryOutcome.nonRetryable,
        errorCode: 'receipt_missing',
      );
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

  Future<void> _uploadAttachments(String bundleId) async {
    final attachments = await _queue.attachmentsForBundle(bundleId);
    for (final attachment in attachments) {
      if (attachment.syncStatus == local.AttachmentSyncStatus.synced) continue;
      await _queue.updateAttachmentStatus(
        attachment.id,
        local.AttachmentSyncStatus.uploading,
      );
      final uploadUrl = await _serverContract.requestAttachmentUrl(
        bundleId,
        attachment.sha256,
      );
      final uploaded = uploadUrl != null &&
          await _serverContract.uploadAttachment(
            uploadUrl,
            attachment.localPath,
          );
      await _queue.updateAttachmentStatus(
        attachment.id,
        uploaded
            ? local.AttachmentSyncStatus.synced
            : local.AttachmentSyncStatus.failed,
      );
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

  Uint8List? _decodeHex(String value) {
    if (value.length != 64) return null;
    try {
      return Uint8List.fromList([
        for (var index = 0; index < value.length; index += 2)
          int.parse(value.substring(index, index + 2), radix: 16),
      ]);
    } catch (_) {
      return null;
    }
  }
}
