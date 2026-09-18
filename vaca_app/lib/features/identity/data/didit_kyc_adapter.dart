import 'package:didit_sdk/sdk_flutter.dart';
import 'package:dio/dio.dart';

import '../../../core/result/result.dart';
import '../../../core/security/device_request_signer.dart';
import '../../../data/local/enums.dart';
import 'kyc_adapter.dart';

/// Implementación de [KycAdapter] usando el SDK oficial de Didit.
///
/// La sesión se crea vía API REST con la clave pública del dispositivo en
/// `metadata.device_public_key`. El SDK nativo recibe el `session_token` y
/// maneja el flujo de captura. La autoridad final de la identidad es el
/// webhook a `kyc-webhook` en Supabase.
///
/// Requiere `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Las credenciales Didit
/// permanecen en la Edge Function `kyc-session`.
class DiditKycAdapter implements KycAdapter {
  const DiditKycAdapter({
    required DeviceRequestSigner requestSigner,
    required String supabaseUrl,
    required String supabaseAnonKey,
    Dio? httpClient,
  })  : _requestSigner = requestSigner,
        _supabaseUrl = supabaseUrl,
        _supabaseAnonKey = supabaseAnonKey,
        _httpClient = httpClient;

  final DeviceRequestSigner _requestSigner;
  final String _supabaseUrl;
  final String _supabaseAnonKey;
  final Dio? _httpClient;

  @override
  Future<Result<KycResult>> verify({
    required String consentVersion,
    required String devicePublicKey,
  }) async {
    if (_supabaseUrl.isEmpty || _supabaseAnonKey.isEmpty) {
      return const Failure(
        VacaError(
          code: 'kyc_unconfigured',
          message: 'KYC no está configurado en este entorno.',
        ),
      );
    }

    final signed = await _requestSigner.sign(
      'kyc-session',
      [devicePublicKey, consentVersion],
    );
    if (signed case Failure(error: final error)) return Failure(error);

    try {
      final dio = _httpClient ?? Dio();
      final response = await dio.post<dynamic>(
        '$_supabaseUrl/functions/v1/kyc-session',
        options: Options(
          headers: {
            'apikey': _supabaseAnonKey,
            'Content-Type': 'application/json',
            ...signed.valueOrNull!,
          },
          validateStatus: (status) => status != null && status < 500,
        ),
        data: {
          'device_public_key': devicePublicKey,
          'consent_version': consentVersion,
        },
      );

      final statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        if (statusCode == 404) {
          return const Failure(
            VacaError(
              code: 'kyc_backend_not_deployed',
              message: 'La función kyc-session no está desplegada en Supabase.',
            ),
          );
        }
        if (statusCode == 401 || statusCode == 403) {
          return const Failure(
            VacaError(
              code: 'kyc_backend_unauthorized',
              message: 'Supabase rechazó la autenticación del servicio KYC.',
            ),
          );
        }
        return Failure(
          VacaError(
            code: 'didit_session_creation_failed',
            message: 'No se pudo crear la sesión KYC ($statusCode).',
          ),
        );
      }

      final data = response.data as Map<String, dynamic>?;
      if (data == null) {
        return const Failure(
          VacaError(
            code: 'didit_session_empty',
            message: 'Didit session response was empty.',
          ),
        );
      }

      final sessionToken = data['session_token'] as String?;
      final sessionId = data['session_id'] as String?;

      if (sessionToken == null || sessionToken.isEmpty || sessionId == null) {
        return const Failure(
          VacaError(
            code: 'didit_session_token_missing',
            message: 'Didit session_token o session_id faltantes.',
          ),
        );
      }

      final sdkResult = await DiditSdk.startVerification(
        sessionToken,
        config: const DiditConfig(
          loggingEnabled: false,
          showCloseButton: true,
          showExitConfirmation: true,
        ),
      );

      switch (sdkResult) {
        case VerificationCompleted(:final session):
          return Success(
            KycResult(
              opaqueSubjectId: sessionId,
              identityAssurance: _mapStatus(session.status),
            ),
          );
        case VerificationCancelled():
          return const Failure(
            VacaError(
              code: 'kyc_cancelled',
              message: 'El usuario canceló el flujo de verificación.',
            ),
          );
        case VerificationFailed(:final error):
          return Failure(
            VacaError(
              code: 'didit_verification_failed',
              message: error.message,
            ),
          );
      }
    } on DioException catch (e) {
      return Failure(
        VacaError(
          code: 'didit_network_error',
          message: e.message ?? 'Error de red al crear la sesión de Didit.',
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'didit_unexpected_error',
          message: e.toString(),
        ),
      );
    }
  }

  IdentityAssurance _mapStatus(VerificationStatus status) {
    return switch (status) {
      VerificationStatus.approved => IdentityAssurance.verified,
      VerificationStatus.pending => IdentityAssurance.pending,
      VerificationStatus.declined => IdentityAssurance.unverified,
    };
  }
}
