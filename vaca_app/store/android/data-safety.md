# Borrador de Data Safety — Android

Este inventario debe validarse contra el artefacto final y ser aprobado por el propietario antes de completar Google Play Console.

| Dato | Recopilado | Compartido | Propósito | Opcional |
| --- | --- | --- | --- | --- |
| Ubicación precisa | Sí | No con publicidad | Funcionalidad de señales | Sí |
| Fotografías | Sí | No con publicidad | Evidencia opcional | Sí |
| Nota y categoría de incidente | Sí | No con publicidad | Coordinación y entrega | Categoría requerida; nota opcional |
| Cantidad de personas | Sí | No con publicidad | Priorización | Sí |
| Clave pública del dispositivo | Sí | Backend autorizado | Autenticación y anti-replay | No para sincronización |
| Estado de verificación KYC | Sí, si se usa | Didit/backend autorizado | Aseguramiento opcional de identidad | Sí |
| Identificadores publicitarios/dispositivo | Potencialmente sí | Google AdMob/RevenueCat | Publicidad, medición y fraude | Ads sólo en sección informativa |
| Interacciones con anuncios | Sí | Google AdMob/RevenueCat | Medición publicitaria | Sólo al abrir “Acerca de VACA” |
| Diagnósticos de SDK | Por confirmar | Proveedores SDK | Seguridad y estabilidad | Por confirmar |

## Controles implementados

- Señales almacenadas localmente antes de transmisión.
- Payload cifrado para el destinatario autorizado.
- Recibos de servidor verificados criptográficamente.
- KYC opcional y no bloqueante para P0/P1.
- Publicidad excluida de captura, detalle, outbox, recibos y verificación de identidad.
- RevenueCat desactiva recolección automática de identificadores en su configuración.
- AdMob solicita consentimiento mediante UMP y usa solicitudes no personalizadas.
- Eliminación local y solicitud de eliminación remota disponibles en la aplicación.

## Declaraciones que requieren validación externa

- Plazo definitivo de retención backend.
- Países de procesamiento de Supabase, Didit, Google y RevenueCat.
- Configuración final de consentimiento en AdMob Privacy & Messaging.
- Uso final de Advertising ID según configuración del SDK y Play Console.
- URL pública de eliminación de cuenta si Google Play la exige para el modelo final de cuenta.
