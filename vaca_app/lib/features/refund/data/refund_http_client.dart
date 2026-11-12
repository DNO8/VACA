import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../domain/refund_scope.dart';
import '../domain/refund_status.dart';
import 'refund_wallet_signer.dart';
import 'refund_submission_journal.dart';

/// One explicit signed command. No retries, redirects, polling or refresh hooks.
class RefundHttpClient {
  RefundHttpClient({
    required this.projectUrl,
    required String publicApiKey,
    required RefundWalletSigner signer,
    HttpClientAdapter? adapter,
    DateTime Function()? now,
  })  : _signer = signer,
        _now = now ?? DateTime.now,
        _http = Dio(BaseOptions(
          // Legacy public anon JWT: gateway access, not wallet/admin identity.
          headers: {
            'apikey': publicApiKey,
            'Authorization': 'Bearer $publicApiKey',
            'Content-Type': 'application/json',
          },
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
      throw const RefundProtocolError('d1_refund_configuration');
    }
    if (adapter != null) _http.httpClientAdapter = adapter;
  }

  final Uri projectUrl;
  final RefundWalletSigner _signer;
  final DateTime Function() _now;
  final Dio _http;

  Future<RefundStatus> send(
    RefundScope scope,
    RefundAction action, {
    RefundLocalReservation? reservation,
  }) async {
    final cancel = CancelToken();
    Timer? timer;
    try {
      if (action == RefundAction.refund) {
        RefundValidation.require(reservation != null);
        reservation!.consume(scope);
      }
      final milliseconds = _now().toUtc().millisecondsSinceEpoch;
      RefundValidation.require(milliseconds >= 0);
      final timestamp = milliseconds ~/ 1000;
      final signed = await _signer.sign(scope, action, timestamp);
      // A delayed storage read must not send a command that already expired.
      final current = _now().toUtc().millisecondsSinceEpoch ~/ 1000;
      RefundValidation.require(
          current >= timestamp && current - timestamp <= 60);
      final body = jsonEncode(signed);
      RefundValidation.require(utf8.encode(body).length <= 8192);
      timer = Timer(const Duration(seconds: 10), () => cancel.cancel());
      final response = await _http.postUri<ResponseBody>(
        projectUrl.resolve('/functions/v1/d1-custody/${action.path}'),
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
      RefundValidation.require(noStore && response.data != null);
      final bytes = <int>[];
      await for (final chunk
          in response.data!.stream.timeout(const Duration(seconds: 10))) {
        RefundValidation.require(bytes.length + chunk.length <= 16384);
        bytes.addAll(chunk);
      }
      final decoded = RefundValidation.decodeJson(utf8.decode(bytes));
      final statusCode = response.statusCode;
      if (decoded is Map<String, Object?> &&
          decoded.length == 1 &&
          decoded.containsKey('error')) {
        final code = decoded['error'];
        RefundValidation.require(_errors[statusCode]?.contains(code) ?? false);
        throw RefundProtocolError(code! as String);
      }
      final status = RefundStatus.parse(decoded, scope);
      final pending = ['pending', 'unknown'].contains(status.state);
      final expected = switch (action) {
        RefundAction.status => 200,
        RefundAction.reconcile => pending ? 202 : 200,
        RefundAction.refund => pending
            ? 202
            : ['not_due', 'blocked'].contains(status.state)
                ? 409
                : 200,
      };
      RefundValidation.require(
        statusCode == expected &&
            !(action == RefundAction.refund && status.state == 'not_started'),
      );
      if (reservation != null) {
        RefundValidation.require(reservation.baseline.sameDonation(status));
      }
      return status;
    } on RefundProtocolError {
      rethrow;
    } catch (_) {
      throw const RefundProtocolError('d1_refund_transport_unavailable');
    } finally {
      timer?.cancel();
      cancel.cancel();
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
  503: ['refund_unavailable'],
};
