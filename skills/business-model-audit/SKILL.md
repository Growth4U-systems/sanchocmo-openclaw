---
name: business-model-audit
description: "Business model classification and growth motion mapping. Use when: understanding HOW the company acquires and monetizes customers — revenue model, growth motion (PLG/MLG/Sales-led), current funnel, unit economics. The business model determines which growth levers exist. NOT for: financial forecasting, pricing strategy (use pricing-hooks), or market analysis (use market-intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: business-model-audit
  layer: '1'
  depends_on: company-context
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/competitors/current.md
context_writes:
- brand/{slug}/business-model/current.md
- brand/{slug}/operational/learnings.md
---

# Business Model & Growth Model

> Entiende CÓMO la empresa adquiere y monetiza clientes. El modelo de negocio determina qué growth levers existen.

**Input**: company-context (necesita elevator_pitch, product_type, b2b_b2c mínimo)
**Output**: Business Model Profile → `brand/{slug}/business-model/current.md` (standalone — la única fuente de verdad que esta skill escribe).

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Preguntas, classificación, funnel mapping, Discovery Tasks |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas revenue model archetypes, growth motion signals | Definiciones, tablas de clasificación, edge cases |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura de datos + sector benchmarks |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required` (company-context, competitors si existe)
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Classify the Model (~10 min)
- Determinar archetype del revenue model
- Preguntar ticket medio y LTV estimado
- Capturar expansion vs new customer ratio
- Si desconocido → crear Discovery Task

### 2. Map the Growth Motion (~10 min)
- Clasificar: PLG, MLG, o Sales-Led
- Comparar lo que el cliente cree vs lo que competitors hacen
- Determinar: ¿self-serve o sales-assisted?

### 3. Map Current Funnel (~10 min)
- Documentar camino: descubrimiento → pago, paso a paso
- Identificar bottleneck (dónde se caen más personas)
- Capturar datos de conversión por paso (measured/estimated/unknown)

### 4. Generar Business Model Summary
- Lee `references/prompt.md` para formato exacto
- Incluir Discovery Tasks para unknowns

### 5. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- Todo ✅ o ⚠️, si ❌ → investigar más
- Metadata QA en documento

### 6. Guardar con versionado
- Ruta: `brand/{slug}/business-model/current.md` (standalone, único archivo que esta skill escribe)
- Si ya existe → backup como `v{N+1}.md`, sobreescribe `current.md`, actualiza `history.json`

> **Merge view `company-brief/current.md`**: lo regenera únicamente `fast-foundation` (no esta skill). Si esta skill se corre standalone, el merge view queda desfasado hasta la próxima corrida completa — aceptado por ahora.

---

## Unknown Handling

Muchos clientes no sabrán unit economics, conversion rates, o detalles del revenue model. Cuando una pregunta obtiene "no sé":
- Log como **Discovery Task** (qué averiguar, cómo, quién lo hace)
- Nunca bloquear progreso por unknowns
- Capturar lo que SÍ se sabe, flaggear lo que NO, y avanzar

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| B2B/B2C + revenue model | Todos downstream — channel, content type, funnel design |
| PLG/MLG/Sales-led | Phase 2 funnel architecture, Phase 3 channel strategy |
| Funnel + bottleneck | phase-0-diagnostic (scoring), Phase 2 (fix priority) |
| Unit economics | budget-constraints (¿es CAC sostenible?), experiment design |
| Competitor growth motions | positioning-messaging, channel strategy |
| Discovery Tasks | Client action items, Phase 2 analytics setup |

---

## Profundizar con Deep Research

Al entregar, añade bloque de profundización estándar.

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/business-model/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `<MC_BASE>/docs/brand/{slug}/business-model/current.md`
