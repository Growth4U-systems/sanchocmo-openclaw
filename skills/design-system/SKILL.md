---
name: design-system
description: |
  Crear o actualizar el DESIGN.md (source-of-truth del visual identity del brand).
  Skill propia de Maese Pedro, forkeada de `design-brief` (Open Design) + discovery interactivo
  heredado de `visual-identity` legacy. Genera DESIGN.md siguiendo schema OD de 9 secciones,
  enriquecido con patrones Sancho (logo color rules, social specs por canal, color use semántico,
  illustration discipline, anti-pegote, tamaños mínimos de texto).
  Triggers: "design system", "visual identity", "DESIGN.md", "brand visuals", "look and feel",
  "design tokens", "actualizar paleta", "brand discovery".
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "meta-skill"
  forked_from: "/Users/ragi/open-design/skills/design-brief/SKILL.md"
  inherited_from: "workspace-maese-pedro/skills/visual-identity/SKILL.md"
  version: "1.0"
triggers:
  - "design system"
  - "visual identity"
  - "DESIGN.md"
  - "brand discovery"
  - "look and feel"
  - "actualizar paleta"
  - "design tokens"
od:
  mode: design-system
  platform: desktop
  scenario: planning
  preview:
    type: html
    entry: design-preview.html
    reload: debounce-100
  design_system:
    requires: false
    generates: true
    sections: [visual-theme, color-palette, typography, component-stylings, layout, depth-elevation, dos-and-donts, responsive, agent-prompt-guide, sancho-extensions]
  inputs:
    - name: brief
      type: string
      required: false
      description: "Brief del usuario en lenguaje natural o I-Lang. Si vacío, la skill ejecuta discovery interactivo."
    - name: brand_slug
      type: string
      required: true
      description: "Slug del brand activo. Output va a brand/{slug}/brand-book/visual-identity/DESIGN.md."
    - name: mode
      type: string
      required: false
      default: "auto"
      description: "quick | full | auto. quick=1 ronda discovery, full=3 rondas + child catálogo. auto=detecta según contexto disponible."
  outputs:
    primary: DESIGN.md
    secondary: design-preview.html
  capabilities_required:
    - file_write
    - web_fetch
    - surgical_edit
context_required:
  - brand/{slug}/company-brief/company-brief.current.md
  - brand/{slug}/brand-voice/brand-voice.current.md (si existe)
  - brand/{slug}/go-to-market/positioning/*/*.current.md (si existen)
  - brand/{slug}/brand-book/visual-identity/visual-identity.current.md (si existe — legacy)
  - brand/{slug}/brand-book/visual-identity/design-tokens.json (si existe — legacy, para migración)
context_writes:
  - brand/{slug}/brand-book/visual-identity/DESIGN.md
  - brand/{slug}/brand-book/visual-identity/design-preview.html
  - brand/{slug}/brand-book/visual-identity/logo-light.png (si el cliente aporta logo)
  - brand/{slug}/brand-book/visual-identity/logo-dark.png (opcional)
---

# Design System — skill canónica de Maese Pedro

> Crear o actualizar el `DESIGN.md` de un brand. Source-of-truth de toda la operación visual.
> Forkeada de `design-brief` (Open Design); enriquecida con discovery + patrones de Sancho.
> No genera assets — eso es trabajo de `od-generate`. Esta skill solo define **cómo se ve** el brand.

---

## Reglas Cardinales (violar = fallo de ejecución)

### R1 — Brand Assets PRIMERO
ANTES de generar nada:
1. Lee `brand/{slug}/company-brief/company-brief.current.md` → extrae `url_primary`.
2. `web_fetch(url_primary)` → analiza colores dominantes, tipografías, logo, estilo visual.
3. Pregunta al cliente: **"¿Tienes brandbook, manual de marca, o guía de estilo? Si sí, pásalo ANTES de continuar."**
4. Si hay brandbook → es la **fuente de verdad**. No inventes colores ni tipografías.
5. Si no hay brandbook → trabaja con lo extraído de la URL + preferencias declaradas.
6. **Nunca** uses tipografías/colores inventados si existen definidos.

### R2 — Anti-Pegote
Composición visual nunca con CSS overlay. Si el output incluye personaje + fondo:
- Genera la imagen entera como **una sola pieza** (vía `od-generate`, no aquí).
- Si necesitas texto sobre imagen → genera la imagen CON el texto integrado, O exige `text-shadow` en componentes downstream.
- CSS es para layout y estructura, NO para composición visual.

### R3 — Vocabulario cerrado del schema
Las dimensiones del DESIGN.md siguen vocabulario cerrado (ver §3). Si el usuario propone un valor no listado, **pide clarificación**, no inventes.

### R4 — Logo canónico
Si el cliente aporta logo, persistir en:
```
brand/{slug}/brand-book/visual-identity/logo-light.png   # OBLIGATORIO si hay logo
brand/{slug}/brand-book/visual-identity/logo-dark.png    # opcional
```
PNG transparente, ancho mínimo 800px. Si no hay logo, marcar `logo.missing: true` en DESIGN.md con `reason`. NO inventar logo.

### R5 — Tamaños mínimos de texto (subsection del DESIGN.md)
Incluir en DESIGN.md la siguiente tabla, no negociable:

| Canvas | Body | Títulos | Quotes | Subtítulos |
|---|---|---|---|---|
| 1080×1080 (IG/social) | ≥ 24px | ≥ 44px | ≥ 54px | ≥ 32px |
| 1200×628 (LinkedIn/OG) | ≥ 18px | ≥ 36px | ≥ 44px | ≥ 24px |
| 1920×1080 (blog/web) | ≥ 16px | ≥ 32px | ≥ 40px | ≥ 20px |

### R6 — Discovery acotado
Máximo **2 rondas** de discovery interactivo. Si tras 2 rondas no hay claridad, propón defaults razonables y deja al cliente validar/ajustar.

---

## Modos

### Quick mode (~30 min)
1 ronda de discovery (Path A si hay URL/brandbook; Path B si no). Output: DESIGN.md mínimo viable.

### Full mode (~2-3 h)
3 rondas (personalidad+color, tipografía+imagery, world+mapping). Output: DESIGN.md completo + design-preview.html + composition table.

### Auto (default)
- Si hay brandbook completo → Quick.
- Si solo hay URL → Quick.
- Si no hay nada → Full (necesitamos discovery profundo).

---

## Flujo de ejecución

### Step -1 — Brand Assets Intake (OBLIGATORIO)
1. Leer `company-brief/company-brief.current.md` → extraer `url_primary`.
2. `web_fetch(url_primary)` → colores, tipografías, logo, estilo.
3. Buscar `/assets`, `/brand`, `/press` en la web.
4. Preguntar (si falta): "¿Tienes brandbook? ¿Logo SVG/AI? ¿Paleta y tipografías ya definidos?"
5. Si brandbook → cargar y analizar.
6. Persistir logo en path canónico (R4).
7. Documentar inventario: qué tenemos, qué falta, fuente de cada dato.

### Step 0 — Context Hydration
Lee `references/hydration.md` para mapeo upstream → DESIGN.md. Pre-rellena lo que ya sabes; pregunta solo lo nuevo.

### Step 1 — Resolver 8+ dimensiones
DESIGN.md requiere resolver mínimo estas dimensiones (vocabulario cerrado):

| # | Dimensión | Valores |
|---|---|---|
| 1 | `palette` | navy_and_white · earth_tones · monochrome_dark · light_clean · custom_from_brandbook |
| 2 | `accent` | coral · electric_blue · emerald · muted_sage · slate · custom |
| 3 | `typography` | inter · system_ui · dm_sans · georgia · custom_from_brandbook |
| 4 | `display` | space_grotesk · clash_display · same_as_body · playfair · custom |
| 5 | `layout` | single_column · two_column · asymmetric |
| 6 | `mood` | professional_minimal · playful · brutalist · editorial |
| 7 | `density` | compact · balanced · spacious |
| 8 | `exclude` | animations · gradients · stock_photos · carousel · (combinaciones) |

**Sancho extensions** (obligatorias):
| 9 | `logo_color_rules` | onWhite · onGradient · onDark · onAccent (al menos onWhite) |
| 10 | `social_specs` | dimensiones por canal: linkedin · instagram · blog (ver R5) |
| 11 | `color_use_semantic` | cada color con campo `use:` (ej: "primary navy = texto, líneas, fondos dark") |
| 12 | `illustration_discipline` | line_art_clean · photo · mixed (regla de coherencia) |

### Step 2 — Resolución symbolic → concrete tokens
Mapeo según tabla de `design-brief` upstream + brandbook si existe. Si el cliente provee valor no listado → pedir clarificación (R3).

### Step 3 — Generar DESIGN.md
Schema:

```markdown
# {Brand Name} Design System

## Visual Theme & Atmosphere
- Mood, Feel, References

## Color Palette & Roles
- Background, Surface, Text primary, Text secondary, Accent, Accent hover
- Color use semántico (qué hace cada color) ← Sancho extension

## Typography Rules
- Display, Body, Mono (familia, peso, tamaño, line-height)
- Tamaños mínimos por canvas ← Sancho extension (R5)

## Component Stylings
- Buttons, Cards, Inputs (estilo según mood)

## Layout Principles
- Max width, Grid, Section spacing, Content padding (según density)

## Depth & Elevation
- Shadows, Borders

## Do's and Don'ts
- DO/DON'T por categoría (color, typography, layout, illustration)
- Anti-pegote (R2) explícito ← Sancho extension

## Responsive Behavior
- Breakpoints, Mobile/Tablet/Desktop strategy

## Agent Prompt Guide
- Reglas para downstream skills al generar assets

## Sancho Extensions ← bloque obligatorio
### Logo Color Rules
- onWhite, onGradient, onDark, onAccent (con hex de cada caso)
### Social Specs por Canal
- linkedin (1080×1350, gradient bg), instagram (1080×1080, white bg), blog (1200×630, white bg)
### Illustration Discipline
- Style, lineColor light/dark, accents, background, anti-mix rules
```

### Step 4 — Generar design-preview.html (OD-compliant)

HTML auto-renderizado del DESIGN.md, **single-file autocontenido** (CSS inline, no external URLs salvo Google Fonts). Usar los tokens del DESIGN.md exclusivamente.

**Estructura mínima** — cada bloque envuelto en una sección con `data-od-id` para activar comment overlay y surgical edits en el editor de OD:

```html
<section data-od-id="palette">
  <!-- swatches de paleta con hex y use semántico -->
</section>

<section data-od-id="typography">
  <!-- samples de display, body, mono con sus tamaños -->
</section>

<section data-od-id="layout">
  <!-- ruler de spacing y grid -->
</section>

<section data-od-id="components">
  <!-- buttons, cards, inputs de muestra -->
</section>

<section data-od-id="depth">
  <!-- shadows y borders de muestra -->
</section>

<section data-od-id="dos-donts">
  <!-- DO / DON'T pares -->
</section>

<section data-od-id="logo-rules">
  <!-- logo en distintos contextos: onWhite, onGradient, onDark, onAccent -->
</section>

<section data-od-id="social-specs">
  <!-- previews por canal: linkedin, instagram, blog -->
</section>

<section data-od-id="illustration">
  <!-- regla de line art, accents permitidos, anti-pegote -->
</section>
```

**Reglas obligatorias** del HTML:
- Single-file: todo el CSS dentro de `<style>` en el `<head>`. Nada en archivos externos.
- No URLs externas excepto Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`).
- `data-od-id` en cada `<section>` con un slug único kebab-case. Mínimo 7-9 secciones (las listadas arriba).
- Estilo del propio HTML usa los tokens del DESIGN.md (background, text color, fonts) para que el preview "se sienta" como la marca.
- Responsive básico: 1440 / 768 / 375 — mobile stack vertical.
- Sin JS interactivo. Vanilla HTML+CSS.

### Step 5 — Reportar dimensiones por defecto
Al final, listar dimensiones que se resolvieron por default (no aportadas por usuario) con la regla aplicada.

---

## Composition Table (para downstream skills)

Ver `references/composition-rules.md` (heredado de visual-identity). Resumen:

| Canal | Fondo | Composición |
|---|---|---|
| LinkedIn (dark) | Gradient oscuro integrado | Generar personaje + gradient en una imagen |
| Blog (light) | Blanco/claro | Ilustración sobre fondo blanco |
| Instagram | Escena completa | Una pieza, no overlay |
| Twitter/X | Flexible | Ilustración con fondo sólido integrado |
| Email header | Claro | Ilustración limpia sobre fondo de marca |

**Regla universal**: el fondo de color SIEMPRE en el prompt de generación, NUNCA como CSS detrás de la imagen.

---

## Ubicación canónica de outputs

```
brand/{slug}/brand-book/visual-identity/
├── DESIGN.md                ← lo escribe ESTA skill (source-of-truth)
├── design-preview.html      ← lo escribe ESTA skill
├── logo-light.png           ← lo escribe ESTA skill (si hay logo)
├── logo-dark.png            ← lo escribe ESTA skill (opcional)
└── _archive/
    ├── design-tokens.json   ← legacy (archivado tras migración)
    └── visual-identity.current.md  ← legacy
```

`DESIGN.md` reemplaza completamente al antiguo `design-tokens.json`. Las plantillas HTML del brand se reescriben para leer DESIGN.md (vía parser server-side en MC).

---

## Self-QA (OBLIGATORIO antes de entregar)

- [ ] R1: ¿Cada color/tipografía viene del brandbook o tiene justificación?
- [ ] R2: ¿No hay composiciones con CSS overlay? (Anti-pegote)
- [ ] R3: ¿Vocabulario cerrado respetado? Sin valores inventados.
- [ ] R4: ¿Logo persistido en path canónico, o `logo.missing: true` con `reason`?
- [ ] R5: ¿Tabla de tamaños mínimos incluida?
- [ ] R6: ¿Discovery ≤ 2 rondas?
- [ ] DESIGN.md tiene las 9 secciones OD + Sancho extensions.
- [ ] design-preview.html renderiza sin errores con los tokens resueltos.
- [ ] Listado de defaults aplicados al final.

Metadata final: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ | mode: quick|full | rondas: Z/2 -->`

---

## Versionado

- DESIGN.md actual: `brand/{slug}/brand-book/visual-identity/DESIGN.md`
- Versiones anteriores: `brand/{slug}/brand-book/visual-identity/_history/DESIGN-v{N}.md`
- Cambio mayor → bumpea versión en frontmatter del DESIGN.md.

---

## Cross-skill consumption

| Dato | Lo consume |
|---|---|
| DESIGN.md | TODAS las skills downstream que generan assets visuales (vía `od-generate`) |
| Logo paths | Templates HTML del brand, content-image, MediaGallery |
| Color tokens | Plantillas HTML (`{{ design_system.color.primary }}`) |
| Composition table | `od-generate` y skills upstream de OD |

---

## Notas de migración (legacy → DESIGN.md)

Cuando un brand tiene `design-tokens.json` + `visual-identity.current.md` legacy:
1. Ejecutar esta skill con input `mode=auto` + contexto = ambos archivos legacy.
2. Maese Pedro produce DESIGN.md preservando paleta, tipografías, logo del legacy.
3. Validar visualmente que captura todo.
4. Mover legacy a `_archive/`.
5. Reescribir plantillas HTML del brand para leer DESIGN.md (con parser server-side en MC).

---

## Referencias

- `references/composition-rules.md` — Reglas de composición por canal (heredado de visual-identity).
- `references/hydration.md` — Mapeo de campos upstream para pre-rellenar.
- Skill upstream `design-brief`: `/Users/ragi/open-design/skills/design-brief/SKILL.md` (vocabulario base).
- Schema OD design-systems: `/Users/ragi/open-design/docs/design-systems.md`.
- Legacy reference: `~/.openclaw/workspace-maese-pedro/skills/visual-identity/SKILL.md` (hasta archivar).
