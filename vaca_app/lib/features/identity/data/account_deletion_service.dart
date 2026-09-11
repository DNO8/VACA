import 'package:dio/dio.dart';

import '../../../core/result/result.dart';
import '../../../core/security/device_request_signer.dart';

class AccountDeletionService {
  AccountDeletionService({
    required DeviceRequestSigner requestSigner,
    required String supabaseUrl,
    required String supabaseAnonKey,
    Dio? httpClient,
  })  : _requestSigner = requestSigner,
        _supabaseUrl = supabaseUrl,
        _supabaseAnonKey = supabaseAnonKey,
        _http = httpClient ?? Dio();

  final DeviceRequestSigner _requestSigner;
  final String _supabaseUrl;
  final String _supabaseAnonKey;
  final Dio _http;

  Future<Result<void>> requestDeletion(String devicePublicKey) async {
    if (_supabaseUrl.isEmpty || _supabaseAnonKey.isEmpty) {
      return const Failure(
        VacaError(
          code: 'deletion_unconfigured',
          message: 'La eliminación remota no está configurada.',
        ),
      );
    }
    final signed = await _requestSigner.sign(
      'account-deletion',
      [devicePublicKey],
    );
    if (signed case Failure(error: final error)) return Failure(error);
    try {
      final response = await _http.post<dynamic>(
        '$_supabaseUrl/functions/v1/account-deletion',
        data: {'device_public_key': devicePublicKey},
        options: Options(
          headers: {
            'apikey': _supabaseAnonKey,
            'Content-Type': 'application/json',
            ...signed.valueOrNull!,
          },
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      final status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) return const Success(null);
      return const Failure(
        VacaError(
          code: 'deletion_request_failed',
          message: 'El servidor rechazó la solicitud de eliminación.',
        ),
      );
    } on DioException {
      return const Failure(
        VacaError(
          code: 'deletion_network_error',
          message: 'No se pudo contactar al servidor de eliminación.',
        ),
      );
    }
  }
}
