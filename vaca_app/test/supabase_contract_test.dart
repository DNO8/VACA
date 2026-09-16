import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/bundle/bundle_signer.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/transport/supabase_contract.dart';
import 'package:vaca_app/core/transport/transport.dart';

class _FakeBundleSigner implements BundleSigner {
  final bool _verifyResult;

  _FakeBundleSigner({bool verifyResult = true}) : _verifyResult = verifyResult;

  @override
  Future<Result<Uint8List>> sign(Uint8List message) async {
    return Success(Uint8List.fromList([1, 2, 3]));
  }

  @override
  Future<Result<bool>> verify(
    Uint8List message,
    Uint8List signature,
    Uint8List publicKey,
  ) async {
    return Success(_verifyResult);
  }
}

class _FakeDioAdapter implements HttpClientAdapter {
  _FakeDioAdapter({
    this.response,
    this.exception,
  });

  final ResponseBody? response;
  final DioException? exception;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (exception != null) throw exception!;
    final r = response!;
    return ResponseBody(
      r.stream,
      r.statusCode,
      headers: r.headers,
      statusMessage: r.statusMessage,
      isRedirect: r.isRedirect,
    );
  }

  @override
  void close({bool force = false}) {}
}

final _payloadHash = Uint8List.fromList(List.filled(32, 9));

String _receiptJson({String messageId = 'msg-1', Uint8List? payloadHash}) =>
    jsonEncode({
      'receipt_id': 'receipt-1',
      'message_id': messageId,
      'payload_hash': base64Encode(payloadHash ?? _payloadHash),
      'server_received_at': '2026-09-11T12:00:00.000Z',
      'server_key_id': 'receipt-key-1',
      'signature': base64Encode(Uint8List(64)),
    });

void main() {
  final serverReceiptPublicKey = base64Encode(Uint8List(32));

  group('SupabaseServerContract fail-closed', () {
    test('fails with server_not_configured when env is empty', () async {
      final signer = _FakeBundleSigner();
      final contract = SupabaseServerContract(signer);

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'server_not_configured');
    });

    test('requestAttachmentUrl returns null when not configured', () async {
      final signer = _FakeBundleSigner();
      final contract = SupabaseServerContract(signer);

      final url = await contract.requestAttachmentUrl('b1', 'hash');
      expect(url, isNull);
    });
  });

  group('SupabaseServerContract delivery', () {
    Dio buildDio(ResponseBody response) {
      final dio = Dio(
        BaseOptions(
          baseUrl: 'https://mock.supabase.co',
          validateStatus: (status) => true,
        ),
      );
      dio.httpClientAdapter = _FakeDioAdapter(response: response);
      return dio;
    }

    test('returns delivered when receipt verifies', () async {
      final signer = _FakeBundleSigner(verifyResult: true);
      final receipt = _receiptJson();
      final dio = buildDio(
        ResponseBody.fromString(
          receipt,
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

      final contract = SupabaseServerContract(
        signer,
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: dio,
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.delivered);
      expect(result.receipt?.messageId, 'msg-1');
      expect(result.receipt?.payloadHash, _payloadHash);
    });

    test('rejects a receipt bound to another message', () async {
      final contract = SupabaseServerContract(
        _FakeBundleSigner(verifyResult: true),
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: buildDio(
          ResponseBody.fromString(
            _receiptJson(messageId: 'msg-other'),
            200,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          ),
        ),
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'receipt_binding_invalid');
    });

    test('rejects a receipt bound to another payload hash', () async {
      final contract = SupabaseServerContract(
        _FakeBundleSigner(verifyResult: true),
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: buildDio(
          ResponseBody.fromString(
            _receiptJson(payloadHash: Uint8List(32)),
            200,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          ),
        ),
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'receipt_binding_invalid');
    });

    test('fails with server_public_key_missing when key is absent', () async {
      final signer = _FakeBundleSigner();
      final receipt = _receiptJson();
      final dio = buildDio(
        ResponseBody.fromString(
          receipt,
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

      final contract = SupabaseServerContract(
        signer,
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        httpClient: dio,
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'server_public_key_missing');
    });

    test('fails with receipt_signature_invalid when verify is false', () async {
      final signer = _FakeBundleSigner(verifyResult: false);
      final receipt = _receiptJson();
      final dio = buildDio(
        ResponseBody.fromString(
          receipt,
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

      final contract = SupabaseServerContract(
        signer,
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: dio,
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'receipt_signature_invalid');
    });

    test('returns queued on network connection error', () async {
      final signer = _FakeBundleSigner();
      final dio = Dio(BaseOptions(baseUrl: 'https://mock.supabase.co'));
      dio.httpClientAdapter = _FakeDioAdapter(
        exception: DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.connectionError,
        ),
      );

      final contract = SupabaseServerContract(
        signer,
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: dio,
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.queued);
      expect(result.failure?.code, 'network_unavailable');
      expect(result.failure?.retryable, isTrue);
    });

    test('fails non-retryable on 401', () async {
      final signer = _FakeBundleSigner();
      final dio = buildDio(
        ResponseBody.fromString(
          '',
          401,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

      final contract = SupabaseServerContract(
        signer,
        supabaseUrl: 'https://mock.supabase.co',
        supabaseAnonKey: 'fake-anon-key',
        serverReceiptPublicKeyBase64: serverReceiptPublicKey,
        httpClient: dio,
      );

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        _payloadHash,
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.failure?.code, 'server_401');
      expect(result.failure?.retryable, isFalse);
    });
  });
}
