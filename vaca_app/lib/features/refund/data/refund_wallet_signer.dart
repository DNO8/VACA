import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';
import '../domain/refund_scope.dart';

/// Signs a command digest with the EXISTING personal wallet, never the pool key.
class RefundWalletSigner {
  RefundWalletSigner(this._storage);
  final SecureStorage _storage;

  Future<Map<String, Object?>> sign(
    RefundScope scope,
    RefundAction action,
    int timestamp,
  ) async {
    try {
      RefundValidation.require(timestamp >= 0 && timestamp <= 9007199254740991);
      final stored = await _storage.read('stellar.testnet.secret-seed');
      if (stored is! Success<String?>) throw const RefundProtocolError();
      final seed = stored.value;
      if (seed == null || seed.isEmpty) throw const RefundProtocolError();
      final key = KeyPair.fromSecretSeed(seed);
      if (key.secretSeed != seed) throw const RefundProtocolError();
      final message = <String, Object?>{
        'version': 1,
        'network': 'TESTNET',
        'pool': scope.pool,
        'namespace': scope.namespace,
        'action': action.wire,
        'request_id': scope.requestId,
        'timestamp': timestamp,
        'payload': const <String, Object?>{},
        'wallet': key.accountId,
      };
      final names = message.keys.toList()..sort();
      final canonical =
          jsonEncode({for (final name in names) name: message[name]});
      final digest = Uint8List.fromList(
        sha256
            .convert(utf8.encode('Stellar Signed Message:\n$canonical'))
            .bytes,
      );
      final signature = key.sign(digest);
      if (signature.length != 64 || !key.verify(digest, signature)) {
        throw const RefundProtocolError();
      }
      return Map.unmodifiable(
          {...message, 'signature': base64Encode(signature)});
    } catch (_) {
      // Do not attach storage, SDK or seed-bearing exceptions to a public error.
      throw const RefundProtocolError('d1_refund_wallet_unavailable');
    }
  }
}
