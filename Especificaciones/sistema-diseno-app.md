# Sistema de Diseño — App Mobile VACA

Este documento traduce el brandboard **Clasicismo Cívico Celadón** a tokens, componentes y reglas para la app Flutter de VACA. La interfaz debe comunicar calma, servicio público y confianza institucional sin sacrificar velocidad, legibilidad ni accesibilidad durante una emergencia.

> **Fuente visual:** `Markdowns/brandboard.md` e imágenes de `estetica/`.
> **Referencias rectoras:** `estetica/estetica-5.jpg` y `estetica/estetica-3.jpg`.
> **Restricciones no negociables:** contraste verificable, targets táctiles de al menos 48×48 dp, escalado de texto hasta 200%, uso comprensible bajo estrés y rendimiento adecuado en Android de gama baja.

---

## 1. Principio rector: la arquitectura organiza

La arquitectura clásica no se aplica como adorno literal. Se traduce en proporción, ritmo, jerarquía y estabilidad.

| | **Modo Operación** | **Modo Institucional** |
| --- | --- | --- |
| **Dónde** | Alertas, captura, mapas, reportes, sincronización y ayuda. | Splash, onboarding, sitio de la fundación, certificados y cierres. |
| **Objetivo** | Acción inmediata, legibilidad y cero ambigüedad. | Confianza, permanencia, cuidado y rendición de cuentas. |
| **Composición** | Orden dórico: simple, robusto y repetible. | Orden jónico: simétrico, editorial y moderadamente ceremonial. |
| **Fondo** | Superficies sólidas celadón claro, marfil o verde profundo. | Gradientes celadón, piedra monocromática y textura tenue. |
| **Ornamentación** | Mínima y fuera del contenido crítico. | Pórticos, marcos, medallones y líneas de cornisa abstractas. |
| **Movimiento** | Sólo feedback funcional. | Transiciones lentas y contenidas cuando no dificulten la tarea. |

> **Regla de oro:** la estructura clásica debe ayudar a comprender. Si un recurso arquitectónico demora una acción o reduce contraste, se elimina.

---

## 2. Tokens de color

### 2.1 Paleta celadón

| Token | Hex de referencia | Rol |
| --- | --- | --- |
| `celadon/50` | `#F3F7F3` | Fondo operativo claro. |
| `celadon/100` | `#E2ECE5` | Superficie secundaria y selección suave. |
| `celadon/300` | `#B8D9C6` | Marca, ilustración y bloques comunitarios. |
| `celadon/500` | `#7EAD91` | Acentos, gráficos y controles secundarios. |
| `celadon/700` | `#456B58` | Acción primaria, iconos y encabezados. |
| `celadon/900` | `#1F3B30` | Fondo institucional oscuro y navegación. |

### 2.2 Neutrales minerales

| Token | Hex de referencia | Rol |
| --- | --- | --- |
| `ivory/50` | `#F8F7F1` | Formularios y superficies de descanso. |
| `stone/100` | `#E7E7DF` | Divisores y fondos editoriales. |
| `stone/300` | `#CACDC5` | Bordes y estados deshabilitados. |
| `stone/600` | `#727970` | Texto secundario. |
| `ink/900` | `#17251F` | Texto principal sobre claro. |
| `white` | `#FFFFFF` | Texto sobre fondos profundos. |
| `bronze/500` | `#9C8058` | Sello o detalle ceremonial de uso limitado. |

### 2.3 Estados funcionales

Los estados críticos mantienen colores propios. No deben reinterpretarse sólo para conservar la monocromía.

| Token | Hex de referencia | Uso |
| --- | --- | --- |
| `semantic/action` | `#456B58` | Acción primaria normal. |
| `semantic/success` | `#35644E` | Confirmación y entrega correcta. |
| `semantic/warning` | `#A86F32` | Atención y riesgo no inmediato. |
| `semantic/danger` | `#C44747` | SOS, error grave y acción destructiva. |
| `semantic/info` | `#376A7A` | Conectividad e información neutral. |

Estos valores son puntos de partida. Cada combinación de foreground/background debe validarse con WCAG antes de considerarse definitiva. El estado siempre se expresa además con texto e icono.

### 2.4 Prioridad operativa

| Prioridad | Tratamiento |
| --- | --- |
| P0 · Vida en riesgo | Rojo danger, icono inequívoco y posición dominante. |
| P1 · Emergencia médica | Rojo oscuro o warning reforzado, según validación de contraste. |
| P2 · Personas/ubicación | Azul petróleo. |
| P3 · Infraestructura | Ocre. |
| P4 · Coordinación | Celadón 700. |
| P5 · Multimedia | Gris mineral. |

La prioridad no se comunica mediante ornamentación arquitectónica ni mediante color aislado.

---

## 3. Tipografía

**Familias actuales:** Anderson Grotesk para marca e interfaz; JetBrains Mono para identificadores, coordenadas, timestamps y hashes.

| Rol | Fuente/peso | Tamaño | Altura de línea | Uso |
| --- | --- | ---: | ---: | --- |
| `display` | Anderson Grotesk 800 | 34 | 40 | Splash y piezas institucionales. |
| `h1` | Anderson Grotesk 700 | 28 | 34 | Título de pantalla. |
| `h2` | Anderson Grotesk 700 | 22 | 28 | Sección. |
| `h3` | Anderson Grotesk 700 | 18 | 24 | Subsección o tarjeta. |
| `body-lg` | Anderson Grotesk 400 | 16 | 24 | Labels y contenido principal. |
| `body` | Anderson Grotesk 400 | 14 | 20 | Cuerpo secundario. |
| `caption` | Anderson Grotesk 700 | 12 | 16 | Estado y metadata breve. |
| `data` | JetBrains Mono 400 | 14 | 20 | Datos técnicos. |
| `data-sm` | JetBrains Mono 400 | 12 | 16 | Metadata compacta. |

Reglas:

- No fijar `textScaleFactor` ni bloquear el escalado del sistema.
- Evitar alturas fijas alrededor de texto.
- No usar tipografías pseudo-griegas ni ornamentales en la app.
- La identidad clásica se logra con composición y proporción, no sacrificando legibilidad.

---

## 4. Espaciado, forma y elevación

- **Grid base:** 4 dp. Escala: `4, 8, 12, 16, 20, 24, 32, 48`.
- **Padding de pantalla:** 16 dp en operación; 24 dp en pantallas institucionales.
- **Targets táctiles:** mínimo 48×48 dp y separación mínima de 8 dp.
- **Radios:** `sm 4`, `md 8`, `lg 12`, `full` sólo para badges o indicadores compactos.
- **Bordes:** 1 dp mineral; 2 dp en foco o selección.
- **Elevación:** mínima. Se prioriza jerarquía por superficie, borde y espaciado antes que sombra.
- **Ritmo de columna:** las grillas pueden usar divisiones verticales regulares inspiradas en una columnata, sin dibujar columnas completas.
- **Basamento:** barras inferiores, resúmenes y acciones persistentes pueden usar una base visual sólida que sugiera soporte.

---

## 5. Lenguaje visual

| Elemento | Traducción digital | Aplicación |
| --- | --- | --- |
| **Pórtico cívico** | Marco de entrada con dintel y dos ejes verticales abstractos. | Splash, onboarding y portal institucional. |
| **Orden dórico** | Grilla firme, bordes rectos, repetición estable. | Pantallas operativas y listas. |
| **Orden jónico** | Curvas pequeñas, medallón y marco editorial. | Certificados y momentos institucionales. |
| **Columna/nodo** | Segmento vertical que representa un actor conectado. | Estado de red, confianza y etapas de proceso. |
| **Basamento** | Superficie de apoyo visual para acciones. | Navegación, barra de acción y resúmenes. |
| **Trama territorial** | Líneas topográficas o patrones de baja opacidad. | Mapas y propagación de señales. |
| **Sello VACA** | Marca de confirmación y trazabilidad. | Cierre de flujo, documentos y comprobantes. |

Las referencias grecorromanas deben sentirse cívicas, no imperiales ni elitistas. La persona afectada sigue siendo el centro de la experiencia.

---

## 6. Gradientes, texturas e imágenes

### 6.1 Referencias

- `estetica/estetica-5.jpg`: composición institucional principal, monocromía, estatuaria y profundidad.
- `estetica/estetica-3.jpg`: ritmo vertical y solidez de columnas.
- `estetica/estetica-4.jpg`: continuidad, curva y transición.
- `estetica/estetica-2.jpg`: abstracción arquitectónica contemporánea.
- `estetica/gradiente*`: fondos verticales para pantallas de marca.
- `estetica/textura*`: trama editorial y territorial.

### 6.2 Uso de gradientes

- Permitidos en splash, onboarding, confirmaciones y encabezados institucionales.
- Deben cubrirse con una superficie sólida o scrim cuando soporten texto.
- No se utilizan detrás de botones SOS, formularios densos ni tablas.
- Deben poder desactivarse sin perder significado.

### 6.3 Uso de texturas

- Opacidad baja y sin frecuencias visuales que dificulten lectura.
- Preferentemente como asset estático optimizado, no shader por frame.
- Permitidas en mapas, certificados y cabeceras.
- Prohibidas detrás de texto pequeño, controles y datos críticos.

### 6.4 Tratamiento de imagen

- Monocromía celadón o piedra.
- Grano contenido, evitando degradar evidencia o fotografías operativas.
- Las fotos de evidencia nunca reciben filtros que alteren su interpretación.
- Arquitectura y estatuaria pertenecen a piezas de marca; no sustituyen iconos funcionales.

---

## 7. Componentes

### 7.1 Botones

- **Primario:** fondo `celadon/700`, texto blanco, radio `md`, altura mínima 52 dp.
- **Secundario:** fondo transparente, borde `celadon/700`, texto `celadon/900`.
- **Terciario:** texto `celadon/700`, sin superficie decorativa.
- **SOS:** fondo `semantic/danger`, texto blanco, icono y etiqueta explícita; nunca usa bronce ni celadón decorativo.
- **Destructivo:** fondo o borde danger según severidad.
- Todos incluyen estados pressed, disabled, focus y loading sin depender sólo de opacidad.

### 7.2 Campos de reporte

- Label visible sobre el control.
- Altura mínima 48 dp.
- Fondo marfil o celadón 50; borde stone 300; foco celadón 700 de 2 dp.
- Selectores de opciones grandes y legibles; evitar dropdowns pequeños.
- Errores con texto, icono y borde danger.
- Datos técnicos con JetBrains Mono.

### 7.3 Tarjeta de reporte o incidente

- Superficie sólida, radio `md`, borde mineral y jerarquía vertical.
- Una línea lateral puede actuar como “columna” abstracta para indicar prioridad o estado.
- Muestra categoría, ubicación comprensible, timestamp, sincronización y confianza.
- No utiliza textura ni fotografía como fondo.

### 7.4 Indicadores de confianza

- Representación mediante segmentos verticales o niveles estructurados.
- Cada nivel incluye nombre y explicación; no se expresa sólo con color.
- Las animaciones son breves y se ejecutan sólo cuando cambia el estado.

### 7.5 Banner de conectividad

| Estado | Color | Texto base |
| --- | --- | --- |
| Offline | `celadon/900` | “Sin conexión · guardando local” |
| Online | `semantic/info` | “Conectado” |
| Sincronizando | `celadon/700` | “Sincronizando N reportes…” |
| Éxito | `semantic/success` | “N reportes sincronizados” |
| Error | `semantic/danger` | “Error · reintentar” |

El estado offline nunca se oculta: es una condición prevista, no una falla excepcional.

### 7.6 Badges y chips

- Forma compacta, borde visible y contraste verificado.
- Icono más texto para estados críticos.
- El bronce se reserva para sellos institucionales y no representa éxito, prioridad ni validación.

### 7.7 Barra superior

- Superficie sólida `celadon/900` o `ivory/50`.
- Sin glassmorphism.
- Puede incorporar una línea inferior inspirada en una cornisa, de máximo 2 dp.
- Acciones con target mínimo 48 dp.

### 7.8 Estados vacíos, carga y error

- Ilustraciones lineales simples: pórtico, columna/nodo o trama territorial.
- Mensaje breve y acción recomendada.
- Error y SOS nunca usan estatuaria o decoración ceremonial.
- Loading funcional y respetuoso de reduce-motion.

### 7.9 Wallet Stellar testnet

- Se accede sólo desde Identidad y datos y nunca desde una señal, recibo o flujo de ayuda.
- La cabecera y el balance muestran siempre la etiqueta `TESTNET`.
- El bronce puede identificar el entorno de demostración, pero nunca éxito, fondos reales o elegibilidad.
- Los estados sin cuenta, sin fondos, financiando, financiada y error incluyen texto e icono.
- La clave pública usa JetBrains Mono y puede copiarse; la clave secreta no se muestra en la interfaz.
- Debe incluir de forma persistente: “XLM de prueba, sin valor real y sin relación con acceso a ayuda”.

---

## 8. Iconografía

- Set lineal de 24 dp, grosor consistente y geometría sobria.
- Esquinas moderadas; evitar estética caricaturesca o arqueológica literal.
- La arquitectura puede aparecer en iconos institucionales como pórtico, edificio cívico o columna simplificada.
- Cámara, ubicación, emergencia médica, infraestructura, conectividad y sincronización conservan símbolos universales.
- Todo icono crítico lleva `semanticLabel`, tooltip cuando corresponda y texto visible.

---

## 9. Movimiento

- Duración normal: 150–250 ms.
- Curvas suaves, sin rebotes decorativos.
- Sin glow, glitch, pulsos neón ni fondos en movimiento permanente.
- SOS puede usar un pulso funcional moderado si no afecta accesibilidad.
- Respetar `MediaQuery.disableAnimations` y preferencias de reduce-motion.

---

## 10. Implementación en Flutter

- Centralizar tokens en `lib/core/theme/` mediante `ThemeExtension`.
- Mantener temas claro y oscuro operativos; las piezas institucionales se construyen con componentes específicos.
- Declarar fuentes localmente para funcionamiento offline.
- Preparar assets verticales en resoluciones optimizadas y con alternativas sin textura.
- Limitar blur, sombras, transparencias y composición costosa en dispositivos de gama baja.
- Las fotografías operativas se almacenan sin filtros visuales destructivos.
- Verificar contraste, escalado 200%, TalkBack, targets táctiles y rendimiento en dispositivo real.

La implementación actual todavía conserva tokens de la identidad anterior. La migración de código debe realizarse en una tarea separada después de aprobar esta especificación.

---

## 11. Expresión organizacional

### Fundación CAMADA

Utiliza la expresión institucional completa: celadón, piedra, pórticos, marcos, sellos y fotografía editorial. Debe transmitir misión pública, cercanía y responsabilidad.

### Empresa de software

Comparte tokens y precisión estructural, pero reduce estatuaria y ornamento. Su expresión enfatiza infraestructura, seguridad, mantenimiento y capacidad técnica. No reemplaza visualmente a la Fundación CAMADA como titular proyectado del producto VACA.

---

## 12. Elementos eliminados

La interfaz y la marca dejan de utilizar como dirección:

- Y2K futurista.
- Lenguaje “Hard Grid meets Soft Haze”.
- Rosa neón y glow decorativo.
- Glitch.
- Blobs flotantes.
- Estética de club nocturno.
- Glassmorphism dominante.
- Radios excesivamente redondos como recurso general.

---

## 13. Checklist de aceptación

- [ ] La acción principal es identificable inmediatamente bajo estrés.
- [ ] Texto normal y componentes cumplen los contrastes WCAG aplicables.
- [ ] Todos los targets interactivos miden al menos 48×48 dp.
- [ ] El layout funciona con escalado de texto al 200%.
- [ ] Ningún estado depende exclusivamente del color.
- [ ] Gradientes y texturas están fuera del contenido crítico.
- [ ] La app operativa usa una interpretación dórica sobria.
- [ ] Las referencias jónicas se limitan a contextos institucionales.
- [ ] Las fotos de evidencia no tienen filtros que alteren el contenido.
- [ ] Reduce-motion y TalkBack están contemplados.
- [ ] La UI mantiene rendimiento aceptable en Android de gama baja.
- [ ] Fundación CAMADA y empresa se distinguen sin fragmentar la identidad de VACA.
