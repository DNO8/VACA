# Instrucciones de acceso para revisión — Google Play

VACA funciona **sin cuenta ni verificación** para sus flujos principales.
No se requiere credencial de usuario para revisar la app.

## Acceso general (sin login)

1. Instalar el AAB/APK publicado.
2. Completar el onboarding (aviso legal → privacidad → identidad).
3. En “Configuración de identidad” elegir **“Continuar sin verificar”**:
   habilita el flujo completo de señal (categoría → ubicación → detalles →
   foto → guardado local → entrega → recibo).

## Flujo KYC opcional (Didit)

La verificación de identidad es opcional y usa el proveedor Didit en modo
sandbox durante el piloto:

- Entrada: pestaña **Identidad → “Verificar identidad”**.
- El SDK Didit abre el flujo nativo; en sandbox se puede completar con
  datos de prueba.
- Estados posibles en pantalla: `unverified`, `Verificación en revisión`,
  `Identidad verificada`. El botón se deshabilita tras verificar o quedar
  pendiente.
- KYC no es requisito para señales P0/P1 ni para la entrega: es solo
  aseguramiento de identidad, nunca barrera de emergencia.

## Datos y eliminación

- **Identidad y datos → “Eliminar datos locales”**: borra el perfil,
  señales, eventos, bundles y recibos del dispositivo.
- **“Solicitar eliminación remota”**: borra identidad, incidentes y
  recibos del servidor en una llamada (con confirmación; irreversible).
  Tras la eliminación, el estado local vuelve a `unverified`.

## Permisos

- Ubicación: opcional; la señal se puede crear con coordenadas manuales o
  sin ubicación.
- Cámara: opcional; la foto de evidencia es un adjunto independiente del
  bundle.
