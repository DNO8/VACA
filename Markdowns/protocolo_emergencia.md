Protocolo de Coordinación: Del "Día 0" a la Solidaridad 365
VACA introduce un protocolo estandarizado que permite orquestar la ayuda humanitaria incluso cuando la infraestructura centralizada colapsa. El protocolo está diseñado para operar en dos estados: Modo Solidaridad 365 (recaudación y apoyo diario) y Modo Emergencia (activación masiva ante desastres).
1. El Ciclo de Vida de la Ayuda (Store-and-Forward)
A diferencia de los sistemas tradicionales, VACA no asume conectividad constante. El ciclo de vida se basa en la construcción de una "Verdad Emergente"
:
Captura en Isla (Día 0): Los "operadores comunitarios espontáneos" registran daños y necesidades en la App offline-first (SQLite). La información queda contenida localmente en el territorio
.
Sincronización Eventual: Al detectar una ventana de conexión (Starlink, radio-enlace o traslado físico del dispositivo), los datos se mergean en la nube para detectar patrones y duplicados
.
Validación de Confianza (Trust Scoring): El sistema asigna un confidence_level que evoluciona:
Nivel 1: Reporte ciudadano único.
Nivel 2: Consenso comunitario (múltiples reportes sobre el mismo daño).
Nivel 3: Validación institucional (cruce vía Foundation Adapter con datos de ONGs o el Estado)
.
Ejecución Financiera: Una vez alcanzado el umbral de confianza, se activan los Claimable Balances en Stellar (USDC) para los beneficiarios validados
.
Cierre y Auditoría: Emisión de Proof of Aid (NFT) para el donante e integración del evento en el National Emergency Index
.
2. Disparadores de Activación (Triggers)
El protocolo se adapta automáticamente según la gravedad detectada por los oráculos oficiales:
Trigger ALFA (SENAPRED): Ante la detección de un Informe ALFA, VACA activa automáticamente el "Modo Emergencia" en la zona geográfica afectada, priorizando el catastro del Módulo 5 de la Ficha FIBE.
Trigger Institucional: Cuando una fundación aliada (ej. Hogar de Cristo) activa una campaña específica para un grupo de riesgo, el sistema habilita los rieles de recaudación trazable con Social Yield.
3. Simbiosis Operativa VACA + Sozu Pay
Para garantizar la resiliencia y el cumplimiento legal (Ley Fintec 21.521), el protocolo separa la inteligencia de la ejecución:

Fase del Protocolo     | Responsable (Capa)     | Acción Técnica
-------------------------------------------------------------------
Detección y Catastro   | VACA (Coordination)    | Registro offline de RUTs y evidencia fotográfica (IPFS)
Validación Social      | VACA (Insights)        | Ejecución de Merkle Proofs para proteger la privacidad (Ley 19.628)
Gestión de Fondos      | Sozu Pay (Financial)   | Colocación en pools de liquidez (Social Yield) para neutralizar comisiones
Liquidación Final      | Sozu Pay (Financial)   | Desembolso a la CuentaRUT del beneficiario validado por VACA.

4. Gobernanza del Evento
El protocolo otorga poder de decisión a los afectados para evitar la "basura humanitaria":
Priorización Comunitaria: Los damnificados con tokens de gobernanza pueden votar para ajustar el tipo de ayuda (ej. priorizar "Vouchers de Agua" sobre "Ropa") según evolucione la crisis en su cuadrante
.
Supervisión Municipal: El municipio actúa como el validador final de las listas de distribución, asegurando que la ayuda sea coherente con la respuesta del COGRID
.
Resultado: El protocolo transforma el caos del "Día 0" en una operación logística y financiera profesional, donde la información fluye antes que el dinero y el dinero rinde más gracias a la tecnología programable
.