import 'package:didit_sdk/sdk_flutter.dart';
import 'package:dio/dio.dart';

import '../../../core/result/result.dart';
import '../../../data/local/enums.dart';
import 'kyc_adapter.dart';

/// Implementacion de [KycAdapter] usando el SDK oficial de Didit.
///
/// La sesion se crea via API REST con la clave publica del dispositivo en
/// `metadata.device_public_key`. El SDK nativo recibe el `session_token` y
/// maneja el flujo de captura. La autoridad final de la identidad es el
/// webhook a `kyc-webhook` en Supabase.
///
/// Requiere `--dart-define`:
/// - `DIDIT_API_KEY`
/// - `DIDIT_WORKFLOW_ID`
class DiditKycAdapter implements KycAdapter {
  const DiditKycAdapter({Dio? httpClient}) : _httpClient = httpClient;

  final Dio? _httpClient;

  static const String _baseUrl = 'https://verification.didit.me/v3';
  static const String _callbackUrl = 'myapp://kyc-callback';

  @override
  Future<Result<KycResult>> verify({
    required String consentVersion,
    required String devicePublicKey,
  }) async {
    const apiKey = String.fromEnvironment('DIDIT_API_KEY');
    const workflowId = String.fromEnvironment('DIDIT_WORKFLOW_ID');

    if (apiKey.isEmpty || workflowId.isEmpty) {
      return const Failure(
        VacaError(
          code: 'kyc_unconfigured',
          message:
              'KYC no esta configurado. Se requieren DIDIT_API_KEY y DIDIT_WORKFLOW_ID.',
        ),
      );
    }

    final vendorData = diditVendorDataFor(devicePublicKey, consentVersion);

    try {
      final dio = _httpClient ?? Dio();
      final response = await dio.post<dynamic>(
        '$_baseUrl/session/',
        options: Options(
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status != null && status < 500,
        ),
        data: {
          'workflow_id': workflowId,
          'vendor_data': vendorData,
          'callback': _callbackUrl,
          'callback_method': 'both',
          'metadata': {
            'device_public_key': devicePublicKey,
          },
        },
      );

      final statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        final detail = response.data is Map<String, dynamic>
            ? (response.data as Map<String, dynamic>)['detail'] as String?
            : null;
        return Failure(
          VacaError(
            code: 'didit_session_creation_failed',
            message: detail ?? 'Didit session creation failed: $statusCode',
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
              message: 'El usuario cancelo el flujo de verificacion.',
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
          message: e.message ?? 'Error de red al crear la sesion de Didit.',
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
      VerificationStatus.pending => IdentityAssurance.unverified,
      VerificationStatus.declined => IdentityAssurance.unverified,
    };
  }
}
