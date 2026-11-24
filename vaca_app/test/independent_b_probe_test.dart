// Independent S1 probes: synthetic wallet and adapter only, no live endpoints.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/core/providers.dart';
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
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/presentation/refund_admin_screen.dart';
import 'package:vaca_app/features/refund/presentation/refund_panel.dart';
import 'package:vaca_app/features/refund/refund_providers.dart';

import 'refund_remainder_status_test.dart' show remainderFixture;
import 'refund_test_fixtures.dart';

const origin = 'https://tgqxxnldwiqisopiclmk.supabase.co';
const prefix = '/functions/v1/d1-custody/video-auto';
final b = RefundScope(
  namespace: '8126a1f4-ed8a-41ec-905b-9ad3442e5e6e',
  pool: 'GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW',
  requestId: '44444444-4444-4444-4444-444444444444',
);

class Storage extends RefundMemoryStorage {
  int reads = 0;
  @override
  Future<Result<String?>> read(String key) {
    reads++;
    return super.read(key);
  }
}

String fingerprint(Storage storage) =>
    sha256.convert(utf8.encode(jsonEncode(storage.values))).toString();

Map<String, Object?> body(bool v2, String state) =>
    (v2 ? remainderFixture(state) : refundFixture(state))
      ..['namespace'] = b.namespace
      ..['pool'] = b.pool
      ..['requestId'] = b.requestId;

ResponseBody reply(Map<String, Object?> value, [int code = 200]) =>
    ResponseBody.fromString(jsonEncode(value), code, headers: {
      'content-type': ['application/json'],
      'cache-control': ['no-store'],
    },);

RefundHttpClient v1(Storage s, RefundTestAdapter a, {String url = origin}) =>
    RefundHttpClient(
      projectUrl: Uri.parse(url), profile: CustodyProfile.b,
      publicApiKey: 'synthetic-public', signer: RefundWalletSigner(s), adapter: a,
    );
RemainderHttpClient v2(Storage s, RefundTestAdapter a, {String url = origin}) =>
    RemainderHttpClient(
      projectUrl: Uri.parse(url), profile: CustodyProfile.b,
      publicApiKey: 'synthetic-public', storage: s, adapter: a,
    );
RemainderStatusClient passive(Storage s, RefundTestAdapter a,
        {String url = origin,}) =>
    RemainderStatusClient(
      projectUrl: Uri.parse(url), profile: CustodyProfile.b,
      publicApiKey: 'synthetic-public', storage: s, adapter: a,
    );

void checkProof(RequestOptions request, int version, String action) {
  expect(request.uri.origin, origin);
  expect(request.followRedirects, isFalse);
  final signed = jsonDecode(request.data as String) as Map<String, dynamic>;
  final signature = base64Decode(signed.remove('signature') as String);
  expect(signed['version'], version);
  expect(signed['network'], 'TESTNET');
  expect(signed['namespace'], b.namespace);
  expect(signed['pool'], b.pool);
  expect(signed['request_id'], b.requestId);
  expect(signed['wallet'], refundTestWallet.accountId);
  expect(signed['action'], action);
  expect(signed['payload'], isEmpty);
  final keys = signed.keys.toList()..sort();
  final canonical = jsonEncode({for (final k in keys) k: signed[k]});
  final digest = Uint8List.fromList(sha256.convert(
    utf8.encode('Stellar Signed Message:\n$canonical'),
  ).bytes,);
  expect(refundTestWallet.verify(digest, signature), isTrue);
}

void main() {
  test('S1 B canonical proofs and both observation routes on all clients', () async {
    final s = Storage();
    final before = fingerprint(s);
    final paths = <String>[];
    final a = RefundTestAdapter((o) async {
      paths.add(o.uri.path);
      final signed = jsonDecode(o.data as String) as Map<String, dynamic>;
      checkProof(o, signed['version'] as int, signed['action'] as String);
      return reply(body(signed['version'] == 2, 'unknown'),
          o.uri.path.endsWith('reconcile') ? 202 : 200,);
    });
    final one = v1(s, a); final two = v2(s, a); final p = passive(s, a);
    addTearDown(one.close); addTearDown(two.close); addTearDown(p.close);
    for (final action in [RefundAction.status, RefundAction.reconcile]) {
      expect((await one.send(b, action)).deadline, '2026-11-07T12:05:00Z');
    }
    for (final action in [RemainderAction.status, RemainderAction.reconcile]) {
      expect((await two.send(b, action)).donation['grossAmount'], '10.0000000');
    }
    final observed = await p.status(b);
    expect(observed.safeActions, [RemainderAction.status]);
    expect(observed.isSettled, isFalse);
    expect(paths, ['$prefix/refund-status', '$prefix/refund-reconcile',
      '$prefix/refund-remainder-status', '$prefix/refund-remainder-reconcile',
      '$prefix/refund-remainder-status',]);
    expect(fingerprint(s), before);
    expect(s.events, isEmpty);
  });

  test('S1 scope rejection precedes reads/signing/reservations/adapter', () async {
    final s = Storage(); final before = fingerprint(s); var calls = 0;
    final a = RefundTestAdapter((_) async { calls++; throw StateError('I/O'); });
    final one = v1(s, a); final two = v2(s, a); final p = passive(s, a);
    addTearDown(one.close); addTearDown(two.close); addTearDown(p.close);
    final mismatch = throwsA(isA<RefundProtocolError>().having(
      (e) => e.code, 'code', 'd1_custody_profile_mismatch',),);
    for (final foreign in [refundTestScope,
      RefundScope(namespace: b.namespace, pool: refundTestScope.pool, requestId: b.requestId),
      RefundScope(namespace: refundTestScope.namespace, pool: b.pool, requestId: b.requestId),]) {
      for (final action in RefundAction.values) {
        await expectLater(one.send(foreign, action), mismatch);
        expect(fingerprint(s), before);
      }
      for (final action in RemainderAction.values) {
        await expectLater(two.send(foreign, action), mismatch);
        expect(fingerprint(s), before);
      }
      final result = await p.status(foreign);
      expect(result.errorCode, 'd1_remainder_response_unverified');
      expect(result.safeActions, isEmpty);
      expect(fingerprint(s), before);
    }
    expect(s.reads, 0); expect(calls, 0); expect(s.events, isEmpty);
  });

  test('S1 valid foreign HTTPS origin rejected on every constructor', () {
    final s = Storage(); final before = fingerprint(s);
    final a = RefundTestAdapter((_) async => throw StateError('I/O'));
    for (final url in ['https://other.invalid', '$origin:444',
      'https://tgqxxnldwiqisopiclmk.supabase.co.evil.invalid',]) {
      for (final make in [() => v1(s, a, url: url), () => v2(s, a, url: url),
        () => passive(s, a, url: url),]) {
        expect(make, throwsA(isA<RefundProtocolError>().having(
          (e) => e.code, 'code', 'd1_custody_profile_mismatch',),),);
        expect(fingerprint(s), before);
      }
    }
    expect(s.reads, 0); expect(s.events, isEmpty);
  });

  for (final lane2 in [false, true]) {
    test('S1 lost ${lane2 ? 'v2' : 'v1'} submit persists original and blocks opposite lane', () async {
      final s = Storage(); final actions = <String>[];
      final a = RefundTestAdapter((o) async {
        final signed = jsonDecode(o.data as String) as Map<String, dynamic>;
        final action = signed['action'] as String;
        actions.add(action);
        checkProof(o, signed['version'] as int, action);
        if (!action.endsWith('_status')) {
          expect(s.events.where((e) => e == 'write:ack'), isNotEmpty);
          throw StateError('lost synthetic response');
        }
        return reply(body(signed['version'] == 2, 'not_started'));
      });
      final one = v1(s, a); final two = v2(s, a);
      addTearDown(one.close); addTearDown(two.close);
      RefundClient client1() => RefundClient(http: one, journal: RefundSubmissionJournal(s));
      RemainderClient client2() => RemainderClient(http: two, journal: RemainderSubmissionJournal(s));
      final error = lane2 ? (await client2().requestRefund(b)).errorCode
          : (await client1().requestRefund(b)).errorCode;
      expect(error, lane2 ? 'd1_remainder_transport_unavailable' : 'd1_refund_transport_unavailable');
      expect(actions.length, 2); // no fallback, retry or automatic reconcile
      final saved = fingerprint(s);
      final persisted = s.values.values.where((v) => v.startsWith('{')).join();
      expect(persisted, contains('2026-11-07T12:05:00Z'));
      expect(persisted, contains('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
      if (lane2) {
        expect((await client1().requestRefund(b)).firstPostRecorded, isTrue);
        expect((await client2().requestRefund(b)).firstPostRecorded, isTrue);
      } else {
        expect((await client2().requestRefund(b)).firstPostRecorded, isTrue);
        expect((await client1().requestRefund(b)).firstPostRecorded, isTrue);
      }
      expect(actions.skip(2), everyElement(endsWith('_status')));
      expect(fingerprint(s), saved);
    });
  }

  test('S1 unavailable and foreign response are passive unknown, never retry', () async {
    for (final mode in ['503', 'foreign', 'transport']) {
      final s = Storage(); final before = fingerprint(s); var calls = 0;
      final p = passive(s, RefundTestAdapter((o) async {
        calls++;
        if (mode == 'transport') throw StateError('offline');
        if (mode == '503') return reply({'error': 'custody_unavailable'}, 503);
        return reply(remainderFixture('settled'));
      }),);
      final result = await p.status(b);
      expect(result.state, 'unknown'); expect(result.isSettled, isFalse);
      expect(result.safeActions, isEmpty);
      expect(result.errorCode, switch (mode) {
        '503' => 'custody_unavailable',
        'foreign' => 'd1_remainder_response_unverified',
        _ => 'd1_remainder_transport_unavailable',
      },);
      expect(calls, 1); expect(fingerprint(s), before); expect(s.events, isEmpty);
      p.close();
    }
  });

  test('S1 production child providers isolate B without mutating A common config', () {
    final s = Storage(); const config = (projectUrl: 'https://common.invalid', publicApiKey: 'synthetic');
    final root = ProviderContainer(overrides: [secureStorageProvider.overrideWithValue(s),
      refundClientConfigurationProvider.overrideWithValue(config),],);
    final child = ProviderContainer(parent: root,
      overrides: [custodyProfileProvider.overrideWithValue(CustodyProfile.b)],);
    addTearDown(root.dispose); addTearDown(child.dispose);
    expect(root.read(refundHttpClientProvider).profile, CustodyProfile.a);
    expect(root.read(remainderHttpClientProvider).projectUrl.toString(), config.projectUrl);
    expect(child.read(refundHttpClientProvider).projectUrl.toString(), origin);
    expect(child.read(remainderHttpClientProvider).profile, CustodyProfile.b);
    expect(child.read(refundClientConfigurationProvider), config);
    expect(root.read(custodyProfileProvider), CustodyProfile.a);
    expect(s.reads, 0); expect(s.events, isEmpty);
  });

  for (final lane2 in [false, true]) {
    testWidgets('S1 mounted ${lane2 ? 'v2' : 'v1'} B busy and stale completion isolation', (t) async {
      final s = Storage(); final before = fingerprint(s);
      late Completer<void> entered; late Completer<void> release;
      await t.runAsync(() async { entered = Completer<void>(); release = Completer<void>(); });
      final a = RefundTestAdapter((o) async {
        checkProof(o, lane2 ? 2 : 1, lane2 ? 'refund_remainder_status' : 'refund_status');
        expect(o.uri.path, '$prefix/${lane2 ? 'refund-remainder' : 'refund'}-status');
        entered.complete(); await release.future;
        return reply(body(lane2, 'not_started'));
      });
      await t.pumpWidget(ProviderScope(overrides: [
        secureStorageProvider.overrideWithValue(s),
        refundHttpClientFactoryProvider.overrideWithValue((_, storage) => v1(s, a)),
        remainderHttpClientFactoryProvider.overrideWithValue((_, storage) => v2(s, a)),
      ], child: const MaterialApp(home: RefundAdminScreen()),),);
      Future<void> tap(String key) async {
        final f = find.byKey(ValueKey(key)); await t.ensureVisible(f);
        await t.tap(f); await t.pumpAndSettle();
      }
      await tap('refund-custody-profile');
      await t.tap(find.text('Custodia B · Testnet').last); await t.pumpAndSettle();
      final request = find.byKey(const ValueKey('refund-original-request'));
      await t.ensureVisible(request); await t.enterText(request, b.requestId);
      await tap('refund-open-original');
      expect(ProviderScope.containerOf(t.element(find.byType(RefundPanel)))
          .read(custodyProfileProvider), CustodyProfile.b,);
      expect(s.reads, 0);
      final button = find.byKey(ValueKey(lane2 ? 'remainder-status' : 'refund-status'));
      await t.ensureVisible(button);
      await t.runAsync(() async {
        await t.tap(button); await entered.future.timeout(const Duration(seconds: 3));
      });
      await t.pump();
      final selector = t.widget<DropdownButtonFormField<CustodyProfile>>(
          find.byKey(const ValueKey('refund-custody-profile')),);
      expect(selector.onChanged, isNull);
      expect(t.widget<TextButton>(find.byKey(const ValueKey('refund-change-reference'))).onPressed, isNull);
      // A late reply after leaving the surface must not write/setState on a dead view.
      await t.pumpWidget(const MaterialApp(home: Text('new unrelated view')));
      await t.runAsync(() async {
        release.complete();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(find.text('new unrelated view'), findsOneWidget);
      expect(find.text('Estado: Sin iniciar'), findsNothing);
      expect(fingerprint(s), before); expect(s.events, isEmpty);
    });
  }
}
