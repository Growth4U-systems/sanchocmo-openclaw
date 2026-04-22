# Visual Identity Snapshot — SanchoCMO

> Generado: 2026-03-08 | Modo: Quick (URL Analysis) | Aprobado por: Martin (martinfpm)
> Dirección: **Sancho Futurista Light** — SaaS moderno con personaje icónico

---

## Mode Tracking

| Campo | Valor |
|-------|-------|
| `mode_completed` | quick |
| `quick_path` | url_analysis |
| `source_materials` | sanchocmo.ai (live), código CSS extraído |
| `generaciones_usadas` | 6/10 |

---

## Visual Snapshot

### 3 Adjetivos Visuales

1. **Limpio** — White space generoso, layout respirado, sin ruido visual
2. **Cálido** — Personalidad humana vía personaje e ilustración, no frío-corporativo
3. **Moderno** — Estética SaaS premium (referentes: Notion, Linear, Vercel)

### Paleta de Colores

| Rol | Color | Hex | Uso |
|-----|-------|-----|-----|
| **Background** | Blanco / Gris claro | `#FFFFFF` / `#F5F5F7` | Fondo principal, cards |
| **Text Primary** | Charcoal | `#1A1A2E` | Headlines, body text |
| **Text Secondary** | Gris medio | `#6B6B70` | Subtítulos, descripciones (WCAG AA 5.2:1 ✅) |
| **Accent / CTA** | Rust Orange | `#C45D35` | Botones primarios, links, acentos |
| **Accent Hover** | Rust Dark | `#A34A28` | Hover states |
| **Accent Light** | Rust Light | `#D4734F` | Backgrounds sutiles, badges |
| **Info / Data** | Steel Blue | `#2C5F7C` | Secciones de metodología, datos, gráficas |
| **Success** | Green | `#34C759` | Indicadores positivos |
| **Destructive** | Red | `#FF3B30` | Errores, alertas |

**Cambio vs web actual:** Se elimina el parchment (#F5F0E6), beige (#E8DCC8), navy dominante (#1E3A5F), yellow (#F2C94C). Se añade Steel Blue (#2C5F7C) para "rigor/datos". El rust se mantiene pero solo como acento, no como tono dominante.

**Justificación:** La paleta cálida/parchment comunicaba "antiguo" según el cliente. El cambio a blanco + charcoal + rust-acento alinea con el posicionamiento tech/IA manteniendo calidez vía el personaje ilustrado.

### Tipografía

| Rol | Font | Weights | Fuente |
|-----|------|---------|--------|
| **Headlines** | Inter (o Geist Sans) | 600, 700 | Nueva — reemplaza Bangers + Playfair |
| **Body** | Inter (o Geist Sans) | 400, 500 | Nueva — reemplaza Source Sans 3 |
| **Mono / Code** | Geist Mono (o JetBrains Mono) | 400 | Nueva — para snippets CLI |
| **Logo** | Custom / Inter 700 | 700 | Simplificación del logo mark |

**Cambio vs web actual:** Se eliminan Bangers (demasiado "comic"), Playfair Display (demasiado "literario"), Comic Neue (redundante). Se unifica en una sola familia sans-serif moderna con variantes de peso.

**Justificación:** Una sola familia tipográfica = consistencia, carga más rápida, más fácil de mantener. Inter/Geist son las tipografías de referencia en el ecosistema SaaS moderno.

### Estilo de Imagery

| Campo | Valor |
|-------|-------|
| **Tipo** | Ilustración (personaje) + UI limpio |
| **Mood** | Cercano, competente, guía confiable |
| **Estilo ilustración** | Flat/semi-realista, línea limpia, colores cálidos. Referencia: ilustraciones Notion/Shopify |
| **Personaje principal** | Sancho Panza modernizado: rechoncho, bonachón, barba, vestimenta casual tech (chaleco/hoodie), con tablet/dashboards |
| **Sidekick** | Burrito tech estilizado (collar con "S", diseño geométrico/flat) |
| **Fotografía** | No se usa. Todo ilustración para coherencia |

### Lite Visual World (5 objetos)

1. **Sancho** — Personaje principal. Rechoncho, barba, ropa casual tech, tablet con métricas
2. **Burrito tech** — Sidekick. Geométrico, collar LED con "S". Lealtad + guiño literario
3. **Dashboards/métricas flotantes** — Hologramas, gráficas, funnels. Contexto IA/data
4. **Molino de viento** — Solo como easter egg (favicon, loading, 404). Nunca protagonista
5. **Elementos UI** — Cards, badges, botones. El producto como parte del mundo visual

### Aesthetic General

SaaS moderno premium con un personaje icónico como diferenciador. El entorno visual dice "somos tecnología seria" (white space, tipografía limpia, cards minimalistas). El personaje dice "pero con alma" (Sancho rechoncho, burrito, calidez). La narrativa quijotesca vive en el copy y en easter eggs visuales, no en la estética general.

**Referentes:** Notion (limpieza + ilustración), Linear (UI moderna), Mailchimp (personaje dentro de SaaS), Vercel (tipografía + dark/light).

---

## Design Tokens (Lite)

```json
{
  "colors": {
    "background": "#FFFFFF",
    "surface": "#F5F5F7",
    "text-primary": "#1A1A2E",
    "text-secondary": "#6B6B70",
    "accent": "#C45D35",
    "accent-hover": "#A34A28",
    "accent-light": "#D4734F",
    "info": "#2C5F7C",
    "success": "#34C759",
    "destructive": "#FF3B30",
    "border": "#E2E2E7"
  },
  "typography": {
    "family-sans": "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    "family-mono": "Geist Mono, JetBrains Mono, monospace",
    "weight-normal": 400,
    "weight-medium": 500,
    "weight-semibold": 600,
    "weight-bold": 700
  },
  "spacing": {
    "unit": "0.25rem",
    "radius-sm": "6px",
    "radius-md": "8px",
    "radius-lg": "12px",
    "radius-xl": "16px"
  },
  "shadows": {
    "sm": "0px 1px 3px rgba(0,0,0,0.08)",
    "md": "0px 4px 12px rgba(0,0,0,0.08)",
    "lg": "0px 8px 24px rgba(0,0,0,0.1)"
  },
  "borders": {
    "default": "1px solid #E2E2E7",
    "accent": "2px solid #C45D35"
  }
}
```

---

## Cambios vs Estado Actual (sanchocmo.ai)

| Elemento | Actual | Nuevo | Razón |
|----------|--------|-------|-------|
| Fondo | Parchment (#F5F0E6) | Blanco (#FFFFFF) | Eliminar sensación "antiguo" |
| Headlines | Bangers (comic) | Inter 700 (modern) | Credibilidad tech |
| Body | Source Sans 3 | Inter 400-500 | Unificar familia |
| Serif | Playfair Display | Eliminada | Simplificar sistema |
| Bordes | 3-4px gruesos everywhere | 1px default, 2px solo accent | Menos ruido |
| Sombras | Hard offset (comic) | Soft shadows sutiles | Modernizar |
| Texturas | Halftone + speed lines | Ninguna | Limpiar |
| Color acento | Rust dominante | Rust solo CTAs | Focalizar |
| Nuevo color | — | Steel Blue (#2C5F7C) | Rigor/datos |
| Personaje | Medieval / cómic | Moderno / flat illustration | Coherencia tech |
| Burro | No presente | Sidekick tech estilizado | Identidad Sancho |

---

## Easter Eggs Quijotescos (para copy + micro-interacciones)

| Elemento | Dónde | Ejecución |
|----------|-------|-----------|
| "Todo Quijote necesita su Sancho" | Tagline hero, About page | Copy |
| Capítulos | Onboarding steps | "Capítulo I: El Encuentro" |
| Molino de viento | Favicon, loading spinner, 404 | Icono estilizado |
| Naming features | Feature names | "Escudero", "Encomienda" |
| Burro | Logo mark secundario | Icono geométrico |

---

## Confidence & Gaps

| Campo | Valor |
|-------|-------|
| **Confidence** | Medium-High |
| **Justificación** | Dirección validada por cliente. Sin brandbook previo — todo extraído de web + conversación. Sin brand-voice formal aún. |

### Gaps para Full Mode
1. ~~**Brand Voice**~~ → ✅ Completado (Layer 5)
2. **Personaje definitivo** → Necesita ilustrador profesional (Dribbble, ~€800). Brief preparado abajo.
3. **Design system completo** → Tokens lite aquí. Full mode genera componentes, UI kit, child skills
4. **Adaptaciones por ECP** → Full mode mapea variaciones visuales por cada ECP
5. **Dark mode** → Pendiente Phase 2. Se define cuando se toque landing/app. Gen 4 como referencia de dirección.

### Siguiente Paso Inmediato
**Landing page rediseñada** → Ya tenemos posicionamiento, copy, pricing, visual identity. Todo listo para ejecutar.

### Brief Ilustrador (Dribbble)

**Proyecto:** Character design para SanchoCMO — AI-powered CMO platform
**Entregables:**
- Personaje principal: "Sancho" — hombre rechoncho, bonachón, barba, ropa casual tech (chaleco/hoodie). 5-6 poses (hero, explicando, celebrando, pensando, con tablet, señalando)
- Sidekick: "Burrito tech" — burro estilizado geométrico/flat con collar LED con "S". 3-4 poses
- Formatos: SVG + PNG con fondo transparente
- Estilo: Flat/semi-realista, línea limpia. Referentes: ilustraciones Notion, Shopify, Linear
- Paleta: charcoal (#1A1A2E), rust (#C45D35), blanco, gris claro. Toques cálidos
**Contexto:** Producto SaaS de IA para marketing. El personaje es Sancho Panza (Don Quijote) modernizado para 2026. Debe sentirse tech y cercano a la vez.
**Budget estimado:** €600-1.000
**Timeline:** 2-3 semanas

---

## Assets Generados

| Archivo | Descripción |
|---------|-------------|
| `assets/2026-03-08-current-style.png` | [Gen 1/10] Estilo actual exagerado (referencia) |
| `assets/2026-03-08-refined-comic.png` | [Gen 2/10] Cómic Refinado (descartado) |
| `assets/2026-03-08-sancho-futurista-light.png` | [Gen 3/10] Sancho Futurista Light v1 |
| `assets/2026-03-08-sancho-futurista-dark.png` | [Gen 4/10] Sancho Futurista Dark (referencia) |
| `assets/2026-03-08-sancho-futurista-final.png` | [Gen 5/10] Sancho Futurista con copy |
| `assets/2026-03-08-sancho-futurista-v2.png` | [Gen 6/10] ✅ **Aprobado** — Sancho rechoncho + burrito tech |

---

<!-- Self-QA: PASS | 2026-03-08 | items: 11✅ 2⚠️ 0❌ | gen: 6/10 | QA Rocinante: 4/4 resueltos | ⚠️: personaje necesita ilustrador (brief listo), dark mode Phase 2 -->
