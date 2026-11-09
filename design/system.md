# VACA mobile design system
Captured from the owned mobile theme, not the unrelated home-root CSS discovery.

## Colors (11 distinct values)
Source: vaca_app/lib/core/theme/app_colors.dart; roles: app_theme.dart.
| Token | Value | Usage |
|---|---|---|
| celadon50 | #F3F7F3 | Light scaffold |
| ivory | #F8F7F1 | Light surface |
| ink | #17251F | Light primary text |
| stone600 | #59635D | Light secondary text |
| celadon700 | #456B58 | Primary action |
| white | #FFFFFF | On-primary/dark text |
| stone300 | #CACDC5 | Light outline |
| celadon100 | #E2ECE5 | Light container |
| celadon900 | #1F3B30 | Dark scaffold/container |
| neutral800 | #29473A | Dark surface |
| celadon300 | #B8D9C6 | Dark secondary text |

## Typography (8 roles, 2 source families)
Source: vaca_app/lib/core/theme/app_typography.dart.
SpaceGrotesk for UI; JetBrainsMono for technical references. Source strings take precedence over historical font comments.
Display 34/40 weight800; h1 28/34 weight700; h2 22/28 weight700; h3 18/24 weight700; bodyLg16/24 weight400; body14/20 weight400; caption12/16 weight700; data14/20 weight400 (dataSm12/16).
Self-contained HTML previews use system-ui and monospace only; these are explicit offline preview fallbacks, not replacement app font tokens.

## Spacing (8 values)
Source: vaca_app/lib/core/theme/app_spacing.dart.
xxs4, xs8, sm12, md16, lg20, xl24, xxl32, xxxl48 logical pixels. Minimum touch target48.

## Radius (4 values)
Source: vaca_app/lib/core/theme/app_radius.dart.
sm8 inputs/chips; md12 cards/buttons; lg20 brand sheets; full999 pill.

## Components and elevation
Source: vaca_app/lib/core/theme/app_theme.dart.
Material3, zero-elevation cards and app bars, outlined cards, filled outlined inputs. Primary/outlined button minimum height52; text buttons48. Keep theme contrast roles in both brightness modes; no status implied by green decoration alone.
Proposal-specific layout (not existing brand tokens): centered reading column up to760 logical pixels, content-driven wrapping, stacked actions with finite available width. Do not clamp accessibility text scaling or truncate public references/financial values.

## Preview self-check
All artboard colors come from the 11 values above. Fonts are only the documented offline fallbacks. No external dependencies, shadows, animations, invented palette or live financial behavior.
