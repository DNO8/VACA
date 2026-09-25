import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/wallet/data/stellar_sdk_wallet_gateway.dart';

void main() {
  final enabled = Platform.environment['VACA_STELLAR_TESTNET'] == '1';

  test(
    'funds a new account and creates the official USDC trustline',
    () async {
      final gateway = StellarSdkWalletGateway();
      final credentials = gateway.createCredentials();

      expect(await gateway.fund(credentials.accountId), isTrue);
      await Future<void>.delayed(const Duration(seconds: 2));
      final transactionHash =
          await gateway.ensureUsdcTrustline(credentials.secretSeed);
      final duplicate =
          await gateway.ensureUsdcTrustline(credentials.secretSeed);
      final snapshot = await gateway.snapshot(credentials.secretSeed);

      expect(transactionHash, isNotNull);
      expect(duplicate, isNull);
      expect(snapshot.funded, isTrue);
      expect(snapshot.usdcTrustlineReady, isTrue);
      expect(snapshot.usdcBalance, '0.0000000');
      debugPrint('USDC trustline account: ${credentials.accountId}');
      debugPrint('USDC trustline transaction: $transactionHash');
    },
    skip: enabled ? false : 'Set VACA_STELLAR_TESTNET=1 to run.',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
