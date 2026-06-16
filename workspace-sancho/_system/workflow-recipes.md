# Workflow Recipes — SanchoCMO

> Flujos pre-construidos. Para detalle de phases, ver `_system/foundation/phase-playbooks.md`.

---

## Workflow 1: New Client Onboarding

**Tiempo:** ~45 min
**Pre-requisitos:** URL del cliente o docs

| Step | Que | Tiempo |
|------|-----|--------|
| 1 | Infer-First (auto-fill desde URL/docs/Notion) | 5 min |
| 2 | Coverage Report + validacion usuario | 5 min |
| 3 | 3 Preguntas Estrategicas (negocio, meta, recursos) | 5 min |
| 4 | Foundation Blitz (3 pillars en paralelo) | 15-20 min |
| 5 | Viability Checkpoint (automatico) | auto |
| 6 | Phase Decision (presentar recomendacion) | 5 min |
| 7 | Route to Phase orchestrator | auto |

**Detalle completo:** `_system/onboarding/onboarding-playbook.md`

---

## Workflow 2: Foundation Lite Fast Path

**Tiempo:** ~1 dia
**Pre-requisitos:** Blitz completado (Workflow 1)
**Target:** 7 pillars esenciales

| Bloque | Pillars | Tiempo |
|--------|---------|--------|
| Morning | Foundation Blitz (done), Brand Voice Quick, Budget & Constraints | ~1h |
| Afternoon | Business Model, Basic Messaging | ~2h |

**Output:** Ready para Phase 2 (Funnel) o Phase 3 (Scale).

---

## Workflow 3: Foundation Deep Complete

**Tiempo:** ~1 semana
**Pre-requisitos:** Blitz completado
**Target:** 16 pillars (ver DAG en `phase-playbooks.md`)

| Dia | Que |
|-----|-----|
| Day 1 | Foundation Blitz + Always-First (3 pillars) |
| Day 2 | Parallel Pillars batch 1 (4 pillars) |
| Day 3 | Parallel Pillars batch 2 (4 pillars) |
| Day 4 | SWOT + TOWS |
| Day 5 | 100x Niche Discovery |
| Day 5-7 | ECP Validation |
| Day 8-9 | Positioning per ECP |
| Day 10 | Pricing Hooks |
| Day 11 | Brand Voice Full |
| Day 12 | Foundation review + Gate to Phase 2 |

**Output:** Complete strategic foundation.

---

## Workflow 4: Quick Launch

**Tiempo:** ~2 dias
**Pre-requisitos:** Foundation Lite minimo

| Dia | Que |
|-----|-----|
| Day 1 | Foundation Lite (if not done), Trust Engine Express (1 caso de exito), Landing page copy |
| Day 2 | Email sequence (5 emails), Social content (launch promo), Setup tracking |

**Output:** Launch-ready funnel.

---

## Workflow 5: Fix What's Broken

**Tiempo:** ~1-3 dias
**Pre-requisitos:** Algo no esta funcionando

| Step | Que | Tiempo |
|------|-----|--------|
| 1 | Phase 0 Diagnostic (identificar breakdown) | ~2h |
| 2 | Root Cause Analysis (Foundation gap o execution issue?) | ~1h |
| 3 | Targeted Fix (completar pillar faltante o arreglar asset) | variable |
| 4 | Validate Fix (metrics check, A/B test) | variable |
| 5 | Re-route to appropriate Phase | auto |

---

## Rutinas Periódicas

### Rutina Diaria
1. Ejecuta `daily-pulse` en #intelligence
2. Revisa métricas de campañas activas
3. Propone ajustes en #campaigns si hay desviaciones

### Síntesis Semanal
1. Recopila learnings de todos los canales
2. Publica resumen en #learning
3. Actualiza `brand/{slug}/operational/learnings.md` con patrones confirmados

### Nueva Campaña (flujo completo)
1. Define objetivo + ECP target + canales
2. Crea entrada en tabla `campaigns`
3. Delega a los especialistas en paralelo para las piezas:
   - `Agent(subagent_type="dulcinea")` para contenido
   - `Agent(subagent_type="maese-pedro")` para assets visuales
   - `Agent(subagent_type="mambrino")` para ad copy
4. Recibe resultados y envía a Rocinante para brand check
5. Publica resultados aprobados en canales correspondientes
6. Trackea progreso en hilos de #campaigns

### Feedback Loops (obligatorio)
Después de cada deliverable grande, pregunta cómo fue y logea a `brand/{slug}/operational/learnings.md`.
