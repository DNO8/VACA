import 'dart:typed_data';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';

class RefundMemoryStorage extends SecureStorage {
  final values = <String, String>{};
  final events = <String>[];
  bool rejectWrite = false;
  bool rejectRead = false;
  RefundMemoryStorage() {
    values['stellar.testnet.secret-seed'] = refundTestWallet.secretSeed;
  }
  @override
  Future<Result<String?>> read(String key) async {
    if (rejectRead) return const Failure(VacaError(code: 'test_read'));
    return Success(values[key]);
  }

  @override
  Future<Result<void>> write(String key, String value) async {
    events.add('write:start');
    if (rejectWrite) return const Failure(VacaError(code: 'test_write'));
    values[key] = value;
    events.add('write:ack');
    return const Success(null);
  }
}

class RefundTestAdapter implements HttpClientAdapter {
  RefundTestAdapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;
  @override
  Future<ResponseBody> fetch(RequestOptions options,
          Stream<Uint8List>? requestStream, Future<void>? cancelFuture) =>
      respond(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody refundTestResponse(String state, {int code = 200}) =>
    ResponseBody.fromString(jsonEncode(refundFixture(state)), code, headers: {
      'content-type': ['application/json'],
      'cache-control': ['no-store']
    });

// Synthetic deterministic test-only identity, never a configured pool/wallet.
final refundTestWallet =
    KeyPair.fromSecretSeedList(Uint8List.fromList(List.filled(32, 7)));
final refundTestScope = RefundScope(
  namespace: '11111111-1111-1111-1111-111111111111',
  pool: refundTestWallet.accountId,
  requestId: '22222222-2222-2222-2222-222222222222',
);

Map<String, Object?> refundFixture(String state) {
  final observed =
      ['refund_observed', 'refund_failed_observed', 'settled'].contains(state);
  final reason = switch (state) {
    'not_due' => 'deadline_not_reached',
    'blocked' => 'remainder_protected',
    'unknown' => 'outcome_unresolved',
    'refund_failed_observed' => 'refund_failed',
    _ => null,
  };
  return {
    'version': 1,
    'network': 'TESTNET',
    'namespace': refundTestScope.namespace,
    'pool': refundTestScope.pool,
    'requestId': refundTestScope.requestId,
    'state': state,
    'verification': observed ? 'persisted_sdk_observation' : 'unverified',
    'deadline': '2026-11-07T12:05:00Z',
    'donation': {
      'paymentOperationId': '1',
      'paymentTransactionHash': 'a' * 64,
      'donor': refundTestWallet.accountId,
      'asset': {'type': 'native'},
      'grossAmount': '10.0000000'
    },
    'refund': [
      'pending',
      'refund_observed',
      'refund_failed_observed',
      'settled'
    ].contains(state)
        ? {
            'transactionHash': 'b' * 64,
            'amount': '9.0000000',
            'claimableBalanceId': null
          }
        : null,
    'settlement': {
      'beneficiaryClaimedAmount': state == 'settled' ? '1.0000000' : null,
      'donorRefundedAmount': state == 'settled' ? '9.0000000' : null,
      'remainingPrincipalAmount': state == 'settled' ? '0.0000000' : null
    },
    'safeActions': state == 'not_started'
        ? ['refund', 'refund_status']
        : ['not_due', 'settled'].contains(state)
            ? ['refund_status']
            : ['refund_status', 'refund_reconcile'],
    'reason': reason,
  };
}
