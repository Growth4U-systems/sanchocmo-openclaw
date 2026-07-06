---
name: niche-presentation
description: Genera presentaciones HTML tipo slide deck con nichos, positioning y Foundation completa de cualquier cliente. Multi-client con brand theming automático desde visual-identity. Usa el design system de frontend-slides (viewport fitting, animations, responsive). Use this skill whenever the user asks for a niche presentation, positioning deck, Foundation report, pitch deck de estrategia, "genera una presentación" sobre nichos/ECPs/posicionamiento, "presenta los nichos", "haz un deck", "prepara las slides", o cualquier variante de presentación basada en Foundation data.
---

# Niche Presentation

Genera presentaciones HTML self-contained con datos de Foundation: nichos, ECPs, positioning, competitors, market intelligence. Multi-client con brand theming automático.

## Core Principles

1. **Multi-Client** — Resuelve brand theme desde visual-identity del cliente. Sin visual identity → fallback por sector.
2. **Foundation-First** — Lee TODOS los docs disponibles del cliente antes de generar. Cruza información entre pillars.
3. **Zero Dependencies** — HTML único, CSS/JS inline, solo Google Fonts como externo.
4. **Viewport Fitting** — Cada slide = 100vh exacto. NUNCA scroll dentro de slides. Si el contenido no cabe → split en múltiples slides.
5. **Datos Reales** — SOLO datos de Foundation docs. NUNCA inventar métricas, scores, o quotes.

---

## Inputs

### Mínimo Viable
Un archivo de niche-discovery con ECPs definidos.

### Óptimo (leer todo lo que exista)
Foundation completa: company context, niche discovery, ECP profiles, positioning, competitors, market intelligence, brand voice, visual identity.

### Encontrar los archivos
Los clientes pueden tener Foundation en distintas rutas. **Siempre inventariar primero:**
```bash
find brand/{slug} -name "*.current.md" | sort
```
Rutas comunes:
- `niche-discovery/` o `niche-discovery-100x/`
- `company-brief/` o `company-context/`
- `go-to-market/ecps/` y `go-to-market/positioning/`
- `market-and-us/market/`, `market-and-us/competitors/`
- `brand-identity/visual-identity/`

### Gate Check: ¿Positioning aprobado?
Antes de generar, verificar si el positioning está aprobado:
1. Leer los archivos de positioning → buscar `Status: ✅ approved` o `Status: pending-approval`
2. **Si positioning está `pending-approval` o no existe** → preguntar al usuario:
   > "Los posicionamientos de {cliente} aún no están aprobados. ¿Quieres que avance con la presentación de nichos usando los datos disponibles (niche-discovery + market + competitors), o prefieres esperar a que se aprueben los posicionamientos para incluir el messaging completo?"
3. **Si el usuario dice sí** → generar con los datos disponibles (niche-discovery como fuente principal, sin messaging de positioning)
4. **Si el usuario dice esperar** → no generar, recordar pendiente
5. **Si positioning está `approved`** → generar con todo incluido (messaging completo en los ads y campaign slides)

### Sin Foundation
Responder: "No hay Foundation data para {cliente}. Necesito al menos niche-discovery para generar la presentación."

---

## Workflow

### Phase 0: Read Foundation + Gate Check

1. Identificar cliente (guild, mención, instrucción)
2. `find brand/{slug} -name "*.current.md"` → inventariar
3. Leer todos los docs disponibles
4. **Gate check**: ¿Positioning aprobado? (ver reglas arriba). Si `pending-approval` → preguntar antes de generar.
5. Anotar qué existe y qué falta → adaptar estructura de slides

### Phase 1: Brand Theme

La presentación usa los colores, fonts y logo del cliente. Todo vía CSS variables `--brand-*`.

**Resolución de theme:**
1. Leer `visual-identity/visual-identity.current.md` → mapear colores a CSS variables
2. Si no hay visual-identity → buscar colores en company-context o web del cliente
3. Si nada → fallback por sector (Salud→teal/navy, Tech→cyan/dark, B2B→blue/slate)

**CSS variables requeridas:**
```css
:root {
    --brand-primary: ;        --brand-primary-light: ;    --brand-primary-dark: ;
    --brand-secondary: ;      --brand-secondary-light: ;
    --brand-accent: ;         --brand-accent-light: ;
    --brand-bg: ;             --brand-text: ;
    --brand-text-light: ;     --brand-text-lighter: ;
    --brand-border: ;         --brand-shadow: ;           --brand-shadow-lg: ;
    --brand-radius: 16px;     --brand-radius-sm: 12px;
    --brand-font-display: ;   --brand-font-body: ;
    --gradient-primary: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    --gradient-secondary: linear-gradient(135deg, var(--brand-secondary), ...);
    --gradient-accent: linear-gradient(135deg, var(--brand-accent), ...);
}
```

**Logo (OBLIGATORIO — nunca SVG genérico):**
1. Buscar en `visual-identity/`, `brand-identity/`, `presentations/logo-*`
2. Si no hay → scraping web del cliente: `curl -sL "{url}" | grep -oi 'src="[^"]*logo[^"]*"'`
3. Descargar a `brand/{slug}/presentations/logo.webp`, embedir como base64
4. Último recurso → nombre del cliente como texto styled. NUNCA círculos abstractos.

### Phase 2: Slide Structure

Estructura recomendada (adaptar según contenido disponible):

| # | Slide | Fuente | Cuándo |
|---|-------|--------|--------|
| 1 | **Portada** | company-context | Siempre |
| 2 | **Contexto de Mercado** | market-intelligence | Si existe |
| 3 | **El Problema / Oportunidad** | company-context + positioning | Si existe |
| 4 | **Competencia** | competitor-intelligence | Si existe (mejor temprano, da contexto) |
| 5 | **Ecosistema de Nichos** | niche-discovery | Siempre (overview grid de todos los nichos) |
| 6-N | **Niche Detail + Campaign** (par por nicho) | niche-discovery + positioning | Siempre (core) |
| N+1 | **Cierre / CTA** | company-context | Siempre |

**Regla clave:** Cada nicho genera un **par de slides** — el niche detail seguido de su campaign detail. No separarlos.

**Si solo hay niche-discovery** → Portada + Ecosistema + Niche pairs + Cierre.

### Phase 3: Generate HTML

**Leer antes de generar:**
- `skills/niche-presentation/slide-templates.md` — Templates HTML/CSS completos
- `skills/frontend-slides/viewport-base.css` — CSS base (incluir completo)

**Estructura HTML:**
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{Client} — Nichos & Positioning</title>
    <link href="https://fonts.googleapis.com/css2?family={Font}:wght@400;700;800&display=swap" rel="stylesheet">
    <style>
        /* Brand Theme */ :root { ... }
        /* viewport-base.css COMPLETO */
        /* Component Styles */
        /* Animations */
    </style>
</head>
<body>
    <!-- Slides (display:none, .active = display:flex) -->
    <!-- Footer + Progress bar + Nav buttons -->
    <script>/* SlidePresentation controller */</script>
</body>
</html>
```

---

## Slide Types

### Portada
- Centered: logo + "Client × Growth4U" + título + subtítulo + tags fecha
- Gradient background con brand colors
- **CSS crítico:** `.slide.cover-bg > div { flex: 1; }` para centrado vertical
- Instrucciones de navegación al fondo

### Contexto de Mercado
- Grid de 3 stat cards (TAM, crecimiento, prevalencia) con colores brand
- Quote block con insight clave
- Fuentes citadas

### Competencia — Cards con Score + Quote Bar
- Grid de 3 cards: 2 competidores principales + el cliente
- Cada card: nombre + score badge (color-coded), 3-4 bullets, "PERO:" con vulnerabilidad, callout box
- Score badges: verde (>4★), amarillo (3-4★), rojo (<3★)
- Card del cliente con borde brand-primary
- Quote bar al fondo: fondo brand-secondary, texto blanco italic
- Datos de competitor-intelligence — nunca inventar scores

### Ecosistema de Nichos
- Grid de cards (4 columnas) mostrando todos los nichos con emoji, nombre, SAM, prioridad
- O diagrama de flujo si el niche-discovery define un funnel/ecosistema

### Niche Detail — Layout Hero 60/40

La ficha del nicho es LA slide más importante. Debe ser rica y completa, usando datos de niche-discovery Y positioning.

- Header: section label "Nicho X de N" + logo
- Grid 1.2fr / 0.8fr:
  - **Izquierda:**
    - Icon emoji + nombre del nicho
    - **Descripción RICA** (párrafo completo con `<strong>` y `<em>`): quién es, edad, comportamiento, motivación, quién influye en la decisión, por qué es valioso para el cliente. Datos de niche-discovery "Quién:" + contexto. NO resumir en 1 línea — escribir el párrafo completo como sale de la Foundation.
    - **Pain quote** (callout rojo): la cita textual del paciente/usuario del niche-discovery (sección "Dolor del paciente:"). Completa, no recortada.
    - **KPIs descriptivos** (no scores abstractos): usar valores como "Muy alta", "Muy bajo", "€150-600/año", "Gateway" — extraídos de las tablas del niche-discovery. 3 KPIs max.
    - **Competitor pills**: competidores relevantes para este nicho con descripción corta entre paréntesis.
  - **Derecha:** Meta Ad mockup con copy del **positioning** o **campañas propuestas** del niche-discovery:
    - Headline = de "Campañas propuestas → Meta:" del niche-discovery
    - CTA = el CTA de la campaña
    - Si hay positioning-messaging → usar el USP más relevante como headline
  - **Footer:** Channel callout (borde accent) con los canales propuestos del nicho — cada canal en 1 línea con descripción (ej: "→ TikTok — Video '3 años con gorra', plano gorra quitándose")
- Ver `slide-templates.md` → Slide Type 3

**Fuentes de datos para la ficha:**
1. `niche-discovery` → Quién, Pain Cluster, JTBD, Dolor del paciente, Keywords, Canales, Campañas propuestas, Competidores, KPIs (Pain/SAM/Reach)
2. `positioning-messaging` → UVP, USPs, copy de ads/landing, beneficio-prueba
3. `ecp-profiles` → Detalles adicionales de la persona

### Campaign Detail — 3 Columnas
- Va justo después de cada niche detail (son un par)
- Header: section label accent "{Nicho} — Campañas" + logo
- 3 columnas flex:
  - **Google Search:** SERP mockup (logo Google colores + searchbox + ad result)
  - **Instagram Stories:** 2 stories (border-radius 14px, gradient, emoji + headline + CTA blanco)
  - **Keywords Target:** card con tabla keyword → demanda (color-coded)
- Copy de las campañas propuestas del niche-discovery o positioning
- Ver `slide-templates.md` → Slide Type 4

### Cierre / CTA
- Centered: logo + mensaje cierre + 3 stat cards resumen + botón CTA grande + tags
- Mismo CSS de centrado que portada

---

## CSS Rules

1. **Todos los font sizes usan `clamp()`** — nunca px/rem fijos
2. **viewport-base.css completo** en `<style>`
3. **`.slide`**: `height: 100vh; 100dvh; overflow: hidden; box-sizing: border-box; flex-direction: column;` (NO justify-content center — excepto covers)
4. **`.slide .slide-header`**: flex item normal con `margin-bottom` y `flex-shrink: 0` (NO position absolute)
5. **`.slide.cover-bg`**: SÍ `justify-content: center` (solo covers se centran)
6. **Padding lateral**: `clamp(2.5rem, 5vw, 5rem)` para dejar espacio a flechas de navegación
7. **Breakpoints**: max-height 700px, 600px, 500px + max-width 600px/900px
8. **`prefers-reduced-motion`** support
9. **No negar CSS functions** — usar `calc(-1 * clamp(...))`, nunca `-clamp(...)`
10. **Animaciones**: `.animate-in` + `.delay-1` a `.delay-5` triggereadas por `.slide.active`

## Responsive (OBLIGATORIO)

La presentación DEBE funcionar en móvil, tablet y desktop. Integrar los principios de `responsive-adapt`:

### Mobile (< 768px)
- **Niche detail**: grid 1.2fr/0.8fr → single column (Meta Ad debajo de la descripción)
- **Campaign**: 3 columnas → stacked vertical
- **Competitor cards**: grid-3 → single column
- **Funnel slides**: grid-2 → stacked
- Touch targets 44x44px mínimo (flechas nav, CTAs)
- Ocultar flechas nav laterales → swipe nativo
- Font base 16px mínimo
- **Nav dots**: ocultar en mobile
- Padding reducido: `clamp(1rem, 3vw, 2rem)`

### Tablet (768px - 1023px)
- **Niche detail**: grid 1fr/1fr (mitad y mitad) o stacked según contenido
- **Campaign**: 2 columnas (SERP + Stories juntos, Keywords debajo)
- **Competitor cards**: 2 cards por fila + 1 debajo
- Touch targets 44x44px

### Desktop (1024px+)
- Layout completo (grids, multi-columna)
- Flechas nav visibles
- Hover states en cards y CTAs

### CSS responsive obligatorio en toda presentación:
```css
@media (max-width: 900px) {
    .niche-hero, .grid-2, .campaign-grid { 
        grid-template-columns: 1fr !important;
        display: flex !important;
        flex-direction: column !important;
    }
    .grid-3 { grid-template-columns: 1fr 1fr !important; }
    .story-mock { width: clamp(80px, 20vw, 120px); height: clamp(140px, 35vh, 200px); }
    .nav-btn { display: none; }
    .meta-ad { max-width: 100%; }
}
@media (max-width: 600px) {
    .grid-3, .grid-4 { grid-template-columns: 1fr !important; }
    .slide { padding: clamp(0.8rem, 3vw, 1.5rem) !important; }
    .slide-title { font-size: clamp(1.1rem, 5vw, 1.6rem) !important; }
    .niche-desc { font-size: clamp(0.7rem, 3vw, 0.85rem) !important; }
    .stories-row { justify-content: center; }
    .campaign-col-label { font-size: clamp(0.6rem, 2.5vw, 0.75rem); }
}
```

## Navigation (obligatorio)

```javascript
// Keyboard: ←→, Space, Home/End
// Touch: swipe
// Mouse wheel: con debounce
// Progress bar bottom
// Page counter "X / N"
// Fullscreen: F key
// Animations: staggered on slide change
```

Ver `slide-templates.md` → Navigation Boilerplate para implementación completa.

## Output

1. Guardar en `brand/{slug}/presentations/niche-presentation.html`
2. Si ya existe → incrementar versión (`-v2.html`)
3. Informar: link MC tokenizado + slide count + qué Foundation se usó + qué faltaba

## Content Rules

1. **Idioma del cliente** (de `clients.json`). Default: español.
2. **Datos reales** de Foundation. Nunca inventar.
3. **Si falta un dato** → omitir o marcar "Pendiente". Nunca placeholder.
4. **Truncar para viewport**: títulos max 60ch, descripciones 200ch, pain points max 5×80ch, keywords max 6
5. **Emojis**: como iconos visuales, sparingly

## Self-QA

- [ ] Datos de Foundation, no inventados
- [ ] Cada slide 100vh sin scroll
- [ ] Font sizes con clamp()
- [ ] viewport-base.css completo
- [ ] Navegación: arrows, space, touch, fullscreen, progress bar
- [ ] Brand colors correctos
- [ ] Logo real del cliente (no genérico)
- [ ] Cover y cierre centrados verticalmente
- [ ] Idioma correcto
- [ ] `<!-- Self-QA: PASS | fecha -->`

## Learnings

### 2026-03-20 — Example
1. **Cover: `flex:1`** en inner div para centrado vertical
2. **Logo real obligatorio** — scraping web si necesario, nunca SVG genérico
3. **Campaign slides pares** — cada nicho = niche detail + campaign detail (juntos)
4. **Competencia temprano** — slide 3-4, da contexto antes de los nichos
5. **Rutas variables** — siempre `find` antes de generar
6. **`box-sizing: border-box`** en `.slide` para que padding no rompa viewport
7. **Timeout del especialista** en generaciones grandes — para >15 slides, generar la estructura base y inyectar las campaign slides via script Python
8. **Gate check positioning** — siempre verificar si positioning está aprobado antes de generar. Si pending → preguntar al usuario si avanzar solo con nichos o esperar messaging completo
