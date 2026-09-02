import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/local/database.dart';
import '../features/identity/data/kyc_adapter.dart';
import '../features/identity/domain/identity_service.dart';
import '../features/incident/domain/attachment_service.dart';
import '../features/incident/domain/incident_service.dart';
import 'permissions/permission_service.dart';
import 'security/identity_key_source.dart';
import 'security/secure_storage.dart';
import 'transport/internet_transport.dart';
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

/// Transporte activo. En el MVP: internet. La app consume la abstracción
/// [Transport], no la implementación concreta (ver mesh-comunicaciones §3).
final transportProvider = Provider<Transport>((ref) {
  final transport = InternetTransport();
  ref.onDispose(transport.stop);
  return transport;
});

/// Almacenamiento seguro.
final secureStorageProvider = Provider<SecureStorage>((ref) {
  return const SecureStorage();
});

/// Fuente de claves de dispositivo.
final identityKeySourceProvider = Provider<IdentityKeySource>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return IdentityKeySource(storage);
});

/// Adapter de KYC. Por defecto desconfigurado (sin credenciales).
final kycAdapterProvider = Provider<KycAdapter>((ref) {
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

/// Servicio de incidentes offline-first.
final incidentServiceProvider = Provider<IncidentService>((ref) {
  final db = ref.watch(databaseProvider);
  return IncidentService(db);
});

/// Servicio de adjuntos de incidentes.
final attachmentServiceProvider = Provider<AttachmentService>((ref) {
  final db = ref.watch(databaseProvider);
  return AttachmentService(db);
});
