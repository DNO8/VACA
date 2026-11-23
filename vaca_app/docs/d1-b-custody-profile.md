# Perfiles de custodia A/B · Stellar Testnet

## Alcance de fuente

La selección pertenece solo a los clientes de reembolso. No modifica el
`SUPABASE_URL` general, feed, KYC, bundles, cuentas, navegación ni claims del
beneficiario/Horizon. No agrega una entrada de administración a Identity.
La pantalla administrativa existente sigue siendo independiente; abrirla no
concede rol ni autorización del backend. Esta entrega no actualiza el APK,
activa backend ni acredita disponibilidad o aceptación financiera.

## Configuración pública y rutas

`CustodyProfile.a` es el valor predeterminado de los tres constructores HTTP y
del proveedor local. Conserva el origen HTTPS configurado y el prefijo
`/functions/v1/d1-custody`, sin reinterpretar referencias existentes.
`CustodyProfile.b` fija exclusivamente:

- Origen: `https://tgqxxnldwiqisopiclmk.supabase.co`
- Namespace: `8126a1f4-ed8a-41ec-905b-9ad3442e5e6e`
- Pool público: `GAYWVFBP2YPYMU245D6AOE7WWTVZOWGPVIFVGOH5EFFSSQ3VZAVR5JCW`
- Prefijo: `/functions/v1/d1-custody/video-auto`
- Red de los scopes y pruebas originales: `TESTNET`

El parámetro opcional `profile` está disponible en `RefundHttpClient`,
`RemainderHttpClient` y `RemainderStatusClient`. Para B, pasar
`projectUrl: CustodyProfile.b.origin(null), profile: CustodyProfile.b` y una API
key pública autorizada para ese proyecto. Nunca una credencial service-role.
Los proveedores seleccionan el origen B sin reemplazar la configuración global;
una API key ausente o rechazada no habilita fallback a A ni otro intento.

Los sufijos siguen siendo `refund`, `refund-status`, `refund-reconcile`,
`refund-remainder`, `refund-remainder-status` y `refund-remainder-reconcile`.
El consumidor pasivo solo expone el último status: no se monta otra pantalla,
no agrega refund/reconcile ni escribe journals. Los transportes B rechazan un
origen distinto al construirlos y un namespace o pool ajeno antes de consumir
una reserva, leer la wallet, firmar o enviar. No sustituyen campos del scope.
Los errores siguen siendo desconocidos/no verificados, nunca permiso financiero.

## Elección explícita en la superficie existente

`Perfil de custodia · Testnet` muestra `Custodia A · Testnet` por defecto y
permite elegir `Custodia B · Testnet`. B muestra namespace y pool fijados, no
editables; requiere ingresar de nuevo el UUID de la solicitud original B.
Cambiar A→B o B→A elimina la referencia y los resultados de esa vista, incluso
al volver al perfil anterior. Nunca copia el UUID A al scope B, descubre una
solicitud ni genera un ID nuevo. El operador debe usar el registro original;
la selección local no prueba la pertenencia de una donación al backend.

Mientras cualquiera de los dos paneles espera confirmación o un comando,
la selección y `Cambiar referencia` quedan deshabilitados. Los paneles mantienen
sus controles de generación/montaje y se reconstruyen por perfil y scope para
no mostrar resultados de una vista anterior. Cambiar o cerrar una vista no
borra ni libera intentos; tampoco replantea una operación ya enviada.

## Invariantes y comprobación offline

Se reutilizan `RefundScope`, los proofs v1/v2 originales, los consumidores,
la cola por identidad y los journals/shared holds existentes. No se agrega un
segundo esquema de almacenamiento ni un reset. Estado fresco, reserva duradera,
readback y permiso de un solo uso siguen precediendo a refund. Un hold previo
conserva el camino de recuperación status/reconcile; ningún perfil ofrece
reintento automático, polling, redirecciones o ejecución por ausencia de estado.

`test/d1_custody_profile_test.dart` cubre los pines, rechazo sin lectura de wallet
ni transporte, rutas de ambas versiones y consumidor pasivo, recuperación sin
segundo primer envío, composición local fría y selección/bloqueo de la vista.
Las pruebas usan Dio, storage y wallets sintéticas inyectadas, sin llamadas de
red, claves privadas reales ni pagos. Los resultados observados de los comandos
se entregan por separado al orquestador; estos casos no son aceptación en un
dispositivo ni verificación independiente.
