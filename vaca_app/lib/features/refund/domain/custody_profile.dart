import 'refund_scope.dart';

/// Custody routing only. Does not change the app's general Supabase project,
/// original issuance identity, TESTNET proofs or backend authorization.
enum CustodyProfile {
  a('Custodia A · Testnet', '/functions/v1/d1-custody'),
  b('Custodia B · Testnet', '/functions/v1/d1-custody/video-auto');

  const CustodyProfile(this.label, this.pathPrefix);
  final String label;
  final String pathPrefix;

  static const bOrigin = 'https://tgqxxnldwiqisopiclmk.supabase.co';
  static const bNamespace = '8126a1f4-ed8a-41ec-905b-9ad3442e5e6e';
  static const bPool =
      'GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW';

  Uri origin(Uri? configured) {
    if (this == b) return Uri.parse(bOrigin);
    if (configured == null) {
      throw const RefundProtocolError('d1_refund_configuration');
    }
    return configured;
  }

  void validateOrigin(Uri origin) {
    if (this == b && origin != Uri.parse(bOrigin) &&
        origin != Uri.parse('$bOrigin/')) {
      throw const RefundProtocolError('d1_custody_profile_mismatch');
    }
  }

  void validateScope(RefundScope scope) {
    if (this == b &&
        (scope.namespace != bNamespace || scope.pool != bPool)) {
      throw const RefundProtocolError('d1_custody_profile_mismatch');
    }
  }
}
