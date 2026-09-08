# VACA mobile app

Aplicación Flutter offline-first para registrar incidentes, conservar bundles cifrados y sincronizarlos con un servidor autorizado.

## Productos

- `public`: Android/iOS con captura local y entrega HTTPS.
- `municipalPilot`: Android administrado con relay BLE autorizado.
- `dev`: desarrollo local; nunca se distribuye como producción.

## Fundamentos

1. Persistir antes de transmitir.
2. KYC no bloquea P0/P1.
3. Relay y gateway no descifran payloads.
4. Sólo un recibo firmado confirma recepción del servidor.
5. Guardado local, custodia, recibo y acuse institucional son estados distintos.

## Documentación

- `../Especificaciones/01-public-mvp-product-spec.md`
- `../Especificaciones/flujo-app.md`
- `../Especificaciones/modelo-datos-fibe.md` — nombre conservado por compatibilidad; modelo activo genérico.
- `../Especificaciones/02-hybrid-dtn-architecture.md`
- `../Especificaciones/mesh-comunicaciones.md`
- `../Especificaciones/03-release-security-readiness.md`
- `../Especificaciones/sistema-diseno-app.md`
- `SETUP.md`

Los handoffs y backlogs de fecha controlan ejecución y evidencia; no sustituyen estas especificaciones permanentes.

## Verificación básica

```powershell
flutter pub get
dart run build_runner build --delete-conflicting-outputs
dart format --output=none --set-exit-if-changed lib test
dart analyze
flutter test
```

Los builds de release requieren flavor, configuración productiva y firma aprobada. Nunca deben usar secretos del proveedor en `dart-define` ni fallback de desarrollo.
