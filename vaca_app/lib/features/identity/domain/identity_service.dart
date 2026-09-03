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
/// Orquesta el perfil local, la clave del dispositivo y la verificacion KYC.
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
      Failure(error: final error) => throw StateError(error.message ?? error.code),
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
      await database.update(database.identityProfiles).replace(
            IdentityProfilesCompanion(
              id: Value(local.id),
              opaqueSubjectId: Value(kyc.opaqueSubjectId),
              identityAssurance: Value(kyc.identityAssurance),
              credential: Value(kyc.credential),
              credentialExpiresAt: Value(kyc.credentialExpiresAt),
              updatedAt: Value(now),
            ),
          );

      return Success(
        UserIdentityProfile(
          id: local.id,
          opaqueSubjectId: kyc.opaqueSubjectId,
          identityAssurance: IdentityAssurance.verified,
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
