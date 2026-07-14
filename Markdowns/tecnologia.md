Infraestructura Tecnológica: Resiliencia y Transparencia
Vaquita utiliza una arquitectura modular diseñada para operar en el colapso (Día 0) y escalar hacia una transparencia radical mediante rieles financieros modernos. El stack tecnológico está optimizado para la resiliencia en terreno y la auditoría inmutable en la nube
.
1. Capa de Captura: Mobile Offline-First
Diseñada para el escenario donde las telecomunicaciones fallan. No es una Web App, sino una aplicación nativa capaz de ser el nodo primario de información
.
Stack: Desarrollada en Flutter para garantizar consistencia en dispositivos Android de gama baja, predominantes en el territorio
.
Persistencia Local (SQLite): Cada dispositivo funciona como una "isla de información", almacenando reportes de daños (basados en el estándar FIBE), fotos y georreferenciación de forma local y segura
.
Protocolo de Sincronización Eventual: Al detectar conectividad (antenas móviles, Starlink o traslado físico), el sistema utiliza colas de sincronización en segundo plano para mergear los datos con el backend central
.
2. Capa de Inteligencia: Verdad Emergente (Trust Scoring)
VACA procesa el caos de los datos sincronizados para generar información accionable antes del arribo del Estado
.
Merge de Datasets: Algoritmos que detectan duplicados y patrones espaciales. Si múltiples usuarios reportan el mismo incidente en un radio geográfico, el sistema eleva automáticamente el nivel de confianza del reporte
.
Niveles de Confianza Progresiva: Cada reporte evoluciona:
Nivel 1: Registro único no confirmado.
Nivel 2: Confirmación por consenso comunitario.
Nivel 3: Validación mediante Foundation Adapter (cruces con bases de datos de ONGs o municipios)
.
3. Capa de Ejecución: Stellar & Soroban
La red Stellar actúa como el sistema circulatorio del protocolo, gestionando activos y reglas de distribución sin custodia humana
.
Soroban Smart Contracts (Rust): Implementan la lógica de negocio, desde la validación de beneficiarios mediante Merkle Proofs (privacidad Ley 19.628) hasta las estrategias de Social Yield
.
Claimable Balances: Primitiva nativa que permite reservar USDC para un RUT específico. El beneficiario puede reclamar su ayuda cuando recupere la señal y acceda a su wallet, eliminando el riesgo de custodia por parte de la fundación
.
Social Yield (DeFi): Integración con protocolos como Blend o Defindex para que los fondos en tránsito generen rendimientos sociales que neutralicen los costos de transferencia (off-ramp).
4. Capa de Integración: Simbiosis VACA + Sozu
División funcional de responsabilidades técnicas para garantizar cumplimiento legal (Ley Fintec 21.521):
VACA (Cerebro): Administra la lógica de priorización, el catastro offline y la validación de niveles de daño.
Sozu (Rieles): Provee la infraestructura de wallet autocustodial, los flujos de on/off-ramp hacia la CuentaRUT y la auditoría financiera del rendimiento DeFi.
Resultado: Una arquitectura de "Store-and-Forward" aplicada a la ayuda humanitaria, donde la información fluye antes que el dinero, y el dinero rinde más gracias a la eficiencia programable de Soroban.