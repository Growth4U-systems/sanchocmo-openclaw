# ECP Validation — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Skip Conditions Check

- [ ] **Skip conditions evaluadas** (timeline < 4 weeks, validate-through-execution, budget, obvious ECPs)
- [ ] **Decisión RUN/SKIP documentada** con justificación

## Step 1: Assumption Mapping (por ECP)

- [ ] **Todas las assumptions listadas** (target audience, problem, positioning, pricing, channels)
- [ ] **Importance × Evidence grid** construido por assumption
- [ ] **Leap of faith assumptions** identificadas (high importance, low evidence)
- [ ] **Experiment backlog** priorizado

## Step 2: Experiment Design (por assumption crítica)

- [ ] **Cada critical assumption** tiene un experimento diseñado
- [ ] **Cada experimento tiene**: nombre, método, success criteria, tiempo, coste, confidence gain
- [ ] **Métodos variados** (SAY + DO → no solo interviews, también landing/waitlist/presale)
- [ ] **Success criteria** son MEDIBLES (números concretos, no "buena respuesta")

## Step 3: Experiment Execution

- [ ] **Interviews**: 15-20 realizadas hasta detectar patrones (o marcado pendiente)
- [ ] **Landing page**: conversion rate medido (target > 5%)
- [ ] **Waitlist**: engagement medido (open rate, referrals)
- [ ] **Presale**: pagos reales documentados (si aplica)
- [ ] **MVI**: usage frequency, NPS, willingness to pay medidos (si aplica)
- [ ] **Content test**: downloads, shares, signups medidos (si aplica)

## Step 4: Results Analysis

- [ ] **Cada experimento tiene resultado** (Pass / Partial / Fail)
- [ ] **Evidence documentada** con métricas concretas
- [ ] **Insights extraídos** por experimento
- [ ] **Action derivada** (PASS → proceed, PARTIAL → refine, FAIL → deprioritize)

## Output

- [ ] **Validation status por ECP** (✅ VALIDATED / ⚠️ PARTIAL / ❌ FAILED)
- [ ] **Go/No-Go decision** por ECP con rationale
- [ ] **Overview completo** (ECPs tested, experiments run, timeline, cost)
- [ ] **Summary Recommendations** (prioritize, deprioritize, refine)
- [ ] **Next actions** por ECP validado (positioning angle, channel, price point)
- [ ] **ecps.md actualizado** con validation status y reordenado por confianza

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/ecp-validation/ecp-validation-current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada resultado tiene datos** (números, no opiniones)
- [ ] **0 resultados inventados** — todos de experimentos reales
- [ ] **Success criteria comparados** contra resultados reales
- [ ] **Coherencia con brand files** (ecps.md, positioning.md)
- [ ] **Frameworks de Maja Voje** aplicados correctamente
- [ ] **learnings.md actualizado** con hallazgos clave

---

## Flujo de uso

```
1. Evaluar skip conditions → si SKIP, documentar y terminar
2. Si RUN → ejecutar Steps 1-4 por cada ECP
3. Al terminar, lee este checklist
4. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica o skipped con razón
   - ❌ = falta — completar
5. Si hay ❌ → completar antes de entregar
6. SOLO ENTONCES guardar y entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
