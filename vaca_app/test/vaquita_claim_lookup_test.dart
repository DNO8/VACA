import 'dart:async';
import 'dart:ffi';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
// Drift already supplies sqlite3; resolve the installed Linux SONAME in this fixture only.
// ignore: depend_on_referenced_packages
import 'package:sqlite3/open.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/features/vaquita/domain/vaquita_feed_service.dart';
import 'package:vaca_app/features/vaquita/presentation/vaquita_screen.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';

const unavailable = 'No se pudo consultar la ayuda pendiente.';
const retry = 'Reintentar consulta';
const emptyAid = 'Sin ayuda pendiente por ahora.';
const emptyVaquitas = 'Aún no tienes Vaquitas';

class _Storage implements SecureStorage {
  final writes = <Symbol>[];
  @override
  Future<Result<String?>> read(String key) async =>
      const Success('fake-secret');
  @override
  dynamic noSuchMethod(Invocation invocation) {
    writes.add(invocation.memberName);
    throw StateError('Unexpected storage mutation');
  }
}

class _Gateway implements StellarWalletGateway {
  int queries = 0;
  final effects = <String>[];
  Future<List<StellarClaim>> Function() reply =
      () async => throw StateError('offline');
  @override
  StellarWalletCredentials credentialsFromSecret(String secretSeed) =>
      const StellarWalletCredentials(
        accountId: 'fake-account',
        secretSeed: 'fake-secret',
      );
  @override
  Future<StellarWalletSnapshot> snapshot(String secretSeed) async =>
      const StellarWalletSnapshot(
        accountId: 'fake-account',
        balance: '12',
        funded: true,
        usdcTrustlineReady: true,
        usdcBalance: '0',
      );
  @override
  Future<List<StellarClaim>> pendingClaims(String accountId) {
    queries++;
    return reply();
  }

  @override
  Future<String?> ensureUsdcTrustline(String secretSeed) async {
    effects.add('trustline');
    return null;
  }

  @override
  Future<String?> claim(String secretSeed, String balanceId) async {
    effects.add('claim:$balanceId');
    return 'transaction-123456789';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    effects.add(invocation.memberName.toString());
    throw StateError('Unexpected financial gateway call');
  }
}

class _Wallet extends StellarWalletService {
  _Wallet(super.storage, super.gateway);
  int executions = 0;
  @override
  Future<Result<StellarClaimResult>> claimAll() {
    executions++;
    return super.claimAll();
  }
}

class _Feed extends VaquitaFeedService {
  _Feed(this.promoted);
  final bool promoted;
  int reads = 0;
  @override
  Future<Result<List<VaquitaFeedItem>>> fetchFeed() async {
    reads++;
    return Success(
      promoted
          ? [
              const VaquitaFeedItem(
                incidentId: 'incident-1234',
                category: 'sos',
                peopleCount: 2,
                latitude: null,
                longitude: null,
                donationStatus: 'vaquita',
                createdAt: null,
              ),
            ]
          : [],
    );
  }
}

void main() {
  late AppDatabase db;
  late _Storage storage;
  late _Gateway gateway;
  late _Wallet wallet;
  late _Feed feed;

  setUpAll(() {
    if (Platform.isLinux) {
      open.overrideFor(
        OperatingSystem.linux,
        () => DynamicLibrary.open('libsqlite3.so.0'),
      );
    }
  });
  setUp(() async {
    storage = _Storage();
    gateway = _Gateway();
    wallet = _Wallet(storage, gateway);
    db = AppDatabase(NativeDatabase.memory());
    List<Map<String, dynamic>>? originalRows;
    addTearDown(() async {
      try {
        expect(storage.writes, isEmpty);
        if (originalRows != null) {
          expect(
            (await db.customSelect('SELECT * FROM incidents').get())
                .map((r) => r.data)
                .toList(),
            originalRows,
          );
        }
      } finally {
        await db.close();
      }
    });
    await db.customStatement('INSERT INTO incidents '
        '(id, reporter_profile_id, category, priority, location_source, created_at, '
        'updated_at, status, identity_assurance) '
        "VALUES ('incident-1234', 'profile', 0, 0, 0, 0, 0, 0, 0)");
    originalRows = (await db.customSelect('SELECT * FROM incidents').get())
        .map((r) => r.data)
        .toList();
  });

  Future<void> mount(WidgetTester tester, {required bool promoted}) async {
    feed = _Feed(promoted);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(db),
          stellarWalletServiceProvider.overrideWithValue(wallet),
          vaquitaFeedServiceProvider.overrideWithValue(feed),
        ],
        child: MaterialApp(
          home: VaquitaScreen(
            onOpenWallet: () => fail('Unexpected wallet navigation'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  void readOnly() {
    expect(wallet.executions, 0);
    expect(gateway.effects, isEmpty);
    expect(storage.writes, isEmpty);
  }

  for (final promoted in [false, true]) {
    testWidgets('failed lookup is unavailable, not empty; promoted=$promoted',
        (tester) async {
      await mount(tester, promoted: promoted);
      expect(find.text(unavailable), findsOneWidget);
      expect(find.text(retry), findsOneWidget);
      expect(find.text(emptyAid), findsNothing);
      expect(find.text(emptyVaquitas), findsNothing);
      expect(find.text('Reclamar ayuda'), findsNothing);
      expect(
        find.text('Vaquita validada'),
        promoted ? findsOneWidget : findsNothing,
      );
      expect(gateway.queries, 1);
      readOnly();
    });

    testWidgets(
        'explicit retry is single-flight and recovers empty; promoted=$promoted',
        (tester) async {
      await mount(tester, promoted: promoted);
      final pending = Completer<List<StellarClaim>>();
      gateway.reply = () => pending.future;
      await tester.tap(find.text(retry));
      await tester.tap(find.text(retry));
      await tester.pump();
      expect(gateway.queries, 2);
      expect(find.text('Consultando ayuda pendiente…'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, retry))
            .onPressed,
        isNull,
      );
      expect(
        find.text('Vaquita validada'),
        promoted ? findsOneWidget : findsNothing,
      );
      readOnly();
      pending.complete([]);
      await tester.pumpAndSettle();
      expect(find.text(unavailable), findsNothing);
      expect(find.text(retry), findsNothing);
      expect(find.text(promoted ? emptyAid : emptyVaquitas), findsOneWidget);
      expect(find.text('Reclamar ayuda'), findsNothing);
      expect(feed.reads, 1);
      expect(gateway.queries, 2);
      readOnly();
    });
  }

  testWidgets(
      'retry restores nonempty aid; only explicit claim executes and preserves receipt',
      (tester) async {
    await mount(tester, promoted: true);
    gateway.reply =
        () async => [const StellarClaim(balanceId: 'balance-1', amount: '2.5')];
    await tester.tap(find.text(retry));
    await tester.pumpAndSettle();
    expect(find.text(unavailable), findsNothing);
    expect(find.text('2.50 XLM testnet reclamables'), findsOneWidget);
    expect(find.text('Reclamar ayuda'), findsOneWidget);
    expect(gateway.queries, 2);
    readOnly();
    await tester.tap(find.text('Reclamar ayuda'));
    await tester.pumpAndSettle();
    expect(wallet.executions, 1);
    expect(gateway.effects, ['trustline', 'claim:balance-1']);
    expect(find.text('Ayuda recibida en tu wallet.'), findsOneWidget);
    expect(find.textContaining('Ver transacción transaction-'), findsOneWidget);
    expect(find.text('Vaquita validada'), findsOneWidget);
    expect(gateway.queries, 4);
    expect(feed.reads, 2);
  });

  testWidgets(
      'existing successful empty lookup remains empty without financial effects',
      (tester) async {
    gateway.reply = () async => [];
    await mount(tester, promoted: false);
    expect(find.text(emptyVaquitas), findsOneWidget);
    expect(find.text(unavailable), findsNothing);
    expect(find.text(retry), findsNothing);
    expect(gateway.queries, 1);
    readOnly();
  });
}
