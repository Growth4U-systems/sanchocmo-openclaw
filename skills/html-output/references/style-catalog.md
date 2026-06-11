# Style Catalog — HTML Output

Fuente: https://thariqs.github.io/html-effectiveness/ (20 ejemplos)

Para cada tipo de documento, este catálogo define:
- **Cuándo usarlo** — señales en el contenido que indican este estilo
- **Patrón de layout** — estructura HTML/CSS a implementar
- **Componentes clave** — elementos que hacen que este estilo funcione

---

## REPORTS & STATUS

### weekly-status
**Cuándo:** Resumen semanal, status update, briefing periódico, "qué pasó esta semana"
**Layout:** Una columna. Secciones: enviado / retrasado / próximos pasos + mini-gráfico de progreso.
**Componentes:** Tag-pills por estado (✓ / ⚠ / ✗), tabla compacta con colores de estado, sección de bloqueos destacada, métricas numéricas grandes al top.

### incident-timeline
**Cuándo:** Post-mortem, análisis de incidente, log de eventos con timestamps, "qué falló y por qué"
**Layout:** Timeline vertical con marcas de tiempo en el margen izquierdo, cuerpo narrativo a la derecha.
**Componentes:** Nodo de timeline (círculo + línea), cajas de log con fuente monospace, checklist de follow-up, severidad con colores (rojo/amarillo/verde).

---

## PLANS & STRATEGY

### implementation-plan
**Cuándo:** Plan de proyecto, roadmap, GTM plan, propuesta de fases, "cómo vamos a hacer X"
**Layout:** Fases en columnas o timeline horizontal. Milestones numerados. Tabla de riesgos al final.
**Componentes:** Badges de fase (Alpha/Beta/Scale), tabla presupuesto/timeline, callout de riesgos, diagrama de flujo de datos (boxes con flechas en SVG inline).

### three-approaches
**Cuándo:** Comparativa de opciones, "pros y contras", análisis de alternativas, A vs B vs C
**Layout:** 3 columnas en paralelo (o 2 si son solo dos opciones). Header de cada columna con nombre de opción. Filas de criterios compartidas.
**Componentes:** Tabla comparativa con checkmarks, indicador de recomendación (estrella o badge), fila de trade-offs.

---

## ANALYSIS & RESEARCH

### deep-analysis
**Cuándo:** Auditoría, análisis de mercado, investigación, diagnóstico, "qué está pasando con X"
**Layout:** Sidebar TOC + contenido principal. Secciones con h2/h3. Callouts para insights clave.
**Componentes:** TOC auto-generado (scroll-spy), callout--insight destacado, métricas en grid, tabla de datos, collapsibles para detalle.
*Este es el estilo por defecto para análisis largo tipo report.*

### concept-explainer
**Cuándo:** Explicación de concepto complejo, guía de onboarding, "cómo funciona X", tutorial
**Layout:** Una columna educativa. Secciones progresivas. Diagrama interactivo o visual al principio.
**Componentes:** TL;DR box al inicio, pasos numerados con íconos, tabla comparativa, FAQ collapsible, glosario hover-linked.

### feature-explainer
**Cuándo:** Documentación técnica, spec de feature, "qué hace X y cómo configurarlo"
**Layout:** Una columna técnica. TL;DR → flujo paso a paso collapsible → snippets con tabs → FAQ.
**Componentes:** Code blocks con syntax highlight, tabs para variantes de config, collapsibles para pasos del flujo, tabla de parámetros.

---

## DESIGN & VISUAL

### design-directions
**Cuándo:** Presentación de opciones de diseño, moodboard, "aquí tienes 3 alternativas visuales"
**Layout:** Grid de opciones (2-3 columnas). Cada card muestra preview + descripción.
**Componentes:** Color swatches, type specimens, preview de UI, badge de recomendación.

### living-design-system
**Cuándo:** Documentación de sistema de diseño, tokens de color/tipografía, guía de componentes
**Layout:** Secciones: paleta → tipografía → spacing → componentes.
**Componentes:** Swatches copiables, type scale specimens, tabla de tokens, ejemplos de componentes live.

### component-variants
**Cuándo:** Catálogo de variantes de un componente, estados de UI, "todos los estados de X"
**Layout:** Grid densa. Cada celda = una variante con label.
**Componentes:** Grid de previews, estado-labels, tabla de props.

---

## CODE & TECHNICAL

### annotated-pr
**Cuándo:** Code review, revisión de PR, "aquí está el diff con mis comentarios"
**Layout:** Diff-style. Líneas con +/- a la izquierda. Notas en margin derecho con jump-links.
**Componentes:** Diff lines (rojo/verde), severity tags (critical/warning/info), jump-links al top.

### pr-writeup
**Cuándo:** Descripción narrativa de un cambio, "por qué hice esto", context para reviewers
**Layout:** Una columna narrativa. Secciones: motivación → antes/después → tour de archivos → qué revisar.
**Componentes:** Before/after code blocks, file-list con checkmarks, callout "dónde enfocarte".

### module-map
**Cuándo:** Mapa de arquitectura, diagrama de dependencias, "cómo están conectados los módulos"
**Layout:** Diagrama SVG central + lista de módulos con descripción.
**Componentes:** Boxes SVG con flechas, hot-path destacado, tabla de entry points.

---

## DECKS & PRESENTATIONS

### slide-deck
**Cuándo:** Presentación, deck para cliente, "esto es para mostrar en pantalla"
**Layout:** Fullscreen slides. Navegación con flechas del teclado (← →).
**Componentes:** Slide con h1 grande, notas del speaker collapsibles, contador de slide, animación de transición suave.

---

## INTERACTIVE TOOLS

### ticket-triage
**Cuándo:** Priorización de tareas, "ayúdame a organizar estos items en ahora/pronto/luego"
**Layout:** Kanban de 4 columnas (Now/Next/Later/Cut) con drag-and-drop.
**Componentes:** Cards arrastrables, botón "copy as markdown", contador por columna.

### prompt-tuner
**Cuándo:** Template de prompt con variables, "muéstrame cómo queda con distintos inputs"
**Layout:** Split: editor a la izquierda, previews a la derecha (3 ejemplos live).
**Componentes:** Variables destacadas, re-render en tiempo real, copy button.

### clickable-flow
**Cuándo:** Flujo de usuario, prototipo clickable, "quiero ver si la interacción se siente bien"
**Layout:** Pantallas enlazadas (4-6 screens). Click en elemento → siguiente pantalla.
**Componentes:** Frames de pantalla, hotspots clickables, breadcrumb de navegación.

---

## DIAGRAMS

### annotated-flowchart
**Cuándo:** Pipeline, proceso con pasos, "diagrama del flujo de X con detalle en cada paso"
**Layout:** Flowchart SVG. Click en nodo → expande detalle, tiempos y rutas de error.
**Componentes:** Nodos SVG clickables, panel de detalle lateral, color por tipo de paso.

### svg-figure-sheet
**Cuándo:** Conjunto de diagramas para un documento, "los diagramas del artículo/report"
**Layout:** Grid de figuras SVG. Cada una editable/copiable.
**Componentes:** Figuras SVG inline, caption, botón copy.

---

## GUÍA DE SELECCIÓN RÁPIDA

| Tipo de output | Estilo |
|---------------|--------|
| Análisis, auditoría, research largo | `deep-analysis` (default) |
| Status semanal, briefing | `weekly-status` |
| Plan de proyecto, GTM, roadmap | `implementation-plan` |
| Comparativa A/B/C | `three-approaches` |
| Post-mortem, timeline de eventos | `incident-timeline` |
| Tutorial, guía paso a paso | `concept-explainer` |
| Spec técnica, documentación | `feature-explainer` |
| Deck para cliente / presentación | `slide-deck` |
| Design system, tokens | `living-design-system` |
| Code review | `annotated-pr` |
| Priorización de tareas | `ticket-triage` |
