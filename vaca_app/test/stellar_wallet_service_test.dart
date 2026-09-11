import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';

class _WalletStorage implements SecureStorage {
  final values = <String, String>{};

  @override
  Future<Result<String?>> read(String key) async => Success(values[key]);

  @override
  Future<Result<void>> write(String key, String value) async {
    values[key] = value;
    return const Success(null);
  }

  @override
  Future<Result<void>> delete(String key) async {
    values.remove(key);
    return const Success(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    values.clear();
    return const Success(null);
  }
}

void main() {
  test('creates a real Stellar keypair and stores only its secret securely',
      () async {
    final storage = _WalletStorage();
    final service = StellarWalletService(storage);

    final created = await service.create();

    expect(created.isSuccess, isTrue);
    expect(created.valueOrNull!.accountId, startsWith('G'));
    expect(created.valueOrNull!.balance, '0.0000000');
    expect(storage.values, hasLength(1));
    expect(storage.values.values.single, startsWith('S'));
    expect(storage.values.values.single, isNot(created.valueOrNull!.accountId));
  });
}
