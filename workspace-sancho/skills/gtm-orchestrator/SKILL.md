---
description: "Orchestrate GTM: channels, funnel, copy, launch."
user-invocable: false
context_required:
  - brand/company-context.md
  - brand/positioning.md
  - brand/voice-profile.md
  - brand/competitors.md
  - brand/icp.md
  - brand/channel-plan.md
context_writes:
  - campaigns/{slug}/brief.md
  - campaigns/{slug}/gtm-state.json
  - campaigns/{slug}/tasks/
  - campaigns/{slug}/content/
  - campaigns/{slug}/qa/
  - campaigns/{slug}/results.md
---

# GTM Orchestrator

> Orquesta la ejecución Go-To-Market desde Foundation aprobada hasta lanzamiento.

## HARD STOP — Foundation Gate

**Antes de CUALQUIER ejecución, verifica:**

```
if brand/foundation-status.json NOT exists OR status != "approved":
    STOP → "Foundation incompleta o no aprobada. No puedo ejecutar GTM.
            Completa Foundation primero (foundation-orchestrator)."
```

Lee `brand/` como **referencia READ-ONLY**. Nunca escribas en `brand/`.
Todos los outputs van a `campaigns/{slug}/`.

---

## Crear Campaña

1. Genera slug: `YYYY-MM-{nombre-corto}` (ej: `2026-03-tratamientos-launch`)
2. Crea estructura:

```
campaigns/{slug}/
  brief.md            ← objetivo, audiencia, canales, timeline
  gtm-state.json      ← estado del DAG (ver abajo)
  tasks/              ← tareas dispatched a Escuderos
  content/            ← outputs de ejecución
  qa/                 ← reviews de Rocinante
  results.md          ← métricas post-lanzamiento
```

3. Inicializa `gtm-state.json`:

```json
{
  "slug": "{slug}",
  "created": "YYYY-MM-DD",
  "status": "in-progress",
  "foundation_approved": true,
  "current_step": 1,
  "steps": {
    "1_keyword_research":       { "status": "pending", "approved": false },
    "2_positioning_validation":  { "status": "pending", "approved": false },
    "3_channel_prioritization":  { "status": "pending", "approved": false },
    "4_funnel_architecture":     { "status": "pending", "approved": false },
    "5_direct_response_copy":    { "status": "pending", "approved": false },
    "6_email_sequences":         { "status": "pending", "approved": false },
    "7_content_atomizer":        { "status": "pending", "approved": false },
    "8_creative_briefs":         { "status": "pending", "approved": false },
    "9_launch_checklist":        { "status": "pending", "approved": false }
  }
}
```

---

## DAG de Ejecución GTM

Cada paso sigue el ciclo: **ejecutar → presentar resultado → usuario aprueba → siguiente**.
No avanzar al siguiente paso sin aprobación explícita del usuario.

### Step 1: Keyword Research
- **Skill:** `keyword-research`
- **Input:** `brand/company-context.md`, `brand/icp.md`, `brand/positioning.md`
- **Output:** `campaigns/{slug}/content/keywords.md` — keywords + content pillars
- **Presenta:** Lista de keywords agrupadas por pilar, volumen, dificultad
- **Aprobación:** Usuario confirma keywords y pillars

### Step 2: Validar Positioning vs Keywords
- **Input:** `brand/positioning.md` + keywords aprobadas (Step 1)
- **Acción:** Verificar que el positioning actual alinea con las keywords target
- **Output:** `campaigns/{slug}/content/positioning-validation.md`
- **Presenta:** Match/mismatch analysis. Si hay gaps, recomendar ajustes
- **Aprobación:** Usuario confirma que positioning y keywords son coherentes

### Step 3: Channel Prioritization
- **Skill:** `channel-prioritization`
- **Input:** `brand/channel-plan.md` (si existe), Foundation files, budget
- **Output:** `campaigns/{slug}/content/channel-plan.md` — canales priorizados para esta campaña
- **Presenta:** 2-4 canales recomendados con budget split (70/20/10)
- **Aprobación:** Usuario confirma canales y distribución de budget

### Step 4: Funnel Architecture
- **Skill:** `funnel-architect` (T-030 — si disponible)
- **Input:** Canales aprobados (Step 3), positioning, ICP/ECPs
- **Output:** `campaigns/{slug}/content/funnel-design.md`
- **Presenta:** Diseño del funnel: awareness → consideration → conversion → retention
- **Aprobación:** Usuario aprueba estructura del funnel
- **Nota:** Si funnel-architect no existe aún, diseñar manualmente y documentar

### Step 5: Direct Response Copy
- **Skill:** `direct-response-copy`
- **Input:** Keywords, positioning, canales, funnel design, `brand/voice-profile.md`
- **Output:** `campaigns/{slug}/content/ad-copy.md` + `campaigns/{slug}/content/landing-pages.md`
- **Presenta:** Ad copy por canal + landing page copy
- **Aprobación:** Usuario aprueba copy (o pide revisiones)

### Step 6: Email Sequences
- **Skill:** `email-sequences`
- **Input:** Funnel design, positioning, voice profile, lead magnets
- **Output:** `campaigns/{slug}/content/email-sequences.md`
- **Presenta:** Nurture flows completos (subject lines, body, CTAs, timing)
- **Aprobación:** Usuario aprueba secuencias

### Step 7: Content Atomizer
- **Skill:** `content-atomizer`
- **Input:** Todo el content aprobado (Steps 5-6), canales (Step 3)
- **Output:** `campaigns/{slug}/content/distribution-plan.md` + piezas atomizadas
- **Presenta:** Plan de distribución: qué contenido, en qué canal, cuándo
- **Aprobación:** Usuario aprueba plan de distribución

### Step 8: Creative Briefs
- **Input:** Content aprobado, canales, brand guidelines
- **Output:** `campaigns/{slug}/tasks/creative-briefs/` — un brief por asset necesario
- **Presenta:** Lista de assets necesarios (imágenes, videos, carousels) con specs
- **Aprobación:** Usuario aprueba briefs (o ajusta)
- **Dispatch:** Enviar briefs a Escudero (creativo) via `sessions_spawn`

### Step 9: Launch Checklist
- **Input:** Todo lo anterior aprobado
- **Output:** `campaigns/{slug}/content/launch-checklist.md`
- **Presenta:** Go/No-Go checklist:
  - [ ] Keywords research aprobado
  - [ ] Positioning validado
  - [ ] Canales seleccionados
  - [ ] Funnel diseñado
  - [ ] Ad copy + LPs aprobados
  - [ ] Email sequences aprobadas
  - [ ] Distribution plan aprobado
  - [ ] Creative assets listos
  - [ ] Tracking configurado
  - [ ] Budget asignado
- **Decisión final:** GO → lanzar | NO-GO → qué falta

---

## State Tracking

Después de cada paso, actualizar `gtm-state.json`:

```json
{
  "status": "completed",
  "approved": true,
  "completed_at": "YYYY-MM-DD",
  "output_files": ["content/keywords.md"]
}
```

Actualizar `current_step` al siguiente paso pendiente.

Cuando Step 9 se aprueba con GO, cambiar `status` raíz a `"launched"`.

---

## Reglas

1. **brand/ es READ-ONLY** — nunca escribir ahí durante GTM
2. **campaigns/{slug}/ es el workspace** — todo output aquí
3. **Sin aprobación no se avanza** — cada paso necesita OK del usuario
4. **HARD STOP si Foundation incompleta** — no improvisar
5. **Rocinante QA** — dispatch QA a Rocinante para Steps 5, 6, 7 (copy-heavy)
6. **Escudero para ejecución** — dispatch a Escudero para creative assets (Step 8)
