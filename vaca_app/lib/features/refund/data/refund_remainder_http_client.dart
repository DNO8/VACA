import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import '../domain/refund_remainder_status.dart';
import '../domain/refund_scope.dart';
import 'refund_remainder_submission_journal.dart';

/// Explicit v2 commands only: no retries, redirects, polling or v1 relabeling.
class RemainderHttpClient {
  RemainderHttpClient({
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
    if (projectUrl.scheme != 'https' || projectUrl.host.isEmpty ||
        projectUrl.userInfo.isNotEmpty || projectUrl.hasQuery ||
        projectUrl.hasFragment || !['', '/'].contains(projectUrl.path) ||
        publicApiKey.isEmpty) {
      throw const RefundProtocolError('d1_remainder_configuration');
    }
    if (adapter != null) _http.httpClientAdapter = adapter;
  }

  final Uri projectUrl;
  final SecureStorage _storage;
  final DateTime Function() _now;
  final Dio _http;

  Future<RemainderStatus> send(RefundScope scope, RemainderAction action,
      {RemainderLocalReservation? reservation}) async {
    final cancel = CancelToken();
    Timer? timer;
    try {
      if (action == RemainderAction.refund) {
        RefundValidation.require(reservation != null);
        reservation!.consume(scope);
      } else {
        RefundValidation.require(reservation == null);
      }
      final milliseconds = _now().toUtc().millisecondsSinceEpoch;
      RefundValidation.require(milliseconds >= 0);
      final timestamp = milliseconds ~/ 1000;
      final signed = await _proof(scope, action, timestamp);
      final current = _now().toUtc().millisecondsSinceEpoch ~/ 1000;
      RefundValidation.require(current >= timestamp && current - timestamp <= 60);
      final body = jsonEncode(signed);
      RefundValidation.require(utf8.encode(body).length <= 8192);
      final suffix = switch (action) {
        RemainderAction.refund => 'refund-remainder',
        RemainderAction.status => 'refund-remainder-status',
        RemainderAction.reconcile => 'refund-remainder-reconcile',
      };
      timer = Timer(const Duration(seconds: 10), () => cancel.cancel());
      final response = await _http.postUri<ResponseBody>(
        projectUrl.resolve('/functions/v1/d1-custody/$suffix'),
        data: body,
        cancelToken: cancel,
      );
      final noStore = response.headers.value('cache-control')?.toLowerCase()
          .split(',').map((value) => value.trim()).contains('no-store') ?? false;
      final jsonType = response.headers.value('content-type')?.split(';')
          .first.trim().toLowerCase() == 'application/json';
      RefundValidation.require(noStore && jsonType && response.data != null);
      final bytes = <int>[];
      await for (final chunk in response.data!.stream.timeout(const Duration(seconds: 10))) {
        RefundValidation.require(bytes.length + chunk.length <= 16384);
        bytes.addAll(chunk);
      }
      final decoded = RefundValidation.decodeJson(utf8.decode(bytes));
      if (decoded is Map<String, Object?> && decoded.length == 1 &&
          decoded.containsKey('error')) {
        final code = decoded['error'];
        RefundValidation.require(_errors[response.statusCode]?.contains(code) ?? false);
        throw RefundProtocolError(code! as String);
      }
      final observed = RemainderStatus.parse(decoded, scope);
      final pending = ['pending', 'unknown'].contains(observed.state);
      final expected = switch (action) {
        RemainderAction.status => 200,
        RemainderAction.reconcile => pending ? 202 : 200,
        RemainderAction.refund => pending ? 202
            : ['not_due', 'blocked'].contains(observed.state) ? 409 : 200,
      };
      RefundValidation.require(response.statusCode == expected &&
          !(action == RemainderAction.refund && observed.state == 'not_started'));
      if (reservation != null) {
        RefundValidation.require(reservation.baseline.sameDonation(observed));
      }
      return observed;
    } on RefundProtocolError {
      rethrow;
    } catch (_) {
      throw const RefundProtocolError('d1_remainder_transport_unavailable');
    } finally {
      timer?.cancel();
      cancel.cancel();
    }
  }

  /// Personal-wallet proof with this action signed into the v2 envelope itself.
  Future<Map<String, Object?>> _proof(
      RefundScope scope, RemainderAction action, int timestamp) async {
    try {
      RefundValidation.require(timestamp >= 0 && timestamp <= 9007199254740991);
      final stored = await _storage.read('stellar.testnet.secret-seed')
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
        'action': action.wire,
        'request_id': scope.requestId,
        'timestamp': timestamp,
        'payload': const <String, Object?>{},
        'wallet': wallet.accountId,
      };
      final names = root.keys.toList()..sort();
      final canonical = jsonEncode({for (final name in names) name: root[name]});
      final digest = Uint8List.fromList(sha256.convert(
          utf8.encode('Stellar Signed Message:\n$canonical')).bytes);
      final signature = wallet.sign(digest);
      RefundValidation.require(signature.length == 64 && wallet.verify(digest, signature));
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
