import 'dart:typed_data';

import 'package:ed25519_edwards/ed25519_edwards.dart' as ed25519;

import '../result/result.dart';
import '../security/identity_key_source.dart';

/// Firma y verifica los bytes de la cabecera protegida de un bundle.
///
/// El origen firma los campos protegidos de la cabecera concatenados con el
/// hash del payload. El destinatario verifica usando la clave publica del
/// origen.
abstract interface class BundleSigner {
  Future<Result<Uint8List>> sign(Uint8List message);
  Future<Result<bool>> verify(
    Uint8List message,
    Uint8List signature,
    Uint8List publicKey,
  );
}

/// Firma con el par de claves del dispositivo.
class DeviceBundleSigner implements BundleSigner {
  const DeviceBundleSigner(this._keySource);

  final IdentityKeySource _keySource;

  @override
  Future<Result<Uint8List>> sign(Uint8List message) => _keySource.sign(message);

  @override
  Future<Result<bool>> verify(
    Uint8List message,
    Uint8List signature,
    Uint8List publicKey,
  ) async {
    try {
      final public = ed25519.PublicKey(publicKey);
      final valid = ed25519.verify(public, message, signature);
      return Success(valid);
    } catch (e) {
      return Failure(
        VacaError(
          code: 'bundle_verify',
          message: 'No se pudo verificar la firma del bundle.',
          cause: e,
        ),
      );
    }
  }
}
