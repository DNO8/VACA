# Factibilidad técnica: biometría local y Passkeys

**Proyecto:** VACA — Vaquita de Ayuda y Coordinación Activa

**Entregable:** Semana 3 — Store-and-Forward Sync & Security Research

**Fecha:** 16 de septiembre de 2026

**Estado:** Factibilidad validada; implementación condicionada

## Decisión ejecutiva

La integración es técnicamente factible, pero biometría local y Passkeys resuelven problemas diferentes y no deben tratarse como equivalentes:

- **Biometría local (`local_auth`)** confirma que quien usa el dispositivo superó Face ID, Touch ID, huella o credencial del sistema. Es apropiada para proteger la apertura de identidad, recibos y wallet testnet.
- **Passkeys** autentican una cuenta frente a un backend mediante WebAuthn. Requieren dominio HTTPS, identificador de aplicación definitivo, firma de producción y servidor de relying party.
- Ninguna de las dos tecnologías reemplaza KYC, determina elegibilidad de ayuda ni debe bloquear una señal P0/P1.
- La recomendación para el MVP es incorporar primero autenticación local opcional. Passkeys deben implementarse cuando los prerrequisitos de dominio, signing y backend estén cerrados.

## Alcance evaluado

| Capacidad | Android | iOS | Decisión VACA |
| --- | --- | --- | --- |
| Biometría/credencial local | Factible desde API 24+ | Factible desde iOS 13+ | Implementar como protección opcional |
| Passkey de cuenta | Factible con Credential Manager y Android 9+ | Factible con AuthenticationServices | Preparar, no afirmar como implementado |
| Recuperación de wallet | No la resuelve por sí sola | No la resuelve por sí sola | Fuera del MVP actual |
| KYC | Independiente | Independiente | Mantener como adapter opcional |
| Captura urgente | No debe bloquearse | No debe bloquearse | Invitado P0/P1 siempre disponible |

VACA usa Android 8.0+ (API 26). La autenticación local es compatible con todo el rango actual. Passkeys estarían disponibles sólo desde Android 9; el producto necesitaría fallback explícito para API 26–27.

## Arquitectura propuesta

```text
UI de identidad / recibos / wallet
              |
              v
    LocalAuthenticationPort
       |                 |
 Android local_auth   iOS local_auth

UI de cuenta opcional
              |
              v
       PasskeyAuthPort
       |            |
 Credential Mgr   AuthenticationServices
              |
              v
      WebAuthn relying-party backend
```

### Límites de responsabilidad

1. `LocalAuthenticationPort` sólo devuelve éxito, cancelación, no disponible o error recuperable. No recibe ni almacena plantillas biométricas.
2. `PasskeyAuthPort` transporta opciones y respuestas WebAuthn opacas. La validación criptográfica ocurre en el backend.
3. `IdentityService` consume interfaces, no SDKs concretos. Esto mantiene sustitución de implementaciones, bajo acoplamiento y pruebas deterministas.
4. La captura de incidentes no depende de ninguno de estos servicios.
5. La wallet Stellar testnet continúa aislada; una passkey no contiene ni reemplaza el secret seed.

## Prerrequisitos para Passkeys

### Android

- Android 9 o superior para creación de passkeys.
- Credential Manager.
- Application ID definitivo.
- Certificado de firma definitivo y su fingerprint SHA-256.
- Dominio HTTPS controlado por VACA.
- `/.well-known/assetlinks.json` con `delegate_permission/common.get_login_creds` y asociaciones requeridas.
- Backend que emita desafíos de registro/autenticación de un solo uso y valide respuestas WebAuthn.

### iOS

- Bundle identifier y Apple Team definitivos.
- Capability **Associated Domains**.
- Entitlement `webcredentials:<dominio>`.
- `/.well-known/apple-app-site-association` con el App ID autorizado.
- Backend WebAuthn con el mismo relying party identifier.

Estos valores no existen todavía de forma final en el repositorio. Implementar Passkeys antes de cerrarlos generaría una integración que no puede validarse ni distribuirse.

## Seguridad y privacidad

| Riesgo | Control requerido |
| --- | --- |
| Bloquear una emergencia por autenticación | P0/P1 invitado permanece disponible |
| Confundir biometría con identidad civil | Copy y dominio separan autenticación local de KYC |
| Replay de desafíos Passkey | Challenge aleatorio, corto y de un solo uso en backend |
| Phishing o RP incorrecto | Verificar origin, RP ID, assetlinks y AASA |
| Cuenta perdida | Definir recuperación independiente; no exportar seed automáticamente |
| Logs sensibles | No registrar respuestas WebAuthn, tokens ni errores crudos del proveedor |
| Device credential débil | Permitir biometría exclusiva sólo en superficies no críticas, con fallback documentado |
| Background durante prompt | Usar `persistAcrossBackgrounding` únicamente donde la UX lo requiera |

La aplicación nunca recibe datos biométricos. El sistema operativo realiza la comparación y entrega únicamente el resultado de autenticación.

## Plan recomendado

### Fase 1 — MVP seguro

- Crear `LocalAuthenticationPort` e implementación `local_auth`.
- Proteger de forma opcional identidad, recibos y wallet testnet.
- No proteger creación de señales urgentes.
- Cubrir éxito, cancelación, dispositivo no compatible, no enrolado y lockout.

### Fase 2 — Cuenta Passkey

- Cerrar dominio, IDs y signing.
- Implementar endpoints WebAuthn de registro y autenticación.
- Publicar Digital Asset Links y AASA.
- Agregar adapters Android/iOS detrás de `PasskeyAuthPort`.
- Probar origin/RP incorrecto, desafío repetido y cuenta revocada.

### Fase 3 — Recuperación opcional

- Diseñar recuperación separada de KYC y de la señal de incidente.
- Si se habilita backup de wallet, usar cifrado del lado cliente y política de recuperación explícita.
- No introducir mainnet ni flujos de ayuda en este módulo.

## Criterios de go/no-go

**Go para biometría local cuando:**

- El prompt y fallback están aprobados.
- No bloquea P0/P1.
- Android/iOS manejan cancelación y no disponibilidad.
- Las pruebas no dependen de hardware biométrico real.

**Go para Passkeys cuando:**

- Dominio, application ID, bundle ID y signing son definitivos.
- Assetlinks y AASA están publicados y verificables.
- Existe backend WebAuthn con desafíos de un solo uso.
- Hay recuperación de cuenta y revocación aprobadas.

**No-go actual para afirmar Passkeys productivos:** faltan relying-party backend, dominio asociado, signing de producción, entitlements y evidencia física multiplataforma.

## Conclusión

VACA puede usar biometría local en el MVP sin afectar su misión offline-first. Passkeys son viables como autenticación de cuenta futura, pero no deben presentarse como recuperación automática de wallet ni como sustituto de KYC. La secuencia recomendada conserva alta cohesión: autenticación local, autenticación remota y captura crítica permanecen como capacidades independientes.

## Referencias verificadas

- Flutter `local_auth`: https://pub.dev/packages/local_auth
- Android Credential Manager prerequisites: https://developer.android.com/identity/credential-manager/prerequisites
- Android passkey creation: https://developer.android.com/identity/passkeys/create-passkeys
- Apple Passkeys: https://developer.apple.com/passkeys/
- Apple associated service setup: https://developer.apple.com/documentation/authenticationservices/connecting-to-a-service-with-passkeys
- WebAuthn Level 3: https://www.w3.org/TR/webauthn-3/
