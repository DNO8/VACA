# Gate de publicación Android y Shipaton

## Valores externos obligatorios

- [x] Application ID definitivo: `cl.vaca.app`.
- [ ] `cl.vaca.app` reservado en Google Play, AdMob y RevenueCat.
- [ ] `ADMOB_APP_ID` asociado al mismo application ID.
- [ ] `ADMOB_BANNER_AD_UNIT_ID` de producción.
- [ ] `REVENUECAT_ANDROID_API_KEY` del proyecto Android.
- [ ] RevenueCat Ads/Charts v3 habilitado y recibiendo eventos ILRD.
- [ ] `PRIVACY_POLICY_URL` HTTPS pública.
- [ ] `SUPPORT_URL` HTTPS pública.
- [ ] Upload keystore y `android/key.properties` fuera de Git.
- [ ] Legacy Supabase keys expuestas rotadas o deshabilitadas.

## Configuración Google Play

- [ ] App creada con el application ID definitivo.
- [ ] Play App Signing aceptado.
- [ ] AAB firmado con upload key, no debug.
- [ ] Disponible en Chile y Estados Unidos.
- [ ] Contiene anuncios: Sí.
- [ ] Compras dentro de la app: No.
- [ ] Data Safety revisado contra SDKs y comportamiento real.
- [ ] Política de privacidad y soporte accesibles públicamente.
- [ ] Clasificación de contenido completada.
- [ ] Instrucciones de acceso para revisión KYC.
- [ ] Disclaimer de no afiliación y canales oficiales incluido.

## Verificación técnica

- [ ] `dart format --output=none --set-exit-if-changed lib test tool`
- [ ] `flutter analyze`
- [ ] `flutter test`
- [ ] Build dev con AdMob test ID.
- [ ] Build `publicRelease` con todas las variables y signing.
- [ ] `apksigner` confirma certificado de upload, no Android Debug.
- [ ] Artefacto no contiene endpoints dev ni secretos privados.
- [ ] Android físico: instalación, onboarding y captura offline.
- [ ] Reinicio de proceso conserva outbox.
- [ ] Reconexión produce un único incidente y recibo verificado.
- [ ] Banner sólo aparece en “Acerca de VACA”.
- [ ] Consentimiento/privacidad de anuncios funciona.
- [ ] RevenueCat registra loaded, displayed e ingreso por impresión.

## Evidencia Shipaton

- [ ] Aplicación publicada antes del 30 de septiembre de 2026, 11:45 p. m. PDT.
- [ ] Store URL pública y accesible desde Estados Unidos.
- [ ] RevenueCat project ID.
- [ ] Icono 1024×1024.
- [ ] Screenshot 1179×2556 sin marco.
- [ ] Video público YouTube/Vimeo de máximo dos minutos.
- [ ] Descripción de beneficio social para Peace Prize.
- [ ] Descripción honesta de RevenueCat Ads.
- [ ] Demo y texto coinciden con la versión publicada.
