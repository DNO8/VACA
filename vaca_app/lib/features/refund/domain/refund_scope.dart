import 'dart:convert';

import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart';

/// Wire actions are deliberately different from their HTTP path suffixes.
enum RefundAction {
  refund('refund', 'refund'),
  status('refund_status', 'refund-status'),
  reconcile('refund_reconcile', 'refund-reconcile');

  const RefundAction(this.wire, this.path);
  final String wire;
  final String path;
}

/// This is the ORIGINAL issuance identity, not a newly generated refund ID.
class RefundScope {
  RefundScope({
    required this.namespace,
    required this.pool,
    required this.requestId,
  }) {
    RefundValidation.uuid(namespace);
    RefundValidation.publicKey(pool);
    RefundValidation.uuid(requestId);
  }

  final String namespace;
  final String pool;
  final String requestId;
  String get identity => 'TESTNET/$namespace/$pool/$requestId';

  bool matches(Map<String, Object?> value) =>
      value['network'] == 'TESTNET' &&
      value['namespace'] == namespace &&
      value['pool'] == pool &&
      value['requestId'] == requestId;
}

/// Contains a public classification only, never response text or key material.
class RefundProtocolError implements Exception {
  const RefundProtocolError([this.code = 'd1_refund_response_unverified']);
  final String code;
  @override
  String toString() => code;
}

class RefundValidation {
  static final maxStroops = BigInt.parse('9223372036854775807');
  static final _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  );

  static void require(bool condition) {
    if (!condition) throw const RefundProtocolError();
  }

  static Map<String, Object?> object(Object? value, List<String> keys) {
    require(value is Map<String, Object?>);
    final map = value! as Map<String, Object?>;
    require(map.length == keys.length && keys.every(map.containsKey));
    return map;
  }

  // Syntax is validated by the standard decoder. Scan the ORIGINAL tokens too:
  // a decoded Map alone has already lost repeated member names.
  static final _jsonTokens = RegExp(r'"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]');

  static Object? decodeJson(String source) {
    try {
      final decoded = jsonDecode(source);
      final objects = <Set<String>?>[]; // null marks an array, not an object.
      var previous = '';
      for (final match in _jsonTokens.allMatches(source)) {
        final token = match.group(0)!;
        if (token == '{') {
          objects.add(<String>{});
        } else if (token == '[') {
          objects.add(null);
        } else if (token == '}' || token == ']') {
          objects.removeLast();
        } else if (token.startsWith('"') &&
            objects.isNotEmpty &&
            objects.last != null &&
            (previous == '{' || previous == ',')) {
          // Decode escapes so "state" and "\\u0073tate" are the SAME name.
          require(objects.last!.add(jsonDecode(token) as String));
        }
        previous = token;
      }
      require(objects.isEmpty);
      return decoded;
    } catch (_) {
      throw const RefundProtocolError();
    }
  }

  static void uuid(Object? value) =>
      require(value is String && _uuid.hasMatch(value));

  static void publicKey(Object? value) {
    require(value is String && RegExp(r'^G[A-Z2-7]{55}$').hasMatch(value));
    try {
      require(KeyPair.fromAccountId(value! as String).accountId == value);
    } catch (_) {
      throw const RefundProtocolError();
    }
  }

  static void hash(Object? value) =>
      require(value is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(value));

  static BigInt amount(Object? value, {bool positive = false}) {
    require(value is String &&
        RegExp(r'^(0|[1-9][0-9]{0,11})\.[0-9]{7}$').hasMatch(value));
    final stroops = BigInt.parse((value! as String).replaceFirst('.', ''));
    require(stroops <= maxStroops && (!positive || stroops > BigInt.zero));
    return stroops;
  }
}
