Infraestructura Financiera: Stellar & Soroban
VACA utiliza la red Stellar y su plataforma de contratos inteligentes Soroban como la autopista de ejecución para la resiliencia humanitaria. La elección tecnológica se basa en la capacidad de Stellar para manejar microtransacciones globales con costos insignificantes y la potencia de Soroban para programar lógica social compleja de forma non-custodial
.
1. Primitivas Nativas de Stellar
VACA aprovecha las funciones  integradas en el protocolo de Stellar para maximizar la seguridad y reducir el área de ataque de los contratos inteligentes:
Claimable Balances (Saldos Reclamables): Es la herramienta core para la distribución. Permite "reservar" fondos (USDC) en la blockchain para un beneficiario específico (identificado por su RUT/Wallet) sin que la fundación mantenga la custodia activa. El beneficiario puede reclamar su ayuda días después, incluso si no tenía una wallet en el momento del desastre
.
Cuentas Multifirma (Ed25519): Cada "Evento de Emergencia" opera con una cuenta dedicada que requiere firmas conjuntas (ej. VACA + Municipalidad + Auditor Externo) para la liberación de fondos de gran escala, eliminando puntos únicos de falla
.
Asset Control: Permite la creación de activos específicos para la emergencia (ej. VOUCHER-AGUA) con restricciones de transferencia, asegurando que la ayuda solo se canjee en comercios locales validados por el sistema
.
2. Capa de Inteligencia en Soroban (Smart Contracts)
Los contratos inteligentes de VACA, desarrollados en Rust, gestionan la lógica de negocio y validación de impacto:
Foundation Adapter (El Oráculo de Verdad): Actúa como el puente entre las bases de datos institucionales (Hogar de Cristo, SENAPRED) y la blockchain. Utiliza Merkle Proofs para validar que un damnificado pertenece a un catastro oficial sin exponer datos sensibles públicamente, garantizando el cumplimiento de la Ley 19.628 de Protección de la Vida Privada
.
Lógica de Niveles de Confianza (Trust Scoring): Un contrato que procesa los reportes sincronizados desde la App Offline-First. Ajusta dinámicamente la asignación de fondos según el consenso comunitario; a mayor número de reportes coincidentes sobre un daño, mayor es el confidence_level y el monto desbloqueado automáticamente
.
3. Simbiosis Técnica: VACA + Sozu Pay
La arquitectura divide las responsabilidades de código para blindar legalmente a las fundaciones bajo la Ley Fintec (21.521):
| Responsabilidad | Contrato / Riel | Función Técnica |
|-----------------|-----------------|------------------|
| VACA (Inteligencia) | vaca_validation.wasm | Valida el "quién" y "cuánto" mediante Merkle Proofs y reglas de priorización |
| Sozu (Tesorería) | sozu_yield.wasm | Conecta los fondos en tránsito con protocolos Defindex o Blend |
| Sozu (Rieles) | SEP-24 / SEP-6 | Ejecuta el on-ramp (CLP a USDC) y off-ramp hacia la CuentaRUT de BancoEstado |

4. Social Yield: Eficiencia Operativa DeFi
VACA no utiliza DeFi para la especulación, sino como un motor de autosustentabilidad operativa:
Neutralización de comisiones: El rendimiento generado por las donaciones en tránsito (aprox. 8% APY) se programa en Soroban para cubrir los costos de dispersión (ej. el fee de $1 USD del off-ramp de Koywe)
.
Ayuda Íntegra: Esto permite que si un donante aporta $10.000, lleguen exactamente $10.000 al beneficiario, rompiendo la barrera de las comisiones bancarias tradicionales
.
5. Proof of Aid (Certificados de Impacto NFT)
Al completarse una distribución, el protocolo emite automáticamente un activo no fungible (NFT) al donante. Este token contiene el hash inmutable de la transacción y evidencia fotográfica del impacto (almacenada en IPFS), permitiendo una auditoría pública y emocional en tiempo real
.
Resultado: Gracias a Stellar, VACA se define como una infraestructura tecnológica no custodia, protegiendo el deber fiduciario de los directores de las fundaciones al delegar la ejecución financiera a reglas programadas e inalterables en la blockchain