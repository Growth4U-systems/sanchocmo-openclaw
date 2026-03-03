---
name: ecp-validation
description: "OPTIONAL pillar — test ECP assumptions before heavy execution. Use when: 4+ weeks timeline, multiple ECPs to choose between, high execution cost, pre-launch. Maja Voje frameworks: Assumption Mapping, Method Selection, MVI. Methods: interviews, landing page smoke tests, waitlists, presale, MVI. Skip if: timeline < 4 weeks, single obvious ECP, low execution cost, client prefers validate-through-execution."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: ecp-validation
  optional: true
  skip_if: timeline < 4 weeks OR validate-through-execution preferred
  framework: Maja Voje Assumption Mapping + MVI Framework
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/positioning-*.md
context_writes:
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/operational/learnings.md
---

# ECP Validation (OPTIONAL)

> **OPCIONAL** — Skip si timeline corto. Valida ECPs con usuarios reales. CONFIDENCE = EVIDENCE.

**Input**: ECPs de niche-discovery-100x + positioning
**Output**: Validation Results → `brand/{slug}/ecp-validation/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Frameworks Maja Voje, validation plan, experiment templates |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas skip conditions, methods deep dive, edge cases | Definiciones y Maja Voje resources |

---

## Skip Conditions

| Skip si | Run si |
|---------|--------|
| ❌ Timeline < 4 weeks | ✅ 4+ weeks timeline |
| ❌ Validate-through-execution preferred | ✅ Multiple ECPs to choose between |
| ❌ Budget constraints | ✅ High execution cost |
| ❌ ECPs obvious/proven | ✅ Pre-launch |

**Default Lite:** SKIP. **Default Deep:** RUN (if timeline permits).

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Map Assumptions per ECP
- List todas las assumptions (audience, problem, willingness to pay, channels)
- Map en 2 ejes: Importance × Evidence
- Identificar "leap of faith" assumptions (high importance, low evidence)

### 2. Design Experiments
- Para cada critical assumption: method, success criteria, time, cost, confidence gain
- Methods: Interviews (15-20), Landing page smoke test, Waitlist, Presale, MVI, Content test

### 3. Execute Tests
- Lee `references/prompt.md` para scripts detallados por método

### 4. Analyze Results
- Per experiment: Pass / Partial / Fail + evidence + insight
- Go/No-Go decision per ECP

### 5. Update ECPs
- Reorder by confidence (validated first)
- Update brand/{slug}/go-to-market/ecps.md with validation status
- Update brand/{slug}/operational/learnings.md

### 6. Self-QA + Guardar
- Checklist, versionado, `brand/{slug}/ecp-validation/current.md`

---

## Validation Through Execution (Alternative)

```
Instead of:   Validate ECPs → Then execute
Do:           Execute on top 2 ECPs → Measure results → Double down on winner
```

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Validated ECPs | positioning-messaging, content-workflow, channel selection |
| Validated price points | pricing-hooks |
| Validated channels | Phase 3 channel strategy |
| Failed ECPs | Deprioritization, resource reallocation |

---

## Profundizar con Deep Research

Al entregar, añade bloque de profundización estándar.
