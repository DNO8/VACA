# Visión Vaquita — incidentes verificados como destino de donaciones

Documento de visión (roadmap post-Shipaton). No es parte del alcance del
release del 30 de septiembre; registra el diseño de producto acordado y la
reconciliación con el handoff SWE-1.7.

## Reconciliación con el handoff

`00-swe-1.7-handoff.md` retiró del modelo activo: *"Stellar-based aid
distribution, Claimable Balances, Social Yield, tokenization, or Proof of
Aid"*. Vaquita **no** reintroduce esos mecanismos:

- No hay elegibilidad estatal ni "Proof of Aid" on-chain.
- No hay Claimable Balances ni tokenización.
- El alcance Stellar sigue siendo la wallet testnet aislada; Vaquita usa la
  wallet como *cuenta receptora*, no como sistema de ayuda automática.
- La donación es una relación donante→receptor; VACA aporta verificación
  y visibilidad, no custodia ni distribución.

## Flujo de producto

### Escalera de confianza de un incidente

| Estado | Significado | Quién lo decide |
| --- | --- | --- |
| Señal registrada | Bundle entregado, recibo verificado | El dispositivo emisor |
| Lucero (web) | Visible en el mapa, no apto para donaciones | Automático al existir señal |
| Vaquita Comunitaria | Donaciones habilitadas por voto comunitario | Usuarios web con wallet, bajo su propia responsabilidad |
| Vaquita (verificada) | Curada por VACA: verificación completa, apta para donaciones | Operación VACA (gobernadoras/fundaciones aliadas) |

### App mobile

- Nueva pestaña **Vaquita** en el shell cuando un incidente del usuario es
  promovido a fase de donaciones.
- Acceso condicionado a wallet activada; si no existe, se guía al usuario
  con un tour de activación (la wallet hoy es testnet).
- Rol del dispositivo: **receptor** — ver su incidente promovido y el
  estado de la recaudación. No se dona desde la app.

### Web

- Mapa sin sectores coloreados: solo puntos georreferenciados emitidos
  por la app mobile.
- **Orbes brillantes** = Vaquitas (donaciones habilitadas).
- **Luceros** en los colores de la categoría = señales visibles no
  aprobadas.
- Usuarios con wallet pueden votar para elevar un lucero a Vaquita
  Comunitaria.
- Dos vistas conmutables: globo (existente en el prototipo visual) y
  panel de CARDS; ambas con filtros país → región → provincia/comuna.
- Navegación progresiva: país → región → provincia/comuna, donde se ven
  los orbes y luceros del sector.
- Donaciones de mercadería (bienes físicos) habilitadas por
  sector/región: la geolocalización del donante lo acerca a puntos
  cercanos.

## Problemas abiertos de diseño

- **Resistencia Sybil del voto**: 1 wallet = 1 voto es farmeable.
  Candidatos: voto con KYC, ponderado por reputación/antigüedad de
  wallet, o costo por voto.
- **Canal servidor→dispositivo**: notificar "tu incidente fue promovido"
  requiere push (FCM) o polling — no existe hoy; la app solo empuja
  datos.
- **Seguridad de ubicación pública**: coordenadas exactas de emergencias
  en un mapa público son riesgo — probablemente se necesite fuzzing a
  nivel comuna/provincia, con precisión solo para el receptor verificado.
- **Marco legal**: fondos donados cruzan Ley de Donaciones (Chile) y AML
  transfronterizo; mantener framing testnet hasta revisión legal.
- **Curaduría "aprobado por VACA"**: implica un flujo operativo humano
  (quién revisa, SLA, criterios), no solo código.
