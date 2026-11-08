import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/security/secure_storage.dart';
import 'data/refund_client.dart';
import 'data/refund_http_client.dart';
import 'data/refund_submission_journal.dart';
import 'data/refund_wallet_signer.dart';
import 'domain/refund_scope.dart';

/// Public build configuration only. Never supply a service-role credential.
typedef RefundClientConfiguration = ({String projectUrl, String publicApiKey});
typedef RefundHttpClientFactory = RefundHttpClient Function(
  RefundClientConfiguration configuration,
  SecureStorage storage,
);

final refundClientConfigurationProvider = Provider<RefundClientConfiguration>(
  (ref) => (
    projectUrl: const String.fromEnvironment('SUPABASE_URL'),
    publicApiKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  ),
);

/// Injectable construction seam; the HTTP provider, not this factory, owns close.
final refundHttpClientFactoryProvider =
    Provider<RefundHttpClientFactory>((ref) {
  return (configuration, storage) {
    final origin = Uri.tryParse(configuration.projectUrl);
    if (origin == null) {
      throw const RefundProtocolError('d1_refund_configuration');
    }
    return RefundHttpClient(
      projectUrl: origin,
      publicApiKey: configuration.publicApiKey,
      signer: RefundWalletSigner(storage),
    );
  };
});

/// No auto-disposal during an awaited explicit command. The container owns it.
final refundHttpClientProvider = Provider<RefundHttpClient>((ref) {
  final http = ref.watch(refundHttpClientFactoryProvider)(
    ref.watch(refundClientConfigurationProvider),
    ref.watch(secureStorageProvider),
  );
  ref.onDispose(http.close);
  return http;
});

/// Passive composition only: no eager storage reads, signing or HTTP commands.
/// Screens/core providers do not import or activate this feature-local graph.
final refundClientProvider = Provider<RefundClient>((ref) {
  return RefundClient(
    http: ref.watch(refundHttpClientProvider),
    journal: RefundSubmissionJournal(ref.watch(secureStorageProvider)),
  );
});
