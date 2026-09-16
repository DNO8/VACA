import 'dart:async';
import 'dart:math';
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
    Random? random,
  })  : _queue = queue,
        _transport = transport,
        _serverContract = serverContract,
        _random = random ?? Random.secure();

  final BundleQueueService _queue;
  final Transport _transport;
  final ServerContract _serverContract;
  final Random _random;
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
      await _queue.expirePendingBundles();
      final pending = await _queue.pendingBundles(limit: batchSize);
      if (pending.isEmpty) {
        await _uploadPendingAttachments();
        await _scheduleRetryIfNeeded();
        return;
      }

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

        await _queue.markSent(row.id);
        final result = await _transport.send(packet);
        await _handleDeliveryResult(row.id, result);
      }

      await _uploadPendingAttachments();
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
      await _recordFailure(
        bundleId,
        result.failure ??
            const DeliveryFailure('transport_queued', retryable: true),
      );
      return;
    }
    if (state == DeliveryState.sent) return;
    if (state == DeliveryState.delivered && result.receipt != null) {
      await _queue.markDelivered(bundleId, result.receipt!);
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
      await _recordFailure(
        bundleId,
        result.failure ??
            const DeliveryFailure('unknown_failure', retryable: true),
      );
      return;
    }
  }

  Future<void> _recordFailure(
    String bundleId,
    DeliveryFailure failure,
  ) async {
    final attempts = await _queue.countDeliveryAttempts(bundleId);
    final nextAttemptAt = failure.retryable
        ? DateTime.now().add(Duration(seconds: _backoffDelay(attempts)))
        : null;
    await _queue.markFailed(
      bundleId,
      failure.retryable
          ? local.DeliveryOutcome.retryable
          : local.DeliveryOutcome.nonRetryable,
      errorCode: failure.code,
      nextAttemptAt: nextAttemptAt,
    );
  }

  Future<void> _uploadPendingAttachments() async {
    final pending = await _queue.pendingAttachmentUploads();
    for (final item in pending) {
      final attachment = item.attachment;
      await _queue.updateAttachmentStatus(
        attachment.id,
        local.AttachmentSyncStatus.uploading,
      );
      final uploadUrl = await _serverContract.requestAttachmentUrl(
        item.bundleId,
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
    final nextRetryAt = await _queue.nextRetryAt();
    final hasAttachments =
        (await _queue.pendingAttachmentUploads(limit: 1)).isNotEmpty;
    if (nextRetryAt == null && !hasAttachments) return;
    final bundleDelay = nextRetryAt?.difference(DateTime.now());
    final attachmentDelay = Duration(seconds: baseRetrySeconds);
    final delay =
        bundleDelay == null || (hasAttachments && attachmentDelay < bundleDelay)
            ? attachmentDelay
            : bundleDelay;
    _retryTimer = Timer(
      delay.isNegative ? Duration.zero : delay,
      processQueue,
    );
  }

  int _backoffDelay(int attempts) {
    final exponential = baseRetrySeconds * (1 << attempts.clamp(0, 8));
    final capped = min(exponential, maxRetrySeconds);
    return min(capped + _random.nextInt(max(1, capped ~/ 4)), maxRetrySeconds);
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
