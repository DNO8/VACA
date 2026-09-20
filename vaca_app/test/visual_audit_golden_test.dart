// Golden-render harness for the prototype-vs-Flutter visual audit.
// Renders each app screen at 390x844 and emits PNGs under
// test/visual_audit/ via `flutter test --update-goldens`.

import 'dart:io';

import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:vaca_app/core/bundle/bundle_cipher.dart';
import 'package:vaca_app/core/bundle/bundle_codec.dart';
import 'package:vaca_app/core/bundle/bundle_queue_service.dart';
import 'package:vaca_app/core/bundle/bundle_signer.dart';
import 'package:vaca_app/core/permissions/permission_service.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/identity_key_source.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/core/transport/transport.dart' as transport;
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/data/local/enums.dart';
import 'package:vaca_app/features/delivery/domain/sync_status_service.dart';
import 'package:vaca_app/features/delivery/presentation/receipt_screen.dart';
import 'package:vaca_app/features/identity/data/kyc_adapter.dart';
import 'package:vaca_app/features/identity/domain/identity_service.dart';
import 'package:vaca_app/features/incident/domain/attachment_service.dart';
import 'package:vaca_app/features/incident/domain/incident.dart';
import 'package:vaca_app/features/incident/domain/incident_service.dart';
import 'package:vaca_app/features/incident/presentation/create_incident_screen.dart';
import 'package:vaca_app/features/incident/presentation/incident_detail_screen.dart';
import 'package:vaca_app/features/incident/presentation/local_confirmation_screen.dart';
import 'package:vaca_app/features/onboarding/presentation/onboarding_flow.dart';
import 'package:vaca_app/features/shell/presentation/app_shell.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';
import 'package:vaca_app/features/wallet/presentation/stellar_wallet_screen.dart';

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

class _FakePermissions extends PermissionService {
  const _FakePermissions();

  @override
  Future<PermissionOutcome> requestCamera() async => PermissionOutcome.denied;

  @override
  Future<PermissionOutcome> requestLocation() async => PermissionOutcome.denied;

  @override
  Future<PermissionOutcome> requestNotifications() async =>
      PermissionOutcome.denied;

  @override
  Future<Position?> currentPosition() async => null;
}

class _FakeTransport implements transport.Transport {
  static const _status = transport.TransportStatus(
    availability: transport.TransportAvailability.available,
    detail: 'audit',
  );

  @override
  String get name => 'audit';

  @override
  Future<void> start() async {}

  @override
  Future<void> stop() async {}

  @override
  Future<transport.DeliveryResult> send(
    transport.TransportPacket packet,
  ) async =>
      transport.DeliveryResult(packet.id, transport.DeliveryState.queued);

  @override
  Stream<transport.TransportPacket> get incoming => const Stream.empty();

  @override
  Stream<transport.DeliveryResult> get deliveries => const Stream.empty();

  @override
  transport.TransportStatus get currentStatus => _status;

  @override
  Stream<transport.TransportStatus> get status => Stream.value(_status);
}

class _FakeWalletService extends StellarWalletService {
  _FakeWalletService(super.storage);

  static const _snapshot = StellarWalletSnapshot(
    accountId: 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP',
    balance: '10000.0000000',
    funded: true,
  );

  @override
  Future<Result<StellarWalletSnapshot?>> load() async =>
      const Success(_snapshot);

  @override
  Future<Result<StellarWalletSnapshot>> refresh() async =>
      const Success(_snapshot);
}

Future<void> _loadFonts() async {
  Future<void> load(String family, String path) async {
    final loader = FontLoader(family)
      ..addFont(
        File(path).readAsBytes().then((b) => ByteData.view(b.buffer)),
      );
    await loader.load();
  }

  for (final file in const [
    'AndersonGrotesk.otf',
    'AndersonGrotesk-Bold.otf',
    'AndersonGrotesk-Ultrabold.otf',
    'AndersonGrotesk-Light.otf',
  ]) {
    await load('AndersonGrotesk', 'assets/fonts/$file');
  }
  for (final file in const [
    'JetBrainsMono-Regular.ttf',
    'JetBrainsMono-Medium.ttf',
    'JetBrainsMono-Bold.ttf',
  ]) {
    await load('JetBrainsMono', 'assets/fonts/$file');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Reloj y datos semilla fijos: los goldens deben ser deterministas.
  final clockNow = DateTime.utc(2026, 9, 16, 10, 0);
  final t1 = DateTime.utc(2026, 9, 16, 9, 41);
  final t2 = DateTime.utc(2026, 9, 16, 9, 52);
  final t3 = DateTime.utc(2026, 9, 16, 9, 58);
  final tVerified = DateTime.utc(2026, 9, 16, 9, 44, 30);
  const bundleId = 'bef4e78e-0000-4000-8000-00000000000b';
  const payloadHash =
      'aa736d9ba62773514a00d76f8dc3362e4396a111682040601af7a626df8e6';

  late AppDatabase db;
  late _MemoryStorage storage;
  late String deliveredIncidentId;

  setUpAll(() async {
    await _loadFonts();
  });

  setUp(() async {
    db = AppDatabase(
      drift.DatabaseConnection(
        NativeDatabase.memory(),
        closeStreamsSynchronously: true,
      ),
    );
    storage = _MemoryStorage();

    final keySource = IdentityKeySource(storage);
    final identity = IdentityService(
      database: db,
      secureStorage: storage,
      keySource: keySource,
      kycAdapter: const UnconfiguredKycAdapter(),
    );
    final queue = BundleQueueService(
      db,
      BundleCodec(
        cipher: AesGcmBundleCipher(
          StaticBundleKeySource(Uint8List.fromList(List.filled(32, 42))),
        ),
        signer: DeviceBundleSigner(keySource),
        destination: 'vaca:server:v1',
      ),
    );
    final incidents = IncidentService(
      db,
      queue,
      identity,
      AttachmentService(db),
    );

    final delivered = await incidents.createAndEnqueue(
      id: '7a0aa8d1-0000-4000-8000-000000000001',
      now: t1,
      category: IncidentCategory.person,
      priority: IncidentPriority.p2,
      shortNote: 'Colision vehicular menor, sin lesionados',
      latitude: -33.0472,
      longitude: -71.4427,
      locationSource: LocationSource.gps,
    );
    deliveredIncidentId = delivered.valueOrNull!.id;
    var bundles = await db.select(db.originBundles).get();
    final deliveredBundle =
        bundles.where((b) => b.incidentId == deliveredIncidentId).single;
    await queue.markDelivered(
      deliveredBundle.id,
      transport.DeliveryReceipt(
        receiptId: 'REC-A7F2-9C14',
        messageId: deliveredBundle.id,
        payloadHash: Uint8List.fromList(
          List<int>.generate(
            32,
            (i) => int.parse(
              deliveredBundle.payloadHash.substring(i * 2, i * 2 + 2),
              radix: 16,
            ),
          ),
        ),
        serverReceivedAt: DateTime.utc(2026, 9, 16, 9, 44, 21),
        serverKeyId: 'srv-cl-vina-01',
        signature: Uint8List(64),
      ),
    );

    await incidents.createAndEnqueue(
      id: 'a9b86ce7-0000-4000-8000-000000000002',
      now: t2,
      category: IncidentCategory.hazard,
      priority: IncidentPriority.p3,
      shortNote: 'Fuga de agua en calle principal',
      latitude: -33.0245,
      longitude: -71.5518,
      locationSource: LocationSource.gps,
    );
    await incidents.createAndEnqueue(
      id: '81891e3a-0000-4000-8000-000000000003',
      now: t3,
      category: IncidentCategory.coordination,
      priority: IncidentPriority.p4,
      shortNote: 'Punto de reunion: plaza de armas',
      locationSource: LocationSource.unavailable,
    );
    bundles = await db.select(db.originBundles).get();
    final failedBundle =
        bundles.where((b) => b.state == DeliveryState.queued).first;
    await (db.update(db.originBundles)
          ..where((b) => b.id.equals(failedBundle.id)))
        .write(
      const OriginBundlesCompanion(state: drift.Value(DeliveryState.failed)),
    );

    // Normaliza valores generados con reloj/azar para que el golden sea
    // estable: timestamps de bandeja e historial, recibo e ID mostrado.
    for (final (id, at) in [
      (deliveredBundle.id, t1),
      (
        bundles
            .firstWhere(
              (b) => b.incidentId == 'a9b86ce7-0000-4000-8000-000000000002',
            )
            .id,
        t2
      ),
      (
        bundles
            .firstWhere(
              (b) => b.incidentId == '81891e3a-0000-4000-8000-000000000003',
            )
            .id,
        t3
      ),
    ]) {
      await (db.update(db.originBundles)..where((b) => b.id.equals(id)))
          .write(OriginBundlesCompanion(createdAt: drift.Value(at)));
    }
    await (db.update(db.serverReceipts)
          ..where((r) => r.receiptId.equals('REC-A7F2-9C14')))
        .write(
      ServerReceiptsCompanion(
        messageId: const drift.Value(bundleId),
        payloadHash: const drift.Value(payloadHash),
        verifiedAt: drift.Value(tVerified),
      ),
    );
    for (final (incidentId, at) in [
      ('7a0aa8d1-0000-4000-8000-000000000001', t1),
      ('a9b86ce7-0000-4000-8000-000000000002', t2),
      ('81891e3a-0000-4000-8000-000000000003', t3),
    ]) {
      await (db.update(db.incidentEvents)
            ..where((e) => e.incidentId.equals(incidentId)))
          .write(IncidentEventsCompanion(timestamp: drift.Value(at)));
    }
  });

  tearDown(() async {
    await db.close();
  });

  List<Override> overrides() => [
        databaseProvider.overrideWithValue(db),
        secureStorageProvider.overrideWithValue(storage),
        vacaClockProvider.overrideWithValue(() => clockNow),
        permissionServiceProvider.overrideWithValue(
          const _FakePermissions(),
        ),
        bundleKeySourceProvider.overrideWithValue(
          StaticBundleKeySource(Uint8List.fromList(List.filled(32, 42))),
        ),
        transportProvider.overrideWithValue(_FakeTransport()),
        syncSnapshotProvider.overrideWith(
          (ref) => Stream.value(
            const SyncSnapshot(
              phase: SyncPhase.online,
              pendingCount: 1,
              deliveredCount: 1,
              canRetry: false,
            ),
          ),
        ),
        stellarWalletServiceProvider.overrideWithValue(
          _FakeWalletService(storage),
        ),
      ];

  void setPhone(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Future<void> precacheImages(WidgetTester tester) async {
    final context = tester.element(find.byType(MaterialApp));
    await tester.runAsync(() async {
      for (final asset in const [
        'estetica-4.jpg',
        'estetica-5.jpg',
        'gradiente-2.jpg',
        'gradiente-3.jpg',
        'gradiente-loading.webp',
        'icono-app-claro-v2.png',
        'icono-app-oscuro-v2.webp',
        'mapa-3.jpg',
        'textura-2.jpg',
        'textura-3.jpg',
      ]) {
        await precacheImage(AssetImage('assets/images/$asset'), context);
      }
    });
  }

  Future<void> pumpScreen(WidgetTester tester, Widget home) async {
    setPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides(),
        child: MaterialApp(
          theme: AppTheme.light,
          debugShowCheckedModeBanner: false,
          home: home,
        ),
      ),
    );
    await precacheImages(tester);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    // Drain any pending fake-async timers (scrollbars, delayed callbacks).
    await tester.pump(const Duration(seconds: 3));
  }

  Future<void> snap(WidgetTester tester, String name) async {
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('visual_audit/$name.png'),
    );
  }

  testWidgets('01 portada', (tester) async {
    await pumpScreen(tester, OnboardingFlow(onComplete: (_) async {}));
    await snap(tester, '01-portada');
  });

  testWidgets('02 aviso legal', (tester) async {
    await pumpScreen(tester, OnboardingFlow(onComplete: (_) async {}));
    await tester.tap(find.text('Iniciar'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    await snap(tester, '02-aviso-legal');
  });

  testWidgets('03 privacidad y permisos', (tester) async {
    await pumpScreen(tester, OnboardingFlow(onComplete: (_) async {}));
    await tester.tap(find.text('Iniciar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Entendido, continuar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '03-privacidad-permisos');
  });

  testWidgets('04 identidad', (tester) async {
    await pumpScreen(tester, OnboardingFlow(onComplete: (_) async {}));
    await tester.tap(find.text('Iniciar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Entendido, continuar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Aceptar y continuar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '04-identidad');
  });

  testWidgets('05 inicio', (tester) async {
    await pumpScreen(tester, const AppShell());
    await tester.pump(const Duration(milliseconds: 300));
    await snap(tester, '05-inicio');
  });

  testWidgets('06 categoria', (tester) async {
    await pumpScreen(tester, const CreateIncidentScreen());
    await snap(tester, '06-categoria');
  });

  Future<void> pickCategory(WidgetTester tester) async {
    await tester.tap(find.text('Persona / ubicación'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(find.text('Continuar con esta categoría'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
  }

  testWidgets('07 ubicacion', (tester) async {
    await pumpScreen(tester, const CreateIncidentScreen());
    await pickCategory(tester);
    await snap(tester, '07-ubicacion');
  });

  testWidgets('08 formulario', (tester) async {
    await pumpScreen(tester, const CreateIncidentScreen());
    await pickCategory(tester);
    await tester.tap(find.text('Continuar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '08-formulario');
  });

  testWidgets('09 foto', (tester) async {
    await pumpScreen(tester, const CreateIncidentScreen());
    await pickCategory(tester);
    await tester.tap(find.text('Continuar'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(find.text('Continuar'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '09-foto');
  });

  testWidgets('10 guardado local', (tester) async {
    await pumpScreen(
      tester,
      LocalConfirmationScreen(
        incident: UserIncident(
          id: 'e13294d3-aaaa-bbbb-cccc-ddddeeeeffff',
          reporterProfileId: 'p-1',
          category: IncidentCategory.sos,
          priority: IncidentPriority.p0,
          locationSource: LocationSource.gps,
          latitude: -33.0472,
          longitude: -71.4427,
          createdAt: DateTime.utc(2026, 9, 16, 9, 41),
          updatedAt: DateTime.utc(2026, 9, 16, 9, 41),
          status: IncidentStatus.savedLocally,
          identityAssurance: IdentityAssurance.unverified,
        ),
      ),
    );
    await snap(tester, '10-guardado-local');
  });

  testWidgets('11 bandeja', (tester) async {
    await pumpScreen(tester, const AppShell());
    tester
        .widget<NavigationBar>(find.byType(NavigationBar))
        .onDestinationSelected
        ?.call(1);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();
    await snap(tester, '11-bandeja');
  });

  testWidgets('12 recibo', (tester) async {
    final receipt = await (db.select(db.serverReceipts)
          ..where((r) => r.receiptId.equals('REC-A7F2-9C14')))
        .getSingle();
    await pumpScreen(tester, ReceiptScreen(receipt: receipt));
    await snap(tester, '12-recibo');
  });

  testWidgets('13 actualizar cancelar', (tester) async {
    await pumpScreen(
      tester,
      IncidentDetailScreen(incidentId: deliveredIncidentId),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '13-actualizar-cancelar');
  });

  testWidgets('14 identidad datos', (tester) async {
    await pumpScreen(tester, const AppShell());
    tester
        .widget<NavigationBar>(find.byType(NavigationBar))
        .onDestinationSelected
        ?.call(2);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();
    await snap(tester, '14-identidad-datos');
  });

  testWidgets('15 wallet', (tester) async {
    await pumpScreen(tester, const StellarWalletScreen());
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await snap(tester, '15-wallet');
  });

  Future<void> pumpAt200(
    WidgetTester tester,
    Widget home,
    String name,
  ) async {
    setPhone(tester);
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides(),
        child: MaterialApp(
          theme: AppTheme.light,
          debugShowCheckedModeBanner: false,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2),
            ),
            child: child!,
          ),
          home: home,
        ),
      ),
    );
    await precacheImages(tester);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    expect(
      tester.takeException(),
      isNull,
      reason: '$name presenta overflow o errores a escala de texto 200%',
    );
  }

  testWidgets('16 escala 200%', (tester) async {
    await pumpAt200(tester, const AppShell(), 'inicio');
    await pumpAt200(tester, const CreateIncidentScreen(), 'categoria');
  });
}
