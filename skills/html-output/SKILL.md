---
name: html-output
description: "Convierte cualquier documento markdown u output estructurado en un archivo HTML self-contained de alta calidad visual — el documento canónico de cara al cliente. Use when: usuario pide 'convertir en HTML', 'documento bonito', 'informe', 'report', 'análisis', 'audit', 'one-pager', 'plan', 'resumen', 'comparativa', 'deliverable', 'briefing'; o cuando otra skill produce un entregable largo (>80 líneas estructuradas) para un humano. Output: sibling .html junto al .md fuente (current.md → current.html). NOT for: presentaciones/decks/slides (use frontend-slides or niche-presentation), código que va a git, respuestas cortas de chat, comunicación agente↔agente, o cuando el usuario pide explícitamente 'en markdown'."
---

# html-output

Transforma un documento markdown u output estructurado en un HTML self-contained de alta calidad.
Un solo archivo, CSS inline, Google Fonts CDN, imprimible y mobile-responsive.

## Skill Metadata
- **Version**: 1.0 (port headless de la skill html-output de Growth4U) | **Owner**: maese-pedro
- **Type**: output/formatting

## Context
- **Reads**: el `.md` fuente bajo `brand/{slug}/...`; `brand/{slug}/brand-identity/visual-identity/visual-identity.current.md` (paleta/tipografías); `brand/{slug}/brand-book/visual-identity/` si existe (tokens/design system)
- **Writes**: sibling `.html` junto al `.md` fuente (mismo basename); si el contenido nace en chat sin `.md` previo, AMBOS ficheros (`.md` + `.html`)

> Protocolo: `_system/output/html-canonical-protocol.md` — el `.html` es el documento **canónico** de cara al cliente; el `.md` es la fuente. Si editas el `.md`, regenera el `.html`.

## Paso 1 — Identificar el tipo de documento

Lee `references/style-catalog.md` y elige el estilo apropiado según la tabla de selección rápida del final.

El estilo por defecto cuando no encaja claramente en ninguna categoría es **`deep-analysis`** — sidebar TOC + contenido principal con secciones, callouts y métricas.

**Presentaciones NO van por esta skill**: si el usuario pide deck/slides/presentación, deriva a `frontend-slides` o `niche-presentation`.

## Paso 2 — Resolver el tema visual (determinista, sin preguntar)

Esta skill corre headless: NO preguntes el tema. Resuélvelo en este orden:

1. **Explícito en el mensaje/task** (ej. "tema dark", "estilo minimal") → úsalo.
2. **Design system del brand**: si existe `brand/{slug}/brand-book/visual-identity/` con tokens o `style.css` → deriva los tokens de ahí (colores, tipografías, bordes, sombras).
3. **Visual identity del brand**: si existe `brand/{slug}/brand-identity/visual-identity/visual-identity.current.md` → extrae paleta y tipografías de su Visual Snapshot y construye los tokens (`--bg`, `--text`, `--accent`, fuentes) respetando la identidad del cliente.
4. **Default**: tema **Sancho — Parchment + Tinta** (tokens abajo).

## Paso 3 — Generar el HTML

### Estructura obligatoria

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[TÍTULO] — [MARCA]</title>
  <!-- Google Fonts según tema -->
  <style>/* CSS completo inline */</style>
</head>
<body>
  <!-- Layout según estilo elegido -->
</body>
</html>
```

El archivo debe ser **100% self-contained**: sin dependencias externas salvo Google Fonts CDN.
Todo el CSS va inline en `<style>`. Sin JavaScript frameworks. Vanilla JS solo si el estilo lo requiere (TOC scroll-spy, collapsibles, drag-and-drop).

### Tokens del tema default (Sancho — Parchment + Tinta)

```css
:root {
  --bg:          #F5F0E6;   /* parchment */
  --bg-card:     #FDF8EF;   /* paper */
  --bg-muted:    #E8DCC8;   /* aged */
  --text:        #1A1A2E;   /* ink */
  --text-muted:  #2D2D44;   /* ink-soft */
  --accent:      #C45D35;   /* rust */
  --accent-alt:  #1E3A5F;   /* navy */
  --highlight:   #F2C94C;   /* yellow */
  --info:        #3B9EBF;   /* cyan */
  --border:      3px solid #1A1A2E;
  --shadow:      5px 5px 0 #1A1A2E;
  --radius:      4px;
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body:    'Nunito', system-ui, sans-serif;
  --font-meta:    'Source Sans 3', system-ui, sans-serif;
  --font-quote:   'Playfair Display', serif;
}
/* Google Fonts: Space+Grotesk:wght@400;500;600;700 + Nunito:ital,wght@0,400;0,600;0,700;1,400;1,600 + Playfair+Display:ital@1 + Source+Sans+3:wght@400;600;700 */
```

### Temas alternativos (si el usuario los pide explícitamente)

**Minimal — Blanco limpio:**
```css
:root {
  --bg: #FFFFFF; --bg-card: #F8FAFC; --bg-muted: #F1F5F9;
  --text: #0F172A; --text-muted: #64748B;
  --accent: #0F172A; --accent-alt: #3B82F6; --highlight: #F59E0B; --info: #6366F1;
  --border: 1px solid #E2E8F0; --shadow: 0 1px 3px rgba(0,0,0,0.08); --radius: 6px;
  --font-display: 'Inter', system-ui, sans-serif; --font-body: 'Inter', system-ui, sans-serif;
  --font-meta: 'JetBrains Mono', monospace; --font-quote: 'Georgia', serif;
}
/* Google Fonts: Inter:wght@400;500;600;700;800 + JetBrains+Mono:wght@400;500 */
```

**Dark — Fondo oscuro:**
```css
:root {
  --bg: #0F172A; --bg-card: #1E293B; --bg-muted: #334155;
  --text: #F8FAFC; --text-muted: #94A3B8;
  --accent: #F97316; --accent-alt: #38BDF8; --highlight: #A78BFA; --info: #34D399;
  --border: 1px solid #334155; --shadow: 0 4px 16px rgba(0,0,0,0.4); --radius: 8px;
  --font-display: 'Manrope', system-ui, sans-serif; --font-body: 'Roboto', system-ui, sans-serif;
  --font-meta: 'Roboto Mono', monospace; --font-quote: 'Roboto', system-ui, sans-serif;
}
/* Google Fonts: Manrope:wght@700;800 + Roboto:wght@400;500;700 + Roboto+Mono:wght@400;500 */
```

Cuando derivas el tema de la visual identity del cliente (Paso 2.2/2.3), construye un bloque `:root` equivalente con SUS colores y tipografías — nunca mezcles la identidad del cliente con la de Sancho.

### Componentes universales (disponibles en todos los temas)

Adapta estos componentes al tema elegido usando los tokens CSS:

```html
<!-- Métrica grande -->
<div class="metric">
  <div class="metric__value">€29</div>
  <div class="metric__label">CAC objetivo</div>
</div>

<!-- Grid de métricas -->
<div class="grid grid--3">
  <!-- métricas aquí -->
</div>

<!-- Callout -->
<div class="callout callout--info">...</div>
<div class="callout callout--warning">...</div>
<div class="callout callout--success">...</div>

<!-- Tabla -->
<table class="data-table">
  <thead>...</thead>
  <tbody>...</tbody>
</table>

<!-- Collapsible -->
<details>
  <summary>Título</summary>
  <p>Contenido...</p>
</details>

<!-- Tag/badge -->
<span class="tag tag--accent">Alpha</span>
```

El CSS de estos componentes lo generas inline usando los tokens del tema elegido.
No hay hoja de estilos externa — todo va en el `<style>` del documento.

### Reglas de layout por estilo

Consulta `references/style-catalog.md` para el patrón específico de cada estilo.

Para el estilo **`deep-analysis`** (el más común), implementa:
```
shell: grid 260px sidebar + main
sidebar: sticky, TOC auto-generado desde <h2 id="...">
main: max-width 760px, padding generoso
TOC mobile (<900px): <details> collapsible al top (no chips horizontales)
```

Para **`three-approaches`**, implementa:
```
grid: 3 columnas (o 2 si son dos opciones)
header de cada columna: nombre + badge de recomendación
criterios: filas compartidas entre columnas
```

Para **`weekly-status`**, implementa:
```
layout: una columna
header con métricas rápidas (grid)
secciones: ✓ Enviado / ⚠ Retrasado / → Próximos pasos
```

Para **`implementation-plan`**, implementa:
```
fases: horizontal timeline o tabla con fase/presupuesto/milestones
tabla de riesgos al final
callout de bloqueos
```

### Mobile

Para estilos con sidebar (`deep-analysis`):
- En `<900px`, colapsar sidebar a `<details class="mobile-toc">` al top del main
- NUNCA usar chips horizontales que se rompan en varias líneas

### Print

```css
@media print {
  body { background: white; font-size: 11pt; }
  .sidebar, .mobile-toc { display: none; }
  .main { padding: 0; max-width: 100%; }
  h2 { page-break-after: avoid; }
  .callout, .metric, details { page-break-inside: avoid; }
}
```

## Paso 4 — Guardar el archivo (convención sibling canónico)

- **Input = un `.md` existente** bajo `brand/{slug}/...` → escribe el HTML **junto al `.md` con el mismo basename**:
  - `brand/acme/market-and-us/swot/current.md` → `brand/acme/market-and-us/swot/current.html`
  - `brand/acme/go-to-market/positioning/positioning.current.md` → `.../positioning.current.html`
- **Contenido nacido en chat** sin `.md` previo → escribe AMBOS ficheros (`<slug-doc>.md` + `<slug-doc>.html`) en la carpeta apropiada del brand (la de la task si existe; si no, la sección temática que corresponda).
- NUNCA escribas fuera de `brand/{slug}/`.
- El `.html` generado es el **documento canónico**: Mission Control lo abre y comparte por defecto; el `.md` queda como fuente editable.
- Si regeneras (el `.md` cambió), sobreescribe el `.html` — mismo path, sin sufijos de versión.

Al terminar, confirma en tu respuesta la ruta exacta del `.html` generado.

## Anti-patterns — no hacer

- ❌ Comic Neue como body font (ilegible — descartada)
- ❌ Inter en tema Sancho (no es Sancho)
- ❌ Gradientes purple decorativos sin propósito
- ❌ Border-radius >8px en Sancho (solo 4px)
- ❌ TOC horizontal en mobile con chips que se rompen en líneas
- ❌ Emojis decorativos — solo símbolos de estado (✓ ✗ ⚠) cuando aporten
- ❌ Centrado general del layout — alineación izquierda por defecto
- ❌ Números grandes fuera de `.metric__value` — los datos numéricos van siempre en color accent
- ❌ Dependencias externas distintas de Google Fonts CDN
- ❌ Inyectar scripts de comentarios en el HTML — la capa de comentarios la añade Mission Control al servir el documento compartido (SAN-148)
