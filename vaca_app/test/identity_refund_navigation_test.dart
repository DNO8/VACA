import 'dart:ffi' show DynamicLibrary;
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
// Match the existing in-memory widget fixture's installed Linux SONAME.
// ignore: depend_on_referenced_packages
import 'package:sqlite3/open.dart';
import 'package:vaca_app/app.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/identity_key_source.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/features/about/presentation/about_vaca_screen.dart';
import 'package:vaca_app/features/delivery/domain/sync_status_service.dart';
import 'package:vaca_app/features/identity/data/kyc_adapter.dart';
import 'package:vaca_app/features/identity/domain/identity_service.dart';
import 'package:vaca_app/features/identity/presentation/identity_data_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';
import 'package:vaca_app/features/refund/domain/custody_profile.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/presentation/refund_remainder_panel.dart';
import 'package:vaca_app/features/vaquita/domain/vaquita_feed_service.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_gateway.dart';
import 'package:vaca_app/features/wallet/domain/stellar_wallet_service.dart';
import 'package:vaca_app/features/wallet/presentation/stellar_wallet_screen.dart';

class _RejectGateway implements StellarWalletGateway {
  _RejectGateway(this.effects);
  final List<String> effects;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    effects.add(invocation.memberName.toString());
    throw StateError('Navigation must not reach a financial gateway');
  }
}

class _OfflineWallet extends StellarWalletService {
  _OfflineWallet(SecureStorage storage, this.effects)
      : super(storage, _RejectGateway(effects));
  final List<String> effects;
  int provisions = 0;
  static const snapshot = StellarWalletSnapshot(
    accountId: 'GDYAWWQFFPSC5XUEEJE2OVHBXABA2LZBSRMUSV4PXWL443MXGDOBMRTP',
    balance: '0',
    funded: true,
    usdcTrustlineReady: true,
    usdcBalance: '0',
  );

  @override
  Future<Result<StellarWalletSnapshot>> create() async {
    provisions++;
    return const Success(snapshot);
  }

  @override
  Future<Result<StellarWalletSnapshot?>> load() async =>
      const Success(snapshot);

  @override
  Future<Result<List<StellarClaim>>> pendingClaims() async => const Success([]);

  @override
  Future<Result<StellarWalletSnapshot>> fund() {
    effects.add('fund');
    throw StateError('Navigation must not fund a wallet');
  }
}

class _EmptyFeed implements VaquitaFeedService {
  @override
  Future<Result<List<VaquitaFeedItem>>> fetchFeed() async => const Success([]);

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected feed operation');
}

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
  late _MemoryStorage storage;
  late IdentityService identity;
  late List<String> financialReads;
  late int walletOpens;
  late List<String> gatewayEffects;
  late _OfflineWallet wallet;

  setUpAll(() {
    if (Platform.isLinux) {
      open.overrideFor(
        OperatingSystem.linux,
        () => DynamicLibrary.open('libsqlite3.so.0'),
      );
    }
  });

  setUp(() async {
    database = AppDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    storage = _MemoryStorage();
    identity = IdentityService(
      database: database,
      secureStorage: storage,
      keySource: IdentityKeySource(storage),
      kycAdapter: const UnconfiguredKycAdapter(),
    );
    // Use the public identity service, not hand-written database rows.
    await identity.getOrCreateLocalProfile();
    financialReads = [];
    walletOpens = 0;
    gatewayEffects = [];
    wallet = _OfflineWallet(storage, gatewayEffects);
    addTearDown(() {
      expect(financialReads, isEmpty);
      expect(gatewayEffects, isEmpty);
    });
  });

  Never rejectFinancialRead(String provider) {
    financialReads.add(provider);
    throw StateError('Identity navigation must not construct $provider');
  }

  Future<void> mount(WidgetTester tester, {bool realApp = false}) async {
    // Navigation coverage only: the baseline stats rows overflow at width 390.
    // This bounded tablet viewport does not establish narrow-layout correctness.
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(database),
          secureStorageProvider.overrideWithValue(storage),
          identityServiceProvider.overrideWithValue(identity),
          stellarWalletServiceProvider.overrideWithValue(wallet),
          vaquitaFeedServiceProvider.overrideWithValue(_EmptyFeed()),
          vaquitaAlertProvider.overrideWith((ref) async => false),
          syncSnapshotProvider.overrideWith(
            (ref) => Stream.value(
              const SyncSnapshot(
                phase: SyncPhase.offline,
                pendingCount: 0,
                deliveredCount: 0,
                canRetry: false,
              ),
            ),
          ),
          // Guard both public clients and direct transport construction for
          // both refund protocols, without constructing real financial clients.
          refundClientProvider.overrideWith(
            (ref) => rejectFinancialRead('refundClientProvider'),
          ),
          refundHttpClientProvider.overrideWith(
            (ref) => rejectFinancialRead('refundHttpClientProvider'),
          ),
          remainderClientProvider.overrideWith(
            (ref) => rejectFinancialRead('remainderClientProvider'),
          ),
          remainderHttpClientProvider.overrideWith(
            (ref) => rejectFinancialRead('remainderHttpClientProvider'),
          ),
          refundHttpClientFactoryProvider.overrideWithValue(
            (configuration, storage) =>
                rejectFinancialRead('refundHttpClientFactoryProvider'),
          ),
          remainderHttpClientFactoryProvider.overrideWithValue(
            (configuration, storage) =>
                rejectFinancialRead('remainderHttpClientFactoryProvider'),
          ),
        ],
        child: realApp
            ? const VacaApp(skipOnboarding: true)
            : MaterialApp(
                theme: AppTheme.light,
                home: IdentityDataScreen(onOpenWallet: () => walletOpens++),
              ),
      ),
    );
    await tester.pumpAndSettle();
    if (realApp) {
      expect(find.text('Inicio'), findsOneWidget);
      expect(wallet.provisions, 1);
      await tester.tap(find.text('Identidad').hitTestable());
      await tester.pumpAndSettle();
    }
    expect(find.text('Identidad no verificada'), findsOneWidget);
    expect(financialReads, isEmpty);
    // Scope the scroll to Identity, not the shell's horizontal PageView.
    await tester.scrollUntilVisible(
      find.text('Wallet Stellar testnet'),
      200,
      scrollable: find.descendant(
        of: find.byType(IdentityDataScreen),
        matching: find.byType(Scrollable),
      ),
    );
    // Center the group: top-aligning About hides Wallet behind the shell bar.
    await Scrollable.ensureVisible(
      tester.element(find.text('Acerca de VACA')),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    expect(find.text('Wallet Stellar testnet').hitTestable(), findsOneWidget);
    expect(find.text('Acerca de VACA').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  }

  // Explicitly supersedes the former no-entry policy after navigation approval.
  testWidgets(
      'real app reaches passive B refunds and preserves wallet and About',
      (tester) async {
    final before = Map<String, String>.from(storage.values);
    await mount(tester, realApp: true);

    expect(find.byType(RefundAdminEntry), findsOneWidget);
    final entry = find.byKey(const ValueKey('refund-admin-entry'));
    expect(entry.hitTestable(), findsOneWidget);
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.byType(RefundAdminScreen), findsOneWidget);
    expect(
      find.textContaining('abrir esta pantalla no concede permisos'),
      findsOneWidget,
    );
    final selector = find.byKey(const ValueKey('refund-custody-profile'));
    await tester.ensureVisible(selector);
    await tester.tap(selector);
    await tester.pumpAndSettle();
    await tester.tap(find.text(CustodyProfile.b.label).last);
    await tester.pumpAndSettle();
    for (final item in {
      'refund-namespace': CustodyProfile.bNamespace,
      'refund-pool': CustodyProfile.bPool,
      'refund-original-request': '',
    }.entries) {
      final field =
          tester.widget<TextFormField>(find.byKey(ValueKey(item.key)));
      expect(field.controller!.text, item.value);
      expect(field.enabled, item.key == 'refund-original-request');
    }
    expect(find.byType(RefundPanel), findsNothing);
    expect(find.byType(RefundRemainderPanel), findsNothing);
    expect(financialReads, isEmpty);
    expect(gatewayEffects, isEmpty);
    expect(storage.values, before);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(RefundAdminScreen), findsNothing);
    await tester.tap(find.text('Wallet Stellar testnet'));
    await tester.pumpAndSettle();
    expect(find.byType(StellarWalletScreen), findsOneWidget);
    // Wallet uses its existing custom, Spanish-labeled back control.
    await tester.tap(find.byTooltip('Volver'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Acerca de VACA'));
    await tester.pumpAndSettle();
    expect(find.byType(AboutVacaScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(IdentityDataScreen), findsOneWidget);
    expect(entry.hitTestable(), findsOneWidget);
    expect(wallet.provisions, 1);
    expect(financialReads, isEmpty);
    expect(gatewayEffects, isEmpty);
    expect(storage.values, before);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets(
      'identity wallet action still invokes its callback without refunds',
      (tester) async {
    await mount(tester);

    expect(walletOpens, 0);
    await tester.tap(find.text('Wallet Stellar testnet'));
    await tester.pumpAndSettle();

    expect(walletOpens, 1);
    expect(find.byType(IdentityDataScreen), findsOneWidget);
    expect(find.byType(RefundAdminScreen), findsNothing);
    expect(financialReads, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('identity About action still opens and returns without refunds',
      (tester) async {
    await mount(tester);

    await tester.tap(find.text('Acerca de VACA'));
    await tester.pumpAndSettle();
    expect(find.byType(AboutVacaScreen), findsOneWidget);
    expect(find.text('Infraestructura cívica de resiliencia'), findsOneWidget);
    expect(find.byType(RefundAdminScreen), findsNothing);
    expect(financialReads, isEmpty);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(AboutVacaScreen), findsNothing);
    expect(find.byType(IdentityDataScreen), findsOneWidget);
    expect(find.text('Acerca de VACA').hitTestable(), findsOneWidget);
    expect(find.text('Wallet Stellar testnet').hitTestable(), findsOneWidget);
    expect(walletOpens, 0);
    expect(financialReads, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
