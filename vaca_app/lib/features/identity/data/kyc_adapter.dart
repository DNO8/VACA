import '../../../core/result/result.dart';

/// Resultado de una verificacion KYC.
class KycResult {
  const KycResult({
    required this.opaqueSubjectId,
    required this.credential,
    required this.credentialExpiresAt,
  });

  final String opaqueSubjectId;
  final String credential;
  final DateTime credentialExpiresAt;
}

/// Abstraccion del proveedor de KYC (Didit u otro).
///
/// La implementacion con Didit requiere credenciales del propietario y no
/// se entrega en el repositorio. Ver handoff §B2.
abstract interface class KycAdapter {
  Future<Result<KycResult>> verify({required String consentVersion});
}

/// Implementacion stub que indica que KYC no esta configurado.
///
/// No contiene credenciales y no realiza llamadas de red.
class UnconfiguredKycAdapter implements KycAdapter {
  const UnconfiguredKycAdapter();

  @override
  Future<Result<KycResult>> verify({required String consentVersion}) async {
    return const Failure(
      VacaError(
        code: 'kyc_unconfigured',
        message:
            'KYC no esta configurado. Se requieren credenciales del propietario.',
      ),
    );
  }
}
