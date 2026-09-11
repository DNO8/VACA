import 'dart:convert';
import 'dart:typed_data';

import 'package:uuid/uuid.dart';

import '../result/result.dart';
import 'identity_key_source.dart';

class DeviceRequestSigner {
  const DeviceRequestSigner(this._keySource);

  final IdentityKeySource _keySource;

  Future<Result<Map<String, String>>> sign(
    String operation,
    List<String> fields,
  ) async {
    final keyPair = await _keySource.getOrCreateKeyPair();
    if (keyPair case Failure(error: final error)) return Failure(error);
    final pair = keyPair.valueOrNull!;
    final timestamp =
        (DateTime.now().millisecondsSinceEpoch ~/ 1000).toString();
    final nonce = const Uuid().v4();
    final canonical =
        ['POST', operation, ...fields, timestamp, nonce].join('\n');
    final signature = await _keySource.sign(
      Uint8List.fromList(utf8.encode(canonical)),
    );
    if (signature case Failure(error: final error)) return Failure(error);
    return Success({
      'X-Device-Public-Key': pair.publicKey,
      'X-Device-Signature': base64Encode(signature.valueOrNull!),
      'X-Device-Timestamp': timestamp,
      'X-Device-Nonce': nonce,
    });
  }
}
