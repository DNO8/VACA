import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/bundle/bundle_cipher.dart';
import 'package:vaca_app/core/bundle/bundle_codec.dart';
import 'package:vaca_app/core/bundle/bundle_queue_service.dart';
import 'package:vaca_app/core/bundle/bundle_signer.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/identity_key_source.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/core/transport/transport.dart' as transport;
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/data/local/enums.dart';
import 'package:vaca_app/features/identity/data/kyc_adapter.dart';
import 'package:vaca_app/features/identity/domain/identity_service.dart';
import 'package:vaca_app/features/incident/domain/attachment_service.dart';
import 'package:vaca_app/features/incident/domain/incident_service.dart';

class _MemoryStorage implements SecureStorage {
  final values = <String, String>{};

  @override
  Future<Result<String?>> read(String key) async => Success(values[key]);

  @override
  Future<Result<void>> write(String key, String value) async {
    values[key] = value;
    return const Success(null);
  }

  @override
  Future<Result<void>> delete(String key) async {
    values.remove(key);
    return const Success(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    values.clear();
    return const Success(null);
  }
}

void main() {
  late AppDatabase database;
  late IncidentService service;
  late Directory tempDirectory;

  setUp(() async {
    database = AppDatabase(NativeDatabase.memory());
    tempDirectory = await Directory.systemTemp.createTemp('vaca-incident-test');
    service = _buildService(
      database,
      AesGcmBundleCipher(
        StaticBundleKeySource(
          Uint8List.fromList(List.filled(32, 42)),
        ),
      ),
    );
  });

  tearDown(() async {
    await database.close();
    await tempDirectory.delete(recursive: true);
  });

  test('creates incident event and outbox in one successful operation',
      () async {
    final result = await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      peopleCount: 2,
      locationSource: LocationSource.unavailable,
    );

    expect(result.isSuccess, isTrue);
    expect(await database.select(database.incidents).get(), hasLength(1));
    expect(await database.select(database.incidentEvents).get(), hasLength(1));
    expect(await database.select(database.originBundles).get(), hasLength(1));
  });

  test('orders P0 before P4 in the pending outbox', () async {
    await service.createAndEnqueue(
      category: IncidentCategory.coordination,
      priority: IncidentPriority.p4,
      locationSource: LocationSource.unavailable,
    );
    await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      locationSource: LocationSource.unavailable,
    );

    final pending = await _queueFor(database).pendingBundles();

    expect(pending, hasLength(2));
    expect(pending.first.priority, IncidentPriority.p0);
    expect(pending.last.priority, IncidentPriority.p4);
  });

  test('stores the real attachment byte size inside the atomic capture',
      () async {
    final photo = File('${tempDirectory.path}/evidence.jpg');
    await photo.writeAsBytes(List<int>.generate(257, (index) => index % 255));

    final result = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      locationSource: LocationSource.unavailable,
      attachment: PendingAttachment(
        kind: AttachmentKind.photo,
        localPath: photo.path,
        sha256: 'test-hash',
        capturedAt: DateTime.utc(2026, 9, 11),
      ),
    );

    expect(result.isSuccess, isTrue);
    final attachment = await database.select(database.attachments).getSingle();
    expect(attachment.sizeBytes, 257);
  });

  test('queues update as a second append-only event', () async {
    final created = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Original',
      locationSource: LocationSource.unavailable,
    );

    final updated = await service.updateNote(
      created.valueOrNull!.id,
      'Actualizada',
    );

    expect(updated.isSuccess, isTrue);
    expect(updated.valueOrNull!.shortNote, 'Actualizada');
    expect(await database.select(database.incidentEvents).get(), hasLength(2));
    expect(await database.select(database.originBundles).get(), hasLength(2));
  });

  test('queues cancellation as a second append-only event', () async {
    final created = await service.createAndEnqueue(
      category: IncidentCategory.person,
      priority: IncidentPriority.p2,
      locationSource: LocationSource.unavailable,
    );

    final cancelled = await service.cancel(created.valueOrNull!.id);

    expect(cancelled.isSuccess, isTrue);
    expect(cancelled.valueOrNull!.status, IncidentStatus.cancellationQueued);
    expect(await database.select(database.incidentEvents).get(), hasLength(2));
    expect(await database.select(database.originBundles).get(), hasLength(2));
  });

  test('persists a verified receipt and advances the incident state', () async {
    final created = await service.createAndEnqueue(
      category: IncidentCategory.coordination,
      priority: IncidentPriority.p4,
      locationSource: LocationSource.unavailable,
    );
    final bundle = await database.select(database.originBundles).getSingle();
    final receipt = transport.DeliveryReceipt(
      receiptId: 'receipt-1',
      messageId: bundle.id,
      payloadHash: Uint8List.fromList(
        List<int>.generate(
          32,
          (index) => int.parse(
            bundle.payloadHash.substring(index * 2, index * 2 + 2),
            radix: 16,
          ),
        ),
      ),
      serverReceivedAt: DateTime.utc(2026, 9, 11, 12),
      serverKeyId: 'receipt-key-1',
      signature: Uint8List(64),
    );

    expect(created.isSuccess, isTrue);
    final result = await _queueFor(database).markDelivered(bundle.id, receipt);

    expect(result.isSuccess, isTrue);
    final incident = await database.select(database.incidents).getSingle();
    expect(incident.status, IncidentStatus.receivedByServer);
    expect(await database.select(database.serverReceipts).get(), hasLength(1));
    expect(await database.select(database.tombstones).get(), hasLength(1));
  });

  test('rejects a duplicate signal at the same place with same note',
      () async {
    final first = await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      shortNote: 'Inundación en calle 12',
      latitude: -34.6,
      longitude: -70.66,
      locationSource: LocationSource.gps,
    );
    expect(first.isSuccess, isTrue);

    final second = await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      shortNote: '  inundación   en CALLE 12 ',
      latitude: -34.60005,
      longitude: -70.66005,
      locationSource: LocationSource.gps,
    );

    expect(second.isFailure, isTrue);
    expect(second.errorOrNull?.code, 'duplicate_signal');
    expect(await database.select(database.incidents).get(), hasLength(1));
  });

  test('allows the same note far enough away', () async {
    await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      shortNote: 'Incendio forestal',
      latitude: -34.6,
      longitude: -70.66,
      locationSource: LocationSource.gps,
    );

    final far = await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      shortNote: 'Incendio forestal',
      latitude: -35.6,
      longitude: -70.66,
      locationSource: LocationSource.gps,
    );

    expect(far.isSuccess, isTrue);
    expect(await database.select(database.incidents).get(), hasLength(2));
  });

  test('allows the same note in a different category', () async {
    await service.createAndEnqueue(
      category: IncidentCategory.sos,
      priority: IncidentPriority.p0,
      shortNote: 'Zona afectada',
      locationSource: LocationSource.unavailable,
    );

    final other = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Zona afectada',
      locationSource: LocationSource.unavailable,
    );

    expect(other.isSuccess, isTrue);
    expect(await database.select(database.incidents).get(), hasLength(2));
  });

  test('rejects a no-GPS duplicate with same category and note', () async {
    await service.createAndEnqueue(
      category: IncidentCategory.medical,
      priority: IncidentPriority.p1,
      shortNote: 'Posta colapsada',
      locationSource: LocationSource.unavailable,
    );

    final second = await service.createAndEnqueue(
      category: IncidentCategory.medical,
      priority: IncidentPriority.p1,
      shortNote: 'posta colapsada',
      locationSource: LocationSource.unavailable,
    );

    expect(second.isFailure, isTrue);
    expect(second.errorOrNull?.code, 'duplicate_signal');
  });

  test('allows recreating a signal after the first was cancelled', () async {
    final first = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Cable caído',
      locationSource: LocationSource.unavailable,
    );
    await service.cancel(first.valueOrNull!.id);

    final second = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Cable caído',
      locationSource: LocationSource.unavailable,
    );

    expect(second.isSuccess, isTrue);
    expect(await database.select(database.incidents).get(), hasLength(2));
  });

  test('allows the same signal after the dedup window', () async {
    final old = DateTime.now().subtract(const Duration(hours: 25));
    await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Sin agua',
      locationSource: LocationSource.unavailable,
      now: old,
    );

    final second = await service.createAndEnqueue(
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Sin agua',
      locationSource: LocationSource.unavailable,
    );

    expect(second.isSuccess, isTrue);
    expect(await database.select(database.incidents).get(), hasLength(2));
  });

  test('rolls back incident and attachment when bundle creation fails',
      () async {
    service = _buildService(
      database,
      const AesGcmBundleCipher(FailClosedBundleKeySource()),
    );

    final result = await service.createAndEnqueue(
      category: IncidentCategory.medical,
      priority: IncidentPriority.p1,
      locationSource: LocationSource.unavailable,
    );

    expect(result.isFailure, isTrue);
    expect(await database.select(database.incidents).get(), isEmpty);
    expect(await database.select(database.incidentEvents).get(), isEmpty);
    expect(await database.select(database.originBundles).get(), isEmpty);
  });
}

BundleQueueService _queueFor(AppDatabase database) {
  final storage = _MemoryStorage();
  final keySource = IdentityKeySource(storage);
  return BundleQueueService(
    database,
    BundleCodec(
      cipher: AesGcmBundleCipher(
        StaticBundleKeySource(Uint8List.fromList(List.filled(32, 42))),
      ),
      signer: DeviceBundleSigner(keySource),
      destination: 'vaca:server:v1',
    ),
  );
}

IncidentService _buildService(AppDatabase database, AesGcmBundleCipher cipher) {
  final storage = _MemoryStorage();
  final keySource = IdentityKeySource(storage);
  final identity = IdentityService(
    database: database,
    secureStorage: storage,
    keySource: keySource,
    kycAdapter: const UnconfiguredKycAdapter(),
  );
  final queue = BundleQueueService(
    database,
    BundleCodec(
      cipher: cipher,
      signer: DeviceBundleSigner(keySource),
      destination: 'vaca:server:v1',
    ),
  );
  return IncidentService(
    database,
    queue,
    identity,
    AttachmentService(database),
  );
}
