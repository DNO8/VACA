import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../data/refund_remainder_client.dart';
import '../domain/refund_remainder_status.dart';
import '../domain/refund_scope.dart';
import '../refund_providers.dart';

/// No command or wallet read during build; every action is an explicit gesture.
class RefundRemainderPanel extends ConsumerStatefulWidget {
  const RefundRemainderPanel({super.key, required this.scope});
  final RefundScope scope;
  @override
  ConsumerState<RefundRemainderPanel> createState() => _RefundRemainderPanelState();
}

class _RefundRemainderPanelState extends ConsumerState<RefundRemainderPanel> {
  RemainderClientResult? _result;
  RemainderStatus? _original;
  bool _busy = false;
  bool _failed = false;
  int _generation = 0;

  @override
  void didUpdateWidget(covariant RefundRemainderPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scope.identity != widget.scope.identity) {
      _generation++;
      _result = null;
      _original = null;
      _busy = false;
      _failed = false;
    }
  }

  Future<void> _run(RemainderAction action) async {
    if (_busy || (action != RemainderAction.status &&
        !(_result?.safeActions.contains(action) ?? false))) return;
    final scope = widget.scope;
    final generation = _generation;
    setState(() => _busy = true);
    try {
      if (action == RemainderAction.refund) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Confirmar reintegro del remanente'),
            content: Text('STELLAR TESTNET · Solicitud original ${scope.requestId}. '
                'Se consultará el estado antes de registrar un único intento v2. '
                'Un intento previo v1 o v2 impide un segundo primer envío. '
                'Esto no garantiza fondos disponibles ni liquidación.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Cancelar')),
              FilledButton(key: const ValueKey('remainder-confirm'),
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Confirmar reintegro')),
            ],
          ),
        );
        if (confirmed != true || !mounted || generation != _generation) return;
      }
      final client = ref.read(remainderClientProvider);
      final result = await switch (action) {
        RemainderAction.status => client.status(scope, previous: _original),
        RemainderAction.refund => client.requestRefund(scope, previous: _original),
        RemainderAction.reconcile => client.reconcile(scope, previous: _original),
      };
      if (!mounted || generation != _generation) return;
      setState(() {
        _result = result;
        _failed = result.errorCode != null;
        _original ??= result.status;
      });
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() { _failed = true; _result = null; });
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _result?.status;
    final state = _failed ? 'unknown' : _result?.state;
    final body = status?.toJson();
    final refund = status?.refund;
    final settlement = status?.settlement;
    final actions = _result?.safeActions ?? const <RemainderAction>[];
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Reintegro del remanente · v2',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.sm),
          const Text('STELLAR TESTNET · Sin valor monetario real. '
              'Devuelve principal restante por Payment; no crea otro claimable balance.'),
          const SizedBox(height: AppSpacing.md),
          Semantics(liveRegion: true, child: Text(
              'Estado: ${_busy ? 'Consulta o solicitud en curso' : _labels[state] ?? 'Sin consultar'}',
              key: const ValueKey('remainder-state'))),
          const SizedBox(height: AppSpacing.sm),
          _reference('Namespace: ${widget.scope.namespace}'),
          _reference('Pool: ${widget.scope.pool}'),
          _reference('Solicitud original: ${widget.scope.requestId}'),
          if (_failed) ...[
            const SizedBox(height: AppSpacing.md),
            const Text('No se pudo verificar el resultado. Conservá la referencia original. '
                'Consultar o reconciliar no vuelve a solicitar el reintegro.'),
          ],
          if (_result?.firstPostRecorded == true) ...[
            const SizedBox(height: AppSpacing.md),
            Text('Existe un registro local en la vía ${_result!.holdLane ?? 'original'}. '
                'No se habilita otro primer envío ni se renueva el vencimiento.'),
          ],
          if (status != null) ...[
            const Divider(height: AppSpacing.xxl),
            Text('Donación original', style: Theme.of(context).textTheme.titleLarge),
            _reference('Donante: ${status.donation['donor']}'),
            _reference('Operación original: ${status.donation['paymentOperationId']}'),
            _reference('Transacción original: ${status.donation['paymentTransactionHash']}'),
            Text('Importe original: ${status.donation['grossAmount']}'),
            _reference('Activo: ${_asset(status.donation['asset'])}'),
            Text('Vencimiento original: ${status.deadline}'),
            Text('Verificación: ${body!['verification']}'),
            if (refund != null) ...[
              const SizedBox(height: AppSpacing.md),
              _reference('Intento reportado: ${refund['transactionHash']}'),
              Text('Importe reportado: ${refund['amount']}'),
              const Text('El intento observado no prueba liquidación.'),
            ],
            const Divider(height: AppSpacing.xxl),
            Text('Estado de liquidación', style: Theme.of(context).textTheme.titleLarge),
            Text('Cobrado por beneficiario: ${settlement?['beneficiaryClaimedAmount'] ?? 'Desconocido'}'),
            Text('Devuelto al donante: ${settlement?['donorRefundedAmount'] ?? 'Desconocido'}'),
            Text('Principal pendiente: ${settlement?['remainingPrincipalAmount'] ?? 'Desconocido'}'),
            const Text('Desconocido no significa cero. Las comisiones no forman parte de estos importes.'),
          ],
          const SizedBox(height: AppSpacing.md),
          const Text('No hay reintento automático ni cambio de vía. '
              'La autorización y la ejecución financiera corresponden al backend.'),
          const SizedBox(height: AppSpacing.md),
          OutlinedButton(key: const ValueKey('remainder-status'),
              onPressed: _busy ? null : () => _run(RemainderAction.status),
              child: const Text('Consultar estado del remanente')),
          if (actions.contains(RemainderAction.reconcile)) ...[
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(key: const ValueKey('remainder-reconcile'),
                onPressed: _busy ? null : () => _run(RemainderAction.reconcile),
                child: const Text('Reconciliar observación del remanente')),
          ],
          if (state == 'not_started' && actions.contains(RemainderAction.refund)) ...[
            const SizedBox(height: AppSpacing.sm),
            FilledButton(key: const ValueKey('remainder-request'),
                onPressed: _busy ? null : () => _run(RemainderAction.refund),
                child: const Text('Solicitar reintegro del remanente')),
          ],
        ]),
      ),
    );
  }

  String _asset(Object? value) {
    final asset = value! as Map<String, Object?>;
    return asset['type'] == 'native' ? 'XLM (nativo)'
        : '${asset['code']} · ${asset['issuer']}';
  }

  Widget _reference(String value) => SelectableText(value,
      style: AppTypography.data.copyWith(color: Theme.of(context).colorScheme.onSurface));
}

const _labels = <String, String>{
  'not_due': 'Pendiente de vencimiento',
  'not_started': 'Sin iniciar',
  'blocked': 'Bloqueado',
  'pending': 'Pendiente',
  'unknown': 'Resultado desconocido',
  'refund_observed': 'Reintegro observado, no liquidado',
  'refund_failed_observed': 'Fallo observado, sin reintento',
  'settled': 'Donación liquidada',
};
