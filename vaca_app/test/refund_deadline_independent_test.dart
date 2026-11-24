import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vaca_app/features/refund/data/refund_submission_gate.dart';
import 'package:vaca_app/features/refund/domain/refund_remainder_status.dart';
import 'package:vaca_app/features/refund/domain/refund_scope.dart';
import 'package:vaca_app/features/refund/domain/refund_status.dart';

import 'refund_test_fixtures.dart';

Map<String, Object?> body(int version, String deadline,
    [String state = 'not_started']) {
  final result = refundFixture(state)
    ..['version'] = version
    ..['deadline'] = deadline;
  if (version == 2) {
    result['safeActions'] = (result['safeActions']! as List<String>)
        .map((action) => action.replaceFirst('refund', 'refund_remainder'))
        .toList();
  }
  return result;
}

dynamic parse(int version, Map<String, Object?> value) => version == 1
    ? RefundStatus.parse(value, refundTestScope)
    : RemainderStatus.parse(value, refundTestScope);

Matcher errorCode(String code) => throwsA(
      isA<RefundProtocolError>().having((e) => e.code, 'code', code),
    );

String storageHash(RefundMemoryStorage storage) {
  final keys = storage.values.keys.toList()..sort();
  return sha256
      .convert(utf8.encode(jsonEncode({
        for (final key in keys) key: storage.values[key],
      })))
      .toString();
}

void main() {
  for (final version in [1, 2]) {
    final lane = 'v$version';

    test('$lane mixed-case UTC preserves facts and literal identity', () {
      for (final deadline in [
        '2028-02-29t23:59:59z',
        '2028-02-29t23:59:59Z',
        '2028-02-29T23:59:59z',
        '2028-02-29t23:59:59+00:00',
        '2028-02-29t23:59:59.123456789z',
      ]) {
        for (final state in ['not_started', 'unknown', 'settled']) {
          final raw = body(version, deadline, state);
          final before = jsonEncode(raw);
          final dynamic status = parse(version, raw);
          expect(jsonEncode(raw), before);
          expect(status.deadline, deadline);
          expect(status.toJson(), raw);
          expect(status.isSettled, state == 'settled');
          final dynamic restored = parse(
            version,
            jsonDecode(jsonEncode(status.toJson()))
                as Map<String, Object?>,
          );
          expect(status.sameDonation(restored), isTrue);
          final dynamic recased =
              parse(version, body(version, deadline.toUpperCase(), state));
          expect(status.sameDonation(recased), isFalse);
          final exported = status.toJson() as Map<String, Object?>;
          exported['deadline'] = '2030-01-01T00:00:00Z';
          expect(status.deadline, deadline);
        }
      }
    });

    test('$lane malformed or overflowing deadlines reject without mutation', () {
      for (final deadline in [
        '',
        '2027-02-29t12:00:00z',
        '2028-02-30t12:00:00z',
        '2028-13-01t12:00:00z',
        '2028-01-00t12:00:00z',
        '2028-02-29t24:00:00z',
        '2028-02-29t23:60:00z',
        '2028-02-29t23:59:60z',
        '2028-02-29t23:59:59+01:00',
        '2028-02-29t23:59:59-01:00',
        '2028-02-29t23:59:59',
        '2028-02-29 23:59:59Z',
        '2028-02-29t23:59:59.1234567890z',
        ' 2028-02-29t23:59:59z',
        '2028-02-29t23:59:59z ',
      ]) {
        final raw = body(version, deadline);
        final before = jsonEncode(raw);
        expect(() => parse(version, raw),
            errorCode('d1_refund_response_unverified'));
        expect(jsonEncode(raw), before);
      }
    });

    test('$lane lowercase persisted hold reconstructs without normalization',
        () async {
      const deadline = '2028-02-29t23:59:59.123456789z';
      final storage = RefundMemoryStorage();
      final original = body(version, deadline);
      await RefundSubmissionGate(storage)
          .reserve(refundTestScope, lane, original);
      final saved = storageHash(storage);
      final events = List<String>.from(storage.events);
      final hold =
          (await RefundSubmissionGate(storage).load(refundTestScope))!;
      expect(hold.lane, lane);
      expect(hold.baseline, original);
      expect(hold.baseline['deadline'], deadline);
      expect(hold.matchesOriginal(original), isTrue);
      expect(
        hold.matchesOriginal(body(version, deadline.toUpperCase())),
        isFalse,
      );
      final record = storage.values.entries.singleWhere(
        (entry) => entry.key.startsWith('d1.refund.submission.'),
      );
      expect(jsonDecode(record.value), {
        'version': 1,
        'lane': lane,
        'baseline': original,
      });
      for (final next in ['v1', 'v2']) {
        await expectLater(
          RefundSubmissionGate(storage).reserve(
            refundTestScope,
            next,
            body(next == 'v1' ? 1 : 2, deadline),
          ),
          errorCode('d1_refund_journal_unavailable'),
        );
        expect(storageHash(storage), saved);
        expect(storage.events, events);
      }
    });

    test('$lane corrupt stored deadline fails closed without rewriting',
        () async {
      final storage = RefundMemoryStorage();
      await RefundSubmissionGate(storage).reserve(
        refundTestScope,
        lane,
        body(version, '2028-02-29t23:59:59z'),
      );
      final key = storage.values.keys.singleWhere(
        (key) => key.startsWith('d1.refund.submission.'),
      );
      final record = jsonDecode(storage.values[key]!) as Map<String, dynamic>;
      record['baseline']['deadline'] = '2028-02-30t23:59:59z';
      storage.values[key] = jsonEncode(record);
      final saved = storageHash(storage);
      final events = List<String>.from(storage.events);
      await expectLater(
        RefundSubmissionGate(storage).load(refundTestScope),
        errorCode('d1_refund_journal_unavailable'),
      );
      expect(storageHash(storage), saved);
      expect(storage.events, events);
    });
  }
}
