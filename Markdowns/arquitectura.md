Arquitectura del Sistema: VACA (Vaquita de Ayuda y Coordinación Activa)
VACA está diseñada como una infraestructura cívica distribuida de múltiples capas
. Su arquitectura modular permite desacoplar la inteligencia territorial de la ejecución financiera, garantizando la resiliencia en el colapso (Día 0) y el cumplimiento regulatorio (Ley Fintec) en la reconstrucción.
1. Vista General: Arquitectura de 4 Capas
El sistema se organiza en cuatro capas de valor interconectadas pero técnicamente independientes para facilitar el mantenimiento y escalamiento
:
Capa de Captura (Edge/Mobile): Aplicación nativa offline-first para la recolección de datos en la "Zona Cero"
.
Capa de Inteligencia (Cloud/Backend): Procesamiento de la "Verdad Emergente", merge de datasets y oráculos institucionales
.
Capa de Ejecución (Blockchain/Stellar): Rieles financieros transparentes, non-custodial y automatización de ayuda programable
.
Capa Analítica (SaaS/Insights): Tableros de control para la toma de decisiones estratégicas del COGRID y ONGs
.
2. Capa de Captura: La App Mobile de Resiliencia
A largo plazo, el núcleo del ecosistema es la aplicación móvil, diseñada bajo el principio de "El dispositivo es el nodo"
.
Tecnología Core: Desarrollada en Flutter para garantizar un alto rendimiento y consistencia visual en dispositivos Android de gama baja, predominantes en zonas vulnerables
.
Módulo de Persistencia Local (SQLite): Cada teléfono funciona como una "isla local de información"
. Almacena reportes de daños (estándar Informe ALFA/FIBE), georreferenciación y evidencia fotográfica sin necesidad de internet
.
Protocolo de Sincronización Eventual (Store-and-Forward): El software gestiona colas de sincronización inteligentes. Al detectar una ventana de conectividad (Starlink, antena móvil o traslado físico), los datos se mergean con el backend central
.
Identidad Soberana: Implementación de Passkeys y biometría para que el usuario acceda a su wallet de ayuda (Sozu) de forma segura sin gestionar frases semilla complejas.
3. Capa de Inteligencia y "Verdad Emergente"
Esta capa transforma el caos de los datos aislados en información accionable para el Estado y las ONGs
.
Motor de Trust Scoring: Algoritmos modulares que asignan niveles de confianza a los reportes basados en la reproducibilidad comunitaria
.
Nivel 1 (Señal Temprana): Reporte ciudadano aislado
.
Nivel 2 (Consenso): Coincidencia geográfica de múltiples reportes
.
Nivel 3 (Validación): Verificación mediante el Foundation Adapter
.
Foundation Adapter (Modular): Interfaz que conecta VACA con bases de datos externas (Hogar de Cristo, SINAPRED, SISE). Utiliza Merkle Proofs para validar beneficiarios sin exponer sus datos personales públicamente, cumpliendo con la Ley 19.628.
4. Capa de Ejecución Financiera: Stellar & Soroban
VACA delega la ejecución financiera pesada a contratos inteligentes inalterables, eliminando la custodia de fondos y la fricción regulatoria
.
Smart Contracts (Soroban/Rust): Lógica de distribución basada en el nivel de daño del damnificado
. Los contratos determinan los montos de USDC o tipos de Vouchers (ej. ITEM-AGUA) a entregar
.
Simbiosis con Sozu Pay: Arquitectura de "Marca Blanca" donde VACA provee la inteligencia y Sozu provee la billetera, conversión de activos y gestión del Social Yield (rendimiento DeFi) para neutralizar comisiones de salida.
Claimable Balances: Primitiva de Stellar que permite "reservar" la ayuda para un RUT específico en la blockchain. Esto asegura que el dinero esté disponible incluso si el damnificado tarda días en recuperar su conectividad o acceso a un smartphone
.
5. Escalabilidad y Buenas Prácticas (SaaS B2G)
La arquitectura está optimizada para crecer como una plataforma regional (LATAM)
.
Arquitectura Non-Custodial: Al no tocar el dinero directamente, VACA escala sin las barreras de las licencias bancarias transfronterizas
.
Diseño Modular Multitenant: La capa de Vaquita Insights permite a cada municipalidad o país configurar sus propias métricas y zonas de riesgo de forma independiente
.
National Emergency Index (NEI): Capa de agregación de datos que utiliza aprendizaje automático para predecir vulnerabilidades territoriales históricas, transformando la ayuda en una ciencia de datos preventiva
.
Resultado: Una infraestructura diseñada para el peor escenario (colapso total) pero capaz de ejecutar la solidaridad más eficiente (DeFi/Blockchain) cuando se restablece la comunicación
.