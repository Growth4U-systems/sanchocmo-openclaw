---
name: budget-constraints
description: "Budget, timeline, team capacity, and tool stack mapping. Use when: capturing client resources and constraints early in engagement. Maps money, time, people, and tools. Determines Lite vs Deep, channel viability, and execution capacity. NOT for: channel selection (use channel-prioritization), financial auditing, or tool procurement."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: budget-constraints
  layer: '0'
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles.
context_required:
- brand/{slug}/company-brief/current.md
# Lite fallbacks (read-only, treat as preliminary seed, not as final truth):
- brand/{slug}/company-brief/lite.md            # merge view fallback (always lite today)
- brand/{slug}/budget/lite.md                   # own seed from fast-foundation (hydration only)
context_writes:
- brand/{slug}/budget/current.md
- brand/{slug}/operational/learnings.md
---

# Budget & Constraints

> Mapea el dinero, el tiempo, las personas y las herramientas. Cada decisión downstream está acotada por estos constraints.

**Input**: Conversación con cliente + company-context existente
**Output**: Budget Constraints Profile → `brand/{slug}/budget/current.md` (standalone — la única fuente de verdad que esta skill escribe).

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Bloques de preguntas, formato output, benchmarks |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas criterios Lite/Deep, edge cases | Definiciones y conversation design |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura de datos del output |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required` (company-context, business-model si existe)
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Budget Range (~5 min)
- Capturar inversión actual en marketing/mes
- Si cero: cuánto dispuestos a invertir
- Si vago: ofrecer rangos (<1K, 1-5K, 5-15K, 15-50K, 50K+)
- Split: ads vs herramientas vs personas
- Flexibilidad: techo fijo o escalable con resultados

### 2. Time & People (~5 min)
- Quién se encarga del marketing actualmente
- Horas semanales disponibles para marketing
- Capacidad de crear contenido (escribir, diseñar, grabar)
- Timeline: semanas, meses, o largo plazo

### 3. Tool Stack (~5-10 min)
- Inventario de herramientas actuales por categoría
- Detección proactiva de solapamiento (40% overlap típico)
- Identificar gaps críticos (analytics, CRM, email, SEO)

### 4. Generar Budget Summary
- Lee `references/prompt.md` para el formato exacto
- Resume: presupuesto, equipo, timeline, stack, implicación

### 5. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- Todo ✅ o ⚠️ antes de entregar
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 6. Guardar con versionado
- Ruta: `brand/{slug}/budget/current.md` (standalone, único archivo que esta skill escribe)
- Si ya existe → backup como `v{N+1}.md`, sobreescribe `current.md`, actualiza `history.json`

> **Merge view `company-brief/current.md`**: lo regenera únicamente `fast-foundation` (no esta skill). Si esta skill se corre standalone, el merge view queda desfasado hasta la próxima corrida completa — aceptado por ahora.

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Budget range | foundation-orchestrator (Lite vs Deep), channel selection Phase 3 |
| Timeline | foundation-orchestrator (urgency), goal-setting |
| Team hours + capabilities | content-workflow, outreach-workflow |
| Tool stack | Phase 2 funnel builder, analytics-tracking |
| Gaps identificados | Phase 2 recommendations, tool selection |
| Budget flexibility | experiment design, scaling decisions |

---

## Profundizar con Deep Research

Al entregar, añade bloque de profundización estándar.

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/budget/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `{MC_BASE_URL}/docs/brand/{slug}/budget/current.md`
