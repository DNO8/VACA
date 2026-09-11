// ignore_for_file: avoid_print

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:ed25519_edwards/ed25519_edwards.dart' as ed25519;

/// Genera claves del servidor de referencia para Supabase (Slice C3).
///
/// SERVER_BUNDLE_PRIVATE_KEY: seed X25519 (32 bytes, base64) del servidor.
/// SERVER_BUNDLE_PUBLIC_KEY: punto X25519 (32 bytes, base64) para el cliente.
/// SERVER_RECEIPT_PRIVATE_KEY: seed Ed25519 (32 bytes, base64) del servidor.
/// SERVER_RECEIPT_PUBLIC_KEY: punto Ed25519 (32 bytes, base64) para el cliente.
Future<void> main() async {
  final random = Random.secure();
  final bundlePair = await X25519().newKeyPair();
  final bundlePrivateKey = await bundlePair.extractPrivateKeyBytes();
  final bundlePublicKey = await bundlePair.extractPublicKey();

  final seed = Uint8List(ed25519.SeedSize);
  for (var i = 0; i < seed.length; i++) {
    seed[i] = random.nextInt(256);
  }
  final privateKey = ed25519.newKeyFromSeed(seed);
  final publicKey = privateKey.bytes.sublist(
    ed25519.SeedSize,
    ed25519.SeedSize + ed25519.PublicKeySize,
  );

  print('');
  print('==============================================');
  print('SERVER_BUNDLE_PRIVATE_KEY=${base64Encode(bundlePrivateKey)}');
  print('SERVER_BUNDLE_PUBLIC_KEY=${base64Encode(bundlePublicKey.bytes)}');
  print('SERVER_RECEIPT_PRIVATE_KEY=${base64Encode(seed)}');
  print('SERVER_RECEIPT_PUBLIC_KEY=${base64Encode(publicKey)}');
  print('==============================================');
  print('');
}
