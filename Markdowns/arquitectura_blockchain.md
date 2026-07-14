Arquitectura Blockchain: VACA + Stellar/Soroban
Este documento detalla la infraestructura financiera descentralizada de VACA, basada en la red Stellar y su plataforma de contratos inteligentes Soroban. La arquitectura está diseñada para ser non-custodial, resiliente ante desastres y financieramente eficiente, transformando la ayuda humanitaria en un proceso auditable y digno
.
1. División Funcional de Responsabilidades
Para mitigar riesgos fiduciarios y cumplir con la Ley Fintec (21.521), el sistema separa la inteligencia de la ejecución financiera mediante una arquitectura de marca blanca
:

| Capa                        | Responsable           | Tecnología      | Función Técnica |
| -------------------------- | --------------------- | --------------- | --------------- |
| Capa de Inteligencia Social | VACA                  | Soroban (Rust)  | Validación de identidad (Merkle Proofs), 
                                                                            asignación de niveles de daño (Tiering) y priorización según Ficha FIBE |
| Capa de Ejecución Financiera | Sozu Pay             | Stellar Core    | Provisión de billeteras autocustodiales, 
                                                                          gestión de Claimable Balances y rieles de liquidación (Off-ramp) |
| Capa de Rendimiento        | Sozu Pay              | DeFi Protocols  | Interacción con Blend o Defindex para generar Social Yield
                                                                             que neutralice costos operativos |
.
2. El "Concepto de Evento" Programable
Cada emergencia se gestiona como un objeto financiero independiente en la red Stellar para evitar la contaminación de fondos
:
Aislamiento de Cuentas: Cada evento tiene una cuenta específica en Stellar protegida por Multifirma (Ed25519), exigiendo firmas conjuntas de VACA, la Municipalidad y un Auditor Externo para la liberación de fondos de gran escala
.
Tokenización de Ayuda: Además de USDC, se emiten activos específicos (ej. ITEM-AGUA, VOUCHER-HABITACION) que garantizan que el capital se gaste únicamente en insumos validados
.
3. Riel de Distribución: Claimable Balances
VACA utiliza la primitiva nativa de Saldos Reclamables (Claimable Balances) para resolver la logística de entrega de fondos
:
Orden de Pago: Basado en el catastro offline-first, el smart contract emite una instrucción inmutable.
Reserva On-chain: El dinero (USDC) queda "reservado" técnicamente para un ID específico (RUT/Wallet) en la blockchain
.
Reclamo Soberano: El beneficiario se autentica en la Cartera Sozu (usando Passkeys) y reclama su ayuda directamente a su CuentaRUT, eliminando la necesidad de que la fundación gestione la custodia física del dinero
.
4. Social Yield: El Multiplicador de Impacto
El protocolo implementa un motor de eficiencia financiera para que la solidaridad sea autosustentable
:
Neutralización de Comisiones: Los fondos en tránsito se colocan automáticamente en protocolos de liquidez para generar rendimiento (aprox. 8% APY). Este interés cubre el costo del off-ramp (ej. fee de $1 USD), asegurando que el damnificado reciba el 100% de la donación original
.
Auditoría de Rendimiento: Vaquita Insights proporciona transparencia total sobre cómo los intereses generados financiaron kits adicionales o costos logísticos
.
5. Privacidad y Transparencia Radical
Merkle Proofs para Ley 19.628: El sistema utiliza pruebas criptográficas de Merkle para validar que un usuario es un beneficiario legítimo (ej. validado por el Hogar de Cristo o SENAPRED) sin publicar sus datos personales en la blockchain, cumpliendo con la Ley de Protección de la Vida Privada
.
Proof of Aid (NFT): Al completarse la entrega, se emite un certificado inmutable al donante con el hash de la transacción y evidencia del impacto (IPFS), restaurando la confianza sistémica
.
Resultado: Una infraestructura donde la tecnología garantiza la administración prudente del patrimonio y la entrega íntegra de la ayuda, protegiendo el deber fiduciario de las instituciones aliadas
.