import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vaca_app/core/providers.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/presentation/refund_remainder_panel.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/result/result.dart';
import 'package:vaca_app/features/refund/data/refund_client.dart';
import 'package:vaca_app/features/refund/data/refund_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_http_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_status_client.dart';
import 'package:vaca_app/features/refund/data/refund_remainder_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_submission_journal.dart';
import 'package:vaca_app/features/refund/data/refund_wallet_signer.dart';
import 'package:vaca_app/features/refund/domain/custody_profile.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_status.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';

import 'refund_remainder_status_test.dart' show remainderFixture;
import 'refund_test_fixtures.dart';

class _Storage extends RefundMemoryStorage {
  int reads = 0;
  @override
  Future<Result<String?>> read(String key) {
    reads++;
    return super.read(key);
  }
}

class _Boundary extends ProviderObserver {
  final events = <String>[];
  final started = Completer<void>();
  final completed = Completer<void>();
  final failed = Completer<void>();
  Object? failure;

  void record(String event) {
    if (events.length < 30) events.add(event);
  }

  void fail(Object error) {
    failure ??= error;
    if (!failed.isCompleted) failed.complete();
  }

  Future<void> waitFor(Future<void> future, String boundary) async {
    await Future.any([future, failed.future]).timeout(
      const Duration(seconds: 3),
      onTimeout: () => throw TestFailure('$boundary not reached; $events'),
    );
    expect(failure, isNull, reason: '$boundary failed; $events');
  }

  @override
  void didAddProvider(ProviderBase<Object?> provider, Object? value,
      ProviderContainer container,) {
    if (provider == refundHttpClientFactoryProvider ||
        provider == remainderHttpClientFactoryProvider) {
      record('provider:factory');
    } else if (provider == refundClientProvider ||
        provider == remainderClientProvider) {
      record('provider:consumer');
    }
  }

  @override
  void providerDidFail(ProviderBase<Object?> provider, Object error,
      StackTrace stackTrace, ProviderContainer container,) {
    record('provider:failure');
    fail(error);
  }
}

class _ObservedRefundHttp extends RefundHttpClient {
  _ObservedRefundHttp(
      {required super.signer, required super.adapter, required this.boundary,})
      : super(
            projectUrl: CustodyProfile.b.origin(null),
            profile: CustodyProfile.b,
            publicApiKey: 'synthetic-public-key',);
  final _Boundary boundary;

  @override
  Future<RefundStatus> send(RefundScope scope, RefundAction action,
      {RefundLocalReservation? reservation,}) async {
    boundary.record('http:command');
    try {
      return await super.send(scope, action, reservation: reservation);
    } finally {
      boundary.record('http:completion');
      boundary.completed.complete();
    }
  }
}

class _ObservedRemainderHttp extends RemainderHttpClient {
  _ObservedRemainderHttp(
      {required super.storage, required super.adapter, required this.boundary,})
      : super(
            projectUrl: CustodyProfile.b.origin(null),
            profile: CustodyProfile.b,
            publicApiKey: 'synthetic-public-key',);
  final _Boundary boundary;

  @override
  Future<RemainderStatus> send(RefundScope scope, RemainderAction action,
      {RemainderLocalReservation? reservation,}) async {
    boundary.record('http:command');
    try {
      return await super.send(scope, action, reservation: reservation);
    } finally {
      boundary.record('http:completion');
      boundary.completed.complete();
    }
  }
}

final _bScope = RefundScope(
  namespace: CustodyProfile.bNamespace,
  pool: CustodyProfile.bPool,
  requestId: refundTestScope.requestId,
);

ResponseBody _reply(RefundScope scope, bool v2, String state,
    {int code = 200,}) {
  final body = v2 ? remainderFixture(state) : refundFixture(state);
  body['namespace'] = scope.namespace;
  body['pool'] = scope.pool;
  body['requestId'] = scope.requestId;
  return ResponseBody.fromString(jsonEncode(body), code, headers: {
    'content-type': ['application/json'],
    'cache-control': ['no-store'],
  },);
}

Future<void> _tap(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _select(WidgetTester tester, CustodyProfile profile) async {
  await _tap(tester, 'refund-custody-profile');
  await tester.tap(find.text(profile.label).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
      'profile selection clears originals, stays cold and pins B fields',
      (tester) async {
    final storage = _Storage();
    final before = Map<String, String>.from(storage.values);
    await tester.pumpWidget(ProviderScope(overrides: [
      secureStorageProvider.overrideWithValue(storage),
    ], child: const MaterialApp(home: RefundAdminScreen()),),);
    for (final entry in {
      'refund-namespace': refundTestScope.namespace,
      'refund-pool': refundTestScope.pool,
      'refund-original-request': refundTestScope.requestId,
    }.entries) {
      await tester.ensureVisible(find.byKey(ValueKey(entry.key)));
      await tester.enterText(find.byKey(ValueKey(entry.key)), entry.value);
    }
    await _tap(tester, 'refund-open-original');
    expect(find.byType(RefundPanel), findsOneWidget);
    await _select(tester, CustodyProfile.b);
    expect(find.byType(RefundPanel), findsNothing);
    expect(find.byType(RefundRemainderPanel), findsNothing);
    for (final entry in {
      'refund-namespace': CustodyProfile.bNamespace,
      'refund-pool': CustodyProfile.bPool,
      'refund-original-request': '',
    }.entries) {
      final field =
          tester.widget<TextFormField>(find.byKey(ValueKey(entry.key)));
      expect(field.controller!.text, entry.value);
      expect(field.enabled, entry.key == 'refund-original-request');
    }
    await _tap(tester, 'refund-open-original');
    expect(find.byType(RefundPanel), findsNothing);
    await tester.enterText(
        find.byKey(const ValueKey('refund-original-request')),
        '33333333-3333-3333-3333-333333333333',);
    await _tap(tester, 'refund-open-original');
    expect(tester.widget<RefundPanel>(find.byType(RefundPanel)).scope.namespace,
        CustodyProfile.bNamespace,);
    expect(find.text('Estado: Sin consultar'), findsNWidgets(2));
    await _select(tester, CustodyProfile.a);
    expect(find.byType(RefundPanel), findsNothing);
    for (final key in [
      'refund-namespace',
      'refund-pool',
      'refund-original-request',
    ]) {
      expect(
          tester
              .widget<TextFormField>(find.byKey(ValueKey(key)))
              .controller!
              .text,
          isEmpty,);
    }
    expect(storage.reads, 0);
    expect(storage.values, before);
    expect(storage.events, isEmpty);
  });

  for (final v2 in [false, true]) {
    testWidgets(
        'selection and reference disabled while ${v2 ? 'v2' : 'v1'} is in flight',
        (tester) async {
      final storage = _Storage();
      late Completer<void> release;
      late _Boundary boundary;
      // Async Completer schedules completion in its creation zone. Creating
      // these in FakeAsync strands their microtasks while runAsync awaits them.
      // Keep creation, completion and waits on real async scheduling. Separate
      // runAsync calls create distinct zones; object identity is not required.
      // Pump only the widget frames outside runAsync.
      await tester.runAsync(() async {
        boundary = _Boundary();
      });
      final before = Map<String, String>.from(storage.values);
      final adapter = RefundTestAdapter((options) async {
        boundary.record('http:adapter');
        try {
          expect(options.uri.origin, CustodyProfile.bOrigin);
          expect(options.uri.path,
              '${CustodyProfile.b.pathPrefix}/${v2 ? 'refund-remainder-status' : 'refund-status'}',);
          boundary.started.complete();
        } catch (error) {
          boundary.fail(error);
          rethrow;
        }
        // Only successful completion crosses into Dio's error zone. The
        // transport error must originate inside this adapter invocation.
        await release.future;
        throw StateError('synthetic transport unavailable');
      });
      await tester.pumpWidget(ProviderScope(observers: [
        boundary,
      ], overrides: [
        secureStorageProvider.overrideWithValue(storage),
        refundClientConfigurationProvider.overrideWithValue((
          projectUrl: 'https://a.invalid',
          publicApiKey: 'synthetic-public-key'
        ),),
        // Only the transport factories are injected. The production scoped
        // providers still construct/own HTTP clients, consumers and journals.
        refundHttpClientFactoryProvider.overrideWithValue((config, provided) {
          boundary.record('factory:v1');
          expect(config.projectUrl, 'https://a.invalid');
          expect(provided, same(storage));
          return _ObservedRefundHttp(
              signer: RefundWalletSigner(provided),
              adapter: adapter,
              boundary: boundary,);
        }),
        remainderHttpClientFactoryProvider
            .overrideWithValue((config, provided) {
          boundary.record('factory:v2');
          expect(config.projectUrl, 'https://a.invalid');
          expect(provided, same(storage));
          return _ObservedRemainderHttp(
              storage: provided, adapter: adapter, boundary: boundary,);
        }),
      ], child: const MaterialApp(home: RefundAdminScreen()),),);
      await _select(tester, CustodyProfile.b);
      await tester
          .ensureVisible(find.byKey(const ValueKey('refund-original-request')));
      await tester.enterText(
          find.byKey(const ValueKey('refund-original-request')),
          refundTestScope.requestId,);
      await _tap(tester, 'refund-open-original');
      final statusKey = v2 ? 'remainder-status' : 'refund-status';
      await tester.ensureVisible(find.byKey(ValueKey(statusKey)));
      await tester.pumpAndSettle();
      expect(
          ProviderScope.containerOf(tester.element(find.byType(RefundPanel)))
              .read(custodyProfileProvider),
          CustodyProfile.b,);
      await tester.runAsync(() async {
        // Dio forks its own error zone after this callback starts. A successful
        // release gate can cross that boundary without stranding the request.
        release = Completer<void>();
        boundary.record('callback:tap');
        await tester.tap(find.byKey(ValueKey(statusKey)));
        boundary.record('callback:return');
        await boundary.waitFor(boundary.started.future, 'B transport start');
        expect(boundary.started.isCompleted, isTrue,
            reason: 'The explicit status must reach the injected B transport',);
      });
      expect(tester.takeException(), isNull);
      await tester.pump();
      expect(
          tester
              .widget<DropdownButtonFormField<CustodyProfile>>(
                  find.byKey(const ValueKey('refund-custody-profile')),)
              .onChanged,
          isNull,);
      expect(
          tester
              .widget<TextButton>(
                  find.byKey(const ValueKey('refund-change-reference')),)
              .onPressed,
          isNull,);
      await tester.runAsync(() async {
        release.complete();
        await boundary.waitFor(boundary.completed.future, 'HTTP completion');
      });
      expect(tester.takeException(), isNull);
      await tester.pumpAndSettle();
      expect(
          boundary.events,
          containsAllInOrder([
            'callback:tap',
            'provider:factory',
            'factory:${v2 ? 'v2' : 'v1'}',
            'provider:consumer',
            'http:command',
            'http:adapter',
            'http:completion',
          ]),);
      expect(boundary.failure, isNull);
      expect(find.text('Estado: Resultado desconocido'), findsOneWidget);
      expect(
          tester
              .widget<DropdownButtonFormField<CustodyProfile>>(
                  find.byKey(const ValueKey('refund-custody-profile')),)
              .onChanged,
          isNotNull,);
      await _select(tester, CustodyProfile.a);
      await _select(tester, CustodyProfile.b);
      expect(find.byType(RefundPanel), findsNothing);
      expect(storage.values, before);
      expect(storage.events, isEmpty);
    });
  }

  test('scoped B providers remain cold and do not reroute A configuration', () {
    final storage = _Storage();
    const configuration =
        (projectUrl: 'https://a.invalid', publicApiKey: 'synthetic-public-key');
    final root = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(storage),
      refundClientConfigurationProvider.overrideWithValue(configuration),
    ],);
    final child = ProviderContainer(parent: root, overrides: [
      custodyProfileProvider.overrideWithValue(CustodyProfile.b),
    ],);
    addTearDown(root.dispose);
    addTearDown(child.dispose);
    final a = root.read(refundHttpClientProvider);
    final a2 = root.read(remainderHttpClientProvider);
    final b = child.read(refundHttpClientProvider);
    final b2 = child.read(remainderHttpClientProvider);
    expect(a.profile, CustodyProfile.a);
    expect(a2.profile, CustodyProfile.a);
    expect(b.profile, CustodyProfile.b);
    expect(b2.profile, CustodyProfile.b);
    expect(a.projectUrl.toString(), configuration.projectUrl);
    expect(a2.projectUrl.toString(), configuration.projectUrl);
    expect(b.projectUrl.toString(), CustodyProfile.bOrigin);
    expect(b2.projectUrl.toString(), CustodyProfile.bOrigin);
    expect(child.read(refundClientConfigurationProvider), configuration);
    expect(root.read(refundHttpClientProvider), same(a));
    expect(root.read(remainderHttpClientProvider), same(a2));
    child.read(refundClientProvider);
    child.read(remainderClientProvider);
    expect(storage.reads, 0);
    expect(storage.events, isEmpty);
  });

  test('B origin is exact; A retains configurable HTTPS origin', () {
    expect(CustodyProfile.b.origin(Uri.parse('https://a.invalid')),
        Uri.parse('https://tgqxxnldwiqisopiclmk.supabase.co'),);
    expect(CustodyProfile.a.origin(Uri.parse('https://a.invalid')),
        Uri.parse('https://a.invalid'),);
    for (final origin in [
      'https://a.invalid',
      'http://tgqxxnldwiqisopiclmk.supabase.co',
      'https://tgqxxnldwiqisopiclmk.supabase.co:444',
      'https://tgqxxnldwiqisopiclmk.supabase.co/foreign',
      'https://tgqxxnldwiqisopiclmk.supabase.co?x=1',
      'https://tgqxxnldwiqisopiclmk.supabase.co#x',
      'https://user@tgqxxnldwiqisopiclmk.supabase.co',
    ]) {
      final storage = _Storage();
      final before = Map<String, String>.from(storage.values);
      expect(
          () => RefundHttpClient(
                projectUrl: Uri.parse(origin),
                profile: CustodyProfile.b,
                publicApiKey: 'synthetic-public-key',
                signer: RefundWalletSigner(storage),
              ),
          throwsA(isA<RefundProtocolError>()),);
      expect(
          () => RemainderHttpClient(
                projectUrl: Uri.parse(origin),
                profile: CustodyProfile.b,
                publicApiKey: 'synthetic-public-key',
                storage: storage,
              ),
          throwsA(isA<RefundProtocolError>()),);
      expect(
          () => RemainderStatusClient(
                projectUrl: Uri.parse(origin),
                profile: CustodyProfile.b,
                publicApiKey: 'synthetic-public-key',
                storage: storage,
              ),
          throwsA(isA<RefundProtocolError>()),);
      expect(storage.reads, 0);
      expect(storage.events, isEmpty);
      expect(storage.values, before);
    }
  });

  for (final scope in [
    refundTestScope,
    RefundScope(
        namespace: CustodyProfile.bNamespace,
        pool: refundTestScope.pool,
        requestId: refundTestScope.requestId,),
    RefundScope(
        namespace: refundTestScope.namespace,
        pool: CustodyProfile.bPool,
        requestId: refundTestScope.requestId,),
  ]) {
    test('B rejects foreign scope before signing or sending ${scope.identity}',
        () async {
      final storage = _Storage();
      final before = Map<String, String>.from(storage.values);
      var calls = 0;
      final adapter = RefundTestAdapter((_) async {
        calls++;
        throw StateError('unexpected send');
      });
      final v1 = RefundHttpClient(
          projectUrl: CustodyProfile.b.origin(null),
          profile: CustodyProfile.b,
          publicApiKey: 'synthetic-public-key',
          signer: RefundWalletSigner(storage),
          adapter: adapter,);
      final v2 = RemainderHttpClient(
          projectUrl: CustodyProfile.b.origin(null),
          profile: CustodyProfile.b,
          publicApiKey: 'synthetic-public-key',
          storage: storage,
          adapter: adapter,);
      final passive = RemainderStatusClient(
          projectUrl: CustodyProfile.b.origin(null),
          profile: CustodyProfile.b,
          publicApiKey: 'synthetic-public-key',
          storage: storage,
          adapter: adapter,);
      addTearDown(v1.close);
      addTearDown(v2.close);
      addTearDown(passive.close);
      for (final action in RefundAction.values) {
        await expectLater(
            v1.send(scope, action), throwsA(isA<RefundProtocolError>()),);
      }
      for (final action in RemainderAction.values) {
        await expectLater(
            v2.send(scope, action), throwsA(isA<RefundProtocolError>()),);
      }
      final result = await passive.status(scope);
      expect(result.state, 'unknown');
      expect(result.errorCode, 'd1_remainder_response_unverified');
      expect(result.safeActions, isEmpty);
      expect(result.status, isNull);
      expect(result.isSettled, isFalse);
      expect(storage.reads, 0);
      expect(calls, 0);
      expect(storage.events, isEmpty);
      expect(storage.values, before);
    });
  }

  for (final profile in CustodyProfile.values) {
    for (final v2 in [false, true]) {
      test(
          '${profile.name} full ${v2 ? 'v2' : 'v1'} routes and durable recovery',
          () async {
        final storage = _Storage();
        final scope = profile == CustodyProfile.b ? _bScope : refundTestScope;
        final paths = <String>[];
        final actions = <String>[];
        final adapter = RefundTestAdapter((options) async {
          final body =
              jsonDecode(options.data! as String) as Map<String, dynamic>;
          paths.add(options.uri.path);
          actions.add(body['action'] as String);
          expect(options.uri.origin,
              profile.origin(Uri.parse('https://a.invalid')).origin,);
          expect(body['version'], v2 ? 2 : 1);
          expect(body['network'], 'TESTNET');
          expect(body['namespace'], scope.namespace);
          expect(body['pool'], scope.pool);
          expect(body['request_id'], scope.requestId);
          expect(body['wallet'], refundTestWallet.accountId);
          expect(body['signature'], isNotEmpty);
          return _reply(
              scope, v2, actions.length == 1 ? 'not_started' : 'pending',
              code: actions.length == 1 || actions.last.endsWith('_status')
                  ? 200
                  : 202,);
        });
        final origin = profile.origin(Uri.parse('https://a.invalid'));
        if (v2) {
          final http = RemainderHttpClient(
              projectUrl: origin,
              profile: profile,
              publicApiKey: 'synthetic-public-key',
              storage: storage,
              adapter: adapter,);
          addTearDown(http.close);
          RemainderClient client() => RemainderClient(
              http: http, journal: RemainderSubmissionJournal(storage),);
          expect((await client().requestRefund(scope)).state, 'pending');
          final saved = Map<String, String>.from(storage.values);
          expect(
              (await client().requestRefund(scope)).firstPostRecorded, isTrue,);
          expect((await client().reconcile(scope)).state, 'pending');
          expect(storage.values, saved);
        } else {
          final http = RefundHttpClient(
              projectUrl: origin,
              profile: profile,
              publicApiKey: 'synthetic-public-key',
              signer: RefundWalletSigner(storage),
              adapter: adapter,);
          addTearDown(http.close);
          RefundClient client() => RefundClient(
              http: http, journal: RefundSubmissionJournal(storage),);
          expect((await client().requestRefund(scope)).state, 'pending');
          final saved = Map<String, String>.from(storage.values);
          expect(
              (await client().requestRefund(scope)).firstPostRecorded, isTrue,);
          expect((await client().reconcile(scope)).state, 'pending');
          expect(storage.values, saved);
        }
        final lane = v2 ? 'refund-remainder' : 'refund';
        expect(paths, [
          '${profile.pathPrefix}/$lane-status',
          '${profile.pathPrefix}/$lane',
          '${profile.pathPrefix}/$lane-status',
          '${profile.pathPrefix}/$lane-reconcile',
        ]);
        expect(
            actions
                .where((a) => a == (v2 ? 'refund_remainder' : 'refund'))
                .length,
            1,);
      });
    }
    test('${profile.name} passive status stays status-only without persistence',
        () async {
      final scope = profile == CustodyProfile.b ? _bScope : refundTestScope;
      final storage = _Storage();
      final before = Map<String, String>.from(storage.values);
      var calls = 0;
      final client = RemainderStatusClient(
          projectUrl: profile.origin(Uri.parse('https://a.invalid')),
          profile: profile,
          publicApiKey: 'synthetic-public-key',
          storage: storage,
          adapter: RefundTestAdapter((options) async {
            calls++;
            expect(options.uri.path,
                '${profile.pathPrefix}/refund-remainder-status',);
            final body =
                jsonDecode(options.data! as String) as Map<String, dynamic>;
            expect(body['version'], 2);
            expect(body['network'], 'TESTNET');
            expect(body['action'], 'refund_remainder_status');
            expect(body['namespace'], scope.namespace);
            expect(body['pool'], scope.pool);
            expect(body['request_id'], scope.requestId);
            return _reply(scope, true, 'not_started');
          }),);
      addTearDown(client.close);
      expect(storage.reads, 0);
      expect(calls, 0);
      final result = await client.status(scope);
      expect(result.state, 'not_started');
      expect(result.safeActions, [RemainderAction.status]);
      expect(result.errorCode, isNull);
      expect(calls, 1);
      expect(storage.reads, 1);
      expect(storage.events, isEmpty);
      expect(storage.values, before);
    });
  }
}
