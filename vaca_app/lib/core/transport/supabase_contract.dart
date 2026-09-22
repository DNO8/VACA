import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../bundle/bundle_signer.dart';
import '../security/device_request_signer.dart';
import 'server_contract.dart';
import 'transport.dart';

/// Implementación del contrato de servidor usando Supabase Edge Functions.
///
/// Lee la configuración desde variables de entorno (dart-define) y falla
/// cerrado si no está completa:
/// - `SUPABASE_URL`
/// - `SUPABASE_ANON_KEY`
/// - `SERVER_RECEIPT_PUBLIC_KEY` (base64, Ed25519)
///
/// No almacena credenciales en el binario: si las variables no están
/// definidas, la entrega falla con un error de configuración.
class SupabaseServerContract implements ServerContract {
  SupabaseServerContract(
    this._signer, {
    String? supabaseUrl,
    String? supabaseAnonKey,
    String? serverReceiptPublicKeyBase64,
    DeviceRequestSigner? requestSigner,
    Dio? httpClient,
  })  : _supabaseUrl = supabaseUrl,
        _supabaseAnonKey = supabaseAnonKey,
        _serverReceiptPublicKey = _decodeKey(serverReceiptPublicKeyBase64),
        _requestSigner = requestSigner,
        _http = httpClient ?? Dio();

  final BundleSigner _signer;
  final String? _supabaseUrl;
  final String? _supabaseAnonKey;
  final Uint8List? _serverReceiptPublicKey;
  final DeviceRequestSigner? _requestSigner;
  final Dio _http;

  @override
  Future<DeliveryResult> sendBundle(
    String messageId,
    Uint8List payload,
    Uint8List payloadHash,
    Uint8List originPublicKey,
  ) async {
    final supabaseUrl = _supabaseUrl;
    final supabaseAnonKey = _supabaseAnonKey;
    if (supabaseUrl == null ||
        supabaseUrl.isEmpty ||
        supabaseAnonKey == null ||
        supabaseAnonKey.isEmpty) {
      return DeliveryResult(
        messageId,
        DeliveryState.queued,
        failure: _retryable('server_not_configured'),
      );
    }

    final endpoint = '$supabaseUrl/functions/v1/bundle-ingest';
    try {
      final response = await _http.post<dynamic>(
        endpoint,
        data: payload,
        options: Options(
          headers: {
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/octet-stream',
            'X-Origin-Public-Key': base64Encode(originPublicKey),
            'X-Message-Id': messageId,
          },
          responseType: ResponseType.json,
        ),
      );

      final status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) {
        final data = response.data as Map<String, dynamic>?;
        if (data == null) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('receipt_missing'),
          );
        }

        final receiptId = data['receipt_id'] as String?;
        final receiptMessageId = data['message_id'] as String?;
        final receiptHashBase64 = data['payload_hash'] as String?;
        final receiptHash = _decodeBytes(receiptHashBase64);
        final receivedAtValue = data['server_received_at'] as String?;
        final receivedAt = DateTime.tryParse(receivedAtValue ?? '');
        final serverKeyId = data['server_key_id'] as String?;
        var receiptSignature = _decodeBytes(data['signature'] as String?);
        // Recibos emitidos con noble "recovered" llevan un byte extra al final;
        // la firma Ed25519 canonica son los primeros 64 bytes.
        if (receiptSignature != null && receiptSignature.length > 64) {
          receiptSignature = Uint8List.fromList(receiptSignature.sublist(0, 64));
        }
        if (receiptId == null ||
            receiptMessageId == null ||
            receiptHashBase64 == null ||
            receiptHash == null ||
            receivedAt == null ||
            serverKeyId == null ||
            receiptSignature == null) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('receipt_incomplete'),
          );
        }
        if (receiptMessageId != messageId ||
            !_constantTimeEquals(receiptHash, payloadHash)) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('receipt_binding_invalid'),
          );
        }

        final serverPublicKey = _serverReceiptPublicKey;
        if (serverPublicKey == null) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('server_public_key_missing'),
          );
        }
        final canonicalReceipt = [
          receiptId,
          receiptMessageId,
          receiptHashBase64,
          _canonicalInstant(receivedAt),
          serverKeyId,
        ].join('\n');
        final verify = await _signer.verify(
          Uint8List.fromList(utf8.encode(canonicalReceipt)),
          receiptSignature,
          serverPublicKey,
        );
        debugPrint(
          'bundle-ingest receipt verify=${verify.valueOrNull} '
          'sigLen=${receiptSignature.length} '
          'canonical=${canonicalReceipt.replaceAll('\n', '|')}',
        );
        if (verify.isFailure) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('receipt_verify_error'),
          );
        }
        if (!verify.valueOrNull!) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            failure: _permanent('receipt_signature_invalid'),
          );
        }

        return DeliveryResult(
          messageId,
          DeliveryState.delivered,
          receipt: DeliveryReceipt(
            receiptId: receiptId,
            messageId: receiptMessageId,
            payloadHash: receiptHash,
            serverReceivedAt: receivedAt,
            serverKeyId: serverKeyId,
            signature: receiptSignature,
          ),
        );
      }

      if (status == 401 || status == 403 || status == 409) {
        return DeliveryResult(
          messageId,
          DeliveryState.failed,
          failure: _permanent('server_$status'),
        );
      }

      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        failure: _retryable('server_$status'),
      );
    } on DioException catch (e) {
      debugPrint(
        'bundle-ingest DioException type=${e.type} '
        'status=${e.response?.statusCode} body=${e.response?.data} '
        'error=${e.error}',
      );
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        return DeliveryResult(
          messageId,
          DeliveryState.queued,
          failure: _retryable('network_unavailable'),
        );
      }
      final statusCode = e.response?.statusCode;
      if (e.type == DioExceptionType.badResponse &&
          statusCode != null &&
          statusCode >= 400 &&
          statusCode < 500 &&
          statusCode != 429) {
        return DeliveryResult(
          messageId,
          DeliveryState.failed,
          failure: _permanent('server_$statusCode'),
        );
      }
      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        failure: _retryable('network_error'),
      );
    } catch (e) {
      debugPrint('bundle-ingest exception: $e');
      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        failure: _retryable('send_exception'),
      );
    }
  }

  @override
  Future<String?> requestAttachmentUrl(
    String bundleId,
    String contentHash,
  ) async {
    final supabaseUrl = _supabaseUrl;
    final supabaseAnonKey = _supabaseAnonKey;
    if (supabaseUrl == null ||
        supabaseUrl.isEmpty ||
        supabaseAnonKey == null ||
        supabaseAnonKey.isEmpty) {
      return null;
    }

    final signer = _requestSigner;
    if (signer == null) return null;
    final signed = await signer.sign(
      'attachment-authorize',
      [bundleId, contentHash],
    );
    if (signed.isFailure) return null;
    final endpoint = '$supabaseUrl/functions/v1/attachment-authorize';
    try {
      final response = await _http.post<dynamic>(
        endpoint,
        data: {
          'bundle_id': bundleId,
          'content_hash': contentHash,
        },
        options: Options(
          headers: {
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
            ...signed.valueOrNull!,
          },
        ),
      );

      final data = response.data as Map<String, dynamic>?;
      debugPrint(
        'attachment-authorize status=${response.statusCode} data=$data',
      );
      return data?['upload_url'] as String?;
    } on DioException catch (e) {
      debugPrint(
        'attachment-authorize DioException type=${e.type} '
        'status=${e.response?.statusCode} body=${e.response?.data} '
        'error=${e.error}',
      );
      return null;
    } catch (e) {
      debugPrint('attachment-authorize exception: $e');
      return null;
    }
  }

  @override
  Future<bool> uploadAttachment(String uploadUrl, String localPath) async {
    try {
      final file = File(localPath);
      final length = await file.length();
      if (length <= 0 || length > 10 * 1024 * 1024) return false;
      final response = await _http.put<void>(
        uploadUrl,
        data: await file.readAsBytes(),
        options: Options(
          headers: {
            Headers.contentLengthHeader: length,
            Headers.contentTypeHeader: 'application/octet-stream',
          },
        ),
      );
      final status = response.statusCode ?? 0;
      debugPrint('attachment-upload status=$status url=$uploadUrl');
      return status >= 200 && status < 300;
    } on DioException catch (e) {
      debugPrint(
        'attachment-upload DioException type=${e.type} '
        'status=${e.response?.statusCode} body=${e.response?.data} '
        'error=${e.error}',
      );
      return false;
    } catch (e) {
      debugPrint('attachment-upload exception: $e');
      return false;
    }
  }

  /// Normaliza un instante al formato ISO-8601 UTC con milisegundos que usa
  /// el servidor al firmar (`new Date().toISOString()`, p.ej. `…Z`).
  static String _canonicalInstant(DateTime value) =>
      value.toUtc().copyWith(microsecond: 0).toIso8601String();

  static DeliveryFailure _retryable(String code) =>
      DeliveryFailure(code, retryable: true);

  static DeliveryFailure _permanent(String code) =>
      DeliveryFailure(code, retryable: false);

  static Uint8List? _decodeKey(String? base64Key) {
    if (base64Key == null || base64Key.isEmpty) return null;
    try {
      return base64Decode(base64Key);
    } catch (_) {
      return null;
    }
  }

  static bool _constantTimeEquals(Uint8List left, Uint8List right) {
    if (left.length != right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index++) {
      difference |= left[index] ^ right[index];
    }
    return difference == 0;
  }

  static Uint8List? _decodeBytes(String? base64Value) {
    if (base64Value == null || base64Value.isEmpty) return null;
    try {
      return base64Decode(base64Value);
    } catch (_) {
      return null;
    }
  }
}
