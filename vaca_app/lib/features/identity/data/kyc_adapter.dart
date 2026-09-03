import '../../../core/result/result.dart';
import '../../../data/local/enums.dart';

/// Resultado de una verificacion KYC.
///
/// [credential] y [credentialExpiresAt] son nulos para proveedores que
/// devuelven solo un estado (por ejemplo, Didit con session token).
class KycResult {
  const KycResult({
    required this.opaqueSubjectId,
    required this.identityAssurance,
    this.credential,
    this.credentialExpiresAt,
  });

  final String opaqueSubjectId;
  final IdentityAssurance identityAssurance;
  final String? credential;
  final DateTime? credentialExpiresAt;
}

/// Abstraccion del proveedor de KYC (Didit u otro).
///
/// La implementacion con Didit requiere credenciales del propietario y no
/// se entrega en el repositorio. Ver handoff §B2.
///
/// [devicePublicKey] se envia al proveedor para que el webhook pueda
/// vincular la sesion con el dispositivo. En Didit se incluye en
/// `metadata.device_public_key`.
abstract interface class KycAdapter {
  Future<Result<KycResult>> verify({
    required String consentVersion,
    required String devicePublicKey,
  });
}

/// Crea un `vendor_data` estable a partir de [devicePublicKey] y [consentVersion].
///
/// Didit usa `vendor_data` para agrupar sesiones del mismo usuario y
/// detectar duplicados. No contiene la clave pública completa, sino un
/// hash corto que identifica al dispositivo.
String diditVendorDataFor(String devicePublicKey, String consentVersion) {
  return '${consentVersion}_${devicePublicKey.hashCode.toRadixString(36)}';
}

/// Implementacion stub que indica que KYC no esta configurado.
///
/// No contiene credenciales y no realiza llamadas de red.
class UnconfiguredKycAdapter implements KycAdapter {
  const UnconfiguredKycAdapter();

  @override
  Future<Result<KycResult>> verify({
    required String consentVersion,
    required String devicePublicKey,
  }) async {
    return const Failure(
      VacaError(
        code: 'kyc_unconfigured',
        message:
            'KYC no esta configurado. Se requieren credenciales del propietario.',
      ),
    );
  }
}
