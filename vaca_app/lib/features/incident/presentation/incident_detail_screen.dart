import 'package:drift/drift.dart' show OrderingTerm;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/result/result.dart';
import '../../../core/share/share_payload.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/database.dart';
import '../../../data/local/enums.dart';
import '../domain/incident.dart';

class IncidentDetailScreen extends ConsumerStatefulWidget {
  const IncidentDetailScreen({required this.incidentId, super.key});

  final String incidentId;

  @override
  ConsumerState<IncidentDetailScreen> createState() =>
      _IncidentDetailScreenState();
}

class _IncidentDetailScreenState extends ConsumerState<IncidentDetailScreen> {
  final _updateController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _updateController.dispose();
    super.dispose();
  }

  Future<void> _run(
    Future<Result<UserIncident>> Function() operation,
    String failureFallback,
  ) async {
    setState(() => _busy = true);
    try {
      final result = await operation();
      if (!mounted) return;
      if (result case Failure(error: final error)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? failureFallback),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _publishUpdate() async {
    final note = _updateController.text.trim();
    await _run(
      () => ref.read(incidentServiceProvider).updateNote(widget.incidentId, note),
      'No se pudo actualizar.',
    );
    if (mounted) {
      _updateController.clear();
      ref.read(bundleSchedulerProvider).processQueue();
    }
  }

  Future<void> _confirmCancel(UserIncident incident) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl,
            AppSpacing.md,
            AppSpacing.xl,
            AppSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.stone300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const Text('¿Cancelar esta señal?', style: AppTypography.h2),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Se encolará un evento de cancelación firmado para el servidor. '
                'El registro original se conserva en este dispositivo.',
                style: AppTypography.body
                    .copyWith(color: context.tokens.muted),
              ),
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () =>
                          Navigator.of(sheetContext).pop(false),
                      child: const Text('No, volver'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger,
                      ),
                      onPressed: () =>
                          Navigator.of(sheetContext).pop(true),
                      child: const Text('Sí, cancelar'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(
      () => ref.read(incidentServiceProvider).cancel(widget.incidentId),
      'No se pudo cancelar.',
    );
    if (mounted) ref.read(bundleSchedulerProvider).processQueue();
  }

  static bool _isCancelled(UserIncident incident) =>
      incident.status == IncidentStatus.cancelledLocally ||
      incident.status == IncidentStatus.cancellationQueued ||
      incident.status == IncidentStatus.cancellationReceived;

  Future<void> _confirmDelete(UserIncident incident) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xl,
            AppSpacing.md,
            AppSpacing.xl,
            AppSpacing.xl,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.stone300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const Text(
                '¿Borrar del dispositivo?',
                style: AppTypography.h2,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Se eliminarán la señal, su historial, sus adjuntos y los '
                'paquetes de entrega pendientes. Esta acción no se puede '
                'deshacer.',
                style: AppTypography.body
                    .copyWith(color: context.tokens.muted),
              ),
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () =>
                          Navigator.of(sheetContext).pop(false),
                      child: const Text('No, volver'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger,
                      ),
                      onPressed: () =>
                          Navigator.of(sheetContext).pop(true),
                      child: const Text('Sí, borrar'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    final result =
        await ref.read(incidentServiceProvider).deleteLocal(widget.incidentId);
    if (!mounted) return;
    if (result case Failure(error: final error)) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.message ?? 'No se pudo borrar.'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }
    Navigator.of(context).pop();
  }

  Future<void> _shareSignal(UserIncident incident) async {
    final database = ref.read(databaseProvider);
    final bundle = await (database.select(database.originBundles)
          ..where((row) => row.incidentId.equals(incident.id))
          ..where((row) => row.state.equals(DeliveryState.delivered.index))
          ..orderBy([(row) => OrderingTerm.desc(row.createdAt)])
          ..limit(1))
        .getSingleOrNull();
    ServerReceipt? receipt;
    if (bundle != null) {
      receipt = await (database.select(database.serverReceipts)
            ..where((row) => row.messageId.equals(bundle.id)))
          .getSingleOrNull();
    }
    await SharePlus.instance.share(
      ShareParams(
        text: signalShareText(
          incidentId: incident.id,
          categoryLabel: categoryMeta(incident.category).label,
          statusLabel: incidentStatusLabel(incident.status),
          latitude: incident.latitude,
          longitude: incident.longitude,
          createdAt: incident.createdAt,
          shortNote: incident.shortNote,
          receipt: receipt,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final database = ref.watch(databaseProvider);
    final service = ref.watch(incidentServiceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Gestionar señal')),
      body: FutureBuilder<UserIncident?>(
        future: service.get(widget.incidentId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const EmptyState(kind: EmptyStateKind.loading);
          }
          final incident = snapshot.data;
          if (incident == null) {
            return const EmptyState(
              kind: EmptyStateKind.error,
              title: 'Señal no encontrada',
              message: 'Ya no existe en este dispositivo.',
            );
          }
          return StreamBuilder<List<IncidentEvent>>(
            stream: (database.select(database.incidentEvents)
                  ..where((row) => row.incidentId.equals(incident.id))
                  ..orderBy([(row) => OrderingTerm.desc(row.timestamp)]))
                .watch(),
            builder: (context, eventsSnapshot) {
              return ListView(
                padding: const EdgeInsets.all(AppSpacing.screenPadding),
                children: [
                  Row(
                    children: [
                      Text(
                        vacaShortId(incident.id),
                        style: AppTypography.dataSm
                            .copyWith(color: context.tokens.muted),
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      PriorityBadge(priority: incident.priority),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Compartir señal',
                        onPressed: () => _shareSignal(incident),
                        icon: const Icon(Icons.share_outlined, size: 20),
                        color: context.tokens.muted,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _SummaryCard(incident: incident),
                  const SizedBox(height: AppSpacing.lg),
                  const Text('Historial', style: AppTypography.h3),
                  const SizedBox(height: AppSpacing.sm),
                  _Timeline(
                    events: eventsSnapshot.data ?? const [],
                    status: incident.status,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (_isCancelled(incident)) ...[
                    OutlinedButton(
                      onPressed:
                          _busy ? null : () => _confirmDelete(incident),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(
                          color: AppColors.danger,
                          width: 1.5,
                        ),
                      ),
                      child: const Text('Borrar del dispositivo'),
                    ),
                  ] else ...[
                    const Text(
                      'Agregar actualización',
                      style: AppTypography.h3,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    TextField(
                      controller: _updateController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText:
                            'Qué cambió, qué se resolvió, qué se necesita ahora…',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    VacaButton(
                      label: _busy ? 'Procesando…' : 'Publicar actualización',
                      loading: _busy,
                      onPressed: _busy ? null : _publishUpdate,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    OutlinedButton(
                      onPressed:
                          _busy ? null : () => _confirmCancel(incident),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(
                          color: AppColors.danger,
                          width: 1.5,
                        ),
                      ),
                      child: const Text('Cancelar señal'),
                    ),
                  ],
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.incident});

  final UserIncident incident;

  @override
  Widget build(BuildContext context) {
    final meta = categoryMeta(incident.category);
    final statusColor = incidentStatusColor(incident.status, context.tokens);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(meta.label, style: AppTypography.h3),
            if (incident.shortNote != null && incident.shortNote!.isNotEmpty)
              Text(
                incident.shortNote!,
                style: AppTypography.body
                    .copyWith(color: context.tokens.muted),
              ),
            if (incident.peopleCount != null)
              Text(
                '${incident.peopleCount} personas aprox.',
                style: AppTypography.body
                    .copyWith(color: context.tokens.muted),
              ),
            if (incident.latitude != null && incident.longitude != null)
              Text(
                '${incident.latitude!.toStringAsFixed(5)}, '
                '${incident.longitude!.toStringAsFixed(5)}',
                style: AppTypography.dataSm
                    .copyWith(color: context.tokens.muted),
              ),
            if (incident.identityAssurance == IdentityAssurance.verified)
              Row(
                children: [
                  const Icon(
                    Icons.verified_user_outlined,
                    size: 14,
                    color: AppColors.success,
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Text(
                    'Identidad verificada',
                    style: AppTypography.caption
                        .copyWith(color: AppColors.success),
                  ),
                ],
              ),
            const Divider(height: AppSpacing.xl),
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Registrada',
                      style: AppTypography.caption
                          .copyWith(color: context.tokens.muted),
                    ),
                    Text(
                      vacaTimestamp(incident.createdAt),
                      style: AppTypography.dataSm,
                    ),
                  ],
                ),
                const SizedBox(width: AppSpacing.lg),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Estado',
                      style: AppTypography.caption
                          .copyWith(color: context.tokens.muted),
                    ),
                    Text(
                      incidentStatusLabel(incident.status),
                      style: AppTypography.caption.copyWith(
                        color: statusColor,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events, required this.status});

  final List<IncidentEvent> events;
  final IncidentStatus status;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final items = <({String text, Color color, DateTime? at})>[
      if (status == IncidentStatus.cancelledLocally ||
          status == IncidentStatus.cancellationQueued ||
          status == IncidentStatus.cancellationReceived)
        (
          text: incidentStatusLabel(status),
          color: tokens.danger,
          at: null,
        ),
      if (status == IncidentStatus.receivedByServer ||
          status == IncidentStatus.acknowledgedInstitutionally)
        (
          text: incidentStatusLabel(status),
          color: tokens.success,
          at: null,
        ),
      for (final event in events)
        (
          text: switch (event.eventType) {
            EventType.created => 'Guardada localmente',
            EventType.updated => 'Actualización publicada',
            EventType.cancelled => 'Cancelación registrada',
            EventType.receipt => 'Recibida por el servidor',
          },
          color: switch (event.eventType) {
            EventType.created => AppColors.celadon700,
            EventType.updated => tokens.info,
            EventType.cancelled => tokens.danger,
            EventType.receipt => tokens.success,
          },
          at: event.timestamp,
        ),
    ];
    return Column(
      children: [
        for (var i = 0; i < items.length; i++)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: items[i].color,
                    ),
                  ),
                  if (i < items.length - 1)
                    Container(
                      width: 1,
                      height: 28,
                      margin: const EdgeInsets.only(top: 4),
                      color: AppColors.stone300,
                    ),
                ],
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: i < items.length - 1 ? AppSpacing.sm : 0,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(items[i].text, style: AppTypography.body),
                      if (items[i].at != null)
                        Text(
                          vacaTimestamp(items[i].at!),
                          style: AppTypography.dataSm
                              .copyWith(color: context.tokens.muted),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}
