import '../../../data/local/enums.dart';

/// Incidente o señal del dominio público.
class UserIncident {
  const UserIncident({
    required this.id,
    required this.reporterProfileId,
    required this.category,
    required this.priority,
    this.peopleCount,
    this.shortNote,
    this.latitude,
    this.longitude,
    this.accuracyMeters,
    required this.locationSource,
    required this.createdAt,
    required this.updatedAt,
    required this.status,
    required this.identityAssurance,
  });

  final String id;
  final String reporterProfileId;
  final IncidentCategory category;
  final IncidentPriority priority;
  final int? peopleCount;
  final String? shortNote;
  final double? latitude;
  final double? longitude;
  final double? accuracyMeters;
  final LocationSource locationSource;
  final DateTime createdAt;
  final DateTime updatedAt;
  final IncidentStatus status;
  final IdentityAssurance identityAssurance;

  UserIncident copyWith({
    IncidentStatus? status,
    DateTime? updatedAt,
  }) =>
      UserIncident(
        id: id,
        reporterProfileId: reporterProfileId,
        category: category,
        priority: priority,
        peopleCount: peopleCount,
        shortNote: shortNote,
        latitude: latitude,
        longitude: longitude,
        accuracyMeters: accuracyMeters,
        locationSource: locationSource,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        status: status ?? this.status,
        identityAssurance: identityAssurance,
      );
}
