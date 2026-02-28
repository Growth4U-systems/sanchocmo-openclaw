---
name: foundation-orchestrator
description: >
  Manages the 16 Foundation pillars for a client in Phase 1. Tracks status,
  resolves dependencies, suggests which pillar to work on next, handles
  Foundation Lite vs Deep, and coordinates individual pillar skills. Use when
  Phase 0 routes to Phase 1, when user says "foundation status", "what pillar
  next", "show my progress", or at the start of any Phase 1 session. Do NOT
  use for executing individual pillars (use pillar-specific skills instead).
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: "1"
---

# Foundation Orchestrator

> Manage the 16-pillar Foundation build. Track, prioritize, coordinate.

This skill does NOT do pillar work. It MANAGES pillar work — tracking the DAG, resolving dependencies, suggesting what to work on next, and coordinating the transition from Phase 1 to Phase 2.

---

## Entry Behavior (Phase 1 starts)

When a client enters Phase 1 (routed from phase-0-diagnostic):

### Step 1: Determine Path

```
if client has URL:
    path = "URL-first" (infer before asking)
elif client has documents (pitch deck, brand guide, etc.):
    path = "Document-first" (extract before asking)
else:
    path = "Questions-only"
```

### Step 2: Infer-First Data Pump

Before asking a single question, pull everything available:

**From URL** (if exists):
- Product/service, pricing, business model
- Positioning, messaging, tone of voice
- Social media links + activity level
- Tech stack indicators (analytics, CRM, widgets)
- SEO baseline (DA, indexed pages, traffic estimates)
- App store listings, review platforms

**From Notion/CRM** (if connected):
- Existing documents, meeting notes, proposals
- Task history, deal stages, customer notes

**From documents** (if provided):
- Map every extracted fact to a specific pillar field
- Track source for each fact (for validation)

### Step 3: Show Coverage Map

After inference, show the client what was auto-filled:

```
COVERAGE MAP — Lo que ya se de tu empresa:

  Pillar                    Coverage   Source
  ─────────────────────────────────────────────
  Company Context           ████░░ 60%  Web + Notion
  Brand Voice (Quick)       ███░░░ 50%  Web
  Budget & Constraints      ░░░░░░  0%  (necesito preguntarte)
  Business Model            ██████ 90%  Web + pricing page
  Company Profile           ████░░ 70%  Web + LinkedIn
  Self-Intelligence         ██░░░░ 30%  Web (solo Lens 1)
  Customer Data             ░░░░░░  0%  (necesito acceso CRM)
  Marketing Assets          ███░░░ 50%  Web + social
  Competitor Intelligence   █░░░░░ 15%  Web (nombres solo)
  Market Intelligence       ██░░░░ 25%  Web
  ─────────────────────────────────────────────
  OVERALL: 39% auto-filled | 61% needs your input

  Siguiente paso: Validar lo que encontre y completar
  Budget & Constraints (0%) — es rapido y desbloquea mucho.
```

Present inferred data for validation: "Esto es lo que entiendo. Corrige lo que este mal."

### Step 4: Determine Lite vs Deep

Based on client context from Phase 0:

```
if goals include "results NOW" or timeline < 30 days:
    mode = "Foundation Lite"
    target_pillars = LITE_SET (7 pillars)
elif goals include "build solid ground" or timeline > 60 days:
    mode = "Foundation Deep"
    target_pillars = ALL_16
else:
    ask: "Quieres empezar a ejecutar rapido (Foundation Lite, ~1 dia)
          o prefieres construir una base solida primero (Foundation Deep, ~1 semana)?"
```

---

## The DAG (Dependency Graph)

16 pillars organized in 6 layers. A pillar is "available" when all its dependencies are met.

See [references/pillar-registry.md](references/pillar-registry.md) for the complete registry with dependencies, done criteria, skip conditions, and Lite/Deep classification per pillar.

### Layer Map

```
LAYER 0 — ALWAYS-FIRST (no dependencies):
  company-context, brand-voice-quick, budget-constraints

LAYER 1 — PARALLEL (needs Layer 0):
  business-model, company-profile, self-intelligence,
  customer-data, marketing-assets, competitor-intel, market-intel

LAYER 2 — SYNTHESIS (needs specific Layer 1 pillars):
  swot-tows (needs: self-intelligence + competitor-intel + market-intel)

LAYER 3 — DISCOVERY (needs Layer 2):
  icp-100x-niches (needs: swot-tows + customer-data)

LAYER 4 — ACTIVATION (needs Layer 3):
  ecp-validation (needs: icp-100x-niches)
  positioning-messaging (needs: icp-100x-niches + competitor-intel)
  pricing-hooks (needs: icp-100x-niches + competitor-intel)

LAYER 5 — REFINEMENT (needs Layer 4):
  brand-voice-full (needs: positioning-messaging + icp-100x-niches)
```

### Status per Pillar

Each pillar has one status:

| Status | Meaning |
|--------|---------|
| `locked` | Dependencies not met — cannot start |
| `available` | Dependencies met — ready to work on |
| `in_progress` | Currently being worked on |
| `lite_done` | Minimum criteria met (enough for downstream) |
| `deep_done` | Full criteria met (comprehensive) |
| `skipped` | Not applicable (e.g., customer-data for pre-launch) |

**Transition rules:**
- `locked` → `available`: when ALL dependency pillars reach `lite_done` or higher
- `available` → `in_progress`: when Sancho or user starts working on it
- `in_progress` → `lite_done`: when Lite done criteria met (see registry)
- `lite_done` → `deep_done`: when Deep done criteria met
- Any → `skipped`: when skip condition is true

---

## Session Behavior (every Phase 1 session)

At the start of each Phase 1 session:

### 1. Show Status Board

```
FOUNDATION STATUS — [Client Name]
Mode: Foundation Lite (7/16 target) | Day 2

  LAYER 0 (Always-First)
  ✅ Company Context          deep_done
  ✅ Brand Voice (Quick)       lite_done
  ⬜ Budget & Constraints      available    ← SUGGESTED NEXT

  LAYER 1 (Parallel)
  🔄 Business Model            in_progress
  ⬜ Company Profile           available
  🔒 Self-Intelligence         available
  ➖ Customer Data             skipped (pre-launch)
  ⬜ Marketing Assets          available
  🔒 Competitor Intelligence   available
  🔒 Market Intelligence       available

  LAYER 2+
  🔒 SWOT + TOWS              locked (needs: self + competitor + market)
  🔒 ICP & 100x Niches        locked
  🔒 ECP Validation           locked
  🔒 Positioning & Messaging  locked
  🔒 Pricing & Hooks          locked
  🔒 Brand Voice (Full)       locked

  Progress: 2/7 Lite pillars done (29%)
  Estimated: 4-5 hours remaining for Lite
```

### 2. Suggest Next Pillar

Priority algorithm (in order):

1. **Most unblocking** — the pillar that unlocks the most downstream work
   - competitor-intel unlocks: swot-tows → icp-100x → 4 more = 6 downstream
   - market-intel unlocks: swot-tows → icp-100x → 4 more = 6 downstream
   - self-intelligence unlocks: swot-tows → icp-100x → 4 more = 6 downstream (+ viability checkpoint)

2. **Most data ready** — pillar with highest coverage from inference (quick win)
   - If business-model is 90% auto-filled, suggest completing it first

3. **User momentum** — if user showed interest in a topic, suggest its pillar
   - "You mentioned competitors earlier — want to work on Competitor Intelligence?"

4. **Work type match** — suggest based on what the user can do now
   - Research pillars (self-intel, competitor-intel, market-intel) = Sancho does heavy lifting
   - Input pillars (budget, customer-data) = user provides info
   - Analysis pillars (swot, icp) = collaborative

**Present the suggestion:**
> "Siguiente: te recomiendo **Budget & Constraints** — es rapido (5 min),
> no lo tengo de ninguna fuente, y desbloquea las decisiones de niche y canal.
> Alternativa: si prefieres que yo trabaje mientras, puedo investigar
> **Competitor Intelligence** en paralelo."

### 3. Track Work Type per Pillar

| Type | Who does what | Examples |
|------|---------------|---------|
| `research` | Sancho does 90%, user validates | Self-Intelligence, Competitor Intel, Market Intel |
| `input` | User provides, Sancho structures | Budget, Customer Data, Company Context |
| `analysis` | Collaborative — Sancho proposes, user decides | SWOT, ICP/100x, Positioning |
| `creative` | Collaborative — Sancho drafts, user refines | Brand Voice, Pricing Hooks |

This lets Sancho suggest **parallel work**: "While you answer Budget questions, I'll research your top 3 competitors."

---

## Viability Checkpoint

After self-intelligence reaches `lite_done`, auto-run:

```
if avg_review_score < 2.5 across platforms:
    flag "PRODUCT VIABILITY CONCERN"
    suggest Pre-Product path (audience building, community, waitlist)
elif major_product_gaps vs competitors:
    flag "PRODUCT GAPS DETECTED"
    suggest addressing gaps before full Foundation
else:
    pass — continue normally
```

This is advisory. User decides whether to continue or pivot.

---

## Foundation Lite Fast Path

When in Lite mode, target these 7 pillars:

1. Company Context → `lite_done` (1-2 hours)
2. Brand Voice Quick → `lite_done` (30 min)
3. Budget & Constraints → `lite_done` (30 min)
4. Business Model → `lite_done` (30 min)
5. Quick Competitor Scan → `lite_done` (2-3 hours, Lens 1 only)
6. Rough ICP → `lite_done` (1 hour, from data or intuition)
7. Basic Messaging → `lite_done` (1-2 hours)

**Total: ~1 day.** Output: enough to start Phase 2 or Phase 3 execution.

### Persistent Lite Warning

When Foundation Lite is active, show at the start of EVERY session:

> "Foundation Lite activa — [X]/16 pillars completos.
> Te recomiendo profundizar **[pillar name]** porque esta bloqueando
> [downstream work]. Quieres invertir 30 minutos?"

Rules:
- Show once per session per missing pillar (not every interaction)
- Suggest the MOST IMPACTFUL missing pillar (most unblocking)
- Tone: helpful, not naggy
- User can always say "skip" — Sancho proceeds with best-effort output
- Warning never disappears until Foundation Deep criteria met

---

## Gate to Phase 2

When user wants to move to Phase 2 (or Sancho suggests it):

### Minimum Gate (Advisory)

```
GATE CHECK — Ready for Phase 2?

  Required (must be lite_done or higher):
  ✅ Company Context
  ✅ Brand Voice Quick
  ✅ Budget & Constraints
  ✅ Business Model
  ⚠️ At least 1 ICP/ECP defined (even rough)
  ⚠️ Basic messaging exists

  Recommended (improves Phase 2 quality):
  ⬜ Competitor Intelligence (helps LP differentiation)
  ⬜ Self-Intelligence (helps audit existing funnel)

  Verdict: READY (with warnings)
  "Puedes empezar Phase 2. Tu funnel sera mejor si primero
  completas Competitor Intelligence — pero no es obligatorio."
```

**This gate is advisory, not a hard block.** Show the risk of proceeding without meeting it. Let the user override: "Entendido, las LPs pueden no estar bien diferenciadas. Empezamos igualmente."

---

## Lateral Movement Rules

When a pillar gets stuck (user doesn't have data, external research pending):

1. Mark pillar as `available` (not in_progress) with a note: "Pendiente: [what's needed]"
2. Suggest a different available pillar
3. Never wait — always move laterally to productive work
4. When the blocker resolves, Sancho proactively suggests returning

**Cross-pillar enrichment:** Working on one pillar often reveals data for others. When this happens:

> "Mientras investigaba Competitor Intelligence, encontre datos sobre
> tu Market Intelligence (TAM estimado, tendencias del sector).
> Quieres que los incorpore?"

Always incorporate cross-pillar findings with user confirmation.

---

## Re-Entry Behavior

When a client returns to Phase 1 (from Phase 2/3 re-diagnostic, or for deepening):

1. Load existing pillar status from Context Lake
2. Show updated status board
3. Highlight what changed since last time (new data from execution, Aprende insights)
4. Suggest which pillar to deepen based on execution learnings

> "Desde la ultima vez, has ejecutado 3 semanas de contenido.
> Los datos muestran que ECP #2 convierte mejor de lo esperado.
> Recomiendo actualizar Positioning & Messaging para reflejar esto."
