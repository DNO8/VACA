import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/refund_scope.dart';
import 'refund_panel.dart';

/// Navigation is not an admin-role grant. The backend verifies every proof.
class RefundAdminEntry extends StatelessWidget {
  const RefundAdminEntry({super.key});
  @override
  Widget build(BuildContext context) => Card(
          child: ListTile(
        key: const ValueKey('refund-admin-entry'),
        minVerticalPadding: AppSpacing.md,
        leading: const Icon(Icons.assignment_return_outlined),
        title: const Text('Reembolsos Stellar testnet'),
        subtitle: const Text(
            'Solo wallets autorizadas. Requiere la referencia original.'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push<void>(
            MaterialPageRoute(builder: (_) => const RefundAdminScreen())),
      ));
}

/// Looks up a KNOWN original reference; it does not discover or create one.
class RefundAdminScreen extends StatefulWidget {
  const RefundAdminScreen({super.key});
  @override
  State<RefundAdminScreen> createState() => _RefundAdminScreenState();
}

class _RefundAdminScreenState extends State<RefundAdminScreen> {
  final _form = GlobalKey<FormState>();
  final _namespace = TextEditingController();
  final _pool = TextEditingController();
  final _request = TextEditingController();
  RefundScope? _scope;

  @override
  void dispose() {
    _namespace.dispose();
    _pool.dispose();
    _request.dispose();
    super.dispose();
  }

  void _open() {
    if (_form.currentState?.validate() != true) return;
    setState(() => _scope = RefundScope(
        namespace: _namespace.text,
        pool: _pool.text,
        requestId: _request.text));
  }

  String? _validate(String? value, {bool pool = false}) {
    try {
      if (pool) {
        RefundValidation.publicKey(value);
      } else {
        RefundValidation.uuid(value);
      }
      return null;
    } on RefundProtocolError {
      return pool
          ? 'Ingresá una clave pública Stellar válida (G…).'
          : 'Ingresá el UUID original en minúsculas, sin espacios.';
    }
  }

  Widget _field(String key, String label, TextEditingController controller,
          {bool pool = false}) =>
      TextFormField(
        key: ValueKey(key),
        controller: controller,
        enabled: _scope == null,
        maxLength: pool ? 56 : 36,
        maxLines: pool ? 2 : 1,
        textInputAction: key == 'refund-original-request'
            ? TextInputAction.done
            : TextInputAction.next,
        autocorrect: false,
        enableSuggestions: false,
        decoration: InputDecoration(labelText: label),
        validator: (value) => _validate(value, pool: pool),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title: const Text('Reembolsos · Testnet',
                maxLines: 1, overflow: TextOverflow.ellipsis)),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.md),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Referencia de la donación original',
                          style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: AppSpacing.sm),
                      const Text(
                          'Copiá una referencia ya existente del registro original. '
                          'No uses un ID de incidente ni de claimable balance. '
                          'Esta pantalla no crea solicitudes ni descubre donaciones.'),
                      const SizedBox(height: AppSpacing.xl),
                      Card(
                        margin: EdgeInsets.zero,
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          child: Form(
                            key: _form,
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text('Datos de la emisión',
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge),
                                  const SizedBox(height: AppSpacing.md),
                                  const Text(
                                      'Solo clave pública del pool, nunca una semilla secreta. '
                                      'La wallet personal debe estar autorizada por el backend; '
                                      'abrir esta pantalla no concede permisos.'),
                                  const SizedBox(height: AppSpacing.xl),
                                  _field('refund-namespace',
                                      'Namespace original (UUID)', _namespace),
                                  const SizedBox(height: AppSpacing.sm),
                                  _field('refund-pool',
                                      'Pool original (clave pública G…)', _pool,
                                      pool: true),
                                  const SizedBox(height: AppSpacing.sm),
                                  _field(
                                      'refund-original-request',
                                      'Solicitud de emisión original (UUID)',
                                      _request),
                                  const SizedBox(height: AppSpacing.md),
                                  FilledButton(
                                      key: const ValueKey(
                                          'refund-open-original'),
                                      onPressed: _scope == null ? _open : null,
                                      child: const Text(
                                          'Abrir referencia original')),
                                ]),
                          ),
                        ),
                      ),
                      if (_scope != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        TextButton(
                            key: const ValueKey('refund-change-reference'),
                            onPressed: () => setState(() => _scope = null),
                            child: const Text('Cambiar referencia')),
                        const Text(
                            'Cambiar la vista no borra intentos ni cancela operaciones. '
                            'Consultá el estado para recuperar una solicitud pendiente.'),
                        const SizedBox(height: AppSpacing.md),
                        RefundPanel(scope: _scope!),
                      ],
                    ]),
              ),
            ),
          ),
        ),
      );
}
