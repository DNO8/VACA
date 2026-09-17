import 'package:drift/drift.dart' show OrderingTerm;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';
import '../domain/sync_status_service.dart';
import 'receipt_screen.dart';

class DeliveryScreen extends ConsumerStatefulWidget {
  const DeliveryScreen({super.key});

  @override
  ConsumerState<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends ConsumerState<DeliveryScreen> {
  _DeliveryFilter _filter = _DeliveryFilter.all;

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
  Widget build(BuildContext context) {
    final database = ref.watch(databaseProvider);
    final sync = ref.watch(syncSnapshotProvider).valueOrNull;
    final bundleQuery = database.select(database.originBundles)
      ..orderBy([(row) => OrderingTerm.desc(row.createdAt)]);
    final incidentQuery = database.select(database.incidents)
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
            stream: bundleQuery.watch(),
            builder: (context, bundleSnapshot) {
              if (!bundleSnapshot.hasData) {
                return const EmptyState(kind: EmptyStateKind.loading);
              }
              return StreamBuilder<List<Incident>>(
                stream: incidentQuery.watch(),
                builder: (context, incidentSnapshot) {
                  final bundles = bundleSnapshot.data!;
                  final incidents = {
                    for (final i in incidentSnapshot.data ?? <Incident>[])
                      i.id: i,
                  };
                  if (bundles.isEmpty) {
                    return const EmptyState(
                      kind: EmptyStateKind.empty,
                      title: 'Bandeja vacía',
                      message:
                          'Las señales guardadas aparecerán aquí cuando tengan un paquete de entrega.',
                    );
                  }
                  final pending = bundles
                      .where((b) => b.state != DeliveryState.delivered)
                      .length;
                  final visible = bundles.where((b) {
                    return switch (_filter) {
                      _DeliveryFilter.all => true,
                      _DeliveryFilter.pending =>
                        b.state != DeliveryState.delivered,
                      _DeliveryFilter.delivered =>
                        b.state == DeliveryState.delivered,
                    };
                  }).toList();
                  return ListView(
                    padding: const EdgeInsets.all(AppSpacing.screenPadding),
                    children: [
                      Text(
                        '${bundles.length} señal${bundles.length == 1 ? '' : 'es'} · '
                        '$pending pendiente${pending == 1 ? '' : 's'} de envío',
                        style: AppTypography.body
                            .copyWith(color: AppColors.neutral500),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _SyncBanner(sync: sync),
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          for (final f in _DeliveryFilter.values) ...[
                            _FilterChip(
                              label: f.label,
                              selected: _filter == f,
                              onTap: () => setState(() => _filter = f),
                            ),
                            if (f != _DeliveryFilter.delivered)
                              const SizedBox(width: AppSpacing.xs),
                          ],
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      for (final bundle in visible)
                        _BundleCard(
                          bundle: bundle,
                          incident: incidents[bundle.incidentId],
                          now: ref.watch(vacaClockProvider)(),
                          onTap: bundle.state == DeliveryState.delivered
                              ? () => _openReceipt(context, ref, bundle)
                              : bundle.state == DeliveryState.failed
                                  ? () => _retry(bundle)
                                  : null,
                          onRetry: bundle.state == DeliveryState.queued ||
                                  bundle.state == DeliveryState.failed
                              ? () => _retry(bundle)
                              : null,
                        ),
                    ],
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _retry(OriginBundle bundle) async {
    await ref.read(bundleQueueServiceProvider).retryNow(bundle.id);
    await ref.read(bundleSchedulerProvider).processQueue();
  }
}

enum _DeliveryFilter {
  all('Todos'),
  pending('Pendientes'),
  delivered('Entregadas');

  const _DeliveryFilter(this.label);
  final String label;
}

class _SyncBanner extends StatelessWidget {
  const _SyncBanner({required this.sync});

  final SyncSnapshot? sync;

  @override
  Widget build(BuildContext context) {
    final phase = sync?.phase ?? SyncPhase.offline;
    final (bg, fg, icon, text) = switch (phase) {
      SyncPhase.syncing => (
          AppColors.celadon100,
          AppColors.success,
          Icons.sync,
          'Sincronización en curso con el servidor autorizado…',
        ),
      SyncPhase.success => (
          AppColors.celadon100,
          AppColors.success,
          Icons.check_circle_outline,
          'Bandeja sincronizada con el servidor autorizado',
        ),
      SyncPhase.error => (
          const Color(0xFFFFF2F2),
          AppColors.danger,
          Icons.error_outline,
          'Entrega pendiente de reintento',
        ),
      SyncPhase.offline => (
          const Color(0xFFFFF8EE),
          AppColors.warning,
          Icons.cloud_off_outlined,
          'Sin conexión — las señales se entregarán luego',
        ),
      SyncPhase.online => (
          AppColors.celadon100,
          AppColors.success,
          Icons.wifi,
          'En línea',
        ),
    };
    return Semantics(
      liveRegion: true,
      label: text,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: fg),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: Text(
                text,
                style: AppTypography.body.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          minimumSize: const Size(0, 48),
          backgroundColor: selected ? AppColors.celadon100 : AppColors.ivory,
          foregroundColor:
              selected ? AppColors.celadon700 : AppColors.neutral500,
          side: BorderSide(
            color: selected ? AppColors.celadon700 : AppColors.stone300,
            width: 1.5,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.full),
          ),
          textStyle: AppTypography.body.copyWith(
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
        child: Text(label),
      ),
    );
  }
}

class _BundleCard extends StatelessWidget {
  const _BundleCard({
    required this.bundle,
    required this.incident,
    required this.now,
    this.onTap,
    this.onRetry,
  });

  final OriginBundle bundle;
  final Incident? incident;
  final DateTime now;
  final VoidCallback? onTap;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (icon, color, label, bg) = switch (bundle.state) {
      DeliveryState.queued => (
          Icons.schedule,
          tokens.warning,
          'En cola',
          const Color(0xFFFFF8EE),
        ),
      DeliveryState.sent => (
          Icons.upload_outlined,
          tokens.info,
          'Enviando',
          const Color(0xFFEEF5F8),
        ),
      DeliveryState.delivered => (
          Icons.verified_outlined,
          tokens.success,
          'Recibida por el servidor',
          const Color(0xFFEEF5F1),
        ),
      DeliveryState.failed => (
          Icons.error_outline,
          tokens.danger,
          'Entrega pendiente de reintento',
          const Color(0xFFFFF2F2),
        ),
    };
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (incident != null) ...[
                      Row(
                        children: [
                          PriorityBadge(
                            priority: incident!.priority,
                            compact: true,
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: Text(
                              categoryMeta(incident!.category).label,
                              style: AppTypography.body.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                    ],
                    Text(
                      label,
                      style: AppTypography.caption.copyWith(
                        color: color,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${vacaShortId(bundle.incidentId)} · '
                      '${vacaRelativeTime(bundle.createdAt, now: now)}',
                      style: AppTypography.dataSm
                          .copyWith(color: AppColors.neutral500),
                    ),
                    if (bundle.state == DeliveryState.failed &&
                        bundle.lastErrorCode != null)
                      Text(
                        'Error: ${bundle.lastErrorCode}',
                        style: AppTypography.caption
                            .copyWith(color: tokens.danger),
                      ),
                  ],
                ),
              ),
              if (onRetry != null)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      tooltip: 'Reintentar entrega',
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh, size: 20),
                      color: AppColors.celadon700,
                    ),
                    Text(
                      'Reintentar',
                      style: AppTypography.caption
                          .copyWith(color: AppColors.celadon700),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
