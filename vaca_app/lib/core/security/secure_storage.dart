import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../result/result.dart';

/// Wrapper seguro sobre `flutter_secure_storage` para claves, tokens y PII.
///
/// No expone excepciones crudas; devuelve `Result` para que la UI decida.
class SecureStorage {
  const SecureStorage([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  Future<Result<String?>> read(String key) async {
    try {
      final value = await _storage.read(key: key);
      return Success(value);
    } catch (e) {
      return const Failure(
        VacaError(
          code: 'secure_storage_read',
          message: 'No se pudo leer el almacenamiento seguro.',
        ),
      );
    }
  }

  Future<Result<void>> write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
      return const Success(null);
    } catch (e) {
      return const Failure(
        VacaError(
          code: 'secure_storage_write',
          message: 'No se pudo escribir el almacenamiento seguro.',
        ),
      );
    }
  }

  Future<Result<void>> delete(String key) async {
    try {
      await _storage.delete(key: key);
      return const Success(null);
    } catch (e) {
      return const Failure(
        VacaError(
          code: 'secure_storage_delete',
          message: 'No se pudo eliminar del almacenamiento seguro.',
        ),
      );
    }
  }

  Future<Result<void>> deleteAll() async {
    try {
      await _storage.deleteAll();
      return const Success(null);
    } catch (e) {
      return const Failure(
        VacaError(
          code: 'secure_storage_delete_all',
          message: 'No se pudo limpiar el almacenamiento seguro.',
        ),
      );
    }
  }
}
