# Shipaton — VACA

Deadline de publicación: **30 de septiembre de 2026, 23:45 PDT**.
Google Play puede tardar varios días en la primera revisión de una cuenta
nueva: la sumisión debe quedar enviada con margen.

## Estado del checklist

### Publicación Google Play

- [x] Application ID definitivo: `cl.vaca.app`.
- [x] Upload keystore generado (`android/app/upload-keystore.jks`,
      alias `vaca-upload`, RSA-2048, válido 30 años) y `key.properties`
      creado — **ambos fuera de Git**.
- [x] AAB `publicRelease` firmado con la upload key:
      `vaca_app/build/app/outputs/bundle/publicRelease/app-public-release.aab`
      (93.4 MB, cert `CN=VACA Upload` — verificado con jarsigner).
- [ ] App creada en Play Console (en curso — owner).
- [ ] Play App Signing aceptado.
- [ ] Países: Chile + Estados Unidos.
- [ ] Contiene anuncios: Sí · Compras dentro de la app: No.
- [ ] Data Safety completado en consola (base: `store/android/data-safety.md`).
- [ ] Clasificación de contenido.
- [ ] `PRIVACY_POLICY_URL` y `SUPPORT_URL` públicas — páginas listas en
      `shipaton/web/`; publicar en GitHub Pages (`docs/` o `gh-pages`).
- [ ] Instrucciones de acceso KYC para revisión (`kyc-review-access.md`).
- [ ] Disclaimer de no afiliación en descripción (`disclaimer.md`).
- [ ] Rotar/deshabilitar Supabase keys legacy expuestas.

### Evidencia

- [x] Icono 1024×1024: `vaca_app/store/android/icon-1024.png`.
- [ ] Screenshots 1179×2556 sin marco (reusar guion `d3-01..06` → `evidence/`).
- [ ] Video público ≤2 min (guion: `video-script.md`).
- [ ] Descripción beneficio social / Peace Prize (`peace-prize.md`).
- [ ] Descripción honesta RevenueCat Ads (`revenuecat-ads.md`).
- [ ] RevenueCat Charts v3 recibiendo eventos ILRD reales.
- [ ] Store URL pública accesible desde EE. UU.
- [ ] Demo y texto coinciden con la versión publicada.

## Comando de build de release

```powershell
cd vaca_app
flutter build appbundle --flavor public --release `
  --dart-define="FLAVOR=public" `
  --dart-define="SUPABASE_URL=<prod>" `
  --dart-define="SUPABASE_ANON_KEY=<prod>" `
  --dart-define="SERVER_BUNDLE_PUBLIC_KEY=<prod>" `
  --dart-define="SERVER_RECEIPT_PUBLIC_KEY=<prod>" `
  --dart-define="REVENUECAT_ANDROID_API_KEY=goog_BXkRalBAZezAZoynMpueiqJiydy" `
  --dart-define="PRIVACY_POLICY_URL=https://dno8.github.io/VACA/privacidad.html" `
  --dart-define="SUPPORT_URL=https://dno8.github.io/VACA/soporte.html"
```

El flavor `public` usa el banner AdMob de producción
(`ca-app-pub-4732294050798203/3390895689`) automáticamente.
En release, `FLAVOR`, `PRIVACY_POLICY_URL` y `SUPPORT_URL` son obligatorios
(fail-closed en `app_config.dart`).

## Respaldo del keystore

`upload-keystore.jks` + `key.properties` NO están en Git. Si se pierden,
no se puede actualizar la app sin reset de signing en Play Console.
Respaldar en gestor de contraseñas o almacenamiento cifrado.
