---
name: market-intelligence
description: "Market analysis: TAM, trends, segments, competitive landscape, customer segmentation, regulatory impact. Use when: analyzing a market for a client, understanding competitive dynamics, sizing a market opportunity, identifying customer segments and their pain points, mapping regulatory constraints for marketing. Produces a 5-part report (Market Overview, Competitive Intelligence, Customer Segmentation, Trends, Opportunities). NOT for: selecting which segments to attack (use niche-discovery), analyzing a specific competitor in depth (use competitor-intelligence), or creating content (use content skills)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '5.0'
  system: SanchoCMO
  phase: '1'
  pillar: market-intelligence
  layer: '2'
  depends_on: company-context
  updated: '2026-03-09'
  changes: v5 — Primary Source Verification obligatorio (Step 1.5). Slide Summary
    autogenerado (Step 4.5). Checklist con tiers P0/P1/P2. Hydration con regla de
    competidores heredados.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/competitors/current.md
context_writes:
- brand/{slug}/market-and-us/market/current.md
---

# Market Intelligence

> Entiende el campo de juego antes de jugar. TAM, segmentos, competidores, clientes, regulación, tendencias.

**Input**: company-context (industria, vertical, producto)
**Output**: Informe 5 partes → `brand/{slug}/market-and-us/market/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — es la fuente de verdad | Las 5 partes del informe con instrucciones detalladas |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación por sección |
| [concepts.md](references/concepts.md) | Si necesitas recordar qué es TAM, madurez, etc. | Definiciones y metodología |
| [schema.md](references/schema.md) | Si necesitas el schema de campos/tipos | Estructura de datos del output |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Preparar contexto
- Lee `brand/{slug}/company-context/current.md` y `brand/{slug}/market-and-us/competitors/current.md`
- Identifica: industria, vertical, producto, geografía, equipo

### 1.5. Primary Source Verification (OBLIGATORIO)

Para CADA competidor — heredados de company-context Y descubiertos en research:

1. `web_fetch(homepage)` → posicionamiento REAL, tagline, propuesta de valor
2. `web_fetch(/pricing o /plans o /#pricing)` → pricing REAL
3. `web_fetch(/features o /product o /services)` → features REALES
4. `web_fetch(/about)` → equipo, historia, credenciales

**Reglas HARD:**
- NUNCA escribir sobre un competidor sin haber scrapeado su web
- Si pricing no público → marcar `⚠️ Pricing no público — verificar manualmente`
- Si web no carga → marcar `⚠️ Web no accesible, datos de fuentes secundarias`
- Fuente primaria (web competidor) > fuente secundaria (artículos) SIEMPRE

### 2. Investigar siguiendo el prompt
- Lee `references/prompt.md` — es tu guía sección por sección
- Ejecuta búsquedas web (mínimo 10-15) cubriendo las 5 partes:
  - **Parte 0**: Executive Narrative (síntesis narrativa de todo el análisis)
  - **Parte 1**: TAM, segmentos, geografía, madurez
  - **Parte 2**: Competidores, cuota, estrategias, RRSS, amenazas
  - **Parte 3**: Segmentos de cliente, psicográfico, conductual, pain points, personas
  - **Parte 4**: Tendencias, comportamiento consumidor, plataformas, regulación
  - **Parte 5**: Gaps, oportunidades, atractivo, hoja de ruta
- Para cada parte, busca en múltiples ángulos (español + inglés, general + específico)
- Incluye escucha social: foros, reviews, comentarios en RRSS para pain points reales

### 3. Escribir el documento (STORYTELLING OBLIGATORIO)
- **EMPIEZA con Executive Narrative (Parte 0)** — 1 página, narrativa pura, cero tablas
- Sigue la estructura de `references/prompt.md` parte por parte
- **CADA SECCIÓN**: Contexto narrativo → Evidencia (tablas/datos) → Interpretación ("so what?") → Implicación
- **TRANSICIONES**: Párrafo puente entre partes (conecta lo anterior con lo siguiente)
- **TONO**: Presentación al CEO, no reporte técnico — "Esto significa que...", "La oportunidad está en..."
- Cada claim con fuente inline: `dato [Fuente](url)`
- Si no hay fuente → marca `⚠️ Estimación sin fuente verificada`
- Si un dato no está disponible públicamente → declara "No disponible" con razón
- Target: 15-25 páginas (exhaustivo pero enfocado y narrativo)

### 4. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- Revisa CADA ítem contra tu documento
- Si hay ❌ (falta) → investiga más con búsquedas enfocadas
- Repite hasta que todo sea ✅ o ⚠️ (justificado)
- Spot-check: verifica 5-10 URLs con `web_fetch`
- Cruza cifras contra brand files (company-context, competitors)
- Añade metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 4.5. Generar Slide Summary (OBLIGATORIO)

Después del Self-QA, genera el bloque `## Slide Summary` al final del informe (antes de `## Fuentes`):

- Extrae datos SOLO del informe ya escrito — no inventar nada nuevo
- Formato YAML-in-markdown (parseable por skill de slides)
- Plantilla completa en `references/prompt.md` → sección "Slide Summary"
- Max 30 líneas YAML
- Debe ser autosuficiente: con solo este bloque se genera la slide sin leer el resto

### 5. Guardar con versionado
- Ruta: `brand/{slug}/market-and-us/market/current.md`
- Si ya existe → backup como `v{N+1}.md`, sobreescribe `current.md`, actualiza `history.json`
- Link al usuario: `{MC_BASE_URL}/docs/brand/{slug}/market-and-us/market/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| TAM | budget-constraints, niche-discovery-100x |
| Madurez | Phase 0 diagnostic, positioning-messaging |
| Regulación + marketing restrictions | **TODOS los skills de contenido** (paid-ads, landing, social, email) |
| Tendencias (oportunidades) | swot-analysis (Opportunities) |
| Tendencias (amenazas) | swot-analysis (Threats) |
| Segmentos de cliente | niche-discovery-100x, content strategy |
| Competidores | competitor-intelligence, positioning |
| Mercados adyacentes | Phase 3 scaling |

---

## Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
Puedo lanzar deep-research para ampliar con más fuentes y validación cruzada.
→ Escribe **"profundizar"** para continuar.
```

Si el usuario dice "profundizar": relee el documento, haz 10-20 búsquedas adicionales enfocadas en los gaps, actualiza el documento.

---

## Citación (Regla 0b SOUL.md)

Toda cifra con URL inline + sección `## Fuentes` al final con lista numerada completa. No inventar URLs. Claims sin fuente → `⚠️`.

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/market/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `{MC_BASE_URL}/docs/brand/{slug}/market-and-us/market/current.md`
