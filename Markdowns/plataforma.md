# Modelo de plataforma — Ecosistema VACA

VACA se organiza como capacidades interoperables con fronteras claras. La aplicación ciudadana es gratuita y no se convierte en un canal de decisiones financieras o de elegibilidad.

## 1. Aplicación pública

Android e iOS permiten preparar identidad, capturar señales offline, adjuntar evidencia opcional, actualizar/cancelar y verificar entrega al servidor.

La persona puede operar sin KYC para señales críticas. La interfaz comunica estados honestos y deriva hacia canales oficiales cuando estén disponibles.

## 2. Despliegue municipal

Un flavor Android administrado añade relay BLE y gateway certificado. Sus permisos, servicio y trust roots no aparecen en el producto público.

El piloto extiende la ruta de entrega; no cambia el modelo de incidente ni otorga autoridad automática al dispositivo.

## 3. Backend autorizado

Proporciona:

- Identidad y credenciales opacas.
- Ingesta de bundles.
- Eventos append-only e idempotencia.
- Recibos firmados.
- Almacenamiento privado de adjuntos.
- Retención, eliminación y auditoría.
- Integraciones institucionales por rol.

## 4. Operación institucional

Municipios y organizaciones acceden a herramientas separadas para revisar señales autorizadas, coordinar acciones y emitir acuses institucionales.

La plataforma no afirma que una señal generó despacho, atención o beneficio salvo que el sistema responsable emita evidencia explícita.

## 5. VACA Insights

La capa analítica utiliza datos agregados o seudonimizados con controles de acceso. Mide operación, cobertura, latencia y resiliencia sin publicar coordenadas exactas ni construir decisiones automatizadas sobre personas.

## 6. Integraciones futuras

Nuevos canales financieros, logísticos o institucionales son productos/adapters independientes sujetos a evaluación legal y técnica. No forman parte del núcleo de captura y no pueden alterar prioridad, verdad o elegibilidad a partir de KYC o señales comunitarias.

## Regla de plataforma

Cada capacidad debe poder evolucionar sin obligar a la aplicación pública a adoptar permisos, secretos o dependencias de otra capa.
