import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/institutional_surface.dart';
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
          const VacaHero(
            asset: 'assets/images/textura-2.jpg',
            title: 'Recepción verificada',
            subtitle: 'RECIBO CRIPTOGRÁFICO · NO EQUIVALE A ATENCIÓN',
            height: 260,
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
