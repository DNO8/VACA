import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/result/result.dart';
import '../../../core/security/identity_key_source.dart';
import '../../../core/security/secure_storage.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';
import '../data/kyc_adapter.dart';
import 'identity_profile.dart';

/// Servicio de identidad del usuario.
///
/// Orquesta el perfil local, la clave del dispositivo y la verificación KYC.
class IdentityService {
  const IdentityService({
    required this.database,
    required this.secureStorage,
    required this.keySource,
    required this.kycAdapter,
  });

  final AppDatabase database;
  final SecureStorage secureStorage;
  final IdentityKeySource keySource;
  final KycAdapter kycAdapter;

  /// Recupera o crea un perfil local no verificado.
  Future<UserIdentityProfile> getOrCreateLocalProfile() async {
    final existing = await database.select(database.identityProfiles).get();
    if (existing.isNotEmpty) {
      final row = existing.first;
      return UserIdentityProfile(
        id: row.id,
        opaqueSubjectId: row.opaqueSubjectId,
        identityAssurance: row.identityAssurance,
        credential: row.credential,
        credentialExpiresAt: row.credentialExpiresAt,
        devicePublicKey: row.devicePublicKey,
        consentVersion: row.consentVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      );
    }

    final keyResult = await keySource.getOrCreateKeyPair();
    final publicKey = switch (keyResult) {
      Success(value: final pair) => pair.publicKey,
      Failure(error: final error) =>
        throw StateError(error.message ?? error.code),
    };

    final id = const Uuid().v4();
    final now = DateTime.now();
    await database.into(database.identityProfiles).insert(
          IdentityProfilesCompanion.insert(
            id: id,
            identityAssurance: IdentityAssurance.unverified,
            devicePublicKey: publicKey,
            consentVersion: '1.0',
            createdAt: now,
            updatedAt: now,
          ),
        );

    return UserIdentityProfile(
      id: id,
      identityAssurance: IdentityAssurance.unverified,
      devicePublicKey: publicKey,
      consentVersion: '1.0',
      createdAt: now,
      updatedAt: now,
    );
  }

  Future<UserIdentityProfile> acceptConsent(String version) async {
    final local = await getOrCreateLocalProfile();
    final now = DateTime.now();
    await (database.update(database.identityProfiles)
          ..where((row) => row.id.equals(local.id)))
        .write(
      IdentityProfilesCompanion(
        consentVersion: Value(version),
        updatedAt: Value(now),
      ),
    );
    return UserIdentityProfile(
      id: local.id,
      opaqueSubjectId: local.opaqueSubjectId,
      identityAssurance: local.identityAssurance,
      credential: local.credential,
      credentialExpiresAt: local.credentialExpiresAt,
      devicePublicKey: local.devicePublicKey,
      consentVersion: version,
      createdAt: local.createdAt,
      updatedAt: now,
    );
  }

  Future<Result<void>> deleteLocalData() async {
    try {
      await database.transaction(() async {
        await database.delete(database.deliveryAttempts).go();
        await database.delete(database.serverReceipts).go();
        await database.delete(database.tombstones).go();
        await database.delete(database.originBundles).go();
        await database.delete(database.incidentEvents).go();
        await database.delete(database.attachments).go();
        await database.delete(database.incidents).go();
        await database.delete(database.identityProfiles).go();
      });
      final secureDelete = await secureStorage.deleteAll();
      if (secureDelete case Failure(error: final error)) return Failure(error);
      return const Success(null);
    } catch (error) {
      return Failure(
        VacaError(
          code: 'identity_local_deletion',
          message: 'No se pudieron eliminar todos los datos locales.',
          cause: error,
        ),
      );
    }
  }

  /// Revierte el perfil local a no verificado tras una eliminación remota.
  ///
  /// La cuenta del servidor deja de existir; si el perfil local conservara
  /// `verified` o `pending`, la app quedaría en un estado inconsistente y el
  /// usuario no podría volver a verificarse.
  Future<Result<UserIdentityProfile>> resetVerification() async {
    final local = await getOrCreateLocalProfile();
    try {
      final now = DateTime.now();
      await (database.update(database.identityProfiles)
            ..where((row) => row.id.equals(local.id)))
          .write(
        const IdentityProfilesCompanion(
          opaqueSubjectId: Value(null),
          identityAssurance: Value(IdentityAssurance.unverified),
          credential: Value(null),
          credentialExpiresAt: Value(null),
        ),
      );
      return Success(
        UserIdentityProfile(
          id: local.id,
          identityAssurance: IdentityAssurance.unverified,
          devicePublicKey: local.devicePublicKey,
          consentVersion: local.consentVersion,
          createdAt: local.createdAt,
          updatedAt: now,
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'identity_reset_verification',
          message: 'No se pudo reiniciar el estado de verificación.',
          cause: e,
        ),
      );
    }
  }

  /// Intenta verificar la identidad con KYC.
  Future<Result<UserIdentityProfile>> verifyWithKyc() async {
    final local = await getOrCreateLocalProfile();
    final kycResult = await kycAdapter.verify(
      consentVersion: local.consentVersion,
      devicePublicKey: local.devicePublicKey,
    );

    return switch (kycResult) {
      Success(value: final kyc) => _applyKyc(local, kyc),
      Failure(error: final error) => Failure<UserIdentityProfile>(error),
    };
  }

  Future<Result<UserIdentityProfile>> _applyKyc(
    UserIdentityProfile local,
    KycResult kyc,
  ) async {
    try {
      final now = DateTime.now();
      final assurance = kyc.identityAssurance;
      await (database.update(database.identityProfiles)
            ..where((row) => row.id.equals(local.id)))
          .write(
        IdentityProfilesCompanion(
          opaqueSubjectId: Value(kyc.opaqueSubjectId),
          identityAssurance: Value(assurance),
          credential: Value(kyc.credential),
          credentialExpiresAt: Value(kyc.credentialExpiresAt),
          updatedAt: Value(now),
        ),
      );

      return Success(
        UserIdentityProfile(
          id: local.id,
          opaqueSubjectId: kyc.opaqueSubjectId,
          identityAssurance: assurance,
          credential: kyc.credential,
          credentialExpiresAt: kyc.credentialExpiresAt,
          devicePublicKey: local.devicePublicKey,
          consentVersion: local.consentVersion,
          createdAt: local.createdAt,
          updatedAt: now,
        ),
      );
    } catch (e) {
      return Failure(
        VacaError(
          code: 'identity_apply_kyc',
          message: 'No se pudo aplicar el resultado KYC.',
          cause: e,
        ),
      );
    }
  }
}
