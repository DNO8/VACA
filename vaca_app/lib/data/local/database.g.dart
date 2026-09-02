// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $IdentityProfilesTable extends IdentityProfiles
    with TableInfo<$IdentityProfilesTable, IdentityProfile> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $IdentityProfilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _opaqueSubjectIdMeta =
      const VerificationMeta('opaqueSubjectId');
  @override
  late final GeneratedColumn<String> opaqueSubjectId = GeneratedColumn<String>(
      'opaque_subject_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  @override
  late final GeneratedColumnWithTypeConverter<IdentityAssurance, int>
      identityAssurance = GeneratedColumn<int>(
              'identity_assurance', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IdentityAssurance>(
              $IdentityProfilesTable.$converteridentityAssurance);
  static const VerificationMeta _credentialMeta =
      const VerificationMeta('credential');
  @override
  late final GeneratedColumn<String> credential = GeneratedColumn<String>(
      'credential', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _credentialExpiresAtMeta =
      const VerificationMeta('credentialExpiresAt');
  @override
  late final GeneratedColumn<DateTime> credentialExpiresAt =
      GeneratedColumn<DateTime>('credential_expires_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _devicePublicKeyMeta =
      const VerificationMeta('devicePublicKey');
  @override
  late final GeneratedColumn<String> devicePublicKey = GeneratedColumn<String>(
      'device_public_key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _consentVersionMeta =
      const VerificationMeta('consentVersion');
  @override
  late final GeneratedColumn<String> consentVersion = GeneratedColumn<String>(
      'consent_version', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        opaqueSubjectId,
        identityAssurance,
        credential,
        credentialExpiresAt,
        devicePublicKey,
        consentVersion,
        createdAt,
        updatedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'identity_profiles';
  @override
  VerificationContext validateIntegrity(Insertable<IdentityProfile> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('opaque_subject_id')) {
      context.handle(
          _opaqueSubjectIdMeta,
          opaqueSubjectId.isAcceptableOrUnknown(
              data['opaque_subject_id']!, _opaqueSubjectIdMeta));
    }
    if (data.containsKey('credential')) {
      context.handle(
          _credentialMeta,
          credential.isAcceptableOrUnknown(
              data['credential']!, _credentialMeta));
    }
    if (data.containsKey('credential_expires_at')) {
      context.handle(
          _credentialExpiresAtMeta,
          credentialExpiresAt.isAcceptableOrUnknown(
              data['credential_expires_at']!, _credentialExpiresAtMeta));
    }
    if (data.containsKey('device_public_key')) {
      context.handle(
          _devicePublicKeyMeta,
          devicePublicKey.isAcceptableOrUnknown(
              data['device_public_key']!, _devicePublicKeyMeta));
    } else if (isInserting) {
      context.missing(_devicePublicKeyMeta);
    }
    if (data.containsKey('consent_version')) {
      context.handle(
          _consentVersionMeta,
          consentVersion.isAcceptableOrUnknown(
              data['consent_version']!, _consentVersionMeta));
    } else if (isInserting) {
      context.missing(_consentVersionMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  IdentityProfile map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return IdentityProfile(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      opaqueSubjectId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}opaque_subject_id']),
      identityAssurance: $IdentityProfilesTable.$converteridentityAssurance
          .fromSql(attachedDatabase.typeMapping.read(
              DriftSqlType.int, data['${effectivePrefix}identity_assurance'])!),
      credential: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}credential']),
      credentialExpiresAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime,
          data['${effectivePrefix}credential_expires_at']),
      devicePublicKey: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}device_public_key'])!,
      consentVersion: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}consent_version'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $IdentityProfilesTable createAlias(String alias) {
    return $IdentityProfilesTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<IdentityAssurance, int, int>
      $converteridentityAssurance =
      const EnumIndexConverter<IdentityAssurance>(IdentityAssurance.values);
}

class IdentityProfile extends DataClass implements Insertable<IdentityProfile> {
  final String id;
  final String? opaqueSubjectId;
  final IdentityAssurance identityAssurance;
  final String? credential;
  final DateTime? credentialExpiresAt;
  final String devicePublicKey;
  final String consentVersion;
  final DateTime createdAt;
  final DateTime updatedAt;
  const IdentityProfile(
      {required this.id,
      this.opaqueSubjectId,
      required this.identityAssurance,
      this.credential,
      this.credentialExpiresAt,
      required this.devicePublicKey,
      required this.consentVersion,
      required this.createdAt,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || opaqueSubjectId != null) {
      map['opaque_subject_id'] = Variable<String>(opaqueSubjectId);
    }
    {
      map['identity_assurance'] = Variable<int>($IdentityProfilesTable
          .$converteridentityAssurance
          .toSql(identityAssurance));
    }
    if (!nullToAbsent || credential != null) {
      map['credential'] = Variable<String>(credential);
    }
    if (!nullToAbsent || credentialExpiresAt != null) {
      map['credential_expires_at'] = Variable<DateTime>(credentialExpiresAt);
    }
    map['device_public_key'] = Variable<String>(devicePublicKey);
    map['consent_version'] = Variable<String>(consentVersion);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  IdentityProfilesCompanion toCompanion(bool nullToAbsent) {
    return IdentityProfilesCompanion(
      id: Value(id),
      opaqueSubjectId: opaqueSubjectId == null && nullToAbsent
          ? const Value.absent()
          : Value(opaqueSubjectId),
      identityAssurance: Value(identityAssurance),
      credential: credential == null && nullToAbsent
          ? const Value.absent()
          : Value(credential),
      credentialExpiresAt: credentialExpiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(credentialExpiresAt),
      devicePublicKey: Value(devicePublicKey),
      consentVersion: Value(consentVersion),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory IdentityProfile.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return IdentityProfile(
      id: serializer.fromJson<String>(json['id']),
      opaqueSubjectId: serializer.fromJson<String?>(json['opaqueSubjectId']),
      identityAssurance: $IdentityProfilesTable.$converteridentityAssurance
          .fromJson(serializer.fromJson<int>(json['identityAssurance'])),
      credential: serializer.fromJson<String?>(json['credential']),
      credentialExpiresAt:
          serializer.fromJson<DateTime?>(json['credentialExpiresAt']),
      devicePublicKey: serializer.fromJson<String>(json['devicePublicKey']),
      consentVersion: serializer.fromJson<String>(json['consentVersion']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'opaqueSubjectId': serializer.toJson<String?>(opaqueSubjectId),
      'identityAssurance': serializer.toJson<int>($IdentityProfilesTable
          .$converteridentityAssurance
          .toJson(identityAssurance)),
      'credential': serializer.toJson<String?>(credential),
      'credentialExpiresAt': serializer.toJson<DateTime?>(credentialExpiresAt),
      'devicePublicKey': serializer.toJson<String>(devicePublicKey),
      'consentVersion': serializer.toJson<String>(consentVersion),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  IdentityProfile copyWith(
          {String? id,
          Value<String?> opaqueSubjectId = const Value.absent(),
          IdentityAssurance? identityAssurance,
          Value<String?> credential = const Value.absent(),
          Value<DateTime?> credentialExpiresAt = const Value.absent(),
          String? devicePublicKey,
          String? consentVersion,
          DateTime? createdAt,
          DateTime? updatedAt}) =>
      IdentityProfile(
        id: id ?? this.id,
        opaqueSubjectId: opaqueSubjectId.present
            ? opaqueSubjectId.value
            : this.opaqueSubjectId,
        identityAssurance: identityAssurance ?? this.identityAssurance,
        credential: credential.present ? credential.value : this.credential,
        credentialExpiresAt: credentialExpiresAt.present
            ? credentialExpiresAt.value
            : this.credentialExpiresAt,
        devicePublicKey: devicePublicKey ?? this.devicePublicKey,
        consentVersion: consentVersion ?? this.consentVersion,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  IdentityProfile copyWithCompanion(IdentityProfilesCompanion data) {
    return IdentityProfile(
      id: data.id.present ? data.id.value : this.id,
      opaqueSubjectId: data.opaqueSubjectId.present
          ? data.opaqueSubjectId.value
          : this.opaqueSubjectId,
      identityAssurance: data.identityAssurance.present
          ? data.identityAssurance.value
          : this.identityAssurance,
      credential:
          data.credential.present ? data.credential.value : this.credential,
      credentialExpiresAt: data.credentialExpiresAt.present
          ? data.credentialExpiresAt.value
          : this.credentialExpiresAt,
      devicePublicKey: data.devicePublicKey.present
          ? data.devicePublicKey.value
          : this.devicePublicKey,
      consentVersion: data.consentVersion.present
          ? data.consentVersion.value
          : this.consentVersion,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('IdentityProfile(')
          ..write('id: $id, ')
          ..write('opaqueSubjectId: $opaqueSubjectId, ')
          ..write('identityAssurance: $identityAssurance, ')
          ..write('credential: $credential, ')
          ..write('credentialExpiresAt: $credentialExpiresAt, ')
          ..write('devicePublicKey: $devicePublicKey, ')
          ..write('consentVersion: $consentVersion, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      opaqueSubjectId,
      identityAssurance,
      credential,
      credentialExpiresAt,
      devicePublicKey,
      consentVersion,
      createdAt,
      updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is IdentityProfile &&
          other.id == this.id &&
          other.opaqueSubjectId == this.opaqueSubjectId &&
          other.identityAssurance == this.identityAssurance &&
          other.credential == this.credential &&
          other.credentialExpiresAt == this.credentialExpiresAt &&
          other.devicePublicKey == this.devicePublicKey &&
          other.consentVersion == this.consentVersion &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class IdentityProfilesCompanion extends UpdateCompanion<IdentityProfile> {
  final Value<String> id;
  final Value<String?> opaqueSubjectId;
  final Value<IdentityAssurance> identityAssurance;
  final Value<String?> credential;
  final Value<DateTime?> credentialExpiresAt;
  final Value<String> devicePublicKey;
  final Value<String> consentVersion;
  final Value<DateTime> createdAt;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const IdentityProfilesCompanion({
    this.id = const Value.absent(),
    this.opaqueSubjectId = const Value.absent(),
    this.identityAssurance = const Value.absent(),
    this.credential = const Value.absent(),
    this.credentialExpiresAt = const Value.absent(),
    this.devicePublicKey = const Value.absent(),
    this.consentVersion = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  IdentityProfilesCompanion.insert({
    required String id,
    this.opaqueSubjectId = const Value.absent(),
    required IdentityAssurance identityAssurance,
    this.credential = const Value.absent(),
    this.credentialExpiresAt = const Value.absent(),
    required String devicePublicKey,
    required String consentVersion,
    required DateTime createdAt,
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        identityAssurance = Value(identityAssurance),
        devicePublicKey = Value(devicePublicKey),
        consentVersion = Value(consentVersion),
        createdAt = Value(createdAt),
        updatedAt = Value(updatedAt);
  static Insertable<IdentityProfile> custom({
    Expression<String>? id,
    Expression<String>? opaqueSubjectId,
    Expression<int>? identityAssurance,
    Expression<String>? credential,
    Expression<DateTime>? credentialExpiresAt,
    Expression<String>? devicePublicKey,
    Expression<String>? consentVersion,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (opaqueSubjectId != null) 'opaque_subject_id': opaqueSubjectId,
      if (identityAssurance != null) 'identity_assurance': identityAssurance,
      if (credential != null) 'credential': credential,
      if (credentialExpiresAt != null)
        'credential_expires_at': credentialExpiresAt,
      if (devicePublicKey != null) 'device_public_key': devicePublicKey,
      if (consentVersion != null) 'consent_version': consentVersion,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  IdentityProfilesCompanion copyWith(
      {Value<String>? id,
      Value<String?>? opaqueSubjectId,
      Value<IdentityAssurance>? identityAssurance,
      Value<String?>? credential,
      Value<DateTime?>? credentialExpiresAt,
      Value<String>? devicePublicKey,
      Value<String>? consentVersion,
      Value<DateTime>? createdAt,
      Value<DateTime>? updatedAt,
      Value<int>? rowid}) {
    return IdentityProfilesCompanion(
      id: id ?? this.id,
      opaqueSubjectId: opaqueSubjectId ?? this.opaqueSubjectId,
      identityAssurance: identityAssurance ?? this.identityAssurance,
      credential: credential ?? this.credential,
      credentialExpiresAt: credentialExpiresAt ?? this.credentialExpiresAt,
      devicePublicKey: devicePublicKey ?? this.devicePublicKey,
      consentVersion: consentVersion ?? this.consentVersion,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (opaqueSubjectId.present) {
      map['opaque_subject_id'] = Variable<String>(opaqueSubjectId.value);
    }
    if (identityAssurance.present) {
      map['identity_assurance'] = Variable<int>($IdentityProfilesTable
          .$converteridentityAssurance
          .toSql(identityAssurance.value));
    }
    if (credential.present) {
      map['credential'] = Variable<String>(credential.value);
    }
    if (credentialExpiresAt.present) {
      map['credential_expires_at'] =
          Variable<DateTime>(credentialExpiresAt.value);
    }
    if (devicePublicKey.present) {
      map['device_public_key'] = Variable<String>(devicePublicKey.value);
    }
    if (consentVersion.present) {
      map['consent_version'] = Variable<String>(consentVersion.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('IdentityProfilesCompanion(')
          ..write('id: $id, ')
          ..write('opaqueSubjectId: $opaqueSubjectId, ')
          ..write('identityAssurance: $identityAssurance, ')
          ..write('credential: $credential, ')
          ..write('credentialExpiresAt: $credentialExpiresAt, ')
          ..write('devicePublicKey: $devicePublicKey, ')
          ..write('consentVersion: $consentVersion, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $IncidentsTable extends Incidents
    with TableInfo<$IncidentsTable, Incident> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $IncidentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _reporterProfileIdMeta =
      const VerificationMeta('reporterProfileId');
  @override
  late final GeneratedColumn<String> reporterProfileId =
      GeneratedColumn<String>('reporter_profile_id', aliasedName, false,
          type: DriftSqlType.string,
          requiredDuringInsert: true,
          defaultConstraints: GeneratedColumn.constraintIsAlways(
              'REFERENCES identity_profiles (id)'));
  @override
  late final GeneratedColumnWithTypeConverter<IncidentCategory, int> category =
      GeneratedColumn<int>('category', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IncidentCategory>($IncidentsTable.$convertercategory);
  @override
  late final GeneratedColumnWithTypeConverter<IncidentPriority, int> priority =
      GeneratedColumn<int>('priority', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IncidentPriority>($IncidentsTable.$converterpriority);
  static const VerificationMeta _peopleCountMeta =
      const VerificationMeta('peopleCount');
  @override
  late final GeneratedColumn<int> peopleCount = GeneratedColumn<int>(
      'people_count', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _shortNoteMeta =
      const VerificationMeta('shortNote');
  @override
  late final GeneratedColumn<String> shortNote = GeneratedColumn<String>(
      'short_note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _latitudeMeta =
      const VerificationMeta('latitude');
  @override
  late final GeneratedColumn<double> latitude = GeneratedColumn<double>(
      'latitude', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _longitudeMeta =
      const VerificationMeta('longitude');
  @override
  late final GeneratedColumn<double> longitude = GeneratedColumn<double>(
      'longitude', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _accuracyMetersMeta =
      const VerificationMeta('accuracyMeters');
  @override
  late final GeneratedColumn<double> accuracyMeters = GeneratedColumn<double>(
      'accuracy_meters', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  @override
  late final GeneratedColumnWithTypeConverter<LocationSource, int>
      locationSource = GeneratedColumn<int>(
              'location_source', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<LocationSource>(
              $IncidentsTable.$converterlocationSource);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  late final GeneratedColumnWithTypeConverter<IncidentStatus, int> status =
      GeneratedColumn<int>('status', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IncidentStatus>($IncidentsTable.$converterstatus);
  @override
  late final GeneratedColumnWithTypeConverter<IdentityAssurance, int>
      identityAssurance = GeneratedColumn<int>(
              'identity_assurance', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IdentityAssurance>(
              $IncidentsTable.$converteridentityAssurance);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        reporterProfileId,
        category,
        priority,
        peopleCount,
        shortNote,
        latitude,
        longitude,
        accuracyMeters,
        locationSource,
        createdAt,
        updatedAt,
        status,
        identityAssurance
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'incidents';
  @override
  VerificationContext validateIntegrity(Insertable<Incident> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('reporter_profile_id')) {
      context.handle(
          _reporterProfileIdMeta,
          reporterProfileId.isAcceptableOrUnknown(
              data['reporter_profile_id']!, _reporterProfileIdMeta));
    } else if (isInserting) {
      context.missing(_reporterProfileIdMeta);
    }
    if (data.containsKey('people_count')) {
      context.handle(
          _peopleCountMeta,
          peopleCount.isAcceptableOrUnknown(
              data['people_count']!, _peopleCountMeta));
    }
    if (data.containsKey('short_note')) {
      context.handle(_shortNoteMeta,
          shortNote.isAcceptableOrUnknown(data['short_note']!, _shortNoteMeta));
    }
    if (data.containsKey('latitude')) {
      context.handle(_latitudeMeta,
          latitude.isAcceptableOrUnknown(data['latitude']!, _latitudeMeta));
    }
    if (data.containsKey('longitude')) {
      context.handle(_longitudeMeta,
          longitude.isAcceptableOrUnknown(data['longitude']!, _longitudeMeta));
    }
    if (data.containsKey('accuracy_meters')) {
      context.handle(
          _accuracyMetersMeta,
          accuracyMeters.isAcceptableOrUnknown(
              data['accuracy_meters']!, _accuracyMetersMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Incident map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Incident(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      reporterProfileId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}reporter_profile_id'])!,
      category: $IncidentsTable.$convertercategory.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}category'])!),
      priority: $IncidentsTable.$converterpriority.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}priority'])!),
      peopleCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}people_count']),
      shortNote: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}short_note']),
      latitude: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}latitude']),
      longitude: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}longitude']),
      accuracyMeters: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}accuracy_meters']),
      locationSource: $IncidentsTable.$converterlocationSource.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.int, data['${effectivePrefix}location_source'])!),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
      status: $IncidentsTable.$converterstatus.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}status'])!),
      identityAssurance: $IncidentsTable.$converteridentityAssurance.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.int, data['${effectivePrefix}identity_assurance'])!),
    );
  }

  @override
  $IncidentsTable createAlias(String alias) {
    return $IncidentsTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<IncidentCategory, int, int> $convertercategory =
      const EnumIndexConverter<IncidentCategory>(IncidentCategory.values);
  static JsonTypeConverter2<IncidentPriority, int, int> $converterpriority =
      const EnumIndexConverter<IncidentPriority>(IncidentPriority.values);
  static JsonTypeConverter2<LocationSource, int, int> $converterlocationSource =
      const EnumIndexConverter<LocationSource>(LocationSource.values);
  static JsonTypeConverter2<IncidentStatus, int, int> $converterstatus =
      const EnumIndexConverter<IncidentStatus>(IncidentStatus.values);
  static JsonTypeConverter2<IdentityAssurance, int, int>
      $converteridentityAssurance =
      const EnumIndexConverter<IdentityAssurance>(IdentityAssurance.values);
}

class Incident extends DataClass implements Insertable<Incident> {
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
  const Incident(
      {required this.id,
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
      required this.identityAssurance});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['reporter_profile_id'] = Variable<String>(reporterProfileId);
    {
      map['category'] =
          Variable<int>($IncidentsTable.$convertercategory.toSql(category));
    }
    {
      map['priority'] =
          Variable<int>($IncidentsTable.$converterpriority.toSql(priority));
    }
    if (!nullToAbsent || peopleCount != null) {
      map['people_count'] = Variable<int>(peopleCount);
    }
    if (!nullToAbsent || shortNote != null) {
      map['short_note'] = Variable<String>(shortNote);
    }
    if (!nullToAbsent || latitude != null) {
      map['latitude'] = Variable<double>(latitude);
    }
    if (!nullToAbsent || longitude != null) {
      map['longitude'] = Variable<double>(longitude);
    }
    if (!nullToAbsent || accuracyMeters != null) {
      map['accuracy_meters'] = Variable<double>(accuracyMeters);
    }
    {
      map['location_source'] = Variable<int>(
          $IncidentsTable.$converterlocationSource.toSql(locationSource));
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    {
      map['status'] =
          Variable<int>($IncidentsTable.$converterstatus.toSql(status));
    }
    {
      map['identity_assurance'] = Variable<int>(
          $IncidentsTable.$converteridentityAssurance.toSql(identityAssurance));
    }
    return map;
  }

  IncidentsCompanion toCompanion(bool nullToAbsent) {
    return IncidentsCompanion(
      id: Value(id),
      reporterProfileId: Value(reporterProfileId),
      category: Value(category),
      priority: Value(priority),
      peopleCount: peopleCount == null && nullToAbsent
          ? const Value.absent()
          : Value(peopleCount),
      shortNote: shortNote == null && nullToAbsent
          ? const Value.absent()
          : Value(shortNote),
      latitude: latitude == null && nullToAbsent
          ? const Value.absent()
          : Value(latitude),
      longitude: longitude == null && nullToAbsent
          ? const Value.absent()
          : Value(longitude),
      accuracyMeters: accuracyMeters == null && nullToAbsent
          ? const Value.absent()
          : Value(accuracyMeters),
      locationSource: Value(locationSource),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
      status: Value(status),
      identityAssurance: Value(identityAssurance),
    );
  }

  factory Incident.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Incident(
      id: serializer.fromJson<String>(json['id']),
      reporterProfileId: serializer.fromJson<String>(json['reporterProfileId']),
      category: $IncidentsTable.$convertercategory
          .fromJson(serializer.fromJson<int>(json['category'])),
      priority: $IncidentsTable.$converterpriority
          .fromJson(serializer.fromJson<int>(json['priority'])),
      peopleCount: serializer.fromJson<int?>(json['peopleCount']),
      shortNote: serializer.fromJson<String?>(json['shortNote']),
      latitude: serializer.fromJson<double?>(json['latitude']),
      longitude: serializer.fromJson<double?>(json['longitude']),
      accuracyMeters: serializer.fromJson<double?>(json['accuracyMeters']),
      locationSource: $IncidentsTable.$converterlocationSource
          .fromJson(serializer.fromJson<int>(json['locationSource'])),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      status: $IncidentsTable.$converterstatus
          .fromJson(serializer.fromJson<int>(json['status'])),
      identityAssurance: $IncidentsTable.$converteridentityAssurance
          .fromJson(serializer.fromJson<int>(json['identityAssurance'])),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'reporterProfileId': serializer.toJson<String>(reporterProfileId),
      'category': serializer
          .toJson<int>($IncidentsTable.$convertercategory.toJson(category)),
      'priority': serializer
          .toJson<int>($IncidentsTable.$converterpriority.toJson(priority)),
      'peopleCount': serializer.toJson<int?>(peopleCount),
      'shortNote': serializer.toJson<String?>(shortNote),
      'latitude': serializer.toJson<double?>(latitude),
      'longitude': serializer.toJson<double?>(longitude),
      'accuracyMeters': serializer.toJson<double?>(accuracyMeters),
      'locationSource': serializer.toJson<int>(
          $IncidentsTable.$converterlocationSource.toJson(locationSource)),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'status': serializer
          .toJson<int>($IncidentsTable.$converterstatus.toJson(status)),
      'identityAssurance': serializer.toJson<int>($IncidentsTable
          .$converteridentityAssurance
          .toJson(identityAssurance)),
    };
  }

  Incident copyWith(
          {String? id,
          String? reporterProfileId,
          IncidentCategory? category,
          IncidentPriority? priority,
          Value<int?> peopleCount = const Value.absent(),
          Value<String?> shortNote = const Value.absent(),
          Value<double?> latitude = const Value.absent(),
          Value<double?> longitude = const Value.absent(),
          Value<double?> accuracyMeters = const Value.absent(),
          LocationSource? locationSource,
          DateTime? createdAt,
          DateTime? updatedAt,
          IncidentStatus? status,
          IdentityAssurance? identityAssurance}) =>
      Incident(
        id: id ?? this.id,
        reporterProfileId: reporterProfileId ?? this.reporterProfileId,
        category: category ?? this.category,
        priority: priority ?? this.priority,
        peopleCount: peopleCount.present ? peopleCount.value : this.peopleCount,
        shortNote: shortNote.present ? shortNote.value : this.shortNote,
        latitude: latitude.present ? latitude.value : this.latitude,
        longitude: longitude.present ? longitude.value : this.longitude,
        accuracyMeters:
            accuracyMeters.present ? accuracyMeters.value : this.accuracyMeters,
        locationSource: locationSource ?? this.locationSource,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        status: status ?? this.status,
        identityAssurance: identityAssurance ?? this.identityAssurance,
      );
  Incident copyWithCompanion(IncidentsCompanion data) {
    return Incident(
      id: data.id.present ? data.id.value : this.id,
      reporterProfileId: data.reporterProfileId.present
          ? data.reporterProfileId.value
          : this.reporterProfileId,
      category: data.category.present ? data.category.value : this.category,
      priority: data.priority.present ? data.priority.value : this.priority,
      peopleCount:
          data.peopleCount.present ? data.peopleCount.value : this.peopleCount,
      shortNote: data.shortNote.present ? data.shortNote.value : this.shortNote,
      latitude: data.latitude.present ? data.latitude.value : this.latitude,
      longitude: data.longitude.present ? data.longitude.value : this.longitude,
      accuracyMeters: data.accuracyMeters.present
          ? data.accuracyMeters.value
          : this.accuracyMeters,
      locationSource: data.locationSource.present
          ? data.locationSource.value
          : this.locationSource,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      status: data.status.present ? data.status.value : this.status,
      identityAssurance: data.identityAssurance.present
          ? data.identityAssurance.value
          : this.identityAssurance,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Incident(')
          ..write('id: $id, ')
          ..write('reporterProfileId: $reporterProfileId, ')
          ..write('category: $category, ')
          ..write('priority: $priority, ')
          ..write('peopleCount: $peopleCount, ')
          ..write('shortNote: $shortNote, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('accuracyMeters: $accuracyMeters, ')
          ..write('locationSource: $locationSource, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('status: $status, ')
          ..write('identityAssurance: $identityAssurance')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      reporterProfileId,
      category,
      priority,
      peopleCount,
      shortNote,
      latitude,
      longitude,
      accuracyMeters,
      locationSource,
      createdAt,
      updatedAt,
      status,
      identityAssurance);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Incident &&
          other.id == this.id &&
          other.reporterProfileId == this.reporterProfileId &&
          other.category == this.category &&
          other.priority == this.priority &&
          other.peopleCount == this.peopleCount &&
          other.shortNote == this.shortNote &&
          other.latitude == this.latitude &&
          other.longitude == this.longitude &&
          other.accuracyMeters == this.accuracyMeters &&
          other.locationSource == this.locationSource &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt &&
          other.status == this.status &&
          other.identityAssurance == this.identityAssurance);
}

class IncidentsCompanion extends UpdateCompanion<Incident> {
  final Value<String> id;
  final Value<String> reporterProfileId;
  final Value<IncidentCategory> category;
  final Value<IncidentPriority> priority;
  final Value<int?> peopleCount;
  final Value<String?> shortNote;
  final Value<double?> latitude;
  final Value<double?> longitude;
  final Value<double?> accuracyMeters;
  final Value<LocationSource> locationSource;
  final Value<DateTime> createdAt;
  final Value<DateTime> updatedAt;
  final Value<IncidentStatus> status;
  final Value<IdentityAssurance> identityAssurance;
  final Value<int> rowid;
  const IncidentsCompanion({
    this.id = const Value.absent(),
    this.reporterProfileId = const Value.absent(),
    this.category = const Value.absent(),
    this.priority = const Value.absent(),
    this.peopleCount = const Value.absent(),
    this.shortNote = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.accuracyMeters = const Value.absent(),
    this.locationSource = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.status = const Value.absent(),
    this.identityAssurance = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  IncidentsCompanion.insert({
    required String id,
    required String reporterProfileId,
    required IncidentCategory category,
    required IncidentPriority priority,
    this.peopleCount = const Value.absent(),
    this.shortNote = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.accuracyMeters = const Value.absent(),
    required LocationSource locationSource,
    required DateTime createdAt,
    required DateTime updatedAt,
    required IncidentStatus status,
    required IdentityAssurance identityAssurance,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        reporterProfileId = Value(reporterProfileId),
        category = Value(category),
        priority = Value(priority),
        locationSource = Value(locationSource),
        createdAt = Value(createdAt),
        updatedAt = Value(updatedAt),
        status = Value(status),
        identityAssurance = Value(identityAssurance);
  static Insertable<Incident> custom({
    Expression<String>? id,
    Expression<String>? reporterProfileId,
    Expression<int>? category,
    Expression<int>? priority,
    Expression<int>? peopleCount,
    Expression<String>? shortNote,
    Expression<double>? latitude,
    Expression<double>? longitude,
    Expression<double>? accuracyMeters,
    Expression<int>? locationSource,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? updatedAt,
    Expression<int>? status,
    Expression<int>? identityAssurance,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (reporterProfileId != null) 'reporter_profile_id': reporterProfileId,
      if (category != null) 'category': category,
      if (priority != null) 'priority': priority,
      if (peopleCount != null) 'people_count': peopleCount,
      if (shortNote != null) 'short_note': shortNote,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (accuracyMeters != null) 'accuracy_meters': accuracyMeters,
      if (locationSource != null) 'location_source': locationSource,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (status != null) 'status': status,
      if (identityAssurance != null) 'identity_assurance': identityAssurance,
      if (rowid != null) 'rowid': rowid,
    });
  }

  IncidentsCompanion copyWith(
      {Value<String>? id,
      Value<String>? reporterProfileId,
      Value<IncidentCategory>? category,
      Value<IncidentPriority>? priority,
      Value<int?>? peopleCount,
      Value<String?>? shortNote,
      Value<double?>? latitude,
      Value<double?>? longitude,
      Value<double?>? accuracyMeters,
      Value<LocationSource>? locationSource,
      Value<DateTime>? createdAt,
      Value<DateTime>? updatedAt,
      Value<IncidentStatus>? status,
      Value<IdentityAssurance>? identityAssurance,
      Value<int>? rowid}) {
    return IncidentsCompanion(
      id: id ?? this.id,
      reporterProfileId: reporterProfileId ?? this.reporterProfileId,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      peopleCount: peopleCount ?? this.peopleCount,
      shortNote: shortNote ?? this.shortNote,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      accuracyMeters: accuracyMeters ?? this.accuracyMeters,
      locationSource: locationSource ?? this.locationSource,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      status: status ?? this.status,
      identityAssurance: identityAssurance ?? this.identityAssurance,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (reporterProfileId.present) {
      map['reporter_profile_id'] = Variable<String>(reporterProfileId.value);
    }
    if (category.present) {
      map['category'] = Variable<int>(
          $IncidentsTable.$convertercategory.toSql(category.value));
    }
    if (priority.present) {
      map['priority'] = Variable<int>(
          $IncidentsTable.$converterpriority.toSql(priority.value));
    }
    if (peopleCount.present) {
      map['people_count'] = Variable<int>(peopleCount.value);
    }
    if (shortNote.present) {
      map['short_note'] = Variable<String>(shortNote.value);
    }
    if (latitude.present) {
      map['latitude'] = Variable<double>(latitude.value);
    }
    if (longitude.present) {
      map['longitude'] = Variable<double>(longitude.value);
    }
    if (accuracyMeters.present) {
      map['accuracy_meters'] = Variable<double>(accuracyMeters.value);
    }
    if (locationSource.present) {
      map['location_source'] = Variable<int>(
          $IncidentsTable.$converterlocationSource.toSql(locationSource.value));
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (status.present) {
      map['status'] =
          Variable<int>($IncidentsTable.$converterstatus.toSql(status.value));
    }
    if (identityAssurance.present) {
      map['identity_assurance'] = Variable<int>($IncidentsTable
          .$converteridentityAssurance
          .toSql(identityAssurance.value));
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('IncidentsCompanion(')
          ..write('id: $id, ')
          ..write('reporterProfileId: $reporterProfileId, ')
          ..write('category: $category, ')
          ..write('priority: $priority, ')
          ..write('peopleCount: $peopleCount, ')
          ..write('shortNote: $shortNote, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('accuracyMeters: $accuracyMeters, ')
          ..write('locationSource: $locationSource, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('status: $status, ')
          ..write('identityAssurance: $identityAssurance, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $IncidentEventsTable extends IncidentEvents
    with TableInfo<$IncidentEventsTable, IncidentEvent> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $IncidentEventsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _incidentIdMeta =
      const VerificationMeta('incidentId');
  @override
  late final GeneratedColumn<String> incidentId = GeneratedColumn<String>(
      'incident_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES incidents (id)'));
  @override
  late final GeneratedColumnWithTypeConverter<EventType, int> eventType =
      GeneratedColumn<int>('event_type', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<EventType>($IncidentEventsTable.$convertereventType);
  static const VerificationMeta _signerMeta = const VerificationMeta('signer');
  @override
  late final GeneratedColumn<String> signer = GeneratedColumn<String>(
      'signer', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _signatureMeta =
      const VerificationMeta('signature');
  @override
  late final GeneratedColumn<String> signature = GeneratedColumn<String>(
      'signature', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _timestampMeta =
      const VerificationMeta('timestamp');
  @override
  late final GeneratedColumn<DateTime> timestamp = GeneratedColumn<DateTime>(
      'timestamp', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _payloadHashMeta =
      const VerificationMeta('payloadHash');
  @override
  late final GeneratedColumn<String> payloadHash = GeneratedColumn<String>(
      'payload_hash', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, incidentId, eventType, signer, signature, timestamp, payloadHash];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'incident_events';
  @override
  VerificationContext validateIntegrity(Insertable<IncidentEvent> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('incident_id')) {
      context.handle(
          _incidentIdMeta,
          incidentId.isAcceptableOrUnknown(
              data['incident_id']!, _incidentIdMeta));
    } else if (isInserting) {
      context.missing(_incidentIdMeta);
    }
    if (data.containsKey('signer')) {
      context.handle(_signerMeta,
          signer.isAcceptableOrUnknown(data['signer']!, _signerMeta));
    } else if (isInserting) {
      context.missing(_signerMeta);
    }
    if (data.containsKey('signature')) {
      context.handle(_signatureMeta,
          signature.isAcceptableOrUnknown(data['signature']!, _signatureMeta));
    } else if (isInserting) {
      context.missing(_signatureMeta);
    }
    if (data.containsKey('timestamp')) {
      context.handle(_timestampMeta,
          timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta));
    } else if (isInserting) {
      context.missing(_timestampMeta);
    }
    if (data.containsKey('payload_hash')) {
      context.handle(
          _payloadHashMeta,
          payloadHash.isAcceptableOrUnknown(
              data['payload_hash']!, _payloadHashMeta));
    } else if (isInserting) {
      context.missing(_payloadHashMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  IncidentEvent map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return IncidentEvent(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      incidentId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}incident_id'])!,
      eventType: $IncidentEventsTable.$convertereventType.fromSql(
          attachedDatabase.typeMapping
              .read(DriftSqlType.int, data['${effectivePrefix}event_type'])!),
      signer: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}signer'])!,
      signature: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}signature'])!,
      timestamp: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}timestamp'])!,
      payloadHash: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_hash'])!,
    );
  }

  @override
  $IncidentEventsTable createAlias(String alias) {
    return $IncidentEventsTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<EventType, int, int> $convertereventType =
      const EnumIndexConverter<EventType>(EventType.values);
}

class IncidentEvent extends DataClass implements Insertable<IncidentEvent> {
  final String id;
  final String incidentId;
  final EventType eventType;
  final String signer;
  final String signature;
  final DateTime timestamp;
  final String payloadHash;
  const IncidentEvent(
      {required this.id,
      required this.incidentId,
      required this.eventType,
      required this.signer,
      required this.signature,
      required this.timestamp,
      required this.payloadHash});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['incident_id'] = Variable<String>(incidentId);
    {
      map['event_type'] = Variable<int>(
          $IncidentEventsTable.$convertereventType.toSql(eventType));
    }
    map['signer'] = Variable<String>(signer);
    map['signature'] = Variable<String>(signature);
    map['timestamp'] = Variable<DateTime>(timestamp);
    map['payload_hash'] = Variable<String>(payloadHash);
    return map;
  }

  IncidentEventsCompanion toCompanion(bool nullToAbsent) {
    return IncidentEventsCompanion(
      id: Value(id),
      incidentId: Value(incidentId),
      eventType: Value(eventType),
      signer: Value(signer),
      signature: Value(signature),
      timestamp: Value(timestamp),
      payloadHash: Value(payloadHash),
    );
  }

  factory IncidentEvent.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return IncidentEvent(
      id: serializer.fromJson<String>(json['id']),
      incidentId: serializer.fromJson<String>(json['incidentId']),
      eventType: $IncidentEventsTable.$convertereventType
          .fromJson(serializer.fromJson<int>(json['eventType'])),
      signer: serializer.fromJson<String>(json['signer']),
      signature: serializer.fromJson<String>(json['signature']),
      timestamp: serializer.fromJson<DateTime>(json['timestamp']),
      payloadHash: serializer.fromJson<String>(json['payloadHash']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'incidentId': serializer.toJson<String>(incidentId),
      'eventType': serializer.toJson<int>(
          $IncidentEventsTable.$convertereventType.toJson(eventType)),
      'signer': serializer.toJson<String>(signer),
      'signature': serializer.toJson<String>(signature),
      'timestamp': serializer.toJson<DateTime>(timestamp),
      'payloadHash': serializer.toJson<String>(payloadHash),
    };
  }

  IncidentEvent copyWith(
          {String? id,
          String? incidentId,
          EventType? eventType,
          String? signer,
          String? signature,
          DateTime? timestamp,
          String? payloadHash}) =>
      IncidentEvent(
        id: id ?? this.id,
        incidentId: incidentId ?? this.incidentId,
        eventType: eventType ?? this.eventType,
        signer: signer ?? this.signer,
        signature: signature ?? this.signature,
        timestamp: timestamp ?? this.timestamp,
        payloadHash: payloadHash ?? this.payloadHash,
      );
  IncidentEvent copyWithCompanion(IncidentEventsCompanion data) {
    return IncidentEvent(
      id: data.id.present ? data.id.value : this.id,
      incidentId:
          data.incidentId.present ? data.incidentId.value : this.incidentId,
      eventType: data.eventType.present ? data.eventType.value : this.eventType,
      signer: data.signer.present ? data.signer.value : this.signer,
      signature: data.signature.present ? data.signature.value : this.signature,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
      payloadHash:
          data.payloadHash.present ? data.payloadHash.value : this.payloadHash,
    );
  }

  @override
  String toString() {
    return (StringBuffer('IncidentEvent(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('eventType: $eventType, ')
          ..write('signer: $signer, ')
          ..write('signature: $signature, ')
          ..write('timestamp: $timestamp, ')
          ..write('payloadHash: $payloadHash')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id, incidentId, eventType, signer, signature, timestamp, payloadHash);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is IncidentEvent &&
          other.id == this.id &&
          other.incidentId == this.incidentId &&
          other.eventType == this.eventType &&
          other.signer == this.signer &&
          other.signature == this.signature &&
          other.timestamp == this.timestamp &&
          other.payloadHash == this.payloadHash);
}

class IncidentEventsCompanion extends UpdateCompanion<IncidentEvent> {
  final Value<String> id;
  final Value<String> incidentId;
  final Value<EventType> eventType;
  final Value<String> signer;
  final Value<String> signature;
  final Value<DateTime> timestamp;
  final Value<String> payloadHash;
  final Value<int> rowid;
  const IncidentEventsCompanion({
    this.id = const Value.absent(),
    this.incidentId = const Value.absent(),
    this.eventType = const Value.absent(),
    this.signer = const Value.absent(),
    this.signature = const Value.absent(),
    this.timestamp = const Value.absent(),
    this.payloadHash = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  IncidentEventsCompanion.insert({
    required String id,
    required String incidentId,
    required EventType eventType,
    required String signer,
    required String signature,
    required DateTime timestamp,
    required String payloadHash,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        incidentId = Value(incidentId),
        eventType = Value(eventType),
        signer = Value(signer),
        signature = Value(signature),
        timestamp = Value(timestamp),
        payloadHash = Value(payloadHash);
  static Insertable<IncidentEvent> custom({
    Expression<String>? id,
    Expression<String>? incidentId,
    Expression<int>? eventType,
    Expression<String>? signer,
    Expression<String>? signature,
    Expression<DateTime>? timestamp,
    Expression<String>? payloadHash,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (incidentId != null) 'incident_id': incidentId,
      if (eventType != null) 'event_type': eventType,
      if (signer != null) 'signer': signer,
      if (signature != null) 'signature': signature,
      if (timestamp != null) 'timestamp': timestamp,
      if (payloadHash != null) 'payload_hash': payloadHash,
      if (rowid != null) 'rowid': rowid,
    });
  }

  IncidentEventsCompanion copyWith(
      {Value<String>? id,
      Value<String>? incidentId,
      Value<EventType>? eventType,
      Value<String>? signer,
      Value<String>? signature,
      Value<DateTime>? timestamp,
      Value<String>? payloadHash,
      Value<int>? rowid}) {
    return IncidentEventsCompanion(
      id: id ?? this.id,
      incidentId: incidentId ?? this.incidentId,
      eventType: eventType ?? this.eventType,
      signer: signer ?? this.signer,
      signature: signature ?? this.signature,
      timestamp: timestamp ?? this.timestamp,
      payloadHash: payloadHash ?? this.payloadHash,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (incidentId.present) {
      map['incident_id'] = Variable<String>(incidentId.value);
    }
    if (eventType.present) {
      map['event_type'] = Variable<int>(
          $IncidentEventsTable.$convertereventType.toSql(eventType.value));
    }
    if (signer.present) {
      map['signer'] = Variable<String>(signer.value);
    }
    if (signature.present) {
      map['signature'] = Variable<String>(signature.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<DateTime>(timestamp.value);
    }
    if (payloadHash.present) {
      map['payload_hash'] = Variable<String>(payloadHash.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('IncidentEventsCompanion(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('eventType: $eventType, ')
          ..write('signer: $signer, ')
          ..write('signature: $signature, ')
          ..write('timestamp: $timestamp, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AttachmentsTable extends Attachments
    with TableInfo<$AttachmentsTable, Attachment> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttachmentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _incidentIdMeta =
      const VerificationMeta('incidentId');
  @override
  late final GeneratedColumn<String> incidentId = GeneratedColumn<String>(
      'incident_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES incidents (id)'));
  @override
  late final GeneratedColumnWithTypeConverter<AttachmentKind, int> kind =
      GeneratedColumn<int>('kind', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<AttachmentKind>($AttachmentsTable.$converterkind);
  static const VerificationMeta _localPathMeta =
      const VerificationMeta('localPath');
  @override
  late final GeneratedColumn<String> localPath = GeneratedColumn<String>(
      'local_path', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
      'sha256', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sizeBytesMeta =
      const VerificationMeta('sizeBytes');
  @override
  late final GeneratedColumn<int> sizeBytes = GeneratedColumn<int>(
      'size_bytes', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _capturedAtMeta =
      const VerificationMeta('capturedAt');
  @override
  late final GeneratedColumn<DateTime> capturedAt = GeneratedColumn<DateTime>(
      'captured_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  late final GeneratedColumnWithTypeConverter<AttachmentSyncStatus, int>
      syncStatus = GeneratedColumn<int>('sync_status', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<AttachmentSyncStatus>(
              $AttachmentsTable.$convertersyncStatus);
  static const VerificationMeta _remoteUrlMeta =
      const VerificationMeta('remoteUrl');
  @override
  late final GeneratedColumn<String> remoteUrl = GeneratedColumn<String>(
      'remote_url', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        incidentId,
        kind,
        localPath,
        sha256,
        sizeBytes,
        capturedAt,
        syncStatus,
        remoteUrl
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attachments';
  @override
  VerificationContext validateIntegrity(Insertable<Attachment> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('incident_id')) {
      context.handle(
          _incidentIdMeta,
          incidentId.isAcceptableOrUnknown(
              data['incident_id']!, _incidentIdMeta));
    } else if (isInserting) {
      context.missing(_incidentIdMeta);
    }
    if (data.containsKey('local_path')) {
      context.handle(_localPathMeta,
          localPath.isAcceptableOrUnknown(data['local_path']!, _localPathMeta));
    } else if (isInserting) {
      context.missing(_localPathMeta);
    }
    if (data.containsKey('sha256')) {
      context.handle(_sha256Meta,
          sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta));
    } else if (isInserting) {
      context.missing(_sha256Meta);
    }
    if (data.containsKey('size_bytes')) {
      context.handle(_sizeBytesMeta,
          sizeBytes.isAcceptableOrUnknown(data['size_bytes']!, _sizeBytesMeta));
    } else if (isInserting) {
      context.missing(_sizeBytesMeta);
    }
    if (data.containsKey('captured_at')) {
      context.handle(
          _capturedAtMeta,
          capturedAt.isAcceptableOrUnknown(
              data['captured_at']!, _capturedAtMeta));
    } else if (isInserting) {
      context.missing(_capturedAtMeta);
    }
    if (data.containsKey('remote_url')) {
      context.handle(_remoteUrlMeta,
          remoteUrl.isAcceptableOrUnknown(data['remote_url']!, _remoteUrlMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Attachment map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Attachment(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      incidentId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}incident_id'])!,
      kind: $AttachmentsTable.$converterkind.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}kind'])!),
      localPath: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}local_path'])!,
      sha256: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sha256'])!,
      sizeBytes: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}size_bytes'])!,
      capturedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}captured_at'])!,
      syncStatus: $AttachmentsTable.$convertersyncStatus.fromSql(
          attachedDatabase.typeMapping
              .read(DriftSqlType.int, data['${effectivePrefix}sync_status'])!),
      remoteUrl: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}remote_url']),
    );
  }

  @override
  $AttachmentsTable createAlias(String alias) {
    return $AttachmentsTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<AttachmentKind, int, int> $converterkind =
      const EnumIndexConverter<AttachmentKind>(AttachmentKind.values);
  static JsonTypeConverter2<AttachmentSyncStatus, int, int>
      $convertersyncStatus = const EnumIndexConverter<AttachmentSyncStatus>(
          AttachmentSyncStatus.values);
}

class Attachment extends DataClass implements Insertable<Attachment> {
  final String id;
  final String incidentId;
  final AttachmentKind kind;
  final String localPath;
  final String sha256;
  final int sizeBytes;
  final DateTime capturedAt;
  final AttachmentSyncStatus syncStatus;
  final String? remoteUrl;
  const Attachment(
      {required this.id,
      required this.incidentId,
      required this.kind,
      required this.localPath,
      required this.sha256,
      required this.sizeBytes,
      required this.capturedAt,
      required this.syncStatus,
      this.remoteUrl});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['incident_id'] = Variable<String>(incidentId);
    {
      map['kind'] = Variable<int>($AttachmentsTable.$converterkind.toSql(kind));
    }
    map['local_path'] = Variable<String>(localPath);
    map['sha256'] = Variable<String>(sha256);
    map['size_bytes'] = Variable<int>(sizeBytes);
    map['captured_at'] = Variable<DateTime>(capturedAt);
    {
      map['sync_status'] = Variable<int>(
          $AttachmentsTable.$convertersyncStatus.toSql(syncStatus));
    }
    if (!nullToAbsent || remoteUrl != null) {
      map['remote_url'] = Variable<String>(remoteUrl);
    }
    return map;
  }

  AttachmentsCompanion toCompanion(bool nullToAbsent) {
    return AttachmentsCompanion(
      id: Value(id),
      incidentId: Value(incidentId),
      kind: Value(kind),
      localPath: Value(localPath),
      sha256: Value(sha256),
      sizeBytes: Value(sizeBytes),
      capturedAt: Value(capturedAt),
      syncStatus: Value(syncStatus),
      remoteUrl: remoteUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(remoteUrl),
    );
  }

  factory Attachment.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Attachment(
      id: serializer.fromJson<String>(json['id']),
      incidentId: serializer.fromJson<String>(json['incidentId']),
      kind: $AttachmentsTable.$converterkind
          .fromJson(serializer.fromJson<int>(json['kind'])),
      localPath: serializer.fromJson<String>(json['localPath']),
      sha256: serializer.fromJson<String>(json['sha256']),
      sizeBytes: serializer.fromJson<int>(json['sizeBytes']),
      capturedAt: serializer.fromJson<DateTime>(json['capturedAt']),
      syncStatus: $AttachmentsTable.$convertersyncStatus
          .fromJson(serializer.fromJson<int>(json['syncStatus'])),
      remoteUrl: serializer.fromJson<String?>(json['remoteUrl']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'incidentId': serializer.toJson<String>(incidentId),
      'kind':
          serializer.toJson<int>($AttachmentsTable.$converterkind.toJson(kind)),
      'localPath': serializer.toJson<String>(localPath),
      'sha256': serializer.toJson<String>(sha256),
      'sizeBytes': serializer.toJson<int>(sizeBytes),
      'capturedAt': serializer.toJson<DateTime>(capturedAt),
      'syncStatus': serializer.toJson<int>(
          $AttachmentsTable.$convertersyncStatus.toJson(syncStatus)),
      'remoteUrl': serializer.toJson<String?>(remoteUrl),
    };
  }

  Attachment copyWith(
          {String? id,
          String? incidentId,
          AttachmentKind? kind,
          String? localPath,
          String? sha256,
          int? sizeBytes,
          DateTime? capturedAt,
          AttachmentSyncStatus? syncStatus,
          Value<String?> remoteUrl = const Value.absent()}) =>
      Attachment(
        id: id ?? this.id,
        incidentId: incidentId ?? this.incidentId,
        kind: kind ?? this.kind,
        localPath: localPath ?? this.localPath,
        sha256: sha256 ?? this.sha256,
        sizeBytes: sizeBytes ?? this.sizeBytes,
        capturedAt: capturedAt ?? this.capturedAt,
        syncStatus: syncStatus ?? this.syncStatus,
        remoteUrl: remoteUrl.present ? remoteUrl.value : this.remoteUrl,
      );
  Attachment copyWithCompanion(AttachmentsCompanion data) {
    return Attachment(
      id: data.id.present ? data.id.value : this.id,
      incidentId:
          data.incidentId.present ? data.incidentId.value : this.incidentId,
      kind: data.kind.present ? data.kind.value : this.kind,
      localPath: data.localPath.present ? data.localPath.value : this.localPath,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      sizeBytes: data.sizeBytes.present ? data.sizeBytes.value : this.sizeBytes,
      capturedAt:
          data.capturedAt.present ? data.capturedAt.value : this.capturedAt,
      syncStatus:
          data.syncStatus.present ? data.syncStatus.value : this.syncStatus,
      remoteUrl: data.remoteUrl.present ? data.remoteUrl.value : this.remoteUrl,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Attachment(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('kind: $kind, ')
          ..write('localPath: $localPath, ')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('remoteUrl: $remoteUrl')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, incidentId, kind, localPath, sha256,
      sizeBytes, capturedAt, syncStatus, remoteUrl);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Attachment &&
          other.id == this.id &&
          other.incidentId == this.incidentId &&
          other.kind == this.kind &&
          other.localPath == this.localPath &&
          other.sha256 == this.sha256 &&
          other.sizeBytes == this.sizeBytes &&
          other.capturedAt == this.capturedAt &&
          other.syncStatus == this.syncStatus &&
          other.remoteUrl == this.remoteUrl);
}

class AttachmentsCompanion extends UpdateCompanion<Attachment> {
  final Value<String> id;
  final Value<String> incidentId;
  final Value<AttachmentKind> kind;
  final Value<String> localPath;
  final Value<String> sha256;
  final Value<int> sizeBytes;
  final Value<DateTime> capturedAt;
  final Value<AttachmentSyncStatus> syncStatus;
  final Value<String?> remoteUrl;
  final Value<int> rowid;
  const AttachmentsCompanion({
    this.id = const Value.absent(),
    this.incidentId = const Value.absent(),
    this.kind = const Value.absent(),
    this.localPath = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.sizeBytes = const Value.absent(),
    this.capturedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.remoteUrl = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AttachmentsCompanion.insert({
    required String id,
    required String incidentId,
    required AttachmentKind kind,
    required String localPath,
    required String sha256,
    required int sizeBytes,
    required DateTime capturedAt,
    required AttachmentSyncStatus syncStatus,
    this.remoteUrl = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        incidentId = Value(incidentId),
        kind = Value(kind),
        localPath = Value(localPath),
        sha256 = Value(sha256),
        sizeBytes = Value(sizeBytes),
        capturedAt = Value(capturedAt),
        syncStatus = Value(syncStatus);
  static Insertable<Attachment> custom({
    Expression<String>? id,
    Expression<String>? incidentId,
    Expression<int>? kind,
    Expression<String>? localPath,
    Expression<String>? sha256,
    Expression<int>? sizeBytes,
    Expression<DateTime>? capturedAt,
    Expression<int>? syncStatus,
    Expression<String>? remoteUrl,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (incidentId != null) 'incident_id': incidentId,
      if (kind != null) 'kind': kind,
      if (localPath != null) 'local_path': localPath,
      if (sha256 != null) 'sha256': sha256,
      if (sizeBytes != null) 'size_bytes': sizeBytes,
      if (capturedAt != null) 'captured_at': capturedAt,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (remoteUrl != null) 'remote_url': remoteUrl,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AttachmentsCompanion copyWith(
      {Value<String>? id,
      Value<String>? incidentId,
      Value<AttachmentKind>? kind,
      Value<String>? localPath,
      Value<String>? sha256,
      Value<int>? sizeBytes,
      Value<DateTime>? capturedAt,
      Value<AttachmentSyncStatus>? syncStatus,
      Value<String?>? remoteUrl,
      Value<int>? rowid}) {
    return AttachmentsCompanion(
      id: id ?? this.id,
      incidentId: incidentId ?? this.incidentId,
      kind: kind ?? this.kind,
      localPath: localPath ?? this.localPath,
      sha256: sha256 ?? this.sha256,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      capturedAt: capturedAt ?? this.capturedAt,
      syncStatus: syncStatus ?? this.syncStatus,
      remoteUrl: remoteUrl ?? this.remoteUrl,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (incidentId.present) {
      map['incident_id'] = Variable<String>(incidentId.value);
    }
    if (kind.present) {
      map['kind'] =
          Variable<int>($AttachmentsTable.$converterkind.toSql(kind.value));
    }
    if (localPath.present) {
      map['local_path'] = Variable<String>(localPath.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (sizeBytes.present) {
      map['size_bytes'] = Variable<int>(sizeBytes.value);
    }
    if (capturedAt.present) {
      map['captured_at'] = Variable<DateTime>(capturedAt.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<int>(
          $AttachmentsTable.$convertersyncStatus.toSql(syncStatus.value));
    }
    if (remoteUrl.present) {
      map['remote_url'] = Variable<String>(remoteUrl.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttachmentsCompanion(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('kind: $kind, ')
          ..write('localPath: $localPath, ')
          ..write('sha256: $sha256, ')
          ..write('sizeBytes: $sizeBytes, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('remoteUrl: $remoteUrl, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $OriginBundlesTable extends OriginBundles
    with TableInfo<$OriginBundlesTable, OriginBundle> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OriginBundlesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _incidentIdMeta =
      const VerificationMeta('incidentId');
  @override
  late final GeneratedColumn<String> incidentId = GeneratedColumn<String>(
      'incident_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES incidents (id)'));
  static const VerificationMeta _eventIdMeta =
      const VerificationMeta('eventId');
  @override
  late final GeneratedColumn<String> eventId = GeneratedColumn<String>(
      'event_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'REFERENCES incident_events (id)'));
  @override
  late final GeneratedColumnWithTypeConverter<IncidentPriority, int> priority =
      GeneratedColumn<int>('priority', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<IncidentPriority>(
              $OriginBundlesTable.$converterpriority);
  static const VerificationMeta _canonicalHeaderMeta =
      const VerificationMeta('canonicalHeader');
  @override
  late final GeneratedColumn<String> canonicalHeader = GeneratedColumn<String>(
      'canonical_header', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _ciphertextPathMeta =
      const VerificationMeta('ciphertextPath');
  @override
  late final GeneratedColumn<String> ciphertextPath = GeneratedColumn<String>(
      'ciphertext_path', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _ciphertextBytesMeta =
      const VerificationMeta('ciphertextBytes');
  @override
  late final GeneratedColumn<Uint8List> ciphertextBytes =
      GeneratedColumn<Uint8List>('ciphertext_bytes', aliasedName, true,
          type: DriftSqlType.blob, requiredDuringInsert: false);
  static const VerificationMeta _payloadHashMeta =
      const VerificationMeta('payloadHash');
  @override
  late final GeneratedColumn<String> payloadHash = GeneratedColumn<String>(
      'payload_hash', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _expiresAtMeta =
      const VerificationMeta('expiresAt');
  @override
  late final GeneratedColumn<DateTime> expiresAt = GeneratedColumn<DateTime>(
      'expires_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  late final GeneratedColumnWithTypeConverter<DeliveryState, int> state =
      GeneratedColumn<int>('state', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<DeliveryState>($OriginBundlesTable.$converterstate);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _lastAttemptAtMeta =
      const VerificationMeta('lastAttemptAt');
  @override
  late final GeneratedColumn<DateTime> lastAttemptAt =
      GeneratedColumn<DateTime>('last_attempt_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _serverReceiptIdMeta =
      const VerificationMeta('serverReceiptId');
  @override
  late final GeneratedColumn<String> serverReceiptId = GeneratedColumn<String>(
      'server_receipt_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _hopLimitMeta =
      const VerificationMeta('hopLimit');
  @override
  late final GeneratedColumn<int> hopLimit = GeneratedColumn<int>(
      'hop_limit', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(8));
  static const VerificationMeta _copyBudgetMeta =
      const VerificationMeta('copyBudget');
  @override
  late final GeneratedColumn<int> copyBudget = GeneratedColumn<int>(
      'copy_budget', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(3));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        incidentId,
        eventId,
        priority,
        canonicalHeader,
        ciphertextPath,
        ciphertextBytes,
        payloadHash,
        expiresAt,
        state,
        createdAt,
        lastAttemptAt,
        serverReceiptId,
        hopLimit,
        copyBudget
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'origin_bundles';
  @override
  VerificationContext validateIntegrity(Insertable<OriginBundle> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('incident_id')) {
      context.handle(
          _incidentIdMeta,
          incidentId.isAcceptableOrUnknown(
              data['incident_id']!, _incidentIdMeta));
    } else if (isInserting) {
      context.missing(_incidentIdMeta);
    }
    if (data.containsKey('event_id')) {
      context.handle(_eventIdMeta,
          eventId.isAcceptableOrUnknown(data['event_id']!, _eventIdMeta));
    } else if (isInserting) {
      context.missing(_eventIdMeta);
    }
    if (data.containsKey('canonical_header')) {
      context.handle(
          _canonicalHeaderMeta,
          canonicalHeader.isAcceptableOrUnknown(
              data['canonical_header']!, _canonicalHeaderMeta));
    } else if (isInserting) {
      context.missing(_canonicalHeaderMeta);
    }
    if (data.containsKey('ciphertext_path')) {
      context.handle(
          _ciphertextPathMeta,
          ciphertextPath.isAcceptableOrUnknown(
              data['ciphertext_path']!, _ciphertextPathMeta));
    }
    if (data.containsKey('ciphertext_bytes')) {
      context.handle(
          _ciphertextBytesMeta,
          ciphertextBytes.isAcceptableOrUnknown(
              data['ciphertext_bytes']!, _ciphertextBytesMeta));
    }
    if (data.containsKey('payload_hash')) {
      context.handle(
          _payloadHashMeta,
          payloadHash.isAcceptableOrUnknown(
              data['payload_hash']!, _payloadHashMeta));
    } else if (isInserting) {
      context.missing(_payloadHashMeta);
    }
    if (data.containsKey('expires_at')) {
      context.handle(_expiresAtMeta,
          expiresAt.isAcceptableOrUnknown(data['expires_at']!, _expiresAtMeta));
    } else if (isInserting) {
      context.missing(_expiresAtMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('last_attempt_at')) {
      context.handle(
          _lastAttemptAtMeta,
          lastAttemptAt.isAcceptableOrUnknown(
              data['last_attempt_at']!, _lastAttemptAtMeta));
    }
    if (data.containsKey('server_receipt_id')) {
      context.handle(
          _serverReceiptIdMeta,
          serverReceiptId.isAcceptableOrUnknown(
              data['server_receipt_id']!, _serverReceiptIdMeta));
    }
    if (data.containsKey('hop_limit')) {
      context.handle(_hopLimitMeta,
          hopLimit.isAcceptableOrUnknown(data['hop_limit']!, _hopLimitMeta));
    }
    if (data.containsKey('copy_budget')) {
      context.handle(
          _copyBudgetMeta,
          copyBudget.isAcceptableOrUnknown(
              data['copy_budget']!, _copyBudgetMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  OriginBundle map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return OriginBundle(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      incidentId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}incident_id'])!,
      eventId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}event_id'])!,
      priority: $OriginBundlesTable.$converterpriority.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}priority'])!),
      canonicalHeader: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}canonical_header'])!,
      ciphertextPath: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}ciphertext_path']),
      ciphertextBytes: attachedDatabase.typeMapping
          .read(DriftSqlType.blob, data['${effectivePrefix}ciphertext_bytes']),
      payloadHash: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_hash'])!,
      expiresAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}expires_at'])!,
      state: $OriginBundlesTable.$converterstate.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}state'])!),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
      lastAttemptAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}last_attempt_at']),
      serverReceiptId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}server_receipt_id']),
      hopLimit: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}hop_limit'])!,
      copyBudget: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}copy_budget'])!,
    );
  }

  @override
  $OriginBundlesTable createAlias(String alias) {
    return $OriginBundlesTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<IncidentPriority, int, int> $converterpriority =
      const EnumIndexConverter<IncidentPriority>(IncidentPriority.values);
  static JsonTypeConverter2<DeliveryState, int, int> $converterstate =
      const EnumIndexConverter<DeliveryState>(DeliveryState.values);
}

class OriginBundle extends DataClass implements Insertable<OriginBundle> {
  final String id;
  final String incidentId;
  final String eventId;
  final IncidentPriority priority;
  final String canonicalHeader;
  final String? ciphertextPath;
  final Uint8List? ciphertextBytes;
  final String payloadHash;
  final DateTime expiresAt;
  final DeliveryState state;
  final DateTime createdAt;
  final DateTime? lastAttemptAt;
  final String? serverReceiptId;
  final int hopLimit;
  final int copyBudget;
  const OriginBundle(
      {required this.id,
      required this.incidentId,
      required this.eventId,
      required this.priority,
      required this.canonicalHeader,
      this.ciphertextPath,
      this.ciphertextBytes,
      required this.payloadHash,
      required this.expiresAt,
      required this.state,
      required this.createdAt,
      this.lastAttemptAt,
      this.serverReceiptId,
      required this.hopLimit,
      required this.copyBudget});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['incident_id'] = Variable<String>(incidentId);
    map['event_id'] = Variable<String>(eventId);
    {
      map['priority'] =
          Variable<int>($OriginBundlesTable.$converterpriority.toSql(priority));
    }
    map['canonical_header'] = Variable<String>(canonicalHeader);
    if (!nullToAbsent || ciphertextPath != null) {
      map['ciphertext_path'] = Variable<String>(ciphertextPath);
    }
    if (!nullToAbsent || ciphertextBytes != null) {
      map['ciphertext_bytes'] = Variable<Uint8List>(ciphertextBytes);
    }
    map['payload_hash'] = Variable<String>(payloadHash);
    map['expires_at'] = Variable<DateTime>(expiresAt);
    {
      map['state'] =
          Variable<int>($OriginBundlesTable.$converterstate.toSql(state));
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    if (!nullToAbsent || lastAttemptAt != null) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
    }
    if (!nullToAbsent || serverReceiptId != null) {
      map['server_receipt_id'] = Variable<String>(serverReceiptId);
    }
    map['hop_limit'] = Variable<int>(hopLimit);
    map['copy_budget'] = Variable<int>(copyBudget);
    return map;
  }

  OriginBundlesCompanion toCompanion(bool nullToAbsent) {
    return OriginBundlesCompanion(
      id: Value(id),
      incidentId: Value(incidentId),
      eventId: Value(eventId),
      priority: Value(priority),
      canonicalHeader: Value(canonicalHeader),
      ciphertextPath: ciphertextPath == null && nullToAbsent
          ? const Value.absent()
          : Value(ciphertextPath),
      ciphertextBytes: ciphertextBytes == null && nullToAbsent
          ? const Value.absent()
          : Value(ciphertextBytes),
      payloadHash: Value(payloadHash),
      expiresAt: Value(expiresAt),
      state: Value(state),
      createdAt: Value(createdAt),
      lastAttemptAt: lastAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAttemptAt),
      serverReceiptId: serverReceiptId == null && nullToAbsent
          ? const Value.absent()
          : Value(serverReceiptId),
      hopLimit: Value(hopLimit),
      copyBudget: Value(copyBudget),
    );
  }

  factory OriginBundle.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return OriginBundle(
      id: serializer.fromJson<String>(json['id']),
      incidentId: serializer.fromJson<String>(json['incidentId']),
      eventId: serializer.fromJson<String>(json['eventId']),
      priority: $OriginBundlesTable.$converterpriority
          .fromJson(serializer.fromJson<int>(json['priority'])),
      canonicalHeader: serializer.fromJson<String>(json['canonicalHeader']),
      ciphertextPath: serializer.fromJson<String?>(json['ciphertextPath']),
      ciphertextBytes: serializer.fromJson<Uint8List?>(json['ciphertextBytes']),
      payloadHash: serializer.fromJson<String>(json['payloadHash']),
      expiresAt: serializer.fromJson<DateTime>(json['expiresAt']),
      state: $OriginBundlesTable.$converterstate
          .fromJson(serializer.fromJson<int>(json['state'])),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),
      serverReceiptId: serializer.fromJson<String?>(json['serverReceiptId']),
      hopLimit: serializer.fromJson<int>(json['hopLimit']),
      copyBudget: serializer.fromJson<int>(json['copyBudget']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'incidentId': serializer.toJson<String>(incidentId),
      'eventId': serializer.toJson<String>(eventId),
      'priority': serializer
          .toJson<int>($OriginBundlesTable.$converterpriority.toJson(priority)),
      'canonicalHeader': serializer.toJson<String>(canonicalHeader),
      'ciphertextPath': serializer.toJson<String?>(ciphertextPath),
      'ciphertextBytes': serializer.toJson<Uint8List?>(ciphertextBytes),
      'payloadHash': serializer.toJson<String>(payloadHash),
      'expiresAt': serializer.toJson<DateTime>(expiresAt),
      'state': serializer
          .toJson<int>($OriginBundlesTable.$converterstate.toJson(state)),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),
      'serverReceiptId': serializer.toJson<String?>(serverReceiptId),
      'hopLimit': serializer.toJson<int>(hopLimit),
      'copyBudget': serializer.toJson<int>(copyBudget),
    };
  }

  OriginBundle copyWith(
          {String? id,
          String? incidentId,
          String? eventId,
          IncidentPriority? priority,
          String? canonicalHeader,
          Value<String?> ciphertextPath = const Value.absent(),
          Value<Uint8List?> ciphertextBytes = const Value.absent(),
          String? payloadHash,
          DateTime? expiresAt,
          DeliveryState? state,
          DateTime? createdAt,
          Value<DateTime?> lastAttemptAt = const Value.absent(),
          Value<String?> serverReceiptId = const Value.absent(),
          int? hopLimit,
          int? copyBudget}) =>
      OriginBundle(
        id: id ?? this.id,
        incidentId: incidentId ?? this.incidentId,
        eventId: eventId ?? this.eventId,
        priority: priority ?? this.priority,
        canonicalHeader: canonicalHeader ?? this.canonicalHeader,
        ciphertextPath:
            ciphertextPath.present ? ciphertextPath.value : this.ciphertextPath,
        ciphertextBytes: ciphertextBytes.present
            ? ciphertextBytes.value
            : this.ciphertextBytes,
        payloadHash: payloadHash ?? this.payloadHash,
        expiresAt: expiresAt ?? this.expiresAt,
        state: state ?? this.state,
        createdAt: createdAt ?? this.createdAt,
        lastAttemptAt:
            lastAttemptAt.present ? lastAttemptAt.value : this.lastAttemptAt,
        serverReceiptId: serverReceiptId.present
            ? serverReceiptId.value
            : this.serverReceiptId,
        hopLimit: hopLimit ?? this.hopLimit,
        copyBudget: copyBudget ?? this.copyBudget,
      );
  OriginBundle copyWithCompanion(OriginBundlesCompanion data) {
    return OriginBundle(
      id: data.id.present ? data.id.value : this.id,
      incidentId:
          data.incidentId.present ? data.incidentId.value : this.incidentId,
      eventId: data.eventId.present ? data.eventId.value : this.eventId,
      priority: data.priority.present ? data.priority.value : this.priority,
      canonicalHeader: data.canonicalHeader.present
          ? data.canonicalHeader.value
          : this.canonicalHeader,
      ciphertextPath: data.ciphertextPath.present
          ? data.ciphertextPath.value
          : this.ciphertextPath,
      ciphertextBytes: data.ciphertextBytes.present
          ? data.ciphertextBytes.value
          : this.ciphertextBytes,
      payloadHash:
          data.payloadHash.present ? data.payloadHash.value : this.payloadHash,
      expiresAt: data.expiresAt.present ? data.expiresAt.value : this.expiresAt,
      state: data.state.present ? data.state.value : this.state,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      lastAttemptAt: data.lastAttemptAt.present
          ? data.lastAttemptAt.value
          : this.lastAttemptAt,
      serverReceiptId: data.serverReceiptId.present
          ? data.serverReceiptId.value
          : this.serverReceiptId,
      hopLimit: data.hopLimit.present ? data.hopLimit.value : this.hopLimit,
      copyBudget:
          data.copyBudget.present ? data.copyBudget.value : this.copyBudget,
    );
  }

  @override
  String toString() {
    return (StringBuffer('OriginBundle(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('eventId: $eventId, ')
          ..write('priority: $priority, ')
          ..write('canonicalHeader: $canonicalHeader, ')
          ..write('ciphertextPath: $ciphertextPath, ')
          ..write('ciphertextBytes: $ciphertextBytes, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('state: $state, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('serverReceiptId: $serverReceiptId, ')
          ..write('hopLimit: $hopLimit, ')
          ..write('copyBudget: $copyBudget')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      incidentId,
      eventId,
      priority,
      canonicalHeader,
      ciphertextPath,
      $driftBlobEquality.hash(ciphertextBytes),
      payloadHash,
      expiresAt,
      state,
      createdAt,
      lastAttemptAt,
      serverReceiptId,
      hopLimit,
      copyBudget);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is OriginBundle &&
          other.id == this.id &&
          other.incidentId == this.incidentId &&
          other.eventId == this.eventId &&
          other.priority == this.priority &&
          other.canonicalHeader == this.canonicalHeader &&
          other.ciphertextPath == this.ciphertextPath &&
          $driftBlobEquality.equals(
              other.ciphertextBytes, this.ciphertextBytes) &&
          other.payloadHash == this.payloadHash &&
          other.expiresAt == this.expiresAt &&
          other.state == this.state &&
          other.createdAt == this.createdAt &&
          other.lastAttemptAt == this.lastAttemptAt &&
          other.serverReceiptId == this.serverReceiptId &&
          other.hopLimit == this.hopLimit &&
          other.copyBudget == this.copyBudget);
}

class OriginBundlesCompanion extends UpdateCompanion<OriginBundle> {
  final Value<String> id;
  final Value<String> incidentId;
  final Value<String> eventId;
  final Value<IncidentPriority> priority;
  final Value<String> canonicalHeader;
  final Value<String?> ciphertextPath;
  final Value<Uint8List?> ciphertextBytes;
  final Value<String> payloadHash;
  final Value<DateTime> expiresAt;
  final Value<DeliveryState> state;
  final Value<DateTime> createdAt;
  final Value<DateTime?> lastAttemptAt;
  final Value<String?> serverReceiptId;
  final Value<int> hopLimit;
  final Value<int> copyBudget;
  final Value<int> rowid;
  const OriginBundlesCompanion({
    this.id = const Value.absent(),
    this.incidentId = const Value.absent(),
    this.eventId = const Value.absent(),
    this.priority = const Value.absent(),
    this.canonicalHeader = const Value.absent(),
    this.ciphertextPath = const Value.absent(),
    this.ciphertextBytes = const Value.absent(),
    this.payloadHash = const Value.absent(),
    this.expiresAt = const Value.absent(),
    this.state = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
    this.serverReceiptId = const Value.absent(),
    this.hopLimit = const Value.absent(),
    this.copyBudget = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  OriginBundlesCompanion.insert({
    required String id,
    required String incidentId,
    required String eventId,
    required IncidentPriority priority,
    required String canonicalHeader,
    this.ciphertextPath = const Value.absent(),
    this.ciphertextBytes = const Value.absent(),
    required String payloadHash,
    required DateTime expiresAt,
    required DeliveryState state,
    required DateTime createdAt,
    this.lastAttemptAt = const Value.absent(),
    this.serverReceiptId = const Value.absent(),
    this.hopLimit = const Value.absent(),
    this.copyBudget = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        incidentId = Value(incidentId),
        eventId = Value(eventId),
        priority = Value(priority),
        canonicalHeader = Value(canonicalHeader),
        payloadHash = Value(payloadHash),
        expiresAt = Value(expiresAt),
        state = Value(state),
        createdAt = Value(createdAt);
  static Insertable<OriginBundle> custom({
    Expression<String>? id,
    Expression<String>? incidentId,
    Expression<String>? eventId,
    Expression<int>? priority,
    Expression<String>? canonicalHeader,
    Expression<String>? ciphertextPath,
    Expression<Uint8List>? ciphertextBytes,
    Expression<String>? payloadHash,
    Expression<DateTime>? expiresAt,
    Expression<int>? state,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? lastAttemptAt,
    Expression<String>? serverReceiptId,
    Expression<int>? hopLimit,
    Expression<int>? copyBudget,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (incidentId != null) 'incident_id': incidentId,
      if (eventId != null) 'event_id': eventId,
      if (priority != null) 'priority': priority,
      if (canonicalHeader != null) 'canonical_header': canonicalHeader,
      if (ciphertextPath != null) 'ciphertext_path': ciphertextPath,
      if (ciphertextBytes != null) 'ciphertext_bytes': ciphertextBytes,
      if (payloadHash != null) 'payload_hash': payloadHash,
      if (expiresAt != null) 'expires_at': expiresAt,
      if (state != null) 'state': state,
      if (createdAt != null) 'created_at': createdAt,
      if (lastAttemptAt != null) 'last_attempt_at': lastAttemptAt,
      if (serverReceiptId != null) 'server_receipt_id': serverReceiptId,
      if (hopLimit != null) 'hop_limit': hopLimit,
      if (copyBudget != null) 'copy_budget': copyBudget,
      if (rowid != null) 'rowid': rowid,
    });
  }

  OriginBundlesCompanion copyWith(
      {Value<String>? id,
      Value<String>? incidentId,
      Value<String>? eventId,
      Value<IncidentPriority>? priority,
      Value<String>? canonicalHeader,
      Value<String?>? ciphertextPath,
      Value<Uint8List?>? ciphertextBytes,
      Value<String>? payloadHash,
      Value<DateTime>? expiresAt,
      Value<DeliveryState>? state,
      Value<DateTime>? createdAt,
      Value<DateTime?>? lastAttemptAt,
      Value<String?>? serverReceiptId,
      Value<int>? hopLimit,
      Value<int>? copyBudget,
      Value<int>? rowid}) {
    return OriginBundlesCompanion(
      id: id ?? this.id,
      incidentId: incidentId ?? this.incidentId,
      eventId: eventId ?? this.eventId,
      priority: priority ?? this.priority,
      canonicalHeader: canonicalHeader ?? this.canonicalHeader,
      ciphertextPath: ciphertextPath ?? this.ciphertextPath,
      ciphertextBytes: ciphertextBytes ?? this.ciphertextBytes,
      payloadHash: payloadHash ?? this.payloadHash,
      expiresAt: expiresAt ?? this.expiresAt,
      state: state ?? this.state,
      createdAt: createdAt ?? this.createdAt,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
      serverReceiptId: serverReceiptId ?? this.serverReceiptId,
      hopLimit: hopLimit ?? this.hopLimit,
      copyBudget: copyBudget ?? this.copyBudget,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (incidentId.present) {
      map['incident_id'] = Variable<String>(incidentId.value);
    }
    if (eventId.present) {
      map['event_id'] = Variable<String>(eventId.value);
    }
    if (priority.present) {
      map['priority'] = Variable<int>(
          $OriginBundlesTable.$converterpriority.toSql(priority.value));
    }
    if (canonicalHeader.present) {
      map['canonical_header'] = Variable<String>(canonicalHeader.value);
    }
    if (ciphertextPath.present) {
      map['ciphertext_path'] = Variable<String>(ciphertextPath.value);
    }
    if (ciphertextBytes.present) {
      map['ciphertext_bytes'] = Variable<Uint8List>(ciphertextBytes.value);
    }
    if (payloadHash.present) {
      map['payload_hash'] = Variable<String>(payloadHash.value);
    }
    if (expiresAt.present) {
      map['expires_at'] = Variable<DateTime>(expiresAt.value);
    }
    if (state.present) {
      map['state'] =
          Variable<int>($OriginBundlesTable.$converterstate.toSql(state.value));
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (lastAttemptAt.present) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);
    }
    if (serverReceiptId.present) {
      map['server_receipt_id'] = Variable<String>(serverReceiptId.value);
    }
    if (hopLimit.present) {
      map['hop_limit'] = Variable<int>(hopLimit.value);
    }
    if (copyBudget.present) {
      map['copy_budget'] = Variable<int>(copyBudget.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OriginBundlesCompanion(')
          ..write('id: $id, ')
          ..write('incidentId: $incidentId, ')
          ..write('eventId: $eventId, ')
          ..write('priority: $priority, ')
          ..write('canonicalHeader: $canonicalHeader, ')
          ..write('ciphertextPath: $ciphertextPath, ')
          ..write('ciphertextBytes: $ciphertextBytes, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('state: $state, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastAttemptAt: $lastAttemptAt, ')
          ..write('serverReceiptId: $serverReceiptId, ')
          ..write('hopLimit: $hopLimit, ')
          ..write('copyBudget: $copyBudget, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DeliveryAttemptsTable extends DeliveryAttempts
    with TableInfo<$DeliveryAttemptsTable, DeliveryAttempt> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DeliveryAttemptsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _messageIdMeta =
      const VerificationMeta('messageId');
  @override
  late final GeneratedColumn<String> messageId = GeneratedColumn<String>(
      'message_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES origin_bundles (id)'));
  static const VerificationMeta _linkIdMeta = const VerificationMeta('linkId');
  @override
  late final GeneratedColumn<String> linkId = GeneratedColumn<String>(
      'link_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _peerIdHashMeta =
      const VerificationMeta('peerIdHash');
  @override
  late final GeneratedColumn<String> peerIdHash = GeneratedColumn<String>(
      'peer_id_hash', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _startedAtMeta =
      const VerificationMeta('startedAt');
  @override
  late final GeneratedColumn<DateTime> startedAt = GeneratedColumn<DateTime>(
      'started_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _finishedAtMeta =
      const VerificationMeta('finishedAt');
  @override
  late final GeneratedColumn<DateTime> finishedAt = GeneratedColumn<DateTime>(
      'finished_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  late final GeneratedColumnWithTypeConverter<DeliveryOutcome, int> outcome =
      GeneratedColumn<int>('outcome', aliasedName, false,
              type: DriftSqlType.int, requiredDuringInsert: true)
          .withConverter<DeliveryOutcome>(
              $DeliveryAttemptsTable.$converteroutcome);
  static const VerificationMeta _bytesTransferredMeta =
      const VerificationMeta('bytesTransferred');
  @override
  late final GeneratedColumn<int> bytesTransferred = GeneratedColumn<int>(
      'bytes_transferred', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _errorCodeMeta =
      const VerificationMeta('errorCode');
  @override
  late final GeneratedColumn<String> errorCode = GeneratedColumn<String>(
      'error_code', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        messageId,
        linkId,
        peerIdHash,
        startedAt,
        finishedAt,
        outcome,
        bytesTransferred,
        errorCode
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'delivery_attempts';
  @override
  VerificationContext validateIntegrity(Insertable<DeliveryAttempt> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('message_id')) {
      context.handle(_messageIdMeta,
          messageId.isAcceptableOrUnknown(data['message_id']!, _messageIdMeta));
    } else if (isInserting) {
      context.missing(_messageIdMeta);
    }
    if (data.containsKey('link_id')) {
      context.handle(_linkIdMeta,
          linkId.isAcceptableOrUnknown(data['link_id']!, _linkIdMeta));
    } else if (isInserting) {
      context.missing(_linkIdMeta);
    }
    if (data.containsKey('peer_id_hash')) {
      context.handle(
          _peerIdHashMeta,
          peerIdHash.isAcceptableOrUnknown(
              data['peer_id_hash']!, _peerIdHashMeta));
    }
    if (data.containsKey('started_at')) {
      context.handle(_startedAtMeta,
          startedAt.isAcceptableOrUnknown(data['started_at']!, _startedAtMeta));
    } else if (isInserting) {
      context.missing(_startedAtMeta);
    }
    if (data.containsKey('finished_at')) {
      context.handle(
          _finishedAtMeta,
          finishedAt.isAcceptableOrUnknown(
              data['finished_at']!, _finishedAtMeta));
    }
    if (data.containsKey('bytes_transferred')) {
      context.handle(
          _bytesTransferredMeta,
          bytesTransferred.isAcceptableOrUnknown(
              data['bytes_transferred']!, _bytesTransferredMeta));
    }
    if (data.containsKey('error_code')) {
      context.handle(_errorCodeMeta,
          errorCode.isAcceptableOrUnknown(data['error_code']!, _errorCodeMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  DeliveryAttempt map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DeliveryAttempt(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      messageId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}message_id'])!,
      linkId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}link_id'])!,
      peerIdHash: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}peer_id_hash']),
      startedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}started_at'])!,
      finishedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}finished_at']),
      outcome: $DeliveryAttemptsTable.$converteroutcome.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}outcome'])!),
      bytesTransferred: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}bytes_transferred'])!,
      errorCode: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}error_code']),
    );
  }

  @override
  $DeliveryAttemptsTable createAlias(String alias) {
    return $DeliveryAttemptsTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<DeliveryOutcome, int, int> $converteroutcome =
      const EnumIndexConverter<DeliveryOutcome>(DeliveryOutcome.values);
}

class DeliveryAttempt extends DataClass implements Insertable<DeliveryAttempt> {
  final String id;
  final String messageId;
  final String linkId;
  final String? peerIdHash;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final DeliveryOutcome outcome;
  final int bytesTransferred;
  final String? errorCode;
  const DeliveryAttempt(
      {required this.id,
      required this.messageId,
      required this.linkId,
      this.peerIdHash,
      required this.startedAt,
      this.finishedAt,
      required this.outcome,
      required this.bytesTransferred,
      this.errorCode});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['message_id'] = Variable<String>(messageId);
    map['link_id'] = Variable<String>(linkId);
    if (!nullToAbsent || peerIdHash != null) {
      map['peer_id_hash'] = Variable<String>(peerIdHash);
    }
    map['started_at'] = Variable<DateTime>(startedAt);
    if (!nullToAbsent || finishedAt != null) {
      map['finished_at'] = Variable<DateTime>(finishedAt);
    }
    {
      map['outcome'] = Variable<int>(
          $DeliveryAttemptsTable.$converteroutcome.toSql(outcome));
    }
    map['bytes_transferred'] = Variable<int>(bytesTransferred);
    if (!nullToAbsent || errorCode != null) {
      map['error_code'] = Variable<String>(errorCode);
    }
    return map;
  }

  DeliveryAttemptsCompanion toCompanion(bool nullToAbsent) {
    return DeliveryAttemptsCompanion(
      id: Value(id),
      messageId: Value(messageId),
      linkId: Value(linkId),
      peerIdHash: peerIdHash == null && nullToAbsent
          ? const Value.absent()
          : Value(peerIdHash),
      startedAt: Value(startedAt),
      finishedAt: finishedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(finishedAt),
      outcome: Value(outcome),
      bytesTransferred: Value(bytesTransferred),
      errorCode: errorCode == null && nullToAbsent
          ? const Value.absent()
          : Value(errorCode),
    );
  }

  factory DeliveryAttempt.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return DeliveryAttempt(
      id: serializer.fromJson<String>(json['id']),
      messageId: serializer.fromJson<String>(json['messageId']),
      linkId: serializer.fromJson<String>(json['linkId']),
      peerIdHash: serializer.fromJson<String?>(json['peerIdHash']),
      startedAt: serializer.fromJson<DateTime>(json['startedAt']),
      finishedAt: serializer.fromJson<DateTime?>(json['finishedAt']),
      outcome: $DeliveryAttemptsTable.$converteroutcome
          .fromJson(serializer.fromJson<int>(json['outcome'])),
      bytesTransferred: serializer.fromJson<int>(json['bytesTransferred']),
      errorCode: serializer.fromJson<String?>(json['errorCode']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'messageId': serializer.toJson<String>(messageId),
      'linkId': serializer.toJson<String>(linkId),
      'peerIdHash': serializer.toJson<String?>(peerIdHash),
      'startedAt': serializer.toJson<DateTime>(startedAt),
      'finishedAt': serializer.toJson<DateTime?>(finishedAt),
      'outcome': serializer.toJson<int>(
          $DeliveryAttemptsTable.$converteroutcome.toJson(outcome)),
      'bytesTransferred': serializer.toJson<int>(bytesTransferred),
      'errorCode': serializer.toJson<String?>(errorCode),
    };
  }

  DeliveryAttempt copyWith(
          {String? id,
          String? messageId,
          String? linkId,
          Value<String?> peerIdHash = const Value.absent(),
          DateTime? startedAt,
          Value<DateTime?> finishedAt = const Value.absent(),
          DeliveryOutcome? outcome,
          int? bytesTransferred,
          Value<String?> errorCode = const Value.absent()}) =>
      DeliveryAttempt(
        id: id ?? this.id,
        messageId: messageId ?? this.messageId,
        linkId: linkId ?? this.linkId,
        peerIdHash: peerIdHash.present ? peerIdHash.value : this.peerIdHash,
        startedAt: startedAt ?? this.startedAt,
        finishedAt: finishedAt.present ? finishedAt.value : this.finishedAt,
        outcome: outcome ?? this.outcome,
        bytesTransferred: bytesTransferred ?? this.bytesTransferred,
        errorCode: errorCode.present ? errorCode.value : this.errorCode,
      );
  DeliveryAttempt copyWithCompanion(DeliveryAttemptsCompanion data) {
    return DeliveryAttempt(
      id: data.id.present ? data.id.value : this.id,
      messageId: data.messageId.present ? data.messageId.value : this.messageId,
      linkId: data.linkId.present ? data.linkId.value : this.linkId,
      peerIdHash:
          data.peerIdHash.present ? data.peerIdHash.value : this.peerIdHash,
      startedAt: data.startedAt.present ? data.startedAt.value : this.startedAt,
      finishedAt:
          data.finishedAt.present ? data.finishedAt.value : this.finishedAt,
      outcome: data.outcome.present ? data.outcome.value : this.outcome,
      bytesTransferred: data.bytesTransferred.present
          ? data.bytesTransferred.value
          : this.bytesTransferred,
      errorCode: data.errorCode.present ? data.errorCode.value : this.errorCode,
    );
  }

  @override
  String toString() {
    return (StringBuffer('DeliveryAttempt(')
          ..write('id: $id, ')
          ..write('messageId: $messageId, ')
          ..write('linkId: $linkId, ')
          ..write('peerIdHash: $peerIdHash, ')
          ..write('startedAt: $startedAt, ')
          ..write('finishedAt: $finishedAt, ')
          ..write('outcome: $outcome, ')
          ..write('bytesTransferred: $bytesTransferred, ')
          ..write('errorCode: $errorCode')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, messageId, linkId, peerIdHash, startedAt,
      finishedAt, outcome, bytesTransferred, errorCode);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is DeliveryAttempt &&
          other.id == this.id &&
          other.messageId == this.messageId &&
          other.linkId == this.linkId &&
          other.peerIdHash == this.peerIdHash &&
          other.startedAt == this.startedAt &&
          other.finishedAt == this.finishedAt &&
          other.outcome == this.outcome &&
          other.bytesTransferred == this.bytesTransferred &&
          other.errorCode == this.errorCode);
}

class DeliveryAttemptsCompanion extends UpdateCompanion<DeliveryAttempt> {
  final Value<String> id;
  final Value<String> messageId;
  final Value<String> linkId;
  final Value<String?> peerIdHash;
  final Value<DateTime> startedAt;
  final Value<DateTime?> finishedAt;
  final Value<DeliveryOutcome> outcome;
  final Value<int> bytesTransferred;
  final Value<String?> errorCode;
  final Value<int> rowid;
  const DeliveryAttemptsCompanion({
    this.id = const Value.absent(),
    this.messageId = const Value.absent(),
    this.linkId = const Value.absent(),
    this.peerIdHash = const Value.absent(),
    this.startedAt = const Value.absent(),
    this.finishedAt = const Value.absent(),
    this.outcome = const Value.absent(),
    this.bytesTransferred = const Value.absent(),
    this.errorCode = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DeliveryAttemptsCompanion.insert({
    required String id,
    required String messageId,
    required String linkId,
    this.peerIdHash = const Value.absent(),
    required DateTime startedAt,
    this.finishedAt = const Value.absent(),
    required DeliveryOutcome outcome,
    this.bytesTransferred = const Value.absent(),
    this.errorCode = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        messageId = Value(messageId),
        linkId = Value(linkId),
        startedAt = Value(startedAt),
        outcome = Value(outcome);
  static Insertable<DeliveryAttempt> custom({
    Expression<String>? id,
    Expression<String>? messageId,
    Expression<String>? linkId,
    Expression<String>? peerIdHash,
    Expression<DateTime>? startedAt,
    Expression<DateTime>? finishedAt,
    Expression<int>? outcome,
    Expression<int>? bytesTransferred,
    Expression<String>? errorCode,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (messageId != null) 'message_id': messageId,
      if (linkId != null) 'link_id': linkId,
      if (peerIdHash != null) 'peer_id_hash': peerIdHash,
      if (startedAt != null) 'started_at': startedAt,
      if (finishedAt != null) 'finished_at': finishedAt,
      if (outcome != null) 'outcome': outcome,
      if (bytesTransferred != null) 'bytes_transferred': bytesTransferred,
      if (errorCode != null) 'error_code': errorCode,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DeliveryAttemptsCompanion copyWith(
      {Value<String>? id,
      Value<String>? messageId,
      Value<String>? linkId,
      Value<String?>? peerIdHash,
      Value<DateTime>? startedAt,
      Value<DateTime?>? finishedAt,
      Value<DeliveryOutcome>? outcome,
      Value<int>? bytesTransferred,
      Value<String?>? errorCode,
      Value<int>? rowid}) {
    return DeliveryAttemptsCompanion(
      id: id ?? this.id,
      messageId: messageId ?? this.messageId,
      linkId: linkId ?? this.linkId,
      peerIdHash: peerIdHash ?? this.peerIdHash,
      startedAt: startedAt ?? this.startedAt,
      finishedAt: finishedAt ?? this.finishedAt,
      outcome: outcome ?? this.outcome,
      bytesTransferred: bytesTransferred ?? this.bytesTransferred,
      errorCode: errorCode ?? this.errorCode,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (messageId.present) {
      map['message_id'] = Variable<String>(messageId.value);
    }
    if (linkId.present) {
      map['link_id'] = Variable<String>(linkId.value);
    }
    if (peerIdHash.present) {
      map['peer_id_hash'] = Variable<String>(peerIdHash.value);
    }
    if (startedAt.present) {
      map['started_at'] = Variable<DateTime>(startedAt.value);
    }
    if (finishedAt.present) {
      map['finished_at'] = Variable<DateTime>(finishedAt.value);
    }
    if (outcome.present) {
      map['outcome'] = Variable<int>(
          $DeliveryAttemptsTable.$converteroutcome.toSql(outcome.value));
    }
    if (bytesTransferred.present) {
      map['bytes_transferred'] = Variable<int>(bytesTransferred.value);
    }
    if (errorCode.present) {
      map['error_code'] = Variable<String>(errorCode.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DeliveryAttemptsCompanion(')
          ..write('id: $id, ')
          ..write('messageId: $messageId, ')
          ..write('linkId: $linkId, ')
          ..write('peerIdHash: $peerIdHash, ')
          ..write('startedAt: $startedAt, ')
          ..write('finishedAt: $finishedAt, ')
          ..write('outcome: $outcome, ')
          ..write('bytesTransferred: $bytesTransferred, ')
          ..write('errorCode: $errorCode, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ServerReceiptsTable extends ServerReceipts
    with TableInfo<$ServerReceiptsTable, ServerReceipt> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ServerReceiptsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _receiptIdMeta =
      const VerificationMeta('receiptId');
  @override
  late final GeneratedColumn<String> receiptId = GeneratedColumn<String>(
      'receipt_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _messageIdMeta =
      const VerificationMeta('messageId');
  @override
  late final GeneratedColumn<String> messageId = GeneratedColumn<String>(
      'message_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES origin_bundles (id)'));
  static const VerificationMeta _payloadHashMeta =
      const VerificationMeta('payloadHash');
  @override
  late final GeneratedColumn<String> payloadHash = GeneratedColumn<String>(
      'payload_hash', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _serverReceivedAtMeta =
      const VerificationMeta('serverReceivedAt');
  @override
  late final GeneratedColumn<DateTime> serverReceivedAt =
      GeneratedColumn<DateTime>('server_received_at', aliasedName, false,
          type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _serverKeyIdMeta =
      const VerificationMeta('serverKeyId');
  @override
  late final GeneratedColumn<String> serverKeyId = GeneratedColumn<String>(
      'server_key_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _signatureMeta =
      const VerificationMeta('signature');
  @override
  late final GeneratedColumn<String> signature = GeneratedColumn<String>(
      'signature', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _verifiedAtMeta =
      const VerificationMeta('verifiedAt');
  @override
  late final GeneratedColumn<DateTime> verifiedAt = GeneratedColumn<DateTime>(
      'verified_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        receiptId,
        messageId,
        payloadHash,
        serverReceivedAt,
        serverKeyId,
        signature,
        verifiedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'server_receipts';
  @override
  VerificationContext validateIntegrity(Insertable<ServerReceipt> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('receipt_id')) {
      context.handle(_receiptIdMeta,
          receiptId.isAcceptableOrUnknown(data['receipt_id']!, _receiptIdMeta));
    } else if (isInserting) {
      context.missing(_receiptIdMeta);
    }
    if (data.containsKey('message_id')) {
      context.handle(_messageIdMeta,
          messageId.isAcceptableOrUnknown(data['message_id']!, _messageIdMeta));
    } else if (isInserting) {
      context.missing(_messageIdMeta);
    }
    if (data.containsKey('payload_hash')) {
      context.handle(
          _payloadHashMeta,
          payloadHash.isAcceptableOrUnknown(
              data['payload_hash']!, _payloadHashMeta));
    } else if (isInserting) {
      context.missing(_payloadHashMeta);
    }
    if (data.containsKey('server_received_at')) {
      context.handle(
          _serverReceivedAtMeta,
          serverReceivedAt.isAcceptableOrUnknown(
              data['server_received_at']!, _serverReceivedAtMeta));
    } else if (isInserting) {
      context.missing(_serverReceivedAtMeta);
    }
    if (data.containsKey('server_key_id')) {
      context.handle(
          _serverKeyIdMeta,
          serverKeyId.isAcceptableOrUnknown(
              data['server_key_id']!, _serverKeyIdMeta));
    } else if (isInserting) {
      context.missing(_serverKeyIdMeta);
    }
    if (data.containsKey('signature')) {
      context.handle(_signatureMeta,
          signature.isAcceptableOrUnknown(data['signature']!, _signatureMeta));
    } else if (isInserting) {
      context.missing(_signatureMeta);
    }
    if (data.containsKey('verified_at')) {
      context.handle(
          _verifiedAtMeta,
          verifiedAt.isAcceptableOrUnknown(
              data['verified_at']!, _verifiedAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ServerReceipt map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ServerReceipt(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      receiptId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}receipt_id'])!,
      messageId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}message_id'])!,
      payloadHash: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}payload_hash'])!,
      serverReceivedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}server_received_at'])!,
      serverKeyId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}server_key_id'])!,
      signature: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}signature'])!,
      verifiedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}verified_at']),
    );
  }

  @override
  $ServerReceiptsTable createAlias(String alias) {
    return $ServerReceiptsTable(attachedDatabase, alias);
  }
}

class ServerReceipt extends DataClass implements Insertable<ServerReceipt> {
  final String id;
  final String receiptId;
  final String messageId;
  final String payloadHash;
  final DateTime serverReceivedAt;
  final String serverKeyId;
  final String signature;
  final DateTime? verifiedAt;
  const ServerReceipt(
      {required this.id,
      required this.receiptId,
      required this.messageId,
      required this.payloadHash,
      required this.serverReceivedAt,
      required this.serverKeyId,
      required this.signature,
      this.verifiedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['receipt_id'] = Variable<String>(receiptId);
    map['message_id'] = Variable<String>(messageId);
    map['payload_hash'] = Variable<String>(payloadHash);
    map['server_received_at'] = Variable<DateTime>(serverReceivedAt);
    map['server_key_id'] = Variable<String>(serverKeyId);
    map['signature'] = Variable<String>(signature);
    if (!nullToAbsent || verifiedAt != null) {
      map['verified_at'] = Variable<DateTime>(verifiedAt);
    }
    return map;
  }

  ServerReceiptsCompanion toCompanion(bool nullToAbsent) {
    return ServerReceiptsCompanion(
      id: Value(id),
      receiptId: Value(receiptId),
      messageId: Value(messageId),
      payloadHash: Value(payloadHash),
      serverReceivedAt: Value(serverReceivedAt),
      serverKeyId: Value(serverKeyId),
      signature: Value(signature),
      verifiedAt: verifiedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(verifiedAt),
    );
  }

  factory ServerReceipt.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ServerReceipt(
      id: serializer.fromJson<String>(json['id']),
      receiptId: serializer.fromJson<String>(json['receiptId']),
      messageId: serializer.fromJson<String>(json['messageId']),
      payloadHash: serializer.fromJson<String>(json['payloadHash']),
      serverReceivedAt: serializer.fromJson<DateTime>(json['serverReceivedAt']),
      serverKeyId: serializer.fromJson<String>(json['serverKeyId']),
      signature: serializer.fromJson<String>(json['signature']),
      verifiedAt: serializer.fromJson<DateTime?>(json['verifiedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'receiptId': serializer.toJson<String>(receiptId),
      'messageId': serializer.toJson<String>(messageId),
      'payloadHash': serializer.toJson<String>(payloadHash),
      'serverReceivedAt': serializer.toJson<DateTime>(serverReceivedAt),
      'serverKeyId': serializer.toJson<String>(serverKeyId),
      'signature': serializer.toJson<String>(signature),
      'verifiedAt': serializer.toJson<DateTime?>(verifiedAt),
    };
  }

  ServerReceipt copyWith(
          {String? id,
          String? receiptId,
          String? messageId,
          String? payloadHash,
          DateTime? serverReceivedAt,
          String? serverKeyId,
          String? signature,
          Value<DateTime?> verifiedAt = const Value.absent()}) =>
      ServerReceipt(
        id: id ?? this.id,
        receiptId: receiptId ?? this.receiptId,
        messageId: messageId ?? this.messageId,
        payloadHash: payloadHash ?? this.payloadHash,
        serverReceivedAt: serverReceivedAt ?? this.serverReceivedAt,
        serverKeyId: serverKeyId ?? this.serverKeyId,
        signature: signature ?? this.signature,
        verifiedAt: verifiedAt.present ? verifiedAt.value : this.verifiedAt,
      );
  ServerReceipt copyWithCompanion(ServerReceiptsCompanion data) {
    return ServerReceipt(
      id: data.id.present ? data.id.value : this.id,
      receiptId: data.receiptId.present ? data.receiptId.value : this.receiptId,
      messageId: data.messageId.present ? data.messageId.value : this.messageId,
      payloadHash:
          data.payloadHash.present ? data.payloadHash.value : this.payloadHash,
      serverReceivedAt: data.serverReceivedAt.present
          ? data.serverReceivedAt.value
          : this.serverReceivedAt,
      serverKeyId:
          data.serverKeyId.present ? data.serverKeyId.value : this.serverKeyId,
      signature: data.signature.present ? data.signature.value : this.signature,
      verifiedAt:
          data.verifiedAt.present ? data.verifiedAt.value : this.verifiedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ServerReceipt(')
          ..write('id: $id, ')
          ..write('receiptId: $receiptId, ')
          ..write('messageId: $messageId, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('serverReceivedAt: $serverReceivedAt, ')
          ..write('serverKeyId: $serverKeyId, ')
          ..write('signature: $signature, ')
          ..write('verifiedAt: $verifiedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, receiptId, messageId, payloadHash,
      serverReceivedAt, serverKeyId, signature, verifiedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ServerReceipt &&
          other.id == this.id &&
          other.receiptId == this.receiptId &&
          other.messageId == this.messageId &&
          other.payloadHash == this.payloadHash &&
          other.serverReceivedAt == this.serverReceivedAt &&
          other.serverKeyId == this.serverKeyId &&
          other.signature == this.signature &&
          other.verifiedAt == this.verifiedAt);
}

class ServerReceiptsCompanion extends UpdateCompanion<ServerReceipt> {
  final Value<String> id;
  final Value<String> receiptId;
  final Value<String> messageId;
  final Value<String> payloadHash;
  final Value<DateTime> serverReceivedAt;
  final Value<String> serverKeyId;
  final Value<String> signature;
  final Value<DateTime?> verifiedAt;
  final Value<int> rowid;
  const ServerReceiptsCompanion({
    this.id = const Value.absent(),
    this.receiptId = const Value.absent(),
    this.messageId = const Value.absent(),
    this.payloadHash = const Value.absent(),
    this.serverReceivedAt = const Value.absent(),
    this.serverKeyId = const Value.absent(),
    this.signature = const Value.absent(),
    this.verifiedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ServerReceiptsCompanion.insert({
    required String id,
    required String receiptId,
    required String messageId,
    required String payloadHash,
    required DateTime serverReceivedAt,
    required String serverKeyId,
    required String signature,
    this.verifiedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        receiptId = Value(receiptId),
        messageId = Value(messageId),
        payloadHash = Value(payloadHash),
        serverReceivedAt = Value(serverReceivedAt),
        serverKeyId = Value(serverKeyId),
        signature = Value(signature);
  static Insertable<ServerReceipt> custom({
    Expression<String>? id,
    Expression<String>? receiptId,
    Expression<String>? messageId,
    Expression<String>? payloadHash,
    Expression<DateTime>? serverReceivedAt,
    Expression<String>? serverKeyId,
    Expression<String>? signature,
    Expression<DateTime>? verifiedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (receiptId != null) 'receipt_id': receiptId,
      if (messageId != null) 'message_id': messageId,
      if (payloadHash != null) 'payload_hash': payloadHash,
      if (serverReceivedAt != null) 'server_received_at': serverReceivedAt,
      if (serverKeyId != null) 'server_key_id': serverKeyId,
      if (signature != null) 'signature': signature,
      if (verifiedAt != null) 'verified_at': verifiedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ServerReceiptsCompanion copyWith(
      {Value<String>? id,
      Value<String>? receiptId,
      Value<String>? messageId,
      Value<String>? payloadHash,
      Value<DateTime>? serverReceivedAt,
      Value<String>? serverKeyId,
      Value<String>? signature,
      Value<DateTime?>? verifiedAt,
      Value<int>? rowid}) {
    return ServerReceiptsCompanion(
      id: id ?? this.id,
      receiptId: receiptId ?? this.receiptId,
      messageId: messageId ?? this.messageId,
      payloadHash: payloadHash ?? this.payloadHash,
      serverReceivedAt: serverReceivedAt ?? this.serverReceivedAt,
      serverKeyId: serverKeyId ?? this.serverKeyId,
      signature: signature ?? this.signature,
      verifiedAt: verifiedAt ?? this.verifiedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (receiptId.present) {
      map['receipt_id'] = Variable<String>(receiptId.value);
    }
    if (messageId.present) {
      map['message_id'] = Variable<String>(messageId.value);
    }
    if (payloadHash.present) {
      map['payload_hash'] = Variable<String>(payloadHash.value);
    }
    if (serverReceivedAt.present) {
      map['server_received_at'] = Variable<DateTime>(serverReceivedAt.value);
    }
    if (serverKeyId.present) {
      map['server_key_id'] = Variable<String>(serverKeyId.value);
    }
    if (signature.present) {
      map['signature'] = Variable<String>(signature.value);
    }
    if (verifiedAt.present) {
      map['verified_at'] = Variable<DateTime>(verifiedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ServerReceiptsCompanion(')
          ..write('id: $id, ')
          ..write('receiptId: $receiptId, ')
          ..write('messageId: $messageId, ')
          ..write('payloadHash: $payloadHash, ')
          ..write('serverReceivedAt: $serverReceivedAt, ')
          ..write('serverKeyId: $serverKeyId, ')
          ..write('signature: $signature, ')
          ..write('verifiedAt: $verifiedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TombstonesTable extends Tombstones
    with TableInfo<$TombstonesTable, Tombstone> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TombstonesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _messageIdMeta =
      const VerificationMeta('messageId');
  @override
  late final GeneratedColumn<String> messageId = GeneratedColumn<String>(
      'message_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _expiresAtMeta =
      const VerificationMeta('expiresAt');
  @override
  late final GeneratedColumn<DateTime> expiresAt = GeneratedColumn<DateTime>(
      'expires_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [messageId, expiresAt, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'tombstones';
  @override
  VerificationContext validateIntegrity(Insertable<Tombstone> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('message_id')) {
      context.handle(_messageIdMeta,
          messageId.isAcceptableOrUnknown(data['message_id']!, _messageIdMeta));
    } else if (isInserting) {
      context.missing(_messageIdMeta);
    }
    if (data.containsKey('expires_at')) {
      context.handle(_expiresAtMeta,
          expiresAt.isAcceptableOrUnknown(data['expires_at']!, _expiresAtMeta));
    } else if (isInserting) {
      context.missing(_expiresAtMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {messageId};
  @override
  Tombstone map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Tombstone(
      messageId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}message_id'])!,
      expiresAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}expires_at'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $TombstonesTable createAlias(String alias) {
    return $TombstonesTable(attachedDatabase, alias);
  }
}

class Tombstone extends DataClass implements Insertable<Tombstone> {
  final String messageId;
  final DateTime expiresAt;
  final DateTime createdAt;
  const Tombstone(
      {required this.messageId,
      required this.expiresAt,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['message_id'] = Variable<String>(messageId);
    map['expires_at'] = Variable<DateTime>(expiresAt);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  TombstonesCompanion toCompanion(bool nullToAbsent) {
    return TombstonesCompanion(
      messageId: Value(messageId),
      expiresAt: Value(expiresAt),
      createdAt: Value(createdAt),
    );
  }

  factory Tombstone.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Tombstone(
      messageId: serializer.fromJson<String>(json['messageId']),
      expiresAt: serializer.fromJson<DateTime>(json['expiresAt']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'messageId': serializer.toJson<String>(messageId),
      'expiresAt': serializer.toJson<DateTime>(expiresAt),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Tombstone copyWith(
          {String? messageId, DateTime? expiresAt, DateTime? createdAt}) =>
      Tombstone(
        messageId: messageId ?? this.messageId,
        expiresAt: expiresAt ?? this.expiresAt,
        createdAt: createdAt ?? this.createdAt,
      );
  Tombstone copyWithCompanion(TombstonesCompanion data) {
    return Tombstone(
      messageId: data.messageId.present ? data.messageId.value : this.messageId,
      expiresAt: data.expiresAt.present ? data.expiresAt.value : this.expiresAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Tombstone(')
          ..write('messageId: $messageId, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(messageId, expiresAt, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Tombstone &&
          other.messageId == this.messageId &&
          other.expiresAt == this.expiresAt &&
          other.createdAt == this.createdAt);
}

class TombstonesCompanion extends UpdateCompanion<Tombstone> {
  final Value<String> messageId;
  final Value<DateTime> expiresAt;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const TombstonesCompanion({
    this.messageId = const Value.absent(),
    this.expiresAt = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TombstonesCompanion.insert({
    required String messageId,
    required DateTime expiresAt,
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : messageId = Value(messageId),
        expiresAt = Value(expiresAt),
        createdAt = Value(createdAt);
  static Insertable<Tombstone> custom({
    Expression<String>? messageId,
    Expression<DateTime>? expiresAt,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (messageId != null) 'message_id': messageId,
      if (expiresAt != null) 'expires_at': expiresAt,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TombstonesCompanion copyWith(
      {Value<String>? messageId,
      Value<DateTime>? expiresAt,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return TombstonesCompanion(
      messageId: messageId ?? this.messageId,
      expiresAt: expiresAt ?? this.expiresAt,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (messageId.present) {
      map['message_id'] = Variable<String>(messageId.value);
    }
    if (expiresAt.present) {
      map['expires_at'] = Variable<DateTime>(expiresAt.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TombstonesCompanion(')
          ..write('messageId: $messageId, ')
          ..write('expiresAt: $expiresAt, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $IdentityProfilesTable identityProfiles =
      $IdentityProfilesTable(this);
  late final $IncidentsTable incidents = $IncidentsTable(this);
  late final $IncidentEventsTable incidentEvents = $IncidentEventsTable(this);
  late final $AttachmentsTable attachments = $AttachmentsTable(this);
  late final $OriginBundlesTable originBundles = $OriginBundlesTable(this);
  late final $DeliveryAttemptsTable deliveryAttempts =
      $DeliveryAttemptsTable(this);
  late final $ServerReceiptsTable serverReceipts = $ServerReceiptsTable(this);
  late final $TombstonesTable tombstones = $TombstonesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        identityProfiles,
        incidents,
        incidentEvents,
        attachments,
        originBundles,
        deliveryAttempts,
        serverReceipts,
        tombstones
      ];
}

typedef $$IdentityProfilesTableCreateCompanionBuilder
    = IdentityProfilesCompanion Function({
  required String id,
  Value<String?> opaqueSubjectId,
  required IdentityAssurance identityAssurance,
  Value<String?> credential,
  Value<DateTime?> credentialExpiresAt,
  required String devicePublicKey,
  required String consentVersion,
  required DateTime createdAt,
  required DateTime updatedAt,
  Value<int> rowid,
});
typedef $$IdentityProfilesTableUpdateCompanionBuilder
    = IdentityProfilesCompanion Function({
  Value<String> id,
  Value<String?> opaqueSubjectId,
  Value<IdentityAssurance> identityAssurance,
  Value<String?> credential,
  Value<DateTime?> credentialExpiresAt,
  Value<String> devicePublicKey,
  Value<String> consentVersion,
  Value<DateTime> createdAt,
  Value<DateTime> updatedAt,
  Value<int> rowid,
});

final class $$IdentityProfilesTableReferences extends BaseReferences<
    _$AppDatabase, $IdentityProfilesTable, IdentityProfile> {
  $$IdentityProfilesTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$IncidentsTable, List<Incident>>
      _incidentsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.incidents,
              aliasName: $_aliasNameGenerator(
                  db.identityProfiles.id, db.incidents.reporterProfileId));

  $$IncidentsTableProcessedTableManager get incidentsRefs {
    final manager = $$IncidentsTableTableManager($_db, $_db.incidents).filter(
        (f) => f.reporterProfileId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_incidentsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$IdentityProfilesTableFilterComposer
    extends Composer<_$AppDatabase, $IdentityProfilesTable> {
  $$IdentityProfilesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get opaqueSubjectId => $composableBuilder(
      column: $table.opaqueSubjectId,
      builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<IdentityAssurance, IdentityAssurance, int>
      get identityAssurance => $composableBuilder(
          column: $table.identityAssurance,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get credential => $composableBuilder(
      column: $table.credential, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get credentialExpiresAt => $composableBuilder(
      column: $table.credentialExpiresAt,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get devicePublicKey => $composableBuilder(
      column: $table.devicePublicKey,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get consentVersion => $composableBuilder(
      column: $table.consentVersion,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  Expression<bool> incidentsRefs(
      Expression<bool> Function($$IncidentsTableFilterComposer f) f) {
    final $$IncidentsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.reporterProfileId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableFilterComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IdentityProfilesTableOrderingComposer
    extends Composer<_$AppDatabase, $IdentityProfilesTable> {
  $$IdentityProfilesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get opaqueSubjectId => $composableBuilder(
      column: $table.opaqueSubjectId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get identityAssurance => $composableBuilder(
      column: $table.identityAssurance,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get credential => $composableBuilder(
      column: $table.credential, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get credentialExpiresAt => $composableBuilder(
      column: $table.credentialExpiresAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get devicePublicKey => $composableBuilder(
      column: $table.devicePublicKey,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get consentVersion => $composableBuilder(
      column: $table.consentVersion,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$IdentityProfilesTableAnnotationComposer
    extends Composer<_$AppDatabase, $IdentityProfilesTable> {
  $$IdentityProfilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get opaqueSubjectId => $composableBuilder(
      column: $table.opaqueSubjectId, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IdentityAssurance, int>
      get identityAssurance => $composableBuilder(
          column: $table.identityAssurance, builder: (column) => column);

  GeneratedColumn<String> get credential => $composableBuilder(
      column: $table.credential, builder: (column) => column);

  GeneratedColumn<DateTime> get credentialExpiresAt => $composableBuilder(
      column: $table.credentialExpiresAt, builder: (column) => column);

  GeneratedColumn<String> get devicePublicKey => $composableBuilder(
      column: $table.devicePublicKey, builder: (column) => column);

  GeneratedColumn<String> get consentVersion => $composableBuilder(
      column: $table.consentVersion, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> incidentsRefs<T extends Object>(
      Expression<T> Function($$IncidentsTableAnnotationComposer a) f) {
    final $$IncidentsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.reporterProfileId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IdentityProfilesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $IdentityProfilesTable,
    IdentityProfile,
    $$IdentityProfilesTableFilterComposer,
    $$IdentityProfilesTableOrderingComposer,
    $$IdentityProfilesTableAnnotationComposer,
    $$IdentityProfilesTableCreateCompanionBuilder,
    $$IdentityProfilesTableUpdateCompanionBuilder,
    (IdentityProfile, $$IdentityProfilesTableReferences),
    IdentityProfile,
    PrefetchHooks Function({bool incidentsRefs})> {
  $$IdentityProfilesTableTableManager(
      _$AppDatabase db, $IdentityProfilesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$IdentityProfilesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$IdentityProfilesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$IdentityProfilesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String?> opaqueSubjectId = const Value.absent(),
            Value<IdentityAssurance> identityAssurance = const Value.absent(),
            Value<String?> credential = const Value.absent(),
            Value<DateTime?> credentialExpiresAt = const Value.absent(),
            Value<String> devicePublicKey = const Value.absent(),
            Value<String> consentVersion = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              IdentityProfilesCompanion(
            id: id,
            opaqueSubjectId: opaqueSubjectId,
            identityAssurance: identityAssurance,
            credential: credential,
            credentialExpiresAt: credentialExpiresAt,
            devicePublicKey: devicePublicKey,
            consentVersion: consentVersion,
            createdAt: createdAt,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            Value<String?> opaqueSubjectId = const Value.absent(),
            required IdentityAssurance identityAssurance,
            Value<String?> credential = const Value.absent(),
            Value<DateTime?> credentialExpiresAt = const Value.absent(),
            required String devicePublicKey,
            required String consentVersion,
            required DateTime createdAt,
            required DateTime updatedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              IdentityProfilesCompanion.insert(
            id: id,
            opaqueSubjectId: opaqueSubjectId,
            identityAssurance: identityAssurance,
            credential: credential,
            credentialExpiresAt: credentialExpiresAt,
            devicePublicKey: devicePublicKey,
            consentVersion: consentVersion,
            createdAt: createdAt,
            updatedAt: updatedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$IdentityProfilesTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({incidentsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (incidentsRefs) db.incidents],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (incidentsRefs)
                    await $_getPrefetchedData<IdentityProfile, $IdentityProfilesTable,
                            Incident>(
                        currentTable: table,
                        referencedTable: $$IdentityProfilesTableReferences
                            ._incidentsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$IdentityProfilesTableReferences(db, table, p0)
                                .incidentsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.reporterProfileId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$IdentityProfilesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $IdentityProfilesTable,
    IdentityProfile,
    $$IdentityProfilesTableFilterComposer,
    $$IdentityProfilesTableOrderingComposer,
    $$IdentityProfilesTableAnnotationComposer,
    $$IdentityProfilesTableCreateCompanionBuilder,
    $$IdentityProfilesTableUpdateCompanionBuilder,
    (IdentityProfile, $$IdentityProfilesTableReferences),
    IdentityProfile,
    PrefetchHooks Function({bool incidentsRefs})>;
typedef $$IncidentsTableCreateCompanionBuilder = IncidentsCompanion Function({
  required String id,
  required String reporterProfileId,
  required IncidentCategory category,
  required IncidentPriority priority,
  Value<int?> peopleCount,
  Value<String?> shortNote,
  Value<double?> latitude,
  Value<double?> longitude,
  Value<double?> accuracyMeters,
  required LocationSource locationSource,
  required DateTime createdAt,
  required DateTime updatedAt,
  required IncidentStatus status,
  required IdentityAssurance identityAssurance,
  Value<int> rowid,
});
typedef $$IncidentsTableUpdateCompanionBuilder = IncidentsCompanion Function({
  Value<String> id,
  Value<String> reporterProfileId,
  Value<IncidentCategory> category,
  Value<IncidentPriority> priority,
  Value<int?> peopleCount,
  Value<String?> shortNote,
  Value<double?> latitude,
  Value<double?> longitude,
  Value<double?> accuracyMeters,
  Value<LocationSource> locationSource,
  Value<DateTime> createdAt,
  Value<DateTime> updatedAt,
  Value<IncidentStatus> status,
  Value<IdentityAssurance> identityAssurance,
  Value<int> rowid,
});

final class $$IncidentsTableReferences
    extends BaseReferences<_$AppDatabase, $IncidentsTable, Incident> {
  $$IncidentsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $IdentityProfilesTable _reporterProfileIdTable(_$AppDatabase db) =>
      db.identityProfiles.createAlias($_aliasNameGenerator(
          db.incidents.reporterProfileId, db.identityProfiles.id));

  $$IdentityProfilesTableProcessedTableManager get reporterProfileId {
    final $_column = $_itemColumn<String>('reporter_profile_id')!;

    final manager =
        $$IdentityProfilesTableTableManager($_db, $_db.identityProfiles)
            .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_reporterProfileIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static MultiTypedResultKey<$IncidentEventsTable, List<IncidentEvent>>
      _incidentEventsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.incidentEvents,
              aliasName: $_aliasNameGenerator(
                  db.incidents.id, db.incidentEvents.incidentId));

  $$IncidentEventsTableProcessedTableManager get incidentEventsRefs {
    final manager = $$IncidentEventsTableTableManager($_db, $_db.incidentEvents)
        .filter((f) => f.incidentId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_incidentEventsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$AttachmentsTable, List<Attachment>>
      _attachmentsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
          db.attachments,
          aliasName:
              $_aliasNameGenerator(db.incidents.id, db.attachments.incidentId));

  $$AttachmentsTableProcessedTableManager get attachmentsRefs {
    final manager = $$AttachmentsTableTableManager($_db, $_db.attachments)
        .filter((f) => f.incidentId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_attachmentsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$OriginBundlesTable, List<OriginBundle>>
      _originBundlesRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.originBundles,
              aliasName: $_aliasNameGenerator(
                  db.incidents.id, db.originBundles.incidentId));

  $$OriginBundlesTableProcessedTableManager get originBundlesRefs {
    final manager = $$OriginBundlesTableTableManager($_db, $_db.originBundles)
        .filter((f) => f.incidentId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_originBundlesRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$IncidentsTableFilterComposer
    extends Composer<_$AppDatabase, $IncidentsTable> {
  $$IncidentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<IncidentCategory, IncidentCategory, int>
      get category => $composableBuilder(
          column: $table.category,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<IncidentPriority, IncidentPriority, int>
      get priority => $composableBuilder(
          column: $table.priority,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get peopleCount => $composableBuilder(
      column: $table.peopleCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get shortNote => $composableBuilder(
      column: $table.shortNote, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get latitude => $composableBuilder(
      column: $table.latitude, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get longitude => $composableBuilder(
      column: $table.longitude, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get accuracyMeters => $composableBuilder(
      column: $table.accuracyMeters,
      builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<LocationSource, LocationSource, int>
      get locationSource => $composableBuilder(
          column: $table.locationSource,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<IncidentStatus, IncidentStatus, int>
      get status => $composableBuilder(
          column: $table.status,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<IdentityAssurance, IdentityAssurance, int>
      get identityAssurance => $composableBuilder(
          column: $table.identityAssurance,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  $$IdentityProfilesTableFilterComposer get reporterProfileId {
    final $$IdentityProfilesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.reporterProfileId,
        referencedTable: $db.identityProfiles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IdentityProfilesTableFilterComposer(
              $db: $db,
              $table: $db.identityProfiles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<bool> incidentEventsRefs(
      Expression<bool> Function($$IncidentEventsTableFilterComposer f) f) {
    final $$IncidentEventsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.incidentEvents,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentEventsTableFilterComposer(
              $db: $db,
              $table: $db.incidentEvents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> attachmentsRefs(
      Expression<bool> Function($$AttachmentsTableFilterComposer f) f) {
    final $$AttachmentsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.attachments,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$AttachmentsTableFilterComposer(
              $db: $db,
              $table: $db.attachments,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> originBundlesRefs(
      Expression<bool> Function($$OriginBundlesTableFilterComposer f) f) {
    final $$OriginBundlesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableFilterComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IncidentsTableOrderingComposer
    extends Composer<_$AppDatabase, $IncidentsTable> {
  $$IncidentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get category => $composableBuilder(
      column: $table.category, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get priority => $composableBuilder(
      column: $table.priority, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get peopleCount => $composableBuilder(
      column: $table.peopleCount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get shortNote => $composableBuilder(
      column: $table.shortNote, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get latitude => $composableBuilder(
      column: $table.latitude, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get longitude => $composableBuilder(
      column: $table.longitude, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get accuracyMeters => $composableBuilder(
      column: $table.accuracyMeters,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get locationSource => $composableBuilder(
      column: $table.locationSource,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get identityAssurance => $composableBuilder(
      column: $table.identityAssurance,
      builder: (column) => ColumnOrderings(column));

  $$IdentityProfilesTableOrderingComposer get reporterProfileId {
    final $$IdentityProfilesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.reporterProfileId,
        referencedTable: $db.identityProfiles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IdentityProfilesTableOrderingComposer(
              $db: $db,
              $table: $db.identityProfiles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$IncidentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $IncidentsTable> {
  $$IncidentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IncidentCategory, int> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IncidentPriority, int> get priority =>
      $composableBuilder(column: $table.priority, builder: (column) => column);

  GeneratedColumn<int> get peopleCount => $composableBuilder(
      column: $table.peopleCount, builder: (column) => column);

  GeneratedColumn<String> get shortNote =>
      $composableBuilder(column: $table.shortNote, builder: (column) => column);

  GeneratedColumn<double> get latitude =>
      $composableBuilder(column: $table.latitude, builder: (column) => column);

  GeneratedColumn<double> get longitude =>
      $composableBuilder(column: $table.longitude, builder: (column) => column);

  GeneratedColumn<double> get accuracyMeters => $composableBuilder(
      column: $table.accuracyMeters, builder: (column) => column);

  GeneratedColumnWithTypeConverter<LocationSource, int> get locationSource =>
      $composableBuilder(
          column: $table.locationSource, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IncidentStatus, int> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IdentityAssurance, int>
      get identityAssurance => $composableBuilder(
          column: $table.identityAssurance, builder: (column) => column);

  $$IdentityProfilesTableAnnotationComposer get reporterProfileId {
    final $$IdentityProfilesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.reporterProfileId,
        referencedTable: $db.identityProfiles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IdentityProfilesTableAnnotationComposer(
              $db: $db,
              $table: $db.identityProfiles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<T> incidentEventsRefs<T extends Object>(
      Expression<T> Function($$IncidentEventsTableAnnotationComposer a) f) {
    final $$IncidentEventsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.incidentEvents,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentEventsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidentEvents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> attachmentsRefs<T extends Object>(
      Expression<T> Function($$AttachmentsTableAnnotationComposer a) f) {
    final $$AttachmentsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.attachments,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$AttachmentsTableAnnotationComposer(
              $db: $db,
              $table: $db.attachments,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> originBundlesRefs<T extends Object>(
      Expression<T> Function($$OriginBundlesTableAnnotationComposer a) f) {
    final $$OriginBundlesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.incidentId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableAnnotationComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IncidentsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $IncidentsTable,
    Incident,
    $$IncidentsTableFilterComposer,
    $$IncidentsTableOrderingComposer,
    $$IncidentsTableAnnotationComposer,
    $$IncidentsTableCreateCompanionBuilder,
    $$IncidentsTableUpdateCompanionBuilder,
    (Incident, $$IncidentsTableReferences),
    Incident,
    PrefetchHooks Function(
        {bool reporterProfileId,
        bool incidentEventsRefs,
        bool attachmentsRefs,
        bool originBundlesRefs})> {
  $$IncidentsTableTableManager(_$AppDatabase db, $IncidentsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$IncidentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$IncidentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$IncidentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> reporterProfileId = const Value.absent(),
            Value<IncidentCategory> category = const Value.absent(),
            Value<IncidentPriority> priority = const Value.absent(),
            Value<int?> peopleCount = const Value.absent(),
            Value<String?> shortNote = const Value.absent(),
            Value<double?> latitude = const Value.absent(),
            Value<double?> longitude = const Value.absent(),
            Value<double?> accuracyMeters = const Value.absent(),
            Value<LocationSource> locationSource = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<IncidentStatus> status = const Value.absent(),
            Value<IdentityAssurance> identityAssurance = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              IncidentsCompanion(
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
            updatedAt: updatedAt,
            status: status,
            identityAssurance: identityAssurance,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String reporterProfileId,
            required IncidentCategory category,
            required IncidentPriority priority,
            Value<int?> peopleCount = const Value.absent(),
            Value<String?> shortNote = const Value.absent(),
            Value<double?> latitude = const Value.absent(),
            Value<double?> longitude = const Value.absent(),
            Value<double?> accuracyMeters = const Value.absent(),
            required LocationSource locationSource,
            required DateTime createdAt,
            required DateTime updatedAt,
            required IncidentStatus status,
            required IdentityAssurance identityAssurance,
            Value<int> rowid = const Value.absent(),
          }) =>
              IncidentsCompanion.insert(
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
            updatedAt: updatedAt,
            status: status,
            identityAssurance: identityAssurance,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$IncidentsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: (
              {reporterProfileId = false,
              incidentEventsRefs = false,
              attachmentsRefs = false,
              originBundlesRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (incidentEventsRefs) db.incidentEvents,
                if (attachmentsRefs) db.attachments,
                if (originBundlesRefs) db.originBundles
              ],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (reporterProfileId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.reporterProfileId,
                    referencedTable:
                        $$IncidentsTableReferences._reporterProfileIdTable(db),
                    referencedColumn: $$IncidentsTableReferences
                        ._reporterProfileIdTable(db)
                        .id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [
                  if (incidentEventsRefs)
                    await $_getPrefetchedData<Incident, $IncidentsTable,
                            IncidentEvent>(
                        currentTable: table,
                        referencedTable: $$IncidentsTableReferences
                            ._incidentEventsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$IncidentsTableReferences(db, table, p0)
                                .incidentEventsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.incidentId == item.id),
                        typedResults: items),
                  if (attachmentsRefs)
                    await $_getPrefetchedData<Incident, $IncidentsTable,
                            Attachment>(
                        currentTable: table,
                        referencedTable: $$IncidentsTableReferences
                            ._attachmentsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$IncidentsTableReferences(db, table, p0)
                                .attachmentsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.incidentId == item.id),
                        typedResults: items),
                  if (originBundlesRefs)
                    await $_getPrefetchedData<Incident, $IncidentsTable,
                            OriginBundle>(
                        currentTable: table,
                        referencedTable: $$IncidentsTableReferences
                            ._originBundlesRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$IncidentsTableReferences(db, table, p0)
                                .originBundlesRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.incidentId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$IncidentsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $IncidentsTable,
    Incident,
    $$IncidentsTableFilterComposer,
    $$IncidentsTableOrderingComposer,
    $$IncidentsTableAnnotationComposer,
    $$IncidentsTableCreateCompanionBuilder,
    $$IncidentsTableUpdateCompanionBuilder,
    (Incident, $$IncidentsTableReferences),
    Incident,
    PrefetchHooks Function(
        {bool reporterProfileId,
        bool incidentEventsRefs,
        bool attachmentsRefs,
        bool originBundlesRefs})>;
typedef $$IncidentEventsTableCreateCompanionBuilder = IncidentEventsCompanion
    Function({
  required String id,
  required String incidentId,
  required EventType eventType,
  required String signer,
  required String signature,
  required DateTime timestamp,
  required String payloadHash,
  Value<int> rowid,
});
typedef $$IncidentEventsTableUpdateCompanionBuilder = IncidentEventsCompanion
    Function({
  Value<String> id,
  Value<String> incidentId,
  Value<EventType> eventType,
  Value<String> signer,
  Value<String> signature,
  Value<DateTime> timestamp,
  Value<String> payloadHash,
  Value<int> rowid,
});

final class $$IncidentEventsTableReferences
    extends BaseReferences<_$AppDatabase, $IncidentEventsTable, IncidentEvent> {
  $$IncidentEventsTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $IncidentsTable _incidentIdTable(_$AppDatabase db) =>
      db.incidents.createAlias(
          $_aliasNameGenerator(db.incidentEvents.incidentId, db.incidents.id));

  $$IncidentsTableProcessedTableManager get incidentId {
    final $_column = $_itemColumn<String>('incident_id')!;

    final manager = $$IncidentsTableTableManager($_db, $_db.incidents)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_incidentIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static MultiTypedResultKey<$OriginBundlesTable, List<OriginBundle>>
      _originBundlesRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.originBundles,
              aliasName: $_aliasNameGenerator(
                  db.incidentEvents.id, db.originBundles.eventId));

  $$OriginBundlesTableProcessedTableManager get originBundlesRefs {
    final manager = $$OriginBundlesTableTableManager($_db, $_db.originBundles)
        .filter((f) => f.eventId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_originBundlesRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$IncidentEventsTableFilterComposer
    extends Composer<_$AppDatabase, $IncidentEventsTable> {
  $$IncidentEventsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<EventType, EventType, int> get eventType =>
      $composableBuilder(
          column: $table.eventType,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get signer => $composableBuilder(
      column: $table.signer, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get signature => $composableBuilder(
      column: $table.signature, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get timestamp => $composableBuilder(
      column: $table.timestamp, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnFilters(column));

  $$IncidentsTableFilterComposer get incidentId {
    final $$IncidentsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableFilterComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<bool> originBundlesRefs(
      Expression<bool> Function($$OriginBundlesTableFilterComposer f) f) {
    final $$OriginBundlesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.eventId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableFilterComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IncidentEventsTableOrderingComposer
    extends Composer<_$AppDatabase, $IncidentEventsTable> {
  $$IncidentEventsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get eventType => $composableBuilder(
      column: $table.eventType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get signer => $composableBuilder(
      column: $table.signer, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get signature => $composableBuilder(
      column: $table.signature, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get timestamp => $composableBuilder(
      column: $table.timestamp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnOrderings(column));

  $$IncidentsTableOrderingComposer get incidentId {
    final $$IncidentsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableOrderingComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$IncidentEventsTableAnnotationComposer
    extends Composer<_$AppDatabase, $IncidentEventsTable> {
  $$IncidentEventsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumnWithTypeConverter<EventType, int> get eventType =>
      $composableBuilder(column: $table.eventType, builder: (column) => column);

  GeneratedColumn<String> get signer =>
      $composableBuilder(column: $table.signer, builder: (column) => column);

  GeneratedColumn<String> get signature =>
      $composableBuilder(column: $table.signature, builder: (column) => column);

  GeneratedColumn<DateTime> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => column);

  GeneratedColumn<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => column);

  $$IncidentsTableAnnotationComposer get incidentId {
    final $$IncidentsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<T> originBundlesRefs<T extends Object>(
      Expression<T> Function($$OriginBundlesTableAnnotationComposer a) f) {
    final $$OriginBundlesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.eventId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableAnnotationComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$IncidentEventsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $IncidentEventsTable,
    IncidentEvent,
    $$IncidentEventsTableFilterComposer,
    $$IncidentEventsTableOrderingComposer,
    $$IncidentEventsTableAnnotationComposer,
    $$IncidentEventsTableCreateCompanionBuilder,
    $$IncidentEventsTableUpdateCompanionBuilder,
    (IncidentEvent, $$IncidentEventsTableReferences),
    IncidentEvent,
    PrefetchHooks Function({bool incidentId, bool originBundlesRefs})> {
  $$IncidentEventsTableTableManager(
      _$AppDatabase db, $IncidentEventsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$IncidentEventsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$IncidentEventsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$IncidentEventsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> incidentId = const Value.absent(),
            Value<EventType> eventType = const Value.absent(),
            Value<String> signer = const Value.absent(),
            Value<String> signature = const Value.absent(),
            Value<DateTime> timestamp = const Value.absent(),
            Value<String> payloadHash = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              IncidentEventsCompanion(
            id: id,
            incidentId: incidentId,
            eventType: eventType,
            signer: signer,
            signature: signature,
            timestamp: timestamp,
            payloadHash: payloadHash,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String incidentId,
            required EventType eventType,
            required String signer,
            required String signature,
            required DateTime timestamp,
            required String payloadHash,
            Value<int> rowid = const Value.absent(),
          }) =>
              IncidentEventsCompanion.insert(
            id: id,
            incidentId: incidentId,
            eventType: eventType,
            signer: signer,
            signature: signature,
            timestamp: timestamp,
            payloadHash: payloadHash,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$IncidentEventsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: (
              {incidentId = false, originBundlesRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (originBundlesRefs) db.originBundles
              ],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (incidentId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.incidentId,
                    referencedTable:
                        $$IncidentEventsTableReferences._incidentIdTable(db),
                    referencedColumn:
                        $$IncidentEventsTableReferences._incidentIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [
                  if (originBundlesRefs)
                    await $_getPrefetchedData<IncidentEvent, $IncidentEventsTable,
                            OriginBundle>(
                        currentTable: table,
                        referencedTable: $$IncidentEventsTableReferences
                            ._originBundlesRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$IncidentEventsTableReferences(db, table, p0)
                                .originBundlesRefs,
                        referencedItemsForCurrentItem: (item,
                                referencedItems) =>
                            referencedItems.where((e) => e.eventId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$IncidentEventsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $IncidentEventsTable,
    IncidentEvent,
    $$IncidentEventsTableFilterComposer,
    $$IncidentEventsTableOrderingComposer,
    $$IncidentEventsTableAnnotationComposer,
    $$IncidentEventsTableCreateCompanionBuilder,
    $$IncidentEventsTableUpdateCompanionBuilder,
    (IncidentEvent, $$IncidentEventsTableReferences),
    IncidentEvent,
    PrefetchHooks Function({bool incidentId, bool originBundlesRefs})>;
typedef $$AttachmentsTableCreateCompanionBuilder = AttachmentsCompanion
    Function({
  required String id,
  required String incidentId,
  required AttachmentKind kind,
  required String localPath,
  required String sha256,
  required int sizeBytes,
  required DateTime capturedAt,
  required AttachmentSyncStatus syncStatus,
  Value<String?> remoteUrl,
  Value<int> rowid,
});
typedef $$AttachmentsTableUpdateCompanionBuilder = AttachmentsCompanion
    Function({
  Value<String> id,
  Value<String> incidentId,
  Value<AttachmentKind> kind,
  Value<String> localPath,
  Value<String> sha256,
  Value<int> sizeBytes,
  Value<DateTime> capturedAt,
  Value<AttachmentSyncStatus> syncStatus,
  Value<String?> remoteUrl,
  Value<int> rowid,
});

final class $$AttachmentsTableReferences
    extends BaseReferences<_$AppDatabase, $AttachmentsTable, Attachment> {
  $$AttachmentsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $IncidentsTable _incidentIdTable(_$AppDatabase db) =>
      db.incidents.createAlias(
          $_aliasNameGenerator(db.attachments.incidentId, db.incidents.id));

  $$IncidentsTableProcessedTableManager get incidentId {
    final $_column = $_itemColumn<String>('incident_id')!;

    final manager = $$IncidentsTableTableManager($_db, $_db.incidents)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_incidentIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$AttachmentsTableFilterComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<AttachmentKind, AttachmentKind, int>
      get kind => $composableBuilder(
          column: $table.kind,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get localPath => $composableBuilder(
      column: $table.localPath, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sha256 => $composableBuilder(
      column: $table.sha256, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get sizeBytes => $composableBuilder(
      column: $table.sizeBytes, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<AttachmentSyncStatus, AttachmentSyncStatus,
          int>
      get syncStatus => $composableBuilder(
          column: $table.syncStatus,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get remoteUrl => $composableBuilder(
      column: $table.remoteUrl, builder: (column) => ColumnFilters(column));

  $$IncidentsTableFilterComposer get incidentId {
    final $$IncidentsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableFilterComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$AttachmentsTableOrderingComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get localPath => $composableBuilder(
      column: $table.localPath, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sha256 => $composableBuilder(
      column: $table.sha256, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get sizeBytes => $composableBuilder(
      column: $table.sizeBytes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get syncStatus => $composableBuilder(
      column: $table.syncStatus, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get remoteUrl => $composableBuilder(
      column: $table.remoteUrl, builder: (column) => ColumnOrderings(column));

  $$IncidentsTableOrderingComposer get incidentId {
    final $$IncidentsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableOrderingComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$AttachmentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AttachmentsTable> {
  $$AttachmentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumnWithTypeConverter<AttachmentKind, int> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get localPath =>
      $composableBuilder(column: $table.localPath, builder: (column) => column);

  GeneratedColumn<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<int> get sizeBytes =>
      $composableBuilder(column: $table.sizeBytes, builder: (column) => column);

  GeneratedColumn<DateTime> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => column);

  GeneratedColumnWithTypeConverter<AttachmentSyncStatus, int> get syncStatus =>
      $composableBuilder(
          column: $table.syncStatus, builder: (column) => column);

  GeneratedColumn<String> get remoteUrl =>
      $composableBuilder(column: $table.remoteUrl, builder: (column) => column);

  $$IncidentsTableAnnotationComposer get incidentId {
    final $$IncidentsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$AttachmentsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AttachmentsTable,
    Attachment,
    $$AttachmentsTableFilterComposer,
    $$AttachmentsTableOrderingComposer,
    $$AttachmentsTableAnnotationComposer,
    $$AttachmentsTableCreateCompanionBuilder,
    $$AttachmentsTableUpdateCompanionBuilder,
    (Attachment, $$AttachmentsTableReferences),
    Attachment,
    PrefetchHooks Function({bool incidentId})> {
  $$AttachmentsTableTableManager(_$AppDatabase db, $AttachmentsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttachmentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttachmentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttachmentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> incidentId = const Value.absent(),
            Value<AttachmentKind> kind = const Value.absent(),
            Value<String> localPath = const Value.absent(),
            Value<String> sha256 = const Value.absent(),
            Value<int> sizeBytes = const Value.absent(),
            Value<DateTime> capturedAt = const Value.absent(),
            Value<AttachmentSyncStatus> syncStatus = const Value.absent(),
            Value<String?> remoteUrl = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AttachmentsCompanion(
            id: id,
            incidentId: incidentId,
            kind: kind,
            localPath: localPath,
            sha256: sha256,
            sizeBytes: sizeBytes,
            capturedAt: capturedAt,
            syncStatus: syncStatus,
            remoteUrl: remoteUrl,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String incidentId,
            required AttachmentKind kind,
            required String localPath,
            required String sha256,
            required int sizeBytes,
            required DateTime capturedAt,
            required AttachmentSyncStatus syncStatus,
            Value<String?> remoteUrl = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AttachmentsCompanion.insert(
            id: id,
            incidentId: incidentId,
            kind: kind,
            localPath: localPath,
            sha256: sha256,
            sizeBytes: sizeBytes,
            capturedAt: capturedAt,
            syncStatus: syncStatus,
            remoteUrl: remoteUrl,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$AttachmentsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({incidentId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (incidentId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.incidentId,
                    referencedTable:
                        $$AttachmentsTableReferences._incidentIdTable(db),
                    referencedColumn:
                        $$AttachmentsTableReferences._incidentIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$AttachmentsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $AttachmentsTable,
    Attachment,
    $$AttachmentsTableFilterComposer,
    $$AttachmentsTableOrderingComposer,
    $$AttachmentsTableAnnotationComposer,
    $$AttachmentsTableCreateCompanionBuilder,
    $$AttachmentsTableUpdateCompanionBuilder,
    (Attachment, $$AttachmentsTableReferences),
    Attachment,
    PrefetchHooks Function({bool incidentId})>;
typedef $$OriginBundlesTableCreateCompanionBuilder = OriginBundlesCompanion
    Function({
  required String id,
  required String incidentId,
  required String eventId,
  required IncidentPriority priority,
  required String canonicalHeader,
  Value<String?> ciphertextPath,
  Value<Uint8List?> ciphertextBytes,
  required String payloadHash,
  required DateTime expiresAt,
  required DeliveryState state,
  required DateTime createdAt,
  Value<DateTime?> lastAttemptAt,
  Value<String?> serverReceiptId,
  Value<int> hopLimit,
  Value<int> copyBudget,
  Value<int> rowid,
});
typedef $$OriginBundlesTableUpdateCompanionBuilder = OriginBundlesCompanion
    Function({
  Value<String> id,
  Value<String> incidentId,
  Value<String> eventId,
  Value<IncidentPriority> priority,
  Value<String> canonicalHeader,
  Value<String?> ciphertextPath,
  Value<Uint8List?> ciphertextBytes,
  Value<String> payloadHash,
  Value<DateTime> expiresAt,
  Value<DeliveryState> state,
  Value<DateTime> createdAt,
  Value<DateTime?> lastAttemptAt,
  Value<String?> serverReceiptId,
  Value<int> hopLimit,
  Value<int> copyBudget,
  Value<int> rowid,
});

final class $$OriginBundlesTableReferences
    extends BaseReferences<_$AppDatabase, $OriginBundlesTable, OriginBundle> {
  $$OriginBundlesTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $IncidentsTable _incidentIdTable(_$AppDatabase db) =>
      db.incidents.createAlias(
          $_aliasNameGenerator(db.originBundles.incidentId, db.incidents.id));

  $$IncidentsTableProcessedTableManager get incidentId {
    final $_column = $_itemColumn<String>('incident_id')!;

    final manager = $$IncidentsTableTableManager($_db, $_db.incidents)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_incidentIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static $IncidentEventsTable _eventIdTable(_$AppDatabase db) =>
      db.incidentEvents.createAlias(
          $_aliasNameGenerator(db.originBundles.eventId, db.incidentEvents.id));

  $$IncidentEventsTableProcessedTableManager get eventId {
    final $_column = $_itemColumn<String>('event_id')!;

    final manager = $$IncidentEventsTableTableManager($_db, $_db.incidentEvents)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_eventIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static MultiTypedResultKey<$DeliveryAttemptsTable, List<DeliveryAttempt>>
      _deliveryAttemptsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.deliveryAttempts,
              aliasName: $_aliasNameGenerator(
                  db.originBundles.id, db.deliveryAttempts.messageId));

  $$DeliveryAttemptsTableProcessedTableManager get deliveryAttemptsRefs {
    final manager = $$DeliveryAttemptsTableTableManager(
            $_db, $_db.deliveryAttempts)
        .filter((f) => f.messageId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache =
        $_typedResult.readTableOrNull(_deliveryAttemptsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$ServerReceiptsTable, List<ServerReceipt>>
      _serverReceiptsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.serverReceipts,
              aliasName: $_aliasNameGenerator(
                  db.originBundles.id, db.serverReceipts.messageId));

  $$ServerReceiptsTableProcessedTableManager get serverReceiptsRefs {
    final manager = $$ServerReceiptsTableTableManager($_db, $_db.serverReceipts)
        .filter((f) => f.messageId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_serverReceiptsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$OriginBundlesTableFilterComposer
    extends Composer<_$AppDatabase, $OriginBundlesTable> {
  $$OriginBundlesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<IncidentPriority, IncidentPriority, int>
      get priority => $composableBuilder(
          column: $table.priority,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get canonicalHeader => $composableBuilder(
      column: $table.canonicalHeader,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get ciphertextPath => $composableBuilder(
      column: $table.ciphertextPath,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<Uint8List> get ciphertextBytes => $composableBuilder(
      column: $table.ciphertextBytes,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<DeliveryState, DeliveryState, int> get state =>
      $composableBuilder(
          column: $table.state,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get serverReceiptId => $composableBuilder(
      column: $table.serverReceiptId,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get hopLimit => $composableBuilder(
      column: $table.hopLimit, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get copyBudget => $composableBuilder(
      column: $table.copyBudget, builder: (column) => ColumnFilters(column));

  $$IncidentsTableFilterComposer get incidentId {
    final $$IncidentsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableFilterComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$IncidentEventsTableFilterComposer get eventId {
    final $$IncidentEventsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.eventId,
        referencedTable: $db.incidentEvents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentEventsTableFilterComposer(
              $db: $db,
              $table: $db.incidentEvents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<bool> deliveryAttemptsRefs(
      Expression<bool> Function($$DeliveryAttemptsTableFilterComposer f) f) {
    final $$DeliveryAttemptsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.deliveryAttempts,
        getReferencedColumn: (t) => t.messageId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$DeliveryAttemptsTableFilterComposer(
              $db: $db,
              $table: $db.deliveryAttempts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> serverReceiptsRefs(
      Expression<bool> Function($$ServerReceiptsTableFilterComposer f) f) {
    final $$ServerReceiptsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.serverReceipts,
        getReferencedColumn: (t) => t.messageId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$ServerReceiptsTableFilterComposer(
              $db: $db,
              $table: $db.serverReceipts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$OriginBundlesTableOrderingComposer
    extends Composer<_$AppDatabase, $OriginBundlesTable> {
  $$OriginBundlesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get priority => $composableBuilder(
      column: $table.priority, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get canonicalHeader => $composableBuilder(
      column: $table.canonicalHeader,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get ciphertextPath => $composableBuilder(
      column: $table.ciphertextPath,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<Uint8List> get ciphertextBytes => $composableBuilder(
      column: $table.ciphertextBytes,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get state => $composableBuilder(
      column: $table.state, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get serverReceiptId => $composableBuilder(
      column: $table.serverReceiptId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get hopLimit => $composableBuilder(
      column: $table.hopLimit, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get copyBudget => $composableBuilder(
      column: $table.copyBudget, builder: (column) => ColumnOrderings(column));

  $$IncidentsTableOrderingComposer get incidentId {
    final $$IncidentsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableOrderingComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$IncidentEventsTableOrderingComposer get eventId {
    final $$IncidentEventsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.eventId,
        referencedTable: $db.incidentEvents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentEventsTableOrderingComposer(
              $db: $db,
              $table: $db.incidentEvents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$OriginBundlesTableAnnotationComposer
    extends Composer<_$AppDatabase, $OriginBundlesTable> {
  $$OriginBundlesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumnWithTypeConverter<IncidentPriority, int> get priority =>
      $composableBuilder(column: $table.priority, builder: (column) => column);

  GeneratedColumn<String> get canonicalHeader => $composableBuilder(
      column: $table.canonicalHeader, builder: (column) => column);

  GeneratedColumn<String> get ciphertextPath => $composableBuilder(
      column: $table.ciphertextPath, builder: (column) => column);

  GeneratedColumn<Uint8List> get ciphertextBytes => $composableBuilder(
      column: $table.ciphertextBytes, builder: (column) => column);

  GeneratedColumn<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => column);

  GeneratedColumn<DateTime> get expiresAt =>
      $composableBuilder(column: $table.expiresAt, builder: (column) => column);

  GeneratedColumnWithTypeConverter<DeliveryState, int> get state =>
      $composableBuilder(column: $table.state, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt, builder: (column) => column);

  GeneratedColumn<String> get serverReceiptId => $composableBuilder(
      column: $table.serverReceiptId, builder: (column) => column);

  GeneratedColumn<int> get hopLimit =>
      $composableBuilder(column: $table.hopLimit, builder: (column) => column);

  GeneratedColumn<int> get copyBudget => $composableBuilder(
      column: $table.copyBudget, builder: (column) => column);

  $$IncidentsTableAnnotationComposer get incidentId {
    final $$IncidentsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.incidentId,
        referencedTable: $db.incidents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$IncidentEventsTableAnnotationComposer get eventId {
    final $$IncidentEventsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.eventId,
        referencedTable: $db.incidentEvents,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$IncidentEventsTableAnnotationComposer(
              $db: $db,
              $table: $db.incidentEvents,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<T> deliveryAttemptsRefs<T extends Object>(
      Expression<T> Function($$DeliveryAttemptsTableAnnotationComposer a) f) {
    final $$DeliveryAttemptsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.deliveryAttempts,
        getReferencedColumn: (t) => t.messageId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$DeliveryAttemptsTableAnnotationComposer(
              $db: $db,
              $table: $db.deliveryAttempts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> serverReceiptsRefs<T extends Object>(
      Expression<T> Function($$ServerReceiptsTableAnnotationComposer a) f) {
    final $$ServerReceiptsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.serverReceipts,
        getReferencedColumn: (t) => t.messageId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$ServerReceiptsTableAnnotationComposer(
              $db: $db,
              $table: $db.serverReceipts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$OriginBundlesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $OriginBundlesTable,
    OriginBundle,
    $$OriginBundlesTableFilterComposer,
    $$OriginBundlesTableOrderingComposer,
    $$OriginBundlesTableAnnotationComposer,
    $$OriginBundlesTableCreateCompanionBuilder,
    $$OriginBundlesTableUpdateCompanionBuilder,
    (OriginBundle, $$OriginBundlesTableReferences),
    OriginBundle,
    PrefetchHooks Function(
        {bool incidentId,
        bool eventId,
        bool deliveryAttemptsRefs,
        bool serverReceiptsRefs})> {
  $$OriginBundlesTableTableManager(_$AppDatabase db, $OriginBundlesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OriginBundlesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OriginBundlesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OriginBundlesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> incidentId = const Value.absent(),
            Value<String> eventId = const Value.absent(),
            Value<IncidentPriority> priority = const Value.absent(),
            Value<String> canonicalHeader = const Value.absent(),
            Value<String?> ciphertextPath = const Value.absent(),
            Value<Uint8List?> ciphertextBytes = const Value.absent(),
            Value<String> payloadHash = const Value.absent(),
            Value<DateTime> expiresAt = const Value.absent(),
            Value<DeliveryState> state = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<DateTime?> lastAttemptAt = const Value.absent(),
            Value<String?> serverReceiptId = const Value.absent(),
            Value<int> hopLimit = const Value.absent(),
            Value<int> copyBudget = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              OriginBundlesCompanion(
            id: id,
            incidentId: incidentId,
            eventId: eventId,
            priority: priority,
            canonicalHeader: canonicalHeader,
            ciphertextPath: ciphertextPath,
            ciphertextBytes: ciphertextBytes,
            payloadHash: payloadHash,
            expiresAt: expiresAt,
            state: state,
            createdAt: createdAt,
            lastAttemptAt: lastAttemptAt,
            serverReceiptId: serverReceiptId,
            hopLimit: hopLimit,
            copyBudget: copyBudget,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String incidentId,
            required String eventId,
            required IncidentPriority priority,
            required String canonicalHeader,
            Value<String?> ciphertextPath = const Value.absent(),
            Value<Uint8List?> ciphertextBytes = const Value.absent(),
            required String payloadHash,
            required DateTime expiresAt,
            required DeliveryState state,
            required DateTime createdAt,
            Value<DateTime?> lastAttemptAt = const Value.absent(),
            Value<String?> serverReceiptId = const Value.absent(),
            Value<int> hopLimit = const Value.absent(),
            Value<int> copyBudget = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              OriginBundlesCompanion.insert(
            id: id,
            incidentId: incidentId,
            eventId: eventId,
            priority: priority,
            canonicalHeader: canonicalHeader,
            ciphertextPath: ciphertextPath,
            ciphertextBytes: ciphertextBytes,
            payloadHash: payloadHash,
            expiresAt: expiresAt,
            state: state,
            createdAt: createdAt,
            lastAttemptAt: lastAttemptAt,
            serverReceiptId: serverReceiptId,
            hopLimit: hopLimit,
            copyBudget: copyBudget,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$OriginBundlesTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: (
              {incidentId = false,
              eventId = false,
              deliveryAttemptsRefs = false,
              serverReceiptsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (deliveryAttemptsRefs) db.deliveryAttempts,
                if (serverReceiptsRefs) db.serverReceipts
              ],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (incidentId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.incidentId,
                    referencedTable:
                        $$OriginBundlesTableReferences._incidentIdTable(db),
                    referencedColumn:
                        $$OriginBundlesTableReferences._incidentIdTable(db).id,
                  ) as T;
                }
                if (eventId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.eventId,
                    referencedTable:
                        $$OriginBundlesTableReferences._eventIdTable(db),
                    referencedColumn:
                        $$OriginBundlesTableReferences._eventIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [
                  if (deliveryAttemptsRefs)
                    await $_getPrefetchedData<OriginBundle, $OriginBundlesTable,
                            DeliveryAttempt>(
                        currentTable: table,
                        referencedTable: $$OriginBundlesTableReferences
                            ._deliveryAttemptsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$OriginBundlesTableReferences(db, table, p0)
                                .deliveryAttemptsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.messageId == item.id),
                        typedResults: items),
                  if (serverReceiptsRefs)
                    await $_getPrefetchedData<OriginBundle, $OriginBundlesTable,
                            ServerReceipt>(
                        currentTable: table,
                        referencedTable: $$OriginBundlesTableReferences
                            ._serverReceiptsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$OriginBundlesTableReferences(db, table, p0)
                                .serverReceiptsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.messageId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$OriginBundlesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $OriginBundlesTable,
    OriginBundle,
    $$OriginBundlesTableFilterComposer,
    $$OriginBundlesTableOrderingComposer,
    $$OriginBundlesTableAnnotationComposer,
    $$OriginBundlesTableCreateCompanionBuilder,
    $$OriginBundlesTableUpdateCompanionBuilder,
    (OriginBundle, $$OriginBundlesTableReferences),
    OriginBundle,
    PrefetchHooks Function(
        {bool incidentId,
        bool eventId,
        bool deliveryAttemptsRefs,
        bool serverReceiptsRefs})>;
typedef $$DeliveryAttemptsTableCreateCompanionBuilder
    = DeliveryAttemptsCompanion Function({
  required String id,
  required String messageId,
  required String linkId,
  Value<String?> peerIdHash,
  required DateTime startedAt,
  Value<DateTime?> finishedAt,
  required DeliveryOutcome outcome,
  Value<int> bytesTransferred,
  Value<String?> errorCode,
  Value<int> rowid,
});
typedef $$DeliveryAttemptsTableUpdateCompanionBuilder
    = DeliveryAttemptsCompanion Function({
  Value<String> id,
  Value<String> messageId,
  Value<String> linkId,
  Value<String?> peerIdHash,
  Value<DateTime> startedAt,
  Value<DateTime?> finishedAt,
  Value<DeliveryOutcome> outcome,
  Value<int> bytesTransferred,
  Value<String?> errorCode,
  Value<int> rowid,
});

final class $$DeliveryAttemptsTableReferences extends BaseReferences<
    _$AppDatabase, $DeliveryAttemptsTable, DeliveryAttempt> {
  $$DeliveryAttemptsTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $OriginBundlesTable _messageIdTable(_$AppDatabase db) =>
      db.originBundles.createAlias($_aliasNameGenerator(
          db.deliveryAttempts.messageId, db.originBundles.id));

  $$OriginBundlesTableProcessedTableManager get messageId {
    final $_column = $_itemColumn<String>('message_id')!;

    final manager = $$OriginBundlesTableTableManager($_db, $_db.originBundles)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_messageIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$DeliveryAttemptsTableFilterComposer
    extends Composer<_$AppDatabase, $DeliveryAttemptsTable> {
  $$DeliveryAttemptsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get linkId => $composableBuilder(
      column: $table.linkId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get peerIdHash => $composableBuilder(
      column: $table.peerIdHash, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get startedAt => $composableBuilder(
      column: $table.startedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get finishedAt => $composableBuilder(
      column: $table.finishedAt, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<DeliveryOutcome, DeliveryOutcome, int>
      get outcome => $composableBuilder(
          column: $table.outcome,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get bytesTransferred => $composableBuilder(
      column: $table.bytesTransferred,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get errorCode => $composableBuilder(
      column: $table.errorCode, builder: (column) => ColumnFilters(column));

  $$OriginBundlesTableFilterComposer get messageId {
    final $$OriginBundlesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableFilterComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$DeliveryAttemptsTableOrderingComposer
    extends Composer<_$AppDatabase, $DeliveryAttemptsTable> {
  $$DeliveryAttemptsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get linkId => $composableBuilder(
      column: $table.linkId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get peerIdHash => $composableBuilder(
      column: $table.peerIdHash, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get startedAt => $composableBuilder(
      column: $table.startedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get finishedAt => $composableBuilder(
      column: $table.finishedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get outcome => $composableBuilder(
      column: $table.outcome, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get bytesTransferred => $composableBuilder(
      column: $table.bytesTransferred,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get errorCode => $composableBuilder(
      column: $table.errorCode, builder: (column) => ColumnOrderings(column));

  $$OriginBundlesTableOrderingComposer get messageId {
    final $$OriginBundlesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableOrderingComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$DeliveryAttemptsTableAnnotationComposer
    extends Composer<_$AppDatabase, $DeliveryAttemptsTable> {
  $$DeliveryAttemptsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get linkId =>
      $composableBuilder(column: $table.linkId, builder: (column) => column);

  GeneratedColumn<String> get peerIdHash => $composableBuilder(
      column: $table.peerIdHash, builder: (column) => column);

  GeneratedColumn<DateTime> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get finishedAt => $composableBuilder(
      column: $table.finishedAt, builder: (column) => column);

  GeneratedColumnWithTypeConverter<DeliveryOutcome, int> get outcome =>
      $composableBuilder(column: $table.outcome, builder: (column) => column);

  GeneratedColumn<int> get bytesTransferred => $composableBuilder(
      column: $table.bytesTransferred, builder: (column) => column);

  GeneratedColumn<String> get errorCode =>
      $composableBuilder(column: $table.errorCode, builder: (column) => column);

  $$OriginBundlesTableAnnotationComposer get messageId {
    final $$OriginBundlesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableAnnotationComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$DeliveryAttemptsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $DeliveryAttemptsTable,
    DeliveryAttempt,
    $$DeliveryAttemptsTableFilterComposer,
    $$DeliveryAttemptsTableOrderingComposer,
    $$DeliveryAttemptsTableAnnotationComposer,
    $$DeliveryAttemptsTableCreateCompanionBuilder,
    $$DeliveryAttemptsTableUpdateCompanionBuilder,
    (DeliveryAttempt, $$DeliveryAttemptsTableReferences),
    DeliveryAttempt,
    PrefetchHooks Function({bool messageId})> {
  $$DeliveryAttemptsTableTableManager(
      _$AppDatabase db, $DeliveryAttemptsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DeliveryAttemptsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DeliveryAttemptsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DeliveryAttemptsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> messageId = const Value.absent(),
            Value<String> linkId = const Value.absent(),
            Value<String?> peerIdHash = const Value.absent(),
            Value<DateTime> startedAt = const Value.absent(),
            Value<DateTime?> finishedAt = const Value.absent(),
            Value<DeliveryOutcome> outcome = const Value.absent(),
            Value<int> bytesTransferred = const Value.absent(),
            Value<String?> errorCode = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              DeliveryAttemptsCompanion(
            id: id,
            messageId: messageId,
            linkId: linkId,
            peerIdHash: peerIdHash,
            startedAt: startedAt,
            finishedAt: finishedAt,
            outcome: outcome,
            bytesTransferred: bytesTransferred,
            errorCode: errorCode,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String messageId,
            required String linkId,
            Value<String?> peerIdHash = const Value.absent(),
            required DateTime startedAt,
            Value<DateTime?> finishedAt = const Value.absent(),
            required DeliveryOutcome outcome,
            Value<int> bytesTransferred = const Value.absent(),
            Value<String?> errorCode = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              DeliveryAttemptsCompanion.insert(
            id: id,
            messageId: messageId,
            linkId: linkId,
            peerIdHash: peerIdHash,
            startedAt: startedAt,
            finishedAt: finishedAt,
            outcome: outcome,
            bytesTransferred: bytesTransferred,
            errorCode: errorCode,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$DeliveryAttemptsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({messageId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (messageId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.messageId,
                    referencedTable:
                        $$DeliveryAttemptsTableReferences._messageIdTable(db),
                    referencedColumn: $$DeliveryAttemptsTableReferences
                        ._messageIdTable(db)
                        .id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$DeliveryAttemptsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $DeliveryAttemptsTable,
    DeliveryAttempt,
    $$DeliveryAttemptsTableFilterComposer,
    $$DeliveryAttemptsTableOrderingComposer,
    $$DeliveryAttemptsTableAnnotationComposer,
    $$DeliveryAttemptsTableCreateCompanionBuilder,
    $$DeliveryAttemptsTableUpdateCompanionBuilder,
    (DeliveryAttempt, $$DeliveryAttemptsTableReferences),
    DeliveryAttempt,
    PrefetchHooks Function({bool messageId})>;
typedef $$ServerReceiptsTableCreateCompanionBuilder = ServerReceiptsCompanion
    Function({
  required String id,
  required String receiptId,
  required String messageId,
  required String payloadHash,
  required DateTime serverReceivedAt,
  required String serverKeyId,
  required String signature,
  Value<DateTime?> verifiedAt,
  Value<int> rowid,
});
typedef $$ServerReceiptsTableUpdateCompanionBuilder = ServerReceiptsCompanion
    Function({
  Value<String> id,
  Value<String> receiptId,
  Value<String> messageId,
  Value<String> payloadHash,
  Value<DateTime> serverReceivedAt,
  Value<String> serverKeyId,
  Value<String> signature,
  Value<DateTime?> verifiedAt,
  Value<int> rowid,
});

final class $$ServerReceiptsTableReferences
    extends BaseReferences<_$AppDatabase, $ServerReceiptsTable, ServerReceipt> {
  $$ServerReceiptsTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $OriginBundlesTable _messageIdTable(_$AppDatabase db) =>
      db.originBundles.createAlias($_aliasNameGenerator(
          db.serverReceipts.messageId, db.originBundles.id));

  $$OriginBundlesTableProcessedTableManager get messageId {
    final $_column = $_itemColumn<String>('message_id')!;

    final manager = $$OriginBundlesTableTableManager($_db, $_db.originBundles)
        .filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_messageIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$ServerReceiptsTableFilterComposer
    extends Composer<_$AppDatabase, $ServerReceiptsTable> {
  $$ServerReceiptsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get receiptId => $composableBuilder(
      column: $table.receiptId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get serverReceivedAt => $composableBuilder(
      column: $table.serverReceivedAt,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get serverKeyId => $composableBuilder(
      column: $table.serverKeyId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get signature => $composableBuilder(
      column: $table.signature, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get verifiedAt => $composableBuilder(
      column: $table.verifiedAt, builder: (column) => ColumnFilters(column));

  $$OriginBundlesTableFilterComposer get messageId {
    final $$OriginBundlesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableFilterComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$ServerReceiptsTableOrderingComposer
    extends Composer<_$AppDatabase, $ServerReceiptsTable> {
  $$ServerReceiptsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get receiptId => $composableBuilder(
      column: $table.receiptId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get serverReceivedAt => $composableBuilder(
      column: $table.serverReceivedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get serverKeyId => $composableBuilder(
      column: $table.serverKeyId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get signature => $composableBuilder(
      column: $table.signature, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get verifiedAt => $composableBuilder(
      column: $table.verifiedAt, builder: (column) => ColumnOrderings(column));

  $$OriginBundlesTableOrderingComposer get messageId {
    final $$OriginBundlesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableOrderingComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$ServerReceiptsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ServerReceiptsTable> {
  $$ServerReceiptsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get receiptId =>
      $composableBuilder(column: $table.receiptId, builder: (column) => column);

  GeneratedColumn<String> get payloadHash => $composableBuilder(
      column: $table.payloadHash, builder: (column) => column);

  GeneratedColumn<DateTime> get serverReceivedAt => $composableBuilder(
      column: $table.serverReceivedAt, builder: (column) => column);

  GeneratedColumn<String> get serverKeyId => $composableBuilder(
      column: $table.serverKeyId, builder: (column) => column);

  GeneratedColumn<String> get signature =>
      $composableBuilder(column: $table.signature, builder: (column) => column);

  GeneratedColumn<DateTime> get verifiedAt => $composableBuilder(
      column: $table.verifiedAt, builder: (column) => column);

  $$OriginBundlesTableAnnotationComposer get messageId {
    final $$OriginBundlesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.messageId,
        referencedTable: $db.originBundles,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$OriginBundlesTableAnnotationComposer(
              $db: $db,
              $table: $db.originBundles,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$ServerReceiptsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ServerReceiptsTable,
    ServerReceipt,
    $$ServerReceiptsTableFilterComposer,
    $$ServerReceiptsTableOrderingComposer,
    $$ServerReceiptsTableAnnotationComposer,
    $$ServerReceiptsTableCreateCompanionBuilder,
    $$ServerReceiptsTableUpdateCompanionBuilder,
    (ServerReceipt, $$ServerReceiptsTableReferences),
    ServerReceipt,
    PrefetchHooks Function({bool messageId})> {
  $$ServerReceiptsTableTableManager(
      _$AppDatabase db, $ServerReceiptsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ServerReceiptsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ServerReceiptsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ServerReceiptsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> receiptId = const Value.absent(),
            Value<String> messageId = const Value.absent(),
            Value<String> payloadHash = const Value.absent(),
            Value<DateTime> serverReceivedAt = const Value.absent(),
            Value<String> serverKeyId = const Value.absent(),
            Value<String> signature = const Value.absent(),
            Value<DateTime?> verifiedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ServerReceiptsCompanion(
            id: id,
            receiptId: receiptId,
            messageId: messageId,
            payloadHash: payloadHash,
            serverReceivedAt: serverReceivedAt,
            serverKeyId: serverKeyId,
            signature: signature,
            verifiedAt: verifiedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String receiptId,
            required String messageId,
            required String payloadHash,
            required DateTime serverReceivedAt,
            required String serverKeyId,
            required String signature,
            Value<DateTime?> verifiedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ServerReceiptsCompanion.insert(
            id: id,
            receiptId: receiptId,
            messageId: messageId,
            payloadHash: payloadHash,
            serverReceivedAt: serverReceivedAt,
            serverKeyId: serverKeyId,
            signature: signature,
            verifiedAt: verifiedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$ServerReceiptsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({messageId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (messageId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.messageId,
                    referencedTable:
                        $$ServerReceiptsTableReferences._messageIdTable(db),
                    referencedColumn:
                        $$ServerReceiptsTableReferences._messageIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$ServerReceiptsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ServerReceiptsTable,
    ServerReceipt,
    $$ServerReceiptsTableFilterComposer,
    $$ServerReceiptsTableOrderingComposer,
    $$ServerReceiptsTableAnnotationComposer,
    $$ServerReceiptsTableCreateCompanionBuilder,
    $$ServerReceiptsTableUpdateCompanionBuilder,
    (ServerReceipt, $$ServerReceiptsTableReferences),
    ServerReceipt,
    PrefetchHooks Function({bool messageId})>;
typedef $$TombstonesTableCreateCompanionBuilder = TombstonesCompanion Function({
  required String messageId,
  required DateTime expiresAt,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$TombstonesTableUpdateCompanionBuilder = TombstonesCompanion Function({
  Value<String> messageId,
  Value<DateTime> expiresAt,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$TombstonesTableFilterComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get messageId => $composableBuilder(
      column: $table.messageId, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$TombstonesTableOrderingComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get messageId => $composableBuilder(
      column: $table.messageId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get expiresAt => $composableBuilder(
      column: $table.expiresAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$TombstonesTableAnnotationComposer
    extends Composer<_$AppDatabase, $TombstonesTable> {
  $$TombstonesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get messageId =>
      $composableBuilder(column: $table.messageId, builder: (column) => column);

  GeneratedColumn<DateTime> get expiresAt =>
      $composableBuilder(column: $table.expiresAt, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$TombstonesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $TombstonesTable,
    Tombstone,
    $$TombstonesTableFilterComposer,
    $$TombstonesTableOrderingComposer,
    $$TombstonesTableAnnotationComposer,
    $$TombstonesTableCreateCompanionBuilder,
    $$TombstonesTableUpdateCompanionBuilder,
    (Tombstone, BaseReferences<_$AppDatabase, $TombstonesTable, Tombstone>),
    Tombstone,
    PrefetchHooks Function()> {
  $$TombstonesTableTableManager(_$AppDatabase db, $TombstonesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TombstonesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TombstonesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TombstonesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> messageId = const Value.absent(),
            Value<DateTime> expiresAt = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              TombstonesCompanion(
            messageId: messageId,
            expiresAt: expiresAt,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String messageId,
            required DateTime expiresAt,
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              TombstonesCompanion.insert(
            messageId: messageId,
            expiresAt: expiresAt,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$TombstonesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $TombstonesTable,
    Tombstone,
    $$TombstonesTableFilterComposer,
    $$TombstonesTableOrderingComposer,
    $$TombstonesTableAnnotationComposer,
    $$TombstonesTableCreateCompanionBuilder,
    $$TombstonesTableUpdateCompanionBuilder,
    (Tombstone, BaseReferences<_$AppDatabase, $TombstonesTable, Tombstone>),
    Tombstone,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$IdentityProfilesTableTableManager get identityProfiles =>
      $$IdentityProfilesTableTableManager(_db, _db.identityProfiles);
  $$IncidentsTableTableManager get incidents =>
      $$IncidentsTableTableManager(_db, _db.incidents);
  $$IncidentEventsTableTableManager get incidentEvents =>
      $$IncidentEventsTableTableManager(_db, _db.incidentEvents);
  $$AttachmentsTableTableManager get attachments =>
      $$AttachmentsTableTableManager(_db, _db.attachments);
  $$OriginBundlesTableTableManager get originBundles =>
      $$OriginBundlesTableTableManager(_db, _db.originBundles);
  $$DeliveryAttemptsTableTableManager get deliveryAttempts =>
      $$DeliveryAttemptsTableTableManager(_db, _db.deliveryAttempts);
  $$ServerReceiptsTableTableManager get serverReceipts =>
      $$ServerReceiptsTableTableManager(_db, _db.serverReceipts);
  $$TombstonesTableTableManager get tombstones =>
      $$TombstonesTableTableManager(_db, _db.tombstones);
}
