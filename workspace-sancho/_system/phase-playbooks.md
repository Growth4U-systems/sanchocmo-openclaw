# Phase Playbooks — SanchoCMO

> Detalle de cada fase. Para overview, ver SOUL.md → Marco Estrategico.

---

## Phase 0: Diagnose

**When:** Siempre — todo cliente empieza aqui (o vuelve aqui cuando algo esta roto).

**Question:** ¿Donde esta el cuello de botella?

**Process:**
1. Quick funnel audit (si existe)
2. Identificar breakdown point
3. Ruta al fix apropiado

**Symptoms → Routes:**

| Sintoma | Ruta |
|---------|------|
| No Foundation | → Phase 1 |
| Foundation existe, no conversions | → Phase 2 |
| Funnel funciona, no traffic | → Phase 3 |
| Traffic + funnel, revenue flat | → Phase 1 (pricing) + Phase 2 (paywall) |

---

## Phase 1: Foundation

**When:** Context Lake vacio o debil.

**Question:** ¿Quienes somos, a quien servimos, que decimos?

### Foundation Lite (7 pillars, ~1 dia)

**Target pillars:**
1. Company Context (done in Blitz)
2. Self-Intelligence Lens 1 (done in Blitz)
3. Competitor Intel Lens 1 (done in Blitz)
4. Brand Voice Quick
5. Budget & Constraints
6. Business Model
7. Basic Messaging (rough positioning)

**When to use:** Meta = LEADS o ESCALAR (need speed).
**Output:** Enough to start Phase 2 o Phase 3.

### Foundation Deep (16 pillars, ~1 semana)

**Full Pillar DAG:**

```
LAYER 0 (Always-First):
  company-context
  brand-voice-quick
  budget-constraints

LAYER 1 (Parallel):
  self-intelligence (full Lens 1-3)
  competitor-intel (full Lens 1-3)
  market-intelligence
  business-model
  company-profile
  customer-data
  marketing-assets

LAYER 2 (Synthesis):
  swot-tows (needs: self + competitor + market)

LAYER 3 (Discovery):
  icp-100x-niches (needs: swot + customer-data)

LAYER 4 (Activation):
  ecp-validation (needs: ecps selected)
  positioning-messaging (needs: ecps + competitor)
  pricing-hooks (needs: ecps + competitor pricing)

LAYER 5 (Refinement):
  brand-voice-full (needs: positioning + ecps)
```

**When to use:** Meta = LANZAR (need solid foundation).

**Gate to Phase 1.5:**
- Minimum: 7/16 (Lite)
- Recommended: 16/16 (Deep)
- Advisory, not hard block

---

## Phase 1.5: Decide (Sprint 1)

**When:** Foundation existe, necesitas decidir QUE canales y COMO activarlos.

**Question:** ¿Que canales usamos, que contenido publicamos, como llegamos a cold prospects?

**Skills (3):**

```
channel-prioritization ─┬→ content-calendar-planner
                        └→ outreach-sequence-builder
```

**channel-prioritization:** Hormozi Core Four + 5-dimension scoring (ICP-fit, Budget-fit, Team-capacity, Competitive-gap, Time-to-result). Lee todos los Foundation files. Produce `./brand/channel-plan.md` con 2-4 canales recomendados + budget split (70/20/10).

**content-calendar-planner:** 3-5 content pillars de positioning + ECPs. Mapea a funnel stages (TOFU/MOFU/BOFU). Monthly overview + weekly detail. Lee channel-plan.md + keyword-plan.md. Produce `./brand/content-calendar.md`.

**outreach-sequence-builder:** COLD outbound sequences per ECP (NOT warm nurture). Multi-channel (email + LinkedIn). 5-7 touchpoints, GDPR compliant. Produce `./campaigns/outreach-{ecp}/sequences/`.

**Key distinction:** outreach-sequence-builder = COLD. email-sequences = WARM (opted-in).

**Gate to Phase 2:** Can answer "Which channels are we activating and what's the plan for each?"

---

## Phase 2: Funnel

**When:** Canales decididos, necesita conversion infrastructure.

**Question:** ¿Donde enviamos gente y convierte?

**Components:**
- Landing pages (per ECP)
- Lead capture forms
- Signup/registration flow
- Onboarding (post-signup)
- Email sequences (warm nurture)
- Paywall/upgrade screens
- Trust Engine (casos de exito)

**Output:** Conversion infrastructure lista para trafico.

**Gate to Phase 3:** Can answer "If I send 1,000 people, how many convert?"

---

## Phase 3: Scale

**When:** Funnel funciona, necesita trafico.

**Question:** ¿Como generamos trafico y crecemos?

### Core Four Activation

| Channel | When to Use |
|---------|------------|
| **Contenido Organico** | No budget, have time, want compounding |
| **Outreach Directo** | No budget, need leads now, can do manual work |
| **Partners & Afiliados** | Have budget, want distribution leverage |
| **Paid Ads** | Have budget, need scale fast, proven funnel |

### Intelligence Pipeline (skill chains)

```
INTELLIGENCE (Operations):
  meeting-intelligence → content-miner → pattern-detector

INTELLIGENCE (Content):
  daily-pulse → insight-to-content-mapper → seo-content / content-atomizer

DECIDE (Strategy):
  channel-prioritization → content-calendar-planner → seo-content / content-atomizer
                         → outreach-sequence-builder

OUTREACH (Prospecting):
  company-finder → decision-maker-finder → contact-enrichment → outreach-sequence-builder

COMPETITIVE:
  thief-marketers (steal ideas)
  signal-definition → signal-monitor (track buy signals)
```

**Routing guide:** Ver `_system/skill-routing.md` para disambiguation.

**Output:** Traffic systems generating leads/signups.
