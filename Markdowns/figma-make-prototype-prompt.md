# Prompt para Figma Make — Prototipo VACA

## Cómo usar este prompt

1. Abrí Figma y activá **Figma Make** (pestaña Make / AI en la barra lateral).
2. **Subí los assets de `estetica/` a la biblioteca del archivo** (`Insert > Image` o arrastrando las imágenes al canvas) antes de correr el prompt. Figma Make podrá usarlas como referencia de estilo o fondo.
3. Copiá el bloque de prompt en inglés de abajo, pegalo en el chat de Figma Make y ajustá las dimensiones de frame si querés otro dispositivo.
4. Pedí explícitamente los 3 entregables: flujo de usuario, prototipo de pantallas y diagrama de arquitectura/DTN.

---

## Prompt (copiar y pegar en Figma Make)

```text
Create a complete Figma design file for VACA, an offline-first mobile incident-signaling app for civil emergency coordination. The design must communicate calm institutional trust, speed under stress, and public-service clarity.

Project name: VACA (Vaquita de Ayuda y Coordinación Activa).
Tagline: "La información es el primer alivio. La comunidad es el primer respondedor."

=== 1. DESIGN SYSTEM ===

Visual direction: "Celadon Civic Classicism" — inspired by neoclassical civic architecture, translated into a calm, modern mobile UI. Use classical ideas (portico, column rhythm, base, pediment) as abstract proportion and structure, never literal illustration around functional UI.

Color palette (tokens):
- Background light: #F3F7F3 (celadon/50)
- Surface soft: #E2ECE5 (celadon/100)
- Brand/muted illustration: #B8D9C6 (celadon/300)
- Secondary accent: #7EAD91 (celadon/500)
- Primary action: #456B58 (celadon/700)
- Dark institutional: #1F3B30 (celadon/900)
- Rest/form: #F8F7F1 (ivory/50)
- Dividers: #E7E7DF (stone/100)
- Secondary text: #727970 (stone/600)
- Main text: #17251F (ink/900)
- Bronze seal: #9C8058 (limited ceremonial use)
- Danger/SOS: #C44747
- Warning: #A86F32
- Info: #376A7A
- Success: #35644E

Typography: use a clean geometric sans (Anderson Grotesk) for headings and body; use a monospace font (JetBrains Mono) for coordinates, timestamps, IDs. No Greek or pseudo-ancient fonts in operational UI.

Tone: clear, calm, honest. No fear-inducing language. UI text in neutral professional Spanish. No FIBE branding or government-assessment language.

=== 2. ASSETS ===

Reference images uploaded to this file (use them as style/background reference or color inspiration, not as overlays on top of critical controls):
- estetica-5.jpg: main institutional reference (neoclassical interior, celadon monochrome, symmetry, statues, vertical composition).
- estetica-3.jpg: column rhythm and institutional presence.
- estetica-4.jpg: spatial transitions, stairs and balustrades.
- estetica-2.jpg: bridge between classical architecture and contemporary digital systems.
- gradiente.webp, gradiente-2.jpg, gradiente-3.jpg: vertical atmospheric brand backgrounds for splash/onboarding/confirmations.
- textura.webp, textura-2.jpg, textura-3.jpg: low-opacity editorial textures for maps/certificates/headers.
- mapa.jpg, mapa-2.webp, mapa-3.jpg: territorial/topographic line patterns.
- metalico.jpg, metalico-2.webp: textural relief for institutional moments.

Avoid: Y2K futurism, neon pink, glow effects, glitch, glassmorphism as dominant surface, floating blobs, nightclub aesthetics.

=== 3. USER FLOWS TO DESIGN ===

A. Prepared onboarding
1. Splash with logo and tagline.
2. Emergency disclaimer + privacy notice.
3. Consent acceptance.
4. Account/passkey setup.
5. KYC initiation (only with network).
6. Verified credential confirmation.

B. Unverified emergency path
1. Skip KYC.
2. Acknowledge unverified status.
3. Create a safety signal.

C. Create incident offline
1. Home/dashboard.
2. Select incident category.
3. Capture or confirm location (GPS / manual / unavailable).
4. Enter people count and optional short note.
5. Optional photo capture.
6. Save locally and show savedLocally state.
7. Outbox/delivery status list.

D. Internet delivery
1. Connectivity detected.
2. Outbox with priority, retry and sync status.
3. receivedByServer after authenticated receipt.

E. Update / cancel
1. Open active incident.
2. Add update or cancel event.
3. Show new signed event and pending sync.

F. Account & data
1. Identity status.
2. Delete local data / request account deletion.
3. Confirmation.

=== 4. SCREENS TO PROTOTYPE (mobile, iPhone 14 frame: 390 × 844) ===

For each screen, define a frame of 390 × 844. Use the color tokens above. All touch targets at least 48 × 48 dp. Text scaling must not hide the primary action.

Required screens:
1. Splash
2. Onboarding disclaimer
3. Privacy/consent
4. Identity setup (verified vs unverified path)
5. Home / create signal
6. Category selector (P0–P4 visual priority)
7. Location capture / manual fallback
8. Incident form (people count, short note)
9. Photo capture / attachment
10. Saved locally confirmation
11. Outbox / delivery status
12. Server receipt confirmation
13. Update / cancel incident
14. Identity & data settings

Use clear labels, icons + text for every critical state. Priority must be shown by label, icon and position, not only color.

=== 5. USER FLOW DIAGRAM ===

On a separate page, create a user flow diagram (not a UI frame) showing:
- Entry: install/open.
- Branch: onboarding vs emergency.
- KYC decision (verified / unverified).
- Create signal loop (offline save, photo optional, location).
- Sync loop (Internet / BLE pilot).
- Update/cancel loop.
- Delete data.

Use simple nodes and arrows. Keep it clean and aligned to the column rhythm.

=== 6. SYSTEM ARCHITECTURE / DTN DIAGRAM ===

On a third page, create a clean architecture diagram showing:
- Public reporter mobile app.
- Prepared verified user with opaque signed credential.
- Unverified reporter.
- Relay node (Android pilot, encrypted bundle store-and-forward).
- Municipal pilot gateway.
- Authorized server with receipt.
- Internet path (HTTPS) and BLE path (compact, encrypted).

Show: local persistence, durable outbox, server receipt, no decryption by relays/gateways. Use celadon/mineral palette.

=== 7. RULES ===

- The primary action must be visible without scrolling.
- No exact coordinates shown publicly.
- SOS/primary danger buttons use #C44747, white text, explicit icon + label.
- Operational screens use solid backgrounds; gradients/textures only for splash, onboarding, confirmations and institutional headers.
- No literal Greek columns or statues around buttons, forms or alerts.
- Use rounded corners: sm 4, md 8, lg 12; full only for small badges.
- The app must feel like a civic foundation, not a startup or a game.

Generate the three pages with all screens, components and diagrams. Maintain consistent component names, layer naming and the celadon civic style throughout.
```

---

## Lista rápida de assets a subir

Subí todos los archivos de `estetica/` que tengan sentido como referencia visual. Prioridad:

- `estetica-5.jpg` — referencia rectora de estilo.
- `estetica-3.jpg`, `estetica-4.jpg`, `estetica-2.jpg` — columnas, transiciones, abstracción.
- `gradiente.webp`, `gradiente-2.jpg`, `gradiente-3.jpg` — fondos atmosféricos.
- `textura.webp`, `textura-2.jpg`, `textura-3.jpg` — tramas editoriales.
- `mapa.jpg`, `mapa-2.webp`, `mapa-3.jpg` — texturas territoriales / mapas.
- `metalico.jpg`, `metalico-2.webp` — texturas de relieve.

No subas `logos.png` como referencia de estilo: contiene propuestas antiguas con estética Y2K/neón que la identidad actual descarta.
