# SanchoCMO Framework — MANIFEST

> Complete inventory: Framework + OpenClaw Discord Deployment

**Version:** 4.0
**Created:** Feb 19-23, 2026
**By:** Alfonso Sainz de Baranda (Growth4U)
**Status:** ✅ READY FOR EXPORT + DEPLOYMENT

---

## Package Contents

**Total Files:** 163 (128 framework + 18 deployment + 3 management scripts + 14 config/templates)
**Total Skills:** 38 (14 Sancho Foundation + 3 Decide Sprint 1 + 4 Intelligence + 4 Outreach/Content + 7 vibe v2 + 3 Intelligence v1 + 2 Optional + 1 Marketplace)
**Total Agents:** 11 (3 Opus + 8 Sonnet)
**Total DB Tables:** 9 (Supabase PostgreSQL + 68 RLS policies)
**Discord Channels:** 14 (5 categories)

---

## Root Documentation (6 files)

1. ✅ **CLAUDE.md** - System prompt (identidad SanchoCMO)
2. ✅ **README.md** - Quick reference
3. ✅ **BRAIN.md** - Complete system (7 parts, 1,385 lines, THE master doc)
4. ✅ **ARCHITECTURE-MAP.md** - Mapa completo: skills + Discord + DB + agents (~1,200 lines)
5. ✅ **SETUP.md** - Setup guide Discord + Supabase + OpenClaw (v2.0)
6. ✅ **FUTURE-IMPROVEMENTS.md** - Roadmap v2.0 (18 remaining tasks, ~20 hours)

---

## OpenClaw Config (1 file)

1. ✅ **openclaw.config.json** - 11 agents, 4 MCP servers, 14 channel bindings

---

## agents/ — SOUL.md Personas (11 files)

1. ✅ **sancho.soul.md** - CMO estratega (Opus 4.6)
2. ✅ **el-oraculo.soul.md** - Guardián de marca (Opus 4.6)
3. ✅ **explorador.soul.md** - Cold outreach (Sonnet 4.5)
4. ✅ **redactor.soul.md** - SEO content (Sonnet 4.5)
5. ✅ **comunicador.soul.md** - Social media (Sonnet 4.5)
6. ✅ **creativo.soul.md** - Assets visuales (Sonnet 4.5)
7. ✅ **amplificador.soul.md** - Paid media (Sonnet 4.5)
8. ✅ **conector.soul.md** - Partnerships (Sonnet 4.5)
9. ✅ **comercial.soul.md** - Sales materials (Sonnet 4.5)
10. ✅ **arquitecto.soul.md** - Landing pages, CRO (Sonnet 4.5)
11. ✅ **investigador.soul.md** - Deep research (Opus 4.6)

---

## database/ — Supabase Schema (1 file)

1. ✅ **init-db.sql** - 688 lines: 9 tables, 14 indexes, 12 roles, 68 RLS policies, 2 extensions (pgvector, pg_trgm)

---

## discord/ — Auto-Dispatch Bot (3 files)

1. ✅ **dispatch-bot.js** - Discord.js bot: listens ✅ reactions, creates threads per channel
2. ✅ **package.json** - Dependencies: discord.js ^14.14.1, dotenv ^16.4.1
3. ✅ **env.example** - Discord bot env template (rename to .env)

---

## scripts/ — Multi-Client Management (3 files)

1. ✅ **new-client.sh** - Onboard nuevo cliente en ~30 seg (symlinks + dirs + copies)
2. ✅ **sync-skills.sh** - Re-sync skills del master a instancias (respeta overrides)
3. ✅ **status.sh** - Estado de todas las instancias (shared/custom/overrides/brand)

---

## brand/ — Context Lake (2 files, grows with use)

1. ✅ **README.md** - Tier 1/2/3 structure, ownership rules, promotion protocol
2. ✅ **.gitkeep** - Placeholder (directory fills when agents execute skills)

---

## env.example (1 file)

1. ✅ **env.example** - Root env template: Supabase, Discord, Anthropic, Google, OpenRouter

---

## _system/ Infrastructure (5 core + 7 schemas)

**Core Protocols:**
1. ✅ **brand-memory.md** (24,990 bytes)
   - File ownership (ONE owner per file)
   - Read/Write protocols
   - Promotion rules (transitory → strategic → constitution)
   - 3 Lenses methodology
   - GTM Canvas integration
   - Trust Engine protocol
   - Feedback collection
   - Freshness TTLs
   - Epistemic Humility principle

2. ✅ **output-format.md** (33,013 bytes)
   - Premium formatting (from vibe v2)
   - Status boards, coverage reports

3. ✅ **skill-communication-protocol.md** (18,717 bytes)
   - 5 Architectural Pillars (Boring Marketer)
   - Communication Patterns (5 types)
   - Orchestrator protocols
   - Context Passing Rules
   - Handoff Block format

4. ✅ **skill-routing.md** (NEW v3.0)
   - When to use which skill (disambiguation)
   - Intelligence pipeline routing
   - Outreach pipeline routing
   - Content pipeline routing

**schemas/ (7 JSON contracts):**
4. ✅ company-context.schema.json
5. ✅ icp.schema.json
6. ✅ positioning.schema.json
7. ✅ competitors.schema.json
8. ✅ swot.schema.json
9. ✅ gtm-canvas.schema.json
10. ✅ campaign.schema.json

---

## skills/ (38 total)

### Orchestrators (3)

1. ✅ **sancho-start** - CBO maestro, universal entry point
2. ✅ **foundation-orchestrator** - Phase 1 manager (16 pillars DAG)
3. ✅ **phase-0-diagnostic** - Entry diagnostic

### Foundation Skills - Sancho (11)

**Layer 0 (Always-First):**
4. ✅ **company-context** - What/Want/Believe
5. ✅ **budget-constraints** - Budget + resources

**Layer 1 (Parallel):**
6. ✅ **self-intelligence** - Product analysis (3 Lenses + Asset Inventory)
7. ✅ **competitor-intelligence** - Competitor analysis (3 Lenses)
8. ✅ **market-intelligence** - TAM/SAM/SOM + trends
9. ✅ **business-model-audit** - Revenue model analysis

**Layer 2 (Synthesis):**
10. ✅ **swot-analysis** - SWOT + TOWS strategies

**Layer 3 (Discovery):**
11. ✅ **niche-discovery-100x** - ICP + 100x niches → ECPs

**Layer 4 (Activation):**
12. ✅ **positioning-messaging** - Positioning per ECP
13. ✅ **brand-voice** - Voice profile

**Layer 5 (Visual):**
14. ✅ **visual-identity** - Meta-skill (genera ui/visual/deck children)

### Execution Skills - vibe v2 (7)

**Content & SEO:**
15. ✅ **keyword-research** - 6 Circles Method + SERP validation
16. ✅ **seo-content** - SEO-optimized articles + schema markup

**Distribution:**
17. ✅ **content-atomizer** - 8 platforms (LinkedIn, Twitter, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit)

**Conversion:**
18. ✅ **email-sequences** - 6 types (welcome, nurture, conversion, launch, re-engagement, post-purchase)
19. ✅ **lead-magnet** - Concepts + BUILD MODE (full content)
20. ✅ **direct-response-copy** - Landing pages, sales copy + scoring

**Ongoing:**
21. ✅ **newsletter** - 5 formats (roundup, deep-dive, essay, curated, news)

### Optional Skills (2 - SKIP CONDITIONS)

22. ✅ **existing-customer-data** - RFM, segmentation, churn (skip if pre-launch)
23. ✅ **ecp-validation** - Maja Voje Assumption Mapping + MVI (skip if timeline < 4 weeks)

### Marketplace Skills (1)

24. ✅ **pricing-strategy** - Corey Haines #2 (value-based pricing, hooks)

### Intelligence Pipeline — NEW v3.0 (4)

25. ✅ **meeting-intelligence** - Extract decisions, action items, insights from meetings (UNIVERSAL)
26. ✅ **content-miner** - Classify meeting intelligence → content ideas + research tasks (CONFIGURABLE)
27. ✅ **pattern-detector** - Detect recurring themes across 30 days of intelligence (UNIVERSAL)
28. ✅ **daily-pulse** - Scan Slack/Notion/transcripts → content ideas (4 degradation modes)

**Pipeline:** meeting-intelligence → content-miner → pattern-detector (accumulates)
**Alt pipeline:** daily-pulse → insight-to-content-mapper → seo-content

### Outreach & Content Bridge Pipeline — NEW v3.0 (4)

29. ✅ **company-finder** - Find ICP-matching companies via Apollo/Clay/Apify (9-step scoring)
30. ✅ **decision-maker-finder** - Find decision makers within target companies (composite 15-pt scoring)
31. ✅ **contact-enrichment** - Waterfall enrichment: emails, phones, social (GDPR compliant)
32. ✅ **insight-to-content-mapper** - Convert insights → SEO content briefs (batch mode + priority scoring)

**Pipeline:** company-finder → decision-maker-finder → contact-enrichment → outreach

### Decide Skills — Sprint 1 (3)

36. ✅ **channel-prioritization** - Hormozi Core Four + 5-dimension scoring → channel-plan.md (2-4 channels recommended)
37. ✅ **content-calendar-planner** - Pillars + funnel mapping + weekly/monthly view → content-calendar.md
38. ✅ **outreach-sequence-builder** - Cold outbound sequences per ECP, multi-channel (email + LinkedIn), GDPR compliant

**Pipeline:** channel-prioritization → content-calendar-planner → seo-content / content-atomizer
**Alt pipeline:** channel-prioritization → outreach-sequence-builder → email-outreach-executor (future)

### Intelligence Skills v1 (3)

33. ✅ **thief-marketers** - Steal competitor ideas (Facebook Ads, calendars, changelogs, LPs)
34. ✅ **signal-definition** - Define buy signals per ICP/ECP/sector
35. ✅ **signal-monitor** - Monitor defined signals via APIs

---

## Architecture Summary

**5 Pillars (Boring Marketer) — ALL Implemented:**
1. ✅ Persistent Memory (./brand/, file ownership, append-only)
2. ✅ Scored Context Loading (Context Matrix, TTLs)
3. ✅ Schema Contracts (7 JSON, typed interfaces)
4. ✅ Learning Loops (Feedback → learnings.md → adapt)
5. ✅ Shared Protocol (brand-memory.md like HTTP)

**Onboarding Flow:**
```
NEW CLIENT:
  Infer-First → 3 Questions → Foundation Blitz (30 min, 3 pillars)
  → Product Assessment (qualitative) → Decision Tree → Route

RETURNING:
  Brand Scan → Gap Analysis → Proactive Suggestion → Route
```

**Compounding Effect:**
- Day 1: Works (zero context)
- Day 7: Works better (voice, positioning)
- Day 14: Works like it knows you (learnings accumulated)

---

## Key Decisions Documented

**1. Context Lake → ./brand/**
- Flat structure (simpler than 3-tier directories)
- Promotion rules documented (not directory-enforced)

**2. Overlap Resolution:**
- ALWAYS use Sancho skills when overlap
- vibe v2 features → FUTURE-IMPROVEMENTS.md (merge roadmap)

**3. OPTIONAL Pillars:**
- existing-customer-data: Skip if pre-launch
- ecp-validation: Skip if timeline < 4 weeks
- Sancho funciona perfectamente sin ellas

**4. Asset Inventory:**
- Part of self-intelligence Lens 1
- Not separate Lens 4
- Covers: Content, social, email, funnels, tools, SEO

**5. Maja Voje Integration:**
- ecp-validation uses her templates
- Assumption Mapping + MVI Framework + 7-Day Validation

---

## Export & Deploy Instructions

**Step 1:** Copy to new machine
```bash
mkdir -p ~/PROJECTS/sanchocmo-[cliente]
cp -r sanchocmo-openclaw/* ~/PROJECTS/sanchocmo-[cliente]/
```

**Step 2:** Follow SETUP.md (9 steps)
1. Verify structure
2. Create Discord server (14 channels, 5 categories)
3. Create Supabase project (run `database/init-db.sql`)
4. Configure `.env` (copy `env.example`)
5. Install skills (`cp -r skills/* .claude/skills/`)
6. Configure MCP servers
7. Launch dispatch bot (`cd discord/ && npm install && node dispatch-bot.js`)
8. Launch OpenClaw (`openclaw start --config openclaw.config.json`)
9. Verify (11 agents responding, 9 tables, dispatch working)

**Step 3:** Read architecture docs
1. README.md (overview)
2. BRAIN.md (complete system - THE master doc)
3. ARCHITECTURE-MAP.md (skills + Discord + DB + agents map)
4. _system/brand-memory.md (core protocol)

**Step 4:** Test Foundation Blitz
```
In Discord #el-toboso:
"Nuevo cliente: https://ejemplo.com"
```

---

## What Makes This Special

> "Most people think an AI skill is a well-written instruction file. That's the baseline. We built a system. The skills were the easy part. The architecture is where the real gains came from." — Boring Marketer

**Two Complementary Layers:**
- **Skills Layer** (38 skills): What to do — foundation, intelligence, content, outreach
- **Deployment Layer** (11 agents): How to execute — Discord channels, Supabase DB, auto-dispatch

**Architecture:**
- ✅ Persistent memory (sessions compound via Context Lake)
- ✅ Selective context (no dumping, Context Matrix)
- ✅ Typed interfaces (7 JSON schema contracts)
- ✅ Learning loops (insights → promote → brand)
- ✅ Shared protocols (brand-memory.md like HTTP)
- ✅ Concurrent DB (Supabase PostgreSQL, 68 RLS policies)
- ✅ Auto-dispatch (✅ reaction → thread creation → agent response)
- ✅ Multi-client isolation (1 server + 1 DB per client)

**Result:** Day 1: works. Day 7: works better. Day 14: works like it knows the client.

---

**Status:** ✅ READY FOR EXPORT + DEPLOYMENT

**Session logs:**
- `memory/2026-02-19-sanchocmo-cerebro-design.md`
- `memory/2026-02-20-sanchocmo-architecture-session.md`
- `.claude/plans/hidden-moseying-horizon.md` (Discord architecture plan)
- This MANIFEST

---

*Framework + Deployment completo. Portable. Production-ready. Compounding by design.*
