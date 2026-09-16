import 'package:drift/drift.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';
import 'receipt_screen.dart';

class DeliveryScreen extends ConsumerWidget {
  const DeliveryScreen({super.key});

  Future<void> _openReceipt(
    BuildContext context,
    WidgetRef ref,
    OriginBundle bundle,
  ) async {
    if (bundle.state != DeliveryState.delivered) return;
    final database = ref.read(databaseProvider);
    final receipt = await (database.select(database.serverReceipts)
          ..where((row) => row.messageId.equals(bundle.id)))
        .getSingleOrNull();
    if (receipt == null || !context.mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => ReceiptScreen(receipt: receipt)),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final database = ref.watch(databaseProvider);
    final query = database.select(database.originBundles)
      ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]);
    return Scaffold(
      appBar: AppBar(title: const Text('Entrega')),
      body: Stack(
        children: [
          Positioned.fill(
            child: Opacity(
              opacity:
                  Theme.of(context).brightness == Brightness.dark ? 0.12 : 0.06,
              child: Image.asset(
                'assets/images/textura-3.jpg',
                fit: BoxFit.cover,
              ),
            ),
          ),
          StreamBuilder<List<OriginBundle>>(
            stream: query.watch(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const EmptyState(kind: EmptyStateKind.loading);
              }
              final bundles = snapshot.data!;
              if (bundles.isEmpty) {
                return const EmptyState(
                  kind: EmptyStateKind.empty,
                  title: 'Bandeja vacía',
                  message:
                      'Las señales guardadas aparecerán aquí cuando tengan un paquete de entrega.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(AppSpacing.screenPadding),
                itemCount: bundles.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppSpacing.sm),
                itemBuilder: (context, index) {
                  final bundle = bundles[index];
                  return Card(
                    child: ListTile(
                      minVerticalPadding: AppSpacing.md,
                      onTap: bundle.state == DeliveryState.delivered
                          ? () => _openReceipt(context, ref, bundle)
                          : null,
                      leading: Icon(
                        _icon(bundle.state),
                        color: _color(bundle.state),
                      ),
                      title:
                          Text(_label(bundle.state), style: AppTypography.h3),
                      subtitle: Text(
                        '${bundle.incidentId.substring(0, 8)} · ${bundle.createdAt.toLocal()}',
                        style: AppTypography.dataSm,
                      ),
                      trailing: bundle.state == DeliveryState.queued
                          ? IconButton(
                              tooltip: 'Reintentar entrega',
                              onPressed: () async {
                                await ref
                                    .read(bundleQueueServiceProvider)
                                    .retryNow(bundle.id);
                                await ref
                                    .read(bundleSchedulerProvider)
                                    .processQueue();
                              },
                              icon: const Icon(Icons.refresh),
                            )
                          : null,
                    ),
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }

  IconData _icon(DeliveryState state) => switch (state) {
        DeliveryState.queued => Icons.schedule,
        DeliveryState.sent => Icons.upload,
        DeliveryState.delivered => Icons.verified,
        DeliveryState.failed => Icons.error_outline,
      };

  Color _color(DeliveryState state) => switch (state) {
        DeliveryState.queued => AppColors.warning,
        DeliveryState.sent => AppColors.info,
        DeliveryState.delivered => AppColors.success,
        DeliveryState.failed => AppColors.danger,
      };

  String _label(DeliveryState state) => switch (state) {
        DeliveryState.queued => 'En cola',
        DeliveryState.sent => 'Enviando',
        DeliveryState.delivered => 'Recibida por el servidor',
        DeliveryState.failed => 'Entrega pendiente de reintento',
      };
}
