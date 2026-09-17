import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/vaca_format.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../data/local/database.dart';
import '../../incident/presentation/incident_detail_screen.dart';

class ReceiptScreen extends ConsumerWidget {
  const ReceiptScreen({required this.receipt, super.key});

  final ServerReceipt receipt;

  String _hashPreview(String hash) =>
      hash.length <= 12 ? hash : '${hash.substring(0, 6)}…${hash.substring(hash.length - 4)}';

  Future<void> _openIncident(BuildContext context, WidgetRef ref) async {
    final database = ref.read(databaseProvider);
    final bundle = await (database.select(database.originBundles)
          ..where((row) => row.id.equals(receipt.messageId)))
        .getSingleOrNull();
    if (bundle == null || !context.mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => IncidentDetailScreen(incidentId: bundle.incidentId),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          VacaHero(
            asset: 'assets/images/textura-2.jpg',
            title: 'Recepción verificada',
            subtitle: 'RECIBO CRIPTOGRÁFICO · NO EQUIVALE A ATENCIÓN',
            onBack: () => Navigator.of(context).pop(),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.screenPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: AppColors.celadon100,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AppColors.success,
                          borderRadius:
                              BorderRadius.circular(AppRadius.sm),
                        ),
                        child: const Icon(
                          Icons.check,
                          color: AppColors.white,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Recibido y verificado',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                color: AppColors.success,
                              ),
                            ),
                            Text(
                              'Autenticado por el servidor autorizado',
                              style: TextStyle(
                                fontFamily: AppTypography.brandFont,
                                fontSize: 12,
                                color: AppColors.stone600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                const Text(
                  'Comprobante de recepción',
                  style: AppTypography.h2,
                ),
                const SizedBox(height: AppSpacing.md),
                Card(
                  child: Column(
                    children: [
                      _ReceiptRow(
                        label: 'ID de señal',
                        value: vacaShortId(receipt.messageId),
                        mono: true,
                      ),
                      _ReceiptRow(
                        label: 'ID de recibo',
                        value: receipt.receiptId,
                        mono: true,
                      ),
                      _ReceiptRow(
                        label: 'Recibido en',
                        value: vacaTimestamp(receipt.serverReceivedAt),
                        mono: true,
                      ),
                      _ReceiptRow(
                        label: 'Servidor',
                        value: receipt.serverKeyId,
                        mono: true,
                      ),
                      _ReceiptRow(
                        label: 'Hash del payload',
                        value: _hashPreview(receipt.payloadHash),
                        mono: true,
                      ),
                      _ReceiptRow(
                        label: 'Verificada en',
                        value: receipt.verifiedAt != null
                            ? vacaTimestamp(receipt.verifiedAt!)
                            : '—',
                        mono: true,
                        last: true,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                _ReceiptField(
                  label: 'Hash completo del payload',
                  value: receipt.payloadHash,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  'El servidor autorizado confirmó la recepción de la señal. '
                  'Este comprobante no garantiza atención ni reemplaza los '
                  'canales oficiales de emergencia.',
                  style: AppTypography.body
                      .copyWith(color: AppColors.neutral500),
                ),
                const SizedBox(height: AppSpacing.lg),
                VacaButton(
                  label: 'Ver señal y actualizar',
                  variant: VacaButtonVariant.secondary,
                  onPressed: () => _openIncident(context, ref),
                ),
                const SizedBox(height: AppSpacing.xs),
                Center(
                  child: TextButton(
                    onPressed: () =>
                        Navigator.of(context).popUntil((r) => r.isFirst),
                    child: const Text('Ir al inicio'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  const _ReceiptRow({
    required this.label,
    required this.value,
    this.mono = false,
    this.last = false,
  });

  final String label;
  final String value;
  final bool mono;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(
                bottom: BorderSide(color: AppColors.stone100),
              ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: AppTypography.body
                .copyWith(color: AppColors.neutral500),
          ),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: (mono ? AppTypography.dataSm : AppTypography.body)
                  .copyWith(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReceiptField extends StatelessWidget {
  const _ReceiptField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: AppTypography.caption
              .copyWith(color: AppColors.neutral500),
        ),
        const SizedBox(height: AppSpacing.xxs),
        SelectableText(value, style: AppTypography.dataSm),
      ],
    );
  }
}
