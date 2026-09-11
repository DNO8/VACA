import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/local/database.dart';

class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({required this.receipt, super.key});

  final ServerReceipt receipt;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recibo del servidor')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        children: [
          Container(
            padding: const EdgeInsets.all(AppSpacing.xl),
            decoration: BoxDecoration(
              color: AppColors.celadon900,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.verified,
                  color: AppColors.celadon300,
                  size: 52,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  'Recepción verificada',
                  style: AppTypography.h2.copyWith(color: AppColors.white),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'El servidor autorizado aceptó este paquete. Esto no equivale a atención institucional.',
                  textAlign: TextAlign.center,
                  style:
                      AppTypography.body.copyWith(color: AppColors.celadon300),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          _ReceiptField(label: 'Recibo', value: receipt.receiptId),
          _ReceiptField(label: 'Mensaje', value: receipt.messageId),
          _ReceiptField(label: 'Hash del payload', value: receipt.payloadHash),
          _ReceiptField(
            label: 'Clave del servidor',
            value: receipt.serverKeyId,
          ),
          _ReceiptField(
            label: 'Recibido',
            value: receipt.serverReceivedAt.toUtc().toIso8601String(),
          ),
          _ReceiptField(
            label: 'Verificado',
            value: receipt.verifiedAt?.toUtc().toIso8601String() ?? 'Pendiente',
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
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppTypography.caption),
          const SizedBox(height: AppSpacing.xxs),
          SelectableText(value, style: AppTypography.dataSm),
        ],
      ),
    );
  }
}
