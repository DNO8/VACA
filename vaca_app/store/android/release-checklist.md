# Gate de publicación Android y Shipaton

## Valores externos obligatorios

- [x] Application ID definitivo: `cl.vaca.app`.
- [ ] `cl.vaca.app` reservado en Google Play.
- [x] AdMob App ID asociado a `cl.vaca.app`.
- [x] AdMob banner ID de producción.
- [x] RevenueCat Project ID: `0f1cc1a2-261f-466f-920a-195a214aa44c`.
- [x] RevenueCat Android SDK key pública configurada (`goog_…`).
- [ ] RevenueCat Ads/Charts v3 habilitado y recibiendo eventos ILRD.
- [ ] `PRIVACY_POLICY_URL` HTTPS pública.
- [ ] `SUPPORT_URL` HTTPS pública.
- [x] Upload keystore y `android/key.properties` fuera de Git.
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
- [x] `flutter analyze` sin findings.
- [x] `flutter test`: 69 tests aprobados.
- [x] Build `devRelease` testnet firmado.
- [ ] Build dev con AdMob test ID.
- [ ] Build `publicRelease` con todas las variables y signing.
- [x] `apksigner` confirma certificado VACA Upload en `devRelease`, no Android Debug.
- [ ] Repetir verificación de `apksigner` sobre el `publicRelease` definitivo.
- [ ] Artefacto no contiene endpoints dev ni secretos privados.
- [ ] Android físico: instalación, onboarding y captura offline.
- [ ] Reinicio de proceso conserva outbox.
- [ ] Reconexión produce un único incidente y recibo verificado.
- [ ] Banner sólo aparece en “Acerca de VACA”.
- [ ] Consentimiento/privacidad de anuncios funciona.
- [ ] RevenueCat registra loaded, displayed e ingreso por impresión.

## Evidencia Instawards — Semana 4

- [x] APK `devRelease` testnet final construido el 21-09-2026: 116.341.529 bytes.
- [x] SHA-256: `C380C5B7FF85A65915B6225F55DC6EC8DE48BB866C746480B8F389BDE61A876B`.
- [x] Copia en Drive: `VACA/06 Programas y Convocatorias/Instawards/Entregables formales/Semana 4/VACA-semana4-dev-testnet-final-2026-09-21.apk`.
- [x] Claim desde app conserva y enlaza hashes de transacción Stellar testnet.
- [ ] Video 3–5 min: captura offline → sync → donación → Claimable Balance → claim.
- [x] Smoke Testnet real: donación `d7d6927f3bf4c7c099271e736bfb34390e13b037f340425266070e396ebf9f1d`, emisión `bb3fc7c63f5446103816feed212760db5d26ae37b1070979bd637c7fccda704e`, claim `71c104bc9c211790fc2cd6d62750e3780226cffa9d31993d6e8b41c85214d024`.
- [x] Mock NFT Proof of Aid ejecutado en Soroban Testnet: contrato `CAE2RWTDM3Q5SJRSLIP247F2ERB4AXJTCVNYNCFHYBVKJL42HKARYDSP`, mint `a8c14a0dbf0b712622454861df07a9f8104bae80d0227fa22e1c04de2b0e3509`, imagen local sin IPFS.
- [ ] Repetir y vincular hashes dentro del walkthrough físico completo.
- [x] Pipeline B2G: 20 prospectos estructurados y outreach completado, cierre operativo confirmado por Marcos.

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
