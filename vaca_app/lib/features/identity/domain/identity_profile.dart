import '../../../data/local/enums.dart';

/// Perfil de identidad del usuario, con o sin KYC.
class UserIdentityProfile {
  const UserIdentityProfile({
    required this.id,
    this.opaqueSubjectId,
    required this.identityAssurance,
    this.credential,
    this.credentialExpiresAt,
    required this.devicePublicKey,
    required this.consentVersion,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String? opaqueSubjectId;
  final IdentityAssurance identityAssurance;
  final String? credential;
  final DateTime? credentialExpiresAt;
  final String devicePublicKey;
  final String consentVersion;
  final DateTime createdAt;
  final DateTime updatedAt;
}
