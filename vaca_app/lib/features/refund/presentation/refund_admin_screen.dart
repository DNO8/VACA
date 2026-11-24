import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/refund_scope.dart';
import '../domain/custody_profile.dart';
import '../refund_providers.dart';
import 'refund_panel.dart';
import 'refund_remainder_panel.dart';

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
            'Solo wallets autorizadas. Requiere la referencia original.',),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push<void>(
            MaterialPageRoute(builder: (_) => const RefundAdminScreen()),),
      ),);
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
  CustodyProfile _profile = CustodyProfile.a;
  bool _v1Busy = false;
  bool _v2Busy = false;
  bool get _busy => _v1Busy || _v2Busy;

  void _selectProfile(CustodyProfile? profile) {
    if (_busy || profile == null || profile == _profile) return;
    _form.currentState?.reset();
    setState(() {
      _profile = profile;
      _scope = null;
      _request.clear();
      _namespace.text =
          profile == CustodyProfile.b ? CustodyProfile.bNamespace : '';
      _pool.text = profile == CustodyProfile.b ? CustodyProfile.bPool : '';
    });
  }

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
        requestId: _request.text,),);
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
          {bool pool = false,}) =>
      TextFormField(
        key: ValueKey(key),
        controller: controller,
        enabled: _scope == null &&
            (_profile == CustodyProfile.a || key == 'refund-original-request'),
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
                maxLines: 1, overflow: TextOverflow.ellipsis,),),
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
                          style: Theme.of(context).textTheme.headlineMedium,),
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
                                          .titleLarge,),
                                  const SizedBox(height: AppSpacing.md),
                                  const Text(
                                      'Solo clave pública del pool, nunca una semilla secreta. '
                                      'La wallet personal debe estar autorizada por el backend; '
                                      'abrir esta pantalla no concede permisos.'),
                                  const SizedBox(height: AppSpacing.xl),
                                  DropdownButtonFormField<CustodyProfile>(
                                    key: const ValueKey(
                                        'refund-custody-profile',),
                                    initialValue: _profile,
                                    isExpanded: true,
                                    decoration: const InputDecoration(
                                        labelText:
                                            'Perfil de custodia · Testnet',),
                                    items: [
                                      for (final profile
                                          in CustodyProfile.values)
                                        DropdownMenuItem(
                                            value: profile,
                                            child: Text(profile.label),),
                                    ],
                                    onChanged: _busy ? null : _selectProfile,
                                  ),
                                  const SizedBox(height: AppSpacing.sm),
                                  const Text(
                                      'Elegí la custodia del registro original. '
                                      'Cambiar de perfil descarta la referencia de esta vista, '
                                      'no borra intentos ni concede autorización.'),
                                  const SizedBox(height: AppSpacing.md),
                                  _field('refund-namespace',
                                      'Namespace original (UUID)', _namespace,),
                                  const SizedBox(height: AppSpacing.sm),
                                  _field('refund-pool',
                                      'Pool original (clave pública G…)', _pool,
                                      pool: true,),
                                  const SizedBox(height: AppSpacing.sm),
                                  _field(
                                      'refund-original-request',
                                      'Solicitud de emisión original (UUID)',
                                      _request,),
                                  const SizedBox(height: AppSpacing.md),
                                  FilledButton(
                                      key: const ValueKey(
                                          'refund-open-original',),
                                      onPressed: _scope == null ? _open : null,
                                      child: const Text(
                                          'Abrir referencia original',),),
                                ],),
                          ),
                        ),
                      ),
                      if (_scope != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        TextButton(
                            key: const ValueKey('refund-change-reference'),
                            onPressed: _busy
                                ? null
                                : () => setState(() => _scope = null),
                            child: const Text('Cambiar referencia'),),
                        const Text(
                            'Cambiar la vista no borra intentos ni cancela operaciones. '
                            'Consultá el estado para recuperar una solicitud pendiente.'),
                        const SizedBox(height: AppSpacing.md),
                        ProviderScope(
                          key: ValueKey(_profile),
                          overrides: [
                            custodyProfileProvider.overrideWithValue(_profile),
                          ],
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              RefundPanel(
                                  scope: _scope!,
                                  key: ValueKey(
                                      'v1/${_profile.name}/${_scope!.identity}',),
                                  onBusyChanged: (busy) =>
                                      setState(() => _v1Busy = busy),),
                              const SizedBox(height: AppSpacing.md),
                              const Text(
                                  'La vía v1 y el remanente v2 comparten la referencia original. '
                                  'Un intento registrado impide otro primer envío entre ambas vías; '
                                  'no se cambia de vía automáticamente.'),
                              const SizedBox(height: AppSpacing.md),
                              RefundRemainderPanel(
                                  scope: _scope!,
                                  key: ValueKey(
                                      'v2/${_profile.name}/${_scope!.identity}',),
                                  onBusyChanged: (busy) =>
                                      setState(() => _v2Busy = busy),),
                            ],
                          ),
                        ),
                      ],
                    ],),
              ),
            ),
          ),
        ),
      );
}
