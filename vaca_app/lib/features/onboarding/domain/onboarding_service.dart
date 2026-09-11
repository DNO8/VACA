import '../../../core/result/result.dart';
import '../../../core/security/secure_storage.dart';

class OnboardingService {
  const OnboardingService(this._storage);

  static const consentVersion = '1.0';
  static const _completionKey = 'onboarding.complete.$consentVersion';

  final SecureStorage _storage;

  Future<bool> isComplete() async {
    final result = await _storage.read(_completionKey);
    return switch (result) {
      Success(value: final value) => value == 'true',
      Failure() => false,
    };
  }

  Future<Result<void>> complete() => _storage.write(_completionKey, 'true');
}
