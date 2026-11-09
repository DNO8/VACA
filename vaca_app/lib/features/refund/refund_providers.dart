import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/security/secure_storage.dart';
import 'data/refund_client.dart';
import 'data/refund_http_client.dart';
import 'data/refund_submission_journal.dart';
import 'data/refund_wallet_signer.dart';
import 'data/refund_remainder_client.dart';
import 'data/refund_remainder_http_client.dart';
import 'data/refund_remainder_submission_journal.dart';
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
/// Administrative panels read this graph only after explicit user commands.
final refundClientProvider = Provider<RefundClient>((ref) {
  return RefundClient(
    http: ref.watch(refundHttpClientProvider),
    journal: RefundSubmissionJournal(ref.watch(secureStorageProvider)),
  );
});

/// Separate injectable v2 transport; construction performs no command.
typedef RemainderHttpClientFactory = RemainderHttpClient Function(
  RefundClientConfiguration configuration,
  SecureStorage storage,
);

final remainderHttpClientFactoryProvider =
    Provider<RemainderHttpClientFactory>((ref) {
  return (configuration, storage) {
    final origin = Uri.tryParse(configuration.projectUrl);
    if (origin == null) {
      throw const RefundProtocolError('d1_remainder_configuration');
    }
    return RemainderHttpClient(projectUrl: origin,
        publicApiKey: configuration.publicApiKey, storage: storage);
  };
});

/// Container lifetime, not auto-disposed in the middle of an explicit command.
final remainderHttpClientProvider = Provider<RemainderHttpClient>((ref) {
  final http = ref.watch(remainderHttpClientFactoryProvider)(
    ref.watch(refundClientConfigurationProvider),
    ref.watch(secureStorageProvider),
  );
  ref.onDispose(http.close);
  return http;
});

final remainderClientProvider = Provider<RemainderClient>((ref) =>
    RemainderClient(http: ref.watch(remainderHttpClientProvider),
        journal: RemainderSubmissionJournal(ref.watch(secureStorageProvider))));
