# Whitepaper — VACA, infraestructura cívica de resiliencia

## 1. Resumen ejecutivo

VACA es una infraestructura offline-first para registrar, conservar y entregar señales de incidentes cuando la conectividad es intermitente o inexistente. Combina una aplicación pública Android/iOS, un protocolo DTN independiente del transporte, un backend autorizado y capacidades institucionales de coordinación y análisis.

VACA no reemplaza servicios de emergencia, no reproduce evaluaciones oficiales, no determina elegibilidad y no promete despacho de recursos. Su función es reducir el vacío de información con privacidad y evidencia verificable de entrega.

## 2. Problema

Durante una emergencia aparecen simultáneamente:

- Islas locales de información.
- Conectividad degradada.
- Reportes duplicados o incompatibles.
- Ambigüedad entre guardado, envío y recepción.
- Riesgo de exponer identidad, ubicación y evidencia.
- Sobrecarga institucional para consolidar señales tempranas.

## 3. Producto público

La aplicación permite:

- Registrar consentimiento y preparar identidad.
- Continuar sin KYC para señales críticas.
- Crear incidentes P0–P4 sin Internet.
- Capturar ubicación disponible y evidencia opcional.
- Persistir el evento y su bundle antes de transmitir.
- Actualizar, cancelar y eliminar datos.
- Distinguir guardado local, cola, relay, recibo y acuse institucional.

KYC aporta aseguramiento de identidad, pero no demuestra verdad, presencia o urgencia.

## 4. Arquitectura de entrega

Cada evento produce un bundle canónico, cifrado y firmado. El mismo objeto puede avanzar por:

1. HTTPS hacia el servidor autorizado.
2. BLE DTN en despliegues municipales Android.

El outbox conserva prioridad, expiración, reintentos e idempotencia. Relays y gateways no reciben claves de descifrado. Sólo un recibo firmado y ligado al payload confirma recepción del servidor.

## 5. Despliegue municipal

El flavor municipal añade:

- Foreground service visible.
- BLE discovery y sesiones autenticadas.
- Caché durable y custody.
- Routing spray-and-wait acotado.
- Gateway certificado.
- Controles de batería, almacenamiento y antiestampida.

La capacidad está aislada del flavor público y se valida con dispositivos reales.

## 6. Backend y privacidad

El backend autentica, valida, deduplica y persiste de forma transaccional. Aplica RLS, mínimo privilegio, almacenamiento privado, rate limits, retención y eliminación.

No se almacenan en la app documentos de identidad, biometría, respuestas completas de KYC o secretos del proveedor. Ubicación, notas y medios permanecen protegidos durante almacenamiento y transferencia.

## 7. Operación institucional e Insights

Herramientas institucionales separadas permiten revisar señales autorizadas y emitir acuses. VACA Insights produce métricas agregadas de cobertura, latencia, calidad y resiliencia sin convertir datos personales en el producto ni automatizar decisiones de alto impacto.

## 8. Sostenibilidad

La aplicación pública se sostiene mediante servicios institucionales:

- Licencias y operación administrada.
- Integraciones y soporte.
- Capacitación y ejercicios.
- Analítica agregada con controles de privacidad.
- Grants para infraestructura cívica.

VACA no depende de blockchain, tokenización, wallets, DeFi o intermediación financiera.

## 9. Gobernanza

Fundación CAMADA custodia la misión y la relación pública. El equipo tecnológico desarrolla y opera la plataforma bajo acuerdos transparentes. Municipios y organizaciones conservan la autoridad sobre sus decisiones.

## 10. Visión

VACA busca que una señal pueda sobrevivir al colapso de conectividad, llegar a un receptor autorizado con evidencia verificable y contribuir a una respuesta más coordinada sin sacrificar privacidad, accesibilidad ni dignidad.
