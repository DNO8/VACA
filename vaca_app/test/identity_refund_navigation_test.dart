import 'dart:ffi' show DynamicLibrary;
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
// Match the existing in-memory widget fixture's installed Linux SONAME.
// ignore: depend_on_referenced_packages
import 'package:sqlite3/open.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/core/security/identity_key_source.dart';
import 'package:vaca_app/core/security/secure_storage.dart';
import 'package:vaca_app/core/theme/app_theme.dart';
import 'package:vaca_app/data/local/database.dart';
import 'package:vaca_app/features/about/presentation/about_vaca_screen.dart';
import 'package:vaca_app/features/identity/data/kyc_adapter.dart';
import 'package:vaca_app/features/identity/domain/identity_service.dart';
import 'package:vaca_app/features/identity/presentation/identity_data_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';

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
    addTearDown(() => expect(financialReads, isEmpty));
  });

  Never rejectFinancialRead(String provider) {
    financialReads.add(provider);
    throw StateError('Identity navigation must not construct $provider');
  }

  Future<void> mount(WidgetTester tester) async {
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
        child: MaterialApp(
          theme: AppTheme.light,
          home: IdentityDataScreen(onOpenWallet: () => walletOpens++),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Identidad no verificada'), findsOneWidget);
    expect(financialReads, isEmpty);
    // Materialize the lazy list's navigation section before asserting absence.
    await tester.scrollUntilVisible(
      find.text('Wallet Stellar testnet'),
      200,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
    expect(find.text('Wallet Stellar testnet').hitTestable(), findsOneWidget);
    expect(find.text('Acerca de VACA').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  }

  testWidgets('normal identity navigation omits refund administration',
      (tester) async {
    await mount(tester);

    expect(find.text('Reembolsos Stellar testnet'), findsNothing);
    expect(find.byType(RefundAdminEntry), findsNothing);
    expect(find.byKey(const ValueKey('refund-admin-entry')), findsNothing);
    expect(find.byType(RefundAdminScreen), findsNothing);
    expect(walletOpens, 0);
    expect(financialReads, isEmpty);
  });

  testWidgets('identity wallet action still invokes its callback without refunds',
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
