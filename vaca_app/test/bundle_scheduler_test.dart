import 'dart:async';
import 'dart:math';
import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/bundle/bundle_cipher.dart';
import 'package:vaca_app/core/bundle/bundle_codec.dart';
import 'package:vaca_app/core/bundle/bundle_queue_service.dart';
import 'package:vaca_app/core/bundle/bundle_scheduler.dart';
import 'package:vaca_app/core/bundle/bundle_signer.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/transport/server_contract.dart';
import 'package:vaca_app/core/transport/transport.dart';
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/data/local/enums.dart' as local;

class _NoopSigner implements BundleSigner {
  @override
  Future<Result<Uint8List>> sign(Uint8List message) async =>
      Success(Uint8List(64));

  @override
  Future<Result<bool>> verify(
    Uint8List message,
    Uint8List signature,
    Uint8List publicKey,
  ) async =>
      const Success(true);
}

class _FakeTransport implements Transport {
  _FakeTransport(this.result);

  DeliveryResult result;
  int sends = 0;
  final statusController = StreamController<TransportStatus>.broadcast();

  @override
  Stream<DeliveryResult> get deliveries => const Stream.empty();

  @override
  Stream<TransportPacket> get incoming => const Stream.empty();

  @override
  String get name => 'fake';

  @override
  Future<DeliveryResult> send(TransportPacket packet) async {
    sends++;
    return result;
  }

  @override
  Future<void> start() async {}

  @override
  Stream<TransportStatus> get status => statusController.stream;

  @override
  Future<void> stop() => statusController.close();
}

class _FakeServerContract extends ServerContract {
  String? uploadUrl;
  bool uploadResult = false;
  int uploadCalls = 0;

  @override
  Future<String?> requestAttachmentUrl(
    String bundleId,
    String contentHash,
  ) async =>
      uploadUrl;

  @override
  Future<DeliveryResult> sendBundle(
    String messageId,
    Uint8List payload,
    Uint8List payloadHash,
    Uint8List originPublicKey,
  ) async =>
      throw UnimplementedError();

  @override
  Future<bool> uploadAttachment(String uploadUrl, String localPath) async {
    uploadCalls++;
    return uploadResult;
  }
}

void main() {
  late AppDatabase database;
  late _FakeTransport transport;
  late _FakeServerContract contract;
  late BundleScheduler scheduler;

  setUp(() async {
    database = AppDatabase(NativeDatabase.memory());
    transport = _FakeTransport(
      const DeliveryResult(
        'bundle-1',
        DeliveryState.failed,
        failure: DeliveryFailure('server_500', retryable: true),
      ),
    );
    contract = _FakeServerContract();
    scheduler = BundleScheduler(
      queue: BundleQueueService(
        database,
        BundleCodec(
          cipher: const AesGcmBundleCipher(FailClosedBundleKeySource()),
          signer: _NoopSigner(),
          destination: 'test',
        ),
      ),
      transport: transport,
      serverContract: contract,
      baseRetrySeconds: 60,
      random: Random(1),
    );
  });

  tearDown(() async {
    await scheduler.stop();
    await database.close();
  });

  test('retryable failure preserves DTN budget and schedules durable retry',
      () async {
    await _insertBundle(database);

    await scheduler.processQueue();

    final bundle = await database.select(database.originBundles).getSingle();
    final attempt =
        await database.select(database.deliveryAttempts).getSingle();
    expect(bundle.state, local.DeliveryState.queued);
    expect(bundle.copyBudget, 3);
    expect(bundle.retryCount, 1);
    expect(bundle.nextAttemptAt, isNotNull);
    expect(bundle.lastErrorCode, 'server_500');
    expect(attempt.outcome, local.DeliveryOutcome.retryable);
  });

  test('permanent failure closes retry without consuming DTN budget', () async {
    await _insertBundle(database);
    transport.result = const DeliveryResult(
      'bundle-1',
      DeliveryState.failed,
      failure: DeliveryFailure('server_401', retryable: false),
    );

    await scheduler.processQueue();

    final bundle = await database.select(database.originBundles).getSingle();
    expect(bundle.state, local.DeliveryState.failed);
    expect(bundle.copyBudget, 3);
    expect(bundle.retryCount, 1);
    expect(bundle.nextAttemptAt, isNull);
  });

  test('expired bundle closes without a network send', () async {
    await _insertBundle(
      database,
      expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
    );

    await scheduler.processQueue();

    final bundle = await database.select(database.originBundles).getSingle();
    final incident = await database.select(database.incidents).getSingle();
    final attempt =
        await database.select(database.deliveryAttempts).getSingle();
    expect(transport.sends, 0);
    expect(bundle.lastErrorCode, 'expired');
    expect(incident.status, local.IncidentStatus.expired);
    expect(attempt.outcome, local.DeliveryOutcome.expired);
  });

  test('failed attachment retries independently from delivered bundle',
      () async {
    await _insertBundle(database, state: local.DeliveryState.delivered);
    await database.into(database.attachments).insert(
          AttachmentsCompanion.insert(
            id: 'attachment-1',
            incidentId: 'incident-1',
            kind: local.AttachmentKind.photo,
            localPath: 'evidence.jpg',
            sha256: 'hash',
            sizeBytes: 10,
            capturedAt: DateTime.now(),
            syncStatus: local.AttachmentSyncStatus.failed,
          ),
        );
    contract
      ..uploadUrl = 'https://upload.test'
      ..uploadResult = true;

    await scheduler.processQueue();

    final attachment = await database.select(database.attachments).getSingle();
    expect(transport.sends, 0);
    expect(contract.uploadCalls, 1);
    expect(attachment.syncStatus, local.AttachmentSyncStatus.synced);
  });
}

Future<void> _insertBundle(
  AppDatabase database, {
  DateTime? expiresAt,
  local.DeliveryState state = local.DeliveryState.queued,
}) async {
  final now = DateTime.now();
  await database.into(database.identityProfiles).insert(
        IdentityProfilesCompanion.insert(
          id: 'profile-1',
          identityAssurance: local.IdentityAssurance.unverified,
          devicePublicKey: 'device-key',
          consentVersion: '1.0',
          createdAt: now,
          updatedAt: now,
        ),
      );
  await database.into(database.incidents).insert(
        IncidentsCompanion.insert(
          id: 'incident-1',
          reporterProfileId: 'profile-1',
          category: local.IncidentCategory.sos,
          priority: local.IncidentPriority.p0,
          locationSource: local.LocationSource.unavailable,
          createdAt: now,
          updatedAt: now,
          status: local.IncidentStatus.queued,
          identityAssurance: local.IdentityAssurance.unverified,
        ),
      );
  await database.into(database.incidentEvents).insert(
        IncidentEventsCompanion.insert(
          id: 'event-1',
          incidentId: 'incident-1',
          eventType: local.EventType.created,
          signer: 'device-key',
          signature: 'signature',
          timestamp: now,
          payloadHash: List.filled(64, '0').join(),
        ),
      );
  await database.into(database.originBundles).insert(
        OriginBundlesCompanion.insert(
          id: 'bundle-1',
          incidentId: 'incident-1',
          eventId: 'event-1',
          priority: local.IncidentPriority.p0,
          canonicalHeader: 'header',
          ciphertextBytes: Value(Uint8List.fromList([1, 2, 3])),
          payloadHash: List.filled(64, '0').join(),
          expiresAt: expiresAt ?? now.add(const Duration(hours: 1)),
          state: state,
          createdAt: now,
        ),
      );
}
