import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local/database.dart';
import '../features/identity/data/account_deletion_service.dart';
import '../features/identity/data/didit_kyc_adapter.dart';
import '../features/identity/data/kyc_adapter.dart';
import '../features/identity/domain/identity_service.dart';
import '../features/incident/domain/attachment_service.dart';
import '../features/incident/domain/incident_service.dart';
import '../features/onboarding/domain/onboarding_service.dart';
import '../features/wallet/domain/stellar_wallet_service.dart';
import 'bundle/bundle_cipher.dart';
import 'bundle/bundle_codec.dart';
import 'bundle/bundle_queue_service.dart';
import 'bundle/bundle_scheduler.dart';
import 'bundle/bundle_signer.dart';
import 'permissions/permission_service.dart';
import 'security/device_request_signer.dart';
import 'security/identity_key_source.dart';
import 'security/secure_storage.dart';
import 'transport/internet_transport.dart';
import 'transport/server_contract.dart';
import 'transport/supabase_contract.dart';
import 'transport/transport.dart';

/// Providers de dependencias core (Riverpod).
///
/// Se usan providers simples (sin codegen) para la infraestructura base; los
/// providers de features usarán `@riverpod` (riverpod_generator) en fases
/// siguientes.

/// Base de datos local Drift. Se cierra con el ciclo de vida del provider.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

/// Servicio de permisos (cámara + GPS).
final permissionServiceProvider = Provider<PermissionService>((ref) {
  return const PermissionService();
});

/// Contrato de servidor para entrega de bundles por Internet.
///
/// Lee SUPABASE_URL, SUPABASE_ANON_KEY y SERVER_RECEIPT_PUBLIC_KEY
/// desde dart-define. Si no están definidos, falla cerrado.
final serverContractProvider = Provider<ServerContract>((ref) {
  const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  const serverReceiptPublicKey = String.fromEnvironment(
    'SERVER_RECEIPT_PUBLIC_KEY',
  );

  final signer = ref.watch(bundleSignerProvider);
  final requestSigner = DeviceRequestSigner(
    ref.watch(identityKeySourceProvider),
  );
  return SupabaseServerContract(
    signer,
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
    serverReceiptPublicKeyBase64: serverReceiptPublicKey,
    requestSigner: requestSigner,
  );
});

/// Transporte activo. En el MVP: internet. La app consume la abstracción
/// [Transport], no la implementación concreta (ver mesh-comunicaciones §3).
final transportProvider = Provider<Transport>((ref) {
  final contract = ref.watch(serverContractProvider);
  final keySource = ref.watch(identityKeySourceProvider);
  final transport = InternetTransport(
    contract: contract,
    keySource: keySource,
  );
  ref.onDispose(transport.stop);
  return transport;
});

/// Almacenamiento seguro.
final secureStorageProvider = Provider<SecureStorage>((ref) {
  return const SecureStorage();
});

final onboardingServiceProvider = Provider<OnboardingService>((ref) {
  return OnboardingService(ref.watch(secureStorageProvider));
});

final stellarWalletServiceProvider = Provider<StellarWalletService>((ref) {
  return StellarWalletService(ref.watch(secureStorageProvider));
});

/// Fuente de claves de dispositivo.
final identityKeySourceProvider = Provider<IdentityKeySource>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return IdentityKeySource(storage);
});

/// Adapter de KYC.
///
/// Si Supabase está configurado, la creación de sesión Didit ocurre en una
/// Edge Function autenticada; ningún secreto del proveedor entra al cliente.
final accountDeletionServiceProvider = Provider<AccountDeletionService>((ref) {
  const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  return AccountDeletionService(
    requestSigner: DeviceRequestSigner(
      ref.watch(identityKeySourceProvider),
    ),
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
  );
});

final kycAdapterProvider = Provider<KycAdapter>((ref) {
  const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  if (supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty) {
    return DiditKycAdapter(
      requestSigner: DeviceRequestSigner(
        ref.watch(identityKeySourceProvider),
      ),
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
    );
  }

  return const UnconfiguredKycAdapter();
});

/// Servicio de identidad del usuario.
final identityServiceProvider = Provider<IdentityService>((ref) {
  final db = ref.watch(databaseProvider);
  final storage = ref.watch(secureStorageProvider);
  final keySource = ref.watch(identityKeySourceProvider);
  final kyc = ref.watch(kycAdapterProvider);
  return IdentityService(
    database: db,
    secureStorage: storage,
    keySource: keySource,
    kycAdapter: kyc,
  );
});

/// Fuente de claves de destinatario para bundles.
///
/// En producción la clave pública X25519 del servidor se provee vía dart-define
/// `SERVER_BUNDLE_PUBLIC_KEY` (base64 de 32 bytes). La clave privada permanece
/// exclusivamente en el servidor autorizado.
final bundleKeySourceProvider = Provider<BundleKeySource>((ref) {
  const envKey = String.fromEnvironment('SERVER_BUNDLE_PUBLIC_KEY');
  if (envKey.isNotEmpty) {
    try {
      final key = base64Decode(envKey);
      if (key.length == 32) {
        return PublicBundleKeySource(key);
      }
    } catch (_) {
      // Falla cerrado si la clave no es base64 válida o no mide 32 bytes.
    }
  }
  return const FailClosedBundleKeySource();
});

/// Cifra el payload de los bundles.
final bundleCipherProvider = Provider<AesGcmBundleCipher>((ref) {
  final keySource = ref.watch(bundleKeySourceProvider);
  return AesGcmBundleCipher(keySource);
});

/// Firma las cabeceras de los bundles.
final bundleSignerProvider = Provider<BundleSigner>((ref) {
  final keySource = ref.watch(identityKeySourceProvider);
  return DeviceBundleSigner(keySource);
});

/// Codifica/decodifica bundles canónicos.
final bundleCodecProvider = Provider<BundleCodec>((ref) {
  final cipher = ref.watch(bundleCipherProvider);
  final signer = ref.watch(bundleSignerProvider);
  return BundleCodec(
    cipher: cipher,
    signer: signer,
    destination: 'vaca:server:v1',
  );
});

/// Cola de origen para bundles.
final bundleQueueServiceProvider = Provider<BundleQueueService>((ref) {
  final db = ref.watch(databaseProvider);
  final codec = ref.watch(bundleCodecProvider);
  return BundleQueueService(db, codec);
});

/// Scheduler de envío de bundles.
final bundleSchedulerProvider = Provider<BundleScheduler>((ref) {
  final queue = ref.watch(bundleQueueServiceProvider);
  final transport = ref.watch(transportProvider);
  final contract = ref.watch(serverContractProvider);
  return BundleScheduler(
    queue: queue,
    transport: transport,
    serverContract: contract,
  );
});

/// Servicio de incidentes offline-first.
final incidentServiceProvider = Provider<IncidentService>((ref) {
  final db = ref.watch(databaseProvider);
  final queue = ref.watch(bundleQueueServiceProvider);
  final identity = ref.watch(identityServiceProvider);
  final attachments = ref.watch(attachmentServiceProvider);
  return IncidentService(db, queue, identity, attachments);
});

/// Servicio de adjuntos de incidentes.
final attachmentServiceProvider = Provider<AttachmentService>((ref) {
  final db = ref.watch(databaseProvider);
  return AttachmentService(db);
});
