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

void main() {
  final serverReceiptPublicKey = base64Encode(Uint8List(32));

  group('SupabaseServerContract fail-closed', () {
    test('fails with server_not_configured when env is empty', () async {
      final signer = _FakeBundleSigner();
      final contract = SupabaseServerContract(signer);

      final result = await contract.sendBundle(
        'msg-1',
        Uint8List.fromList([1, 2, 3]),
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.error, 'server_not_configured');
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
      final receipt = jsonEncode({
        'message_id': 'msg-1',
        'signature': base64Encode(Uint8List(64)),
      });
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
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.delivered);
    });

    test('fails with server_public_key_missing when key is absent', () async {
      final signer = _FakeBundleSigner();
      final receipt = jsonEncode({
        'message_id': 'msg-1',
        'signature': base64Encode(Uint8List(64)),
      });
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
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.error, 'server_public_key_missing');
    });

    test('fails with receipt_signature_invalid when verify is false', () async {
      final signer = _FakeBundleSigner(verifyResult: false);
      final receipt = jsonEncode({
        'message_id': 'msg-1',
        'signature': base64Encode(Uint8List(64)),
      });
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
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.error, 'receipt_signature_invalid');
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
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.queued);
      expect(result.error, 'network_unavailable');
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
        Uint8List.fromList([4, 5, 6]),
      );

      expect(result.state, DeliveryState.failed);
      expect(result.error, 'server_401_non_retryable');
    });
  });
}
