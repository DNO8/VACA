import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import '../domain/refund_scope.dart';
import '../domain/refund_remainder_status.dart';

/// An observed state or a local unknown hold, never retry/financial permission.
class RemainderStatusResult {
  const RemainderStatusResult._(this.status, this.errorCode);
  final RemainderStatus? status;
  final String? errorCode;
  String get state => errorCode == null ? status!.state : 'unknown';
  bool get isSettled => errorCode == null && status!.isSettled;

  // This consumer implements ONLY status, regardless of other server commands.
  List<RemainderAction> get safeActions =>
      errorCode == null ? const [RemainderAction.status] : const [];
}

/// Passive explicit status seam. No refund/reconcile, journal writes or UI mount.
class RemainderStatusClient {
  RemainderStatusClient({
    required this.projectUrl,
    required String publicApiKey,
    required SecureStorage storage,
    HttpClientAdapter? adapter,
    DateTime Function()? now,
  })  : _storage = storage,
        _now = now ?? DateTime.now,
        _http = Dio(BaseOptions(
          headers: {'apikey': publicApiKey, 'Content-Type': 'application/json'},
          responseType: ResponseType.stream,
          followRedirects: false,
          validateStatus: (_) => true,
        )) {
    if (projectUrl.scheme != 'https' ||
        projectUrl.host.isEmpty ||
        projectUrl.userInfo.isNotEmpty ||
        projectUrl.hasQuery ||
        projectUrl.hasFragment ||
        !['', '/'].contains(projectUrl.path) ||
        publicApiKey.isEmpty) {
      throw const RefundProtocolError('d1_remainder_configuration');
    }
    if (adapter != null) _http.httpClientAdapter = adapter;
  }

  final Uri projectUrl;
  final SecureStorage _storage;
  final DateTime Function() _now;
  final Dio _http;

  Future<RemainderStatusResult> status(
    RefundScope scope, {
    RemainderStatus? previous,
  }) async {
    final cancel = CancelToken();
    Timer? timer;
    try {
      // Reject a foreign baseline before any wallet read or transport effect.
      RefundValidation.require(
          previous == null || scope.matches(previous.toJson()));
      final milliseconds = _now().toUtc().millisecondsSinceEpoch;
      RefundValidation.require(milliseconds >= 0);
      final timestamp = milliseconds ~/ 1000;
      final signed = await _proof(scope, timestamp);
      final current = _now().toUtc().millisecondsSinceEpoch ~/ 1000;
      RefundValidation.require(
          current >= timestamp && current - timestamp <= 60);
      final body = jsonEncode(signed);
      RefundValidation.require(utf8.encode(body).length <= 8192);
      timer = Timer(const Duration(seconds: 10), () => cancel.cancel());
      final response = await _http.postUri<ResponseBody>(
        projectUrl.resolve('/functions/v1/d1-custody/refund-remainder-status'),
        data: body,
        cancelToken: cancel,
      );
      final noStore = response.headers
              .value('cache-control')
              ?.toLowerCase()
              .split(',')
              .map((part) => part.trim())
              .contains('no-store') ??
          false;
      final jsonType = response.headers
              .value('content-type')
              ?.split(';')
              .first
              .trim()
              .toLowerCase() ==
          'application/json';
      RefundValidation.require(noStore && jsonType && response.data != null);
      final bytes = <int>[];
      await for (final chunk
          in response.data!.stream.timeout(const Duration(seconds: 10))) {
        RefundValidation.require(bytes.length + chunk.length <= 16384);
        bytes.addAll(chunk);
      }
      final decoded = RefundValidation.decodeJson(utf8.decode(bytes));
      if (decoded is Map<String, Object?> &&
          decoded.length == 1 &&
          decoded.containsKey('error')) {
        final code = decoded['error'];
        RefundValidation.require(
            _errors[response.statusCode]?.contains(code) ?? false);
        return RemainderStatusResult._(null, code! as String);
      }
      RefundValidation.require(response.statusCode == 200);
      final observed = RemainderStatus.parse(decoded, scope);
      RefundValidation.require(
          previous == null || previous.sameDonation(observed));
      return RemainderStatusResult._(observed, null);
    } on RefundProtocolError catch (error) {
      final code = error.code == 'd1_remainder_wallet_unavailable'
          ? error.code
          : 'd1_remainder_response_unverified';
      return RemainderStatusResult._(null, code);
    } catch (_) {
      return const RemainderStatusResult._(
          null, 'd1_remainder_transport_unavailable');
    } finally {
      timer?.cancel();
      cancel.cancel();
    }
  }

  // Separate v2 proof: never call the v1 signer and relabel its signed envelope.
  Future<Map<String, Object?>> _proof(RefundScope scope, int timestamp) async {
    try {
      RefundValidation.require(timestamp >= 0 && timestamp <= 9007199254740991);
      final stored = await _storage
          .read('stellar.testnet.secret-seed')
          .timeout(const Duration(seconds: 10));
      if (stored is! Success<String?> || stored.value == null) {
        throw const RefundProtocolError();
      }
      final seed = stored.value!;
      final wallet = KeyPair.fromSecretSeed(seed);
      RefundValidation.require(wallet.secretSeed == seed);
      final root = <String, Object?>{
        'version': 2,
        'network': 'TESTNET',
        'pool': scope.pool,
        'namespace': scope.namespace,
        'action': 'refund_remainder_status',
        'request_id': scope.requestId,
        'timestamp': timestamp,
        'payload': const <String, Object?>{},
        'wallet': wallet.accountId,
      };
      final names = root.keys.toList()..sort();
      final canonical =
          jsonEncode({for (final name in names) name: root[name]});
      final digest = Uint8List.fromList(sha256
          .convert(
            utf8.encode('Stellar Signed Message:\n$canonical'),
          )
          .bytes);
      final signature = wallet.sign(digest);
      RefundValidation.require(
          signature.length == 64 && wallet.verify(digest, signature));
      return Map.unmodifiable({...root, 'signature': base64Encode(signature)});
    } catch (_) {
      throw const RefundProtocolError('d1_remainder_wallet_unavailable');
    }
  }

  void close() => _http.close(force: true);
}

const _errors = <int, List<String>>{
  400: ['invalid_request'],
  401: ['stale_request', 'invalid_signature'],
  403: ['unauthorized_admin_wallet'],
  404: ['request_not_found', 'not_found'],
  405: ['method_not_allowed'],
  503: ['remainder_unavailable'],
};
