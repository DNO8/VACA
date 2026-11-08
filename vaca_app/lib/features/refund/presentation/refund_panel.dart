import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../data/refund_client.dart';
import '../domain/refund_scope.dart';
import '../refund_providers.dart';

/// Administrative view. Only explicit gestures invoke the consumer.
class RefundPanel extends ConsumerStatefulWidget {
  const RefundPanel({super.key, required this.scope});
  final RefundScope scope;
  @override
  ConsumerState<RefundPanel> createState() => _RefundPanelState();
}

class _RefundPanelState extends ConsumerState<RefundPanel> {
  RefundClientResult? _result;
  bool _busy = false;
  bool _failed = false;
  int _generation = 0;

  @override
  void didUpdateWidget(covariant RefundPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scope.identity != widget.scope.identity) {
      _generation++;
      _result = null;
      _failed = false;
      _busy = false;
    }
  }

  Future<void> _run(RefundAction action) async {
    if (_busy ||
        (action != RefundAction.status &&
            !(_result?.safeActions.contains(action) ?? false))) return;
    final scope = widget.scope;
    final generation = _generation;
    setState(() => _busy = true);
    try {
      if (action == RefundAction.refund) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Confirmar solicitud de reembolso'),
            content: Text(
                'STELLAR TESTNET · Solicitud original ${scope.requestId}. '
                'Se volverá a consultar el estado antes de intentar el reembolso. '
                'Esto no garantiza disponibilidad ni liquidación.'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Cancelar')),
              FilledButton(
                  key: const ValueKey('refund-confirm'),
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Confirmar solicitud')),
            ],
          ),
        );
        if (confirmed != true || !mounted || generation != _generation) return;
      }
      final client = ref.read(refundClientProvider);
      final result = await switch (action) {
        RefundAction.status => client.status(scope),
        RefundAction.refund => client.requestRefund(scope),
        RefundAction.reconcile => client.reconcile(scope),
      };
      if (!mounted || generation != _generation) return;
      setState(() {
        _result = result;
        _failed = result.errorCode != null;
      });
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _result = null;
        _failed = true;
      });
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _result?.status;
    final body = status?.toJson();
    final settlement = body?['settlement'] as Map<String, Object?>?;
    final refund = body?['refund'] as Map<String, Object?>?;
    final asset = status?.donation['asset'] as Map<String, Object?>?;
    final actions = _result?.safeActions ?? const <RefundAction>[];
    final state = _failed ? 'unknown' : _result?.state;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Reembolso de la donación original',
              style: Theme.of(context).textTheme.titleMedium),
          const Text('STELLAR TESTNET · Sin valor monetario real'),
          SelectableText('Namespace: ${widget.scope.namespace}'),
          SelectableText('Pool: ${widget.scope.pool}'),
          SelectableText('Solicitud original: ${widget.scope.requestId}'),
          const SizedBox(height: AppSpacing.sm),
          Semantics(
              liveRegion: true,
              child: Text(
                  'Estado: ${_busy ? 'Consulta o solicitud en curso' : _labels[state] ?? 'Sin consultar'}',
                  key: const ValueKey('refund-state'))),
          if (_failed)
            const Text(
                'No se pudo verificar el estado. Conservá la correlación original.'),
          if (status != null) ...[
            SelectableText('Donante original: ${status.donation['donor']}',
                key: const ValueKey('refund-original-donor')),
            SelectableText(
                'Operación de pago original: ${status.donation['paymentOperationId']}'),
            SelectableText(
                'Transacción de pago original: ${status.donation['paymentTransactionHash']}'),
            Text('Importe original: ${status.donation['grossAmount']}'),
            Text(
                'Activo: ${asset?['type'] == 'native' ? 'XLM (nativo)' : '${asset?['code']} · ${asset?['issuer']}'}'),
            Text('Vencimiento original: ${status.deadline}'),
            Text('Verificación: ${body!['verification']}'),
            if (refund != null) ...[
              SelectableText(
                  'Referencia del intento: ${refund['transactionHash']}',
                  key: const ValueKey('refund-attempt-reference')),
              Text('Importe reportado del intento: ${refund['amount']}'),
              const Text(
                  'La referencia y el importe del intento no prueban liquidación.'),
            ],
            Text(
                'Cobrado por beneficiario: ${settlement?['beneficiaryClaimedAmount'] ?? 'Desconocido'}'),
            Text(
                'Devuelto al donante: ${settlement?['donorRefundedAmount'] ?? 'Desconocido'}'),
            Text(
                'Principal pendiente: ${settlement?['remainingPrincipalAmount'] ?? 'Desconocido'}'),
            const Text('Comisiones fuera de estos importes.'),
          ],
          if (state != 'settled')
            const Text(
                'Un resultado desconocido o el vencimiento no habilitan otro intento.'),
          Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
            OutlinedButton(
                key: const ValueKey('refund-status'),
                onPressed: _busy ? null : () => _run(RefundAction.status),
                child: const Text('Consultar estado')),
            if (actions.contains(RefundAction.reconcile))
              OutlinedButton(
                  key: const ValueKey('refund-reconcile'),
                  onPressed: _busy ? null : () => _run(RefundAction.reconcile),
                  child: const Text('Reconciliar observación')),
            if (state == 'not_started' && actions.contains(RefundAction.refund))
              FilledButton(
                  key: const ValueKey('refund-request'),
                  onPressed: _busy ? null : () => _run(RefundAction.refund),
                  child: const Text('Solicitar reembolso')),
          ]),
        ]),
      ),
    );
  }
}

const _labels = <String, String>{
  'not_due': 'Pendiente de vencimiento',
  'not_started': 'Sin iniciar',
  'blocked': 'Bloqueado',
  'pending': 'Pendiente',
  'unknown': 'Resultado desconocido',
  'refund_observed': 'Reembolso observado, no liquidado',
  'refund_failed_observed': 'Fallo observado, sin reintento',
  'settled': 'Donación liquidada',
};
