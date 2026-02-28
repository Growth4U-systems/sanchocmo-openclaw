# Future Improvements — SanchoCMO Framework

> Roadmap de mejoras: Framework + OpenClaw Discord Deployment

**Version:** 2.0 (Feb 23, 2026)
**Status:** Planning
**Remaining:** ~12-15 hours

---

## Completed (Sprint 1-3)

| Task | What | When |
|------|------|------|
| ~~Tasks 4-10~~ | All vibe v2 execution skills (7) | Feb 20 |
| ~~Task 14~~ | Foundation Blitz tested (Hospital Capilar) | Feb 23 |
| ~~Sprint 1 DECIDE~~ | 3 skills (channel-prioritization, content-calendar, outreach-sequence) | Feb 22 |
| ~~Intelligence Pipeline~~ | 4 skills (meeting-intelligence, content-miner, pattern-detector, daily-pulse) | Feb 22 |
| ~~Outreach Pipeline~~ | 4 skills (company-finder, decision-maker-finder, contact-enrichment, insight-to-content-mapper) | Feb 22 |
| ~~OpenClaw Deployment~~ | 11 agents, 14 channels, Supabase DB, dispatch bot | Feb 23 |
| ~~Multi-Client Architecture~~ | Hybrid master + instances, 3 management scripts | Feb 23 |

---

## Skill Overlap Merges

### Priority: HIGH

**Task 1: Merge vibe v2 positioning-angles competitor search**

**Current:** SanchoCMO positioning-messaging (manual competitor input)
**Add:** Automatic competitor search + 12-ad testing matrix from vibe v2
**Benefit:**
- Search-powered positioning (web search → finds competitor messaging)
- Testing matrix (3 angles × 4 formats = 12 ad variants)
- Faster competitive differentiation

**Files:**
- Source: `~/.claude/skills/positioning-angles/SKILL.md`
- Target: `skills/positioning-messaging/SKILL.md`
- Merge: Competitor search section + testing matrix generator

**Time:** ~1 hour
**Priority:** HIGH (big quality improvement)

---

### Priority: MEDIUM

**Task 2: Merge vibe v2 brand-voice 3 modes**

**Current:** SanchoCMO brand-voice (basic extraction)
**Add:** 3 modes from vibe v2 (Extract / Build / Auto-Scrape)
**Benefit:**
- Extract: Analyze existing content for voice patterns
- Build: Strategic questions → construct voice
- Auto-Scrape: Provide URL → skill does research automatically

**Files:**
- Source: `~/.claude/skills/brand-voice/SKILL.md`
- Target: `skills/brand-voice/SKILL.md`
- Merge: Mode detection + Auto-Scrape flow + Voice Test Loop

**Time:** ~2 hours
**Priority:** MEDIUM (nice to have, not critical)

---

### Priority: LOW

**Task 3: Learn from vibe v2 creative architecture**

**Current:** SanchoCMO visual-identity (meta-skill que genera child skills)
**Learn:** Unified creative engine from vibe v2 (one skill, multiple modes)
**Benefit:**
- Streamlined workflow
- Shared creative-kit.md
- Platform-specific adaptations

**Files:**
- Source: `~/.claude/skills/creative/SKILL.md`
- Target: `skills/visual-identity/SKILL.md`
- Action: Review + optionally adopt unified approach

**Time:** ~30 min review, ~2 hours if adopting
**Priority:** LOW (current approach works)

---

## Infrastructure Improvements

### Task 11: Add GTM Canvas Dashboard

**What:** Visual dashboard showing GTM Canvas state
**Why:** Quick view of what's complete vs missing
**How:** HTML artifact with live data from ./brand/ files
**Benefit:** Strategic overview at a glance

**Time:** ~2 hours
**Priority:** MEDIUM

---

### Task 12: Add Lite → Deep Upgrade Workflow

**What:** Workflow for upgrading Foundation Lite (7 pillars) to Deep (16)
**Why:** Currently not documented
**How:** Add to WORKFLOWS in BRAIN.md + implementation in foundation-orchestrator
**Benefit:** Client can deepen foundation mid-flight

**Time:** ~30 min
**Priority:** LOW

---

### Task 13: Add Case Study Template (Trust Engine)

**What:** Standardized template for casos de éxito (Oier Method)
**Why:** Systematic social proof generation
**How:** Template + skill for caso creation
**Benefit:** Faster, consistent casos

**Time:** ~1 hour
**Priority:** MEDIUM

---

## Testing & Validation

### Task 14: Test Foundation Blitz End-to-End ✅ DONE (Feb 23)

**Tested with:** Hospital Capilar (real client)
**Results:**
- ✅ Infer-First works (web scrape → 10 data points)
- ✅ Foundation Blitz produces 3 brand files (company-context, product-analysis, competitors)
- ✅ DECIDE skills chain correctly (channel-plan → content-calendar → outreach sequences)
- ✅ Graceful degradation works (missing keyword-plan, voice-profile handled)
- ✅ Tool detection LIGHT mode works (no Instantly/Lemlist → manual sequences)
- ✅ Brand memory persists (10 brand files + 7 campaign files written)

---

### Task 15: Test Context Paradox

**Test:** Run positioning-messaging → check what context it receives
**Verify:**
- Gets: company-context.md, competitors.md, icp.md
- Does NOT get: product-analysis.md, market.md, swot.md
- Output is focused (not muddy)

**Time:** ~30 min
**Priority:** HIGH

---

### Task 16: Test Learning Loops

**Test:** Create deliverable → collect feedback → log → re-run skill
**Verify:**
- Feedback prompt appears
- Learning logged to learnings.md correctly
- Next run reads learnings
- Output adapts based on past learnings

**Time:** ~45 min
**Priority:** MEDIUM

---

## OpenClaw & Discord Improvements (NEW v4.0)

### Task 19: Agent Memory Isolation

**What:** Ensure each agent maintains context within its channel threads only
**Why:** Prevent cross-contamination between agents
**How:** Configure OpenClaw context_window per agent, thread-scoped memory
**Benefit:** Cleaner, more focused agent responses

**Time:** ~1 hour
**Priority:** HIGH

---

### Task 20: Campaign Approval Workflow

**What:** Add multi-step approval (✅ → dispatch → agent responds → 👍 human review)
**Why:** Quality control before campaigns go live
**How:** Extend dispatch-bot.js with approval reactions + status tracking
**Benefit:** Prevent low-quality output from reaching production

**Time:** ~2 hours
**Priority:** HIGH

---

### Task 21: Inter-Agent Handoff Protocol

**What:** Enable agents to reference each other's outputs across channels
**Why:** El Redactor needs El Investigador's research, El Comunicador needs El Redactor's content
**How:** Define handoff format in skill-communication-protocol.md + teach agents to read threads from other channels
**Benefit:** Coherent multi-agent workflows

**Time:** ~2 hours
**Priority:** HIGH

---

### Task 22: Supabase Multi-Schema Setup

**What:** Script to create per-client schemas in a single Supabase project
**Why:** Free tier = 2 projects max. Schemas = unlimited clients.
**How:** Modify init-db.sql to accept schema parameter, update scripts/new-client.sh
**Benefit:** Scale beyond 2 clients without additional cost

**Time:** ~1 hour
**Priority:** MEDIUM (only needed at 3+ clients)

---

### Task 23: Discord Channel Analytics

**What:** Track agent response quality, frequency, user engagement per channel
**Why:** Data-driven optimization of agent configuration
**How:** Log to Supabase `insights` table via dispatch bot or OpenClaw hooks
**Benefit:** Identify underperforming agents, optimize model assignments

**Time:** ~2 hours
**Priority:** MEDIUM

---

### Task 24: Automated Foundation Blitz Test

**What:** CI-like test that runs Foundation Blitz on a test URL and verifies outputs
**Why:** Regression testing when skills change
**How:** Script that triggers Infer-First + Foundation + verifies brand/ files created
**Benefit:** Confidence that updates don't break core flow

**Time:** ~1 hour
**Priority:** MEDIUM

---

## Documentation

### Task 17: Create Skill Dependency Map (Visual)

**What:** Diagram showing skill dependencies (DAG)
**Format:** Mermaid diagram or similar
**Benefit:** Visual understanding of skill relationships

**Time:** ~1 hour
**Priority:** LOW

---

### Task 18: Create Context Flow Diagram

**What:** Visual showing how context flows between skills
**Show:** Sequential chains, parallel dispatch, conditional routing
**Benefit:** Understand architecture at a glance

**Time:** ~1 hour
**Priority:** LOW

---

### Task 25: OpenClaw Deployment Video / Tutorial

**What:** Walkthrough video or step-by-step tutorial with screenshots
**Why:** Lower barrier to entry for new users
**How:** Screen recording of full setup process (Steps 1-9 from SETUP.md)
**Benefit:** Self-serve onboarding

**Time:** ~2 hours
**Priority:** LOW

---

## Total Estimated Time (Remaining)

| Category | Hours | Tasks |
|----------|-------|-------|
| **Merges** | ~3-4h | Tasks 1 (HIGH), 2 (MED), 3 (LOW) |
| **Infrastructure** | ~3.5h | Tasks 11, 12, 13 |
| **Testing** | ~1.5h | Tasks 15 (HIGH), 16 (MED) |
| **OpenClaw** | ~8h | Tasks 19-24 |
| **Documentation** | ~4h | Tasks 17, 18, 25 |
| **TOTAL** | **~20h** | 18 tasks remaining |

---

## Priority Order

**Sprint 4 (Next):**
1. Task 19: Agent memory isolation (~1h, HIGH)
2. Task 20: Campaign approval workflow (~2h, HIGH)
3. Task 21: Inter-agent handoff (~2h, HIGH)
4. Task 1: Merge positioning competitor search (~1h, HIGH)
5. Task 15: Test Context Paradox (~30m, HIGH)

**Sprint 5:**
6. Task 22: Multi-schema Supabase (~1h, MED)
7. Task 23: Channel analytics (~2h, MED)
8. Task 11: GTM Canvas Dashboard (~2h, MED)
9. Task 13: Case Study Template (~1h, MED)
10. Task 16: Test Learning Loops (~45m, MED)

**Backlog:**
11. Task 2: Brand-voice 3 modes (~2h)
12. Task 24: Automated Foundation test (~1h)
13. Task 3: Creative architecture review (~30m)
14. Task 12: Lite→Deep workflow (~30m)
15-18. Documentation tasks (~4h)

---

*Update this file as you complete tasks. Mark with ✅ when done. Add new tasks as you discover improvements.*
