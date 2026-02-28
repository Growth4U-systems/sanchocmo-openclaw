# SanchoCMO Framework — Complete System

> El CBO (Chief Brand Officer) para empresas tech.
> Portable framework para integrar en proyecto SanchoCMO.

**Version:** 3.1 (Feb 23, 2026)
**Created by:** Alfonso Sainz de Baranda (Growth4U)
**For:** Martín (SanchoCMO development)
**Based on:** vibe Marketer v2 architecture + SanchoCMO design

---

## Quick Start

1. **Read BRAIN.md first** — Complete system overview (7 parts)
2. **Review _system/** — Protocols que todas las skills siguen
3. **Install skills** — Copy `skills/` to your SanchoCMO project
4. **Reference protocols** — Add to each skill:
   ```markdown
   Read ./brand/ per _system/brand-memory.md
   Follow _system/skill-communication-protocol.md
   ```

---

## What's Inside

### BRAIN.md (START HERE)

Complete documentation del sistema:
1. **SOUL** — Cómo piensa Sancho (8 principios)
2. **SYSTEM** — Core Four, 4 Phases, routing logic
3. **KNOWLEDGE** — Data architecture (./brand/, 3 tiers conceptuales)
4. **ONBOARDING** — Cómo empieza un cliente (Foundation Blitz, 3 Questions)
5. **CONTEXT PARADOX** — Selective context passing (NOT dumping)
6. **PHASES** — Detailed (0: Diagnose, 1: Foundation, 2: Funnel, 3: Scale)
7. **WORKFLOWS** — Pre-built (New Client, Quick Launch, Foundation Lite/Deep, Fix)

**Read this FIRST.** Todo lo demás referencia BRAIN.md.

---

### _system/ (Shared Infrastructure)

**brand-memory.md** — THE protocol
- How to read/write ./brand/ files
- File ownership (ONE owner per file)
- Append-only rules (assets.md, learnings.md)
- Freshness TTLs (< 7d / 7-30d / 30-90d / > 90d)
- Promotion rules (transitory → strategic → constitution)
- 3 Lenses methodology
- GTM Canvas integration
- Trust Engine (casos de éxito) protocol
- Feedback collection

**output-format.md** — Premium formatting
- Status boards, coverage reports, styled output
- Copy from vibe Marketer v2 (proven quality)

**skill-communication-protocol.md** — How skills talk
- 5 Architectural Pillars (Boring Marketer)
- Communication Patterns (Sequential, Parallel, Conditional, Feedback, Degradation)
- Orchestrator protocols (sancho-start ↔ foundation-orchestrator ↔ pillar skills)
- Context Passing Rules
- Handoff Block format (YAML)

**skill-routing.md** — When to use which skill
- Decision tree by intent
- Overlap disambiguation (outreach vs email-sequences, daily-pulse vs meeting-intelligence)
- Pipeline maps (Intelligence → Content, Outreach, Decide → Execute)

**schemas/** — JSON contracts (7 files)
- company-context, icp, positioning, competitors, swot, gtm-canvas, campaign

---

### skills/ (38 total)

**Orchestrators (3):**
- `sancho-start/` — CBO maestro, universal entry point
- `foundation-orchestrator/` — Phase 1 manager (16 pillars DAG)
- `phase-0-diagnostic/` — Entry diagnostic

**Foundation Skills (11):**
- Layer 0: `company-context/`, `budget-constraints/`
- Layer 1: `self-intelligence/`, `competitor-intelligence/`, `market-intelligence/`, `business-model-audit/`
- Layer 2: `swot-analysis/`
- Layer 3: `niche-discovery-100x/`
- Layer 4: `positioning-messaging/`, `brand-voice/`
- Layer 5: `visual-identity/`

**Decide Skills — Sprint 1 (3):**
- `channel-prioritization/` — Hormozi Core Four + 5-dimension scoring → channel-plan.md
- `content-calendar-planner/` — Pillars + funnel mapping + weekly/monthly view → content-calendar.md
- `outreach-sequence-builder/` — Cold outbound sequences per ECP, multi-channel, GDPR compliant

**Execution Skills — vibe v2 (7):**
- Content & SEO: `keyword-research/`, `seo-content/`, `content-atomizer/`
- Conversion: `email-sequences/`, `lead-magnet/`, `direct-response-copy/`
- Ongoing: `newsletter/`

**Intelligence Pipeline (4):**
- `meeting-intelligence/`, `content-miner/`, `pattern-detector/`, `daily-pulse/`

**Outreach & Content Bridge Pipeline (4):**
- `company-finder/`, `decision-maker-finder/`, `contact-enrichment/`, `insight-to-content-mapper/`

**Intelligence v1 (3):**
- `thief-marketers/`, `signal-definition/`, `signal-monitor/`

**Optional (2):**
- `existing-customer-data/`, `ecp-validation/`

**Marketplace (1):**
- `pricing-strategy/`

---

## Architecture

### 5 Architectural Pillars (from Boring Marketer)

**Pillar 1: Persistent Memory**
- `./brand/` directory
- Session 1 builds context → Session 20 uses
- File ownership (ONE owner per profile file)
- Append-only (assets.md, learnings.md)

**Pillar 2: Scored Context Loading**
- Context Matrix (what each skill reads)
- Freshness TTLs (< 7d fresh, > 90d stale)
- NO dumping (selective passing only)

**Pillar 3: Schema Contracts**
- JSON schemas in `_system/schemas/`
- Skills output structured data
- Next skill reads as typed input
- No re-explaining between sessions

**Pillar 4: Learning Loops**
- Feedback after every deliverable
- Logged to learnings.md
- Next run reads and adapts
- System gets smarter with use

**Pillar 5: Shared Protocol**
- brand-memory.md (like HTTP)
- All skills follow same rules
- System-wide coherence

---

## The Compounding Effect

> "Day 1: it works.
> Day 7: it works better.
> Day 14: it works like it knows you."
> — Boring Marketer

---

## Skill Pipelines

```
FOUNDATION → DECIDE → EXECUTE

Foundation Blitz (3 pillars)
  → channel-prioritization (which channels)
    → content-calendar-planner → seo-content / content-atomizer / newsletter
    → outreach-sequence-builder → email-outreach-executor (future)

INTELLIGENCE → CONTENT
  meeting-intelligence → content-miner → insight-to-content-mapper → seo-content
  daily-pulse → insight-to-content-mapper → content-atomizer

OUTREACH
  company-finder → decision-maker-finder → contact-enrichment → outreach-sequence-builder

COMPETITIVE
  thief-marketers (steal ideas)
  signal-definition → signal-monitor (track buy signals)
```

---

## Installation for SanchoCMO Project

### Step 1: Copy Framework

```bash
cp -r sanchocmo-framework-export/ ~/PROJECTS/SanchoCMO/framework/
```

### Step 2: Read Documentation

1. `BRAIN.md` — Complete system (start here)
2. `_system/brand-memory.md` — Core protocol
3. `_system/skill-communication-protocol.md` — Skill interactions
4. `_system/skill-routing.md` — When to use which skill

### Step 3: Install Skills

Skills go to: `~/PROJECTS/SanchoCMO/.claude/skills/` (or project-specific location)

### Step 4: Test

Run `/sancho-start` with test client to verify:
- Foundation Blitz works (3 pillars paralelo)
- Coverage Report shows correctly
- Routes to foundation-orchestrator
- brand memory persists

**Test case available:** Hospital Capilar (real client, tested Feb 23, 2026)

---

## Next Steps

See FUTURE-IMPROVEMENTS.md for remaining roadmap items.

---

## Support

**Questions?** Contact Alfonso Sainz de Baranda (Growth4U)
**Updates:** Track in FUTURE-IMPROVEMENTS.md
**Issues:** Document in learnings.md as you use the system

---

*This is a living system. It compounds with use. Day 1 works. Day 14 works like it knows you.*
