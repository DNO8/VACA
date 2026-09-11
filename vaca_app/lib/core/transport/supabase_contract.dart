import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../bundle/bundle_signer.dart';
import '../security/device_request_signer.dart';
import 'server_contract.dart';
import 'transport.dart';

/// Implementacion del contrato de servidor usando Supabase Edge Functions.
///
/// Lee la configuracion desde variables de entorno (dart-define) y falla
/// cerrado si no esta completa:
/// - `SUPABASE_URL`
/// - `SUPABASE_ANON_KEY`
/// - `SERVER_RECEIPT_PUBLIC_KEY` (base64, Ed25519)
///
/// No almacena credenciales en el binario: si las variables no estan
/// definidas, la entrega falla con un error de configuracion.
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
        DeliveryState.failed,
        error: 'server_not_configured',
      );
    }

    final endpoint = '$supabaseUrl/functions/v1/bundle-ingest';
    try {
      final response = await _http.post<dynamic>(
        endpoint,
        data: payload,
        options: Options(
          headers: {
            'Authorization': 'Bearer $supabaseAnonKey',
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
            error: 'receipt_missing',
          );
        }

        final receiptId = data['receipt_id'] as String?;
        final receiptMessageId = data['message_id'] as String?;
        final receiptHashBase64 = data['payload_hash'] as String?;
        final receiptHash = _decodeBytes(receiptHashBase64);
        final receivedAtValue = data['server_received_at'] as String?;
        final receivedAt = DateTime.tryParse(receivedAtValue ?? '');
        final serverKeyId = data['server_key_id'] as String?;
        final receiptSignature = _decodeBytes(data['signature'] as String?);
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
            error: 'receipt_incomplete',
          );
        }
        if (receiptMessageId != messageId ||
            !_constantTimeEquals(receiptHash, payloadHash)) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            error: 'receipt_binding_invalid',
          );
        }

        final serverPublicKey = _serverReceiptPublicKey;
        if (serverPublicKey == null) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            error: 'server_public_key_missing',
          );
        }
        final canonicalReceipt = [
          receiptId,
          receiptMessageId,
          receiptHashBase64,
          receivedAtValue,
          serverKeyId,
        ].join('\n');
        final verify = await _signer.verify(
          Uint8List.fromList(utf8.encode(canonicalReceipt)),
          receiptSignature,
          serverPublicKey,
        );
        if (verify.isFailure) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            error: 'receipt_verify_error',
          );
        }
        if (!verify.valueOrNull!) {
          return DeliveryResult(
            messageId,
            DeliveryState.failed,
            error: 'receipt_signature_invalid',
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
          error: 'server_${status}_non_retryable',
        );
      }

      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        error: 'server_$status',
      );
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        return DeliveryResult(
          messageId,
          DeliveryState.queued,
          error: 'network_unavailable',
        );
      }
      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        error: 'network_error: ${e.message}',
      );
    } catch (e) {
      return DeliveryResult(
        messageId,
        DeliveryState.failed,
        error: 'send_exception: $e',
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
            'Authorization': 'Bearer $supabaseAnonKey',
            'Content-Type': 'application/json',
            ...signed.valueOrNull!,
          },
        ),
      );

      final data = response.data as Map<String, dynamic>?;
      return data?['upload_url'] as String?;
    } catch (_) {
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
      return status >= 200 && status < 300;
    } catch (_) {
      return false;
    }
  }

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
