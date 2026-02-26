# Skill Communication Protocol

> How SanchoCMO skills talk to each other. Based on vibe Marketer v2 architecture + Boring Marketer's 5 pillars.

**Version:** 1.0 (Feb 20, 2026)
**For:** All SanchoCMO skills
**Apply:** ALWAYS when skills communicate

---

## The 5 Architectural Pillars

### 1. Persistent Memory (./brand/ directory)

**Rule:** Every skill reads from and writes to `./brand/`. Session 1 builds context that session 20 uses.

**Structure:**
```
./brand/
  # ONE OWNER per file (only that skill can overwrite)
  company-context.md
  voice-profile.md
  positioning.md
  icp.md, ecps.md
  competitors.md
  market.md
  product-analysis.md
  swot.md
  pricing.md
  business-model.md
  team.md
  budget.md
  customer-data.md

  # APPEND-ONLY (all skills can append, none can truncate)
  assets.md
  learnings.md
```

**File Ownership:**
- Profile files: ONE owner. Others can read, NOT overwrite.
- Append files: ALL skills can append. NEVER truncate.

**Before writing:**
1. Read existing file
2. Show diff of changes
3. Ask confirmation
4. Only then overwrite

---

### 2. Scored Context Loading (Context Paradox)

**Rule:** Each skill gets ONLY what sharpens it. Everything else withheld on purpose.

**The Problem (tested by vibe v2):**
Give email skill keyword plan + competitor analysis + creative kit + voice profile → writes muddy emails. Attention is finite.

**The Fix:**
Context Matrix + Freshness TTLs

**Context Matrix:**

| Skill | Reads from ./brand/ | WHY |
|-------|---------------------|-----|
| company-context | (none) | First skill |
| self-intelligence | company-context only | Needs basics for product analysis |
| competitor-intel | company-context, positioning (if exists) | Needs industry context |
| positioning-messaging | company-context, competitors, icp | Synthesis skill needs inputs |
| brand-voice | company-context, positioning | Needs identity for tone |
| email-sequences | voice-profile, positioning, lead-magnet | Needs tone + angle + what we deliver |
| seo-content | voice-profile, keyword-plan, audience | Needs tone + topics + who we write for |

**Freshness TTLs:**
```
< 7 days   → Pass as-is (fresh)
7-30 days  → Flag age: "This data is from {date}"
30-90 days → Summary only + flag: "{n} days old, verify if used"
> 90 days  → DON'T load → "Your {file} is stale. Refresh first."
```

**Anti-Pattern:**
```python
# ❌ WRONG - Context dump
context = read_all_brand_files()
dispatch_skill("email-sequences", context)

# ✅ RIGHT - Selective
context = {
    "voice": brand.voice_profile,
    "positioning": brand.positioning.primary_angle,
    "magnet": lead_magnet.title_and_hook
}
dispatch_skill("email-sequences", context)
```

**Context Passing Checklist:**

Never do:
1. Pass entire Context Lake to every skill
2. Pass all 5 ECPs when skill only needs primary
3. Pass full competitor analysis cuando solo necesita positioning claims
4. Pass Tier 3 (transitory) data to foundation skills
5. Pass stale data (> 90 days) without flagging

Always do:
1. Check Context Matrix before dispatching skill
2. Pass minimal context (name + positioning vs full 50-page analysis)
3. Flag stale data if passing it
4. Exclude irrelevant tiers
5. Document what was passed (transparency)

---

### 3. Schema Contracts (Structured Data Flow)

**Rule:** Skills output structured JSON → other skills read as typed input → no re-explaining between sessions.

**Schemas:**
```
_system/schemas/
  company-context.schema.json
  icp.schema.json
  positioning.schema.json
  competitors.schema.json
  swot.schema.json
  gtm-canvas.schema.json
  campaign.schema.json
```

**Flow Example:**
```
company-context skill
  → outputs: company-context.json
         ↓
competitor-intel skill
  → reads: company-context.json
  → outputs: competitors.json
         ↓
positioning-messaging skill
  → reads: company-context.json + competitors.json
  → outputs: positioning.json
         ↓
brand-voice skill
  → reads: company-context.json + positioning.json
  → outputs: voice-profile.json
```

**Benefit:** Pipeline. Data stays structured. No copy-paste.

---

### 4. Learning Loops (Feedback → Improvement)

**Rule:** After major deliverable, collect feedback → log to learnings.md → next invocation reads and adapts.

**Feedback Collection:**
```
After deliverable (email, LP, caso de éxito, content):

  How did this perform?

  a) Great — shipped as-is
  b) Good — minor edits
  c) Needs work — rewrote significantly
  d) Haven't tested yet
```

**Logging Format (learnings.md):**
```markdown
| Date | Skill | Asset | Performance | Learning |
|------|-------|-------|-------------|----------|
| 2026-02-20 | email-sequences | welcome-series | b (minor edits) | Subject lines with numbers outperform questions |
| 2026-02-19 | positioning-messaging | monzo-positioning | a (shipped) | "Trust Engine" angle resonates with fintech |
```

**Read on Next Invocation:**
Before email-sequences runs again, read learnings.md → apply patterns that worked → avoid patterns that didn't.

**Result:** Session 1 teaches session 5. Mistakes made once. Wins repeat forever.

---

### 5. Shared Protocol Layer (Like HTTP)

**Rule:** One protocol document. All skills follow. No runtime enforces it — skills just follow the spec.

**Protocol File:** `_system/brand-memory.md`

**Defines:**
- How to read brand files
- How to write them
- When context is stale
- How to collect feedback
- How to degrade when files missing
- File ownership rules
- Append-only rules

**Result:** 13+ skills. One protocol. System-wide coherence.

---

## Skill Communication Patterns

### Pattern 1: Sequential Chain

**When:** Skill B needs output of Skill A

**Example:** company-context → self-intelligence → swot-analysis

**Protocol:**
```
1. Skill A completes
2. Skill A writes to ./brand/file-a.json
3. Skill A reports: "Created file-a.json"
4. Orchestrator dispatches Skill B
5. Skill B reads ./brand/file-a.json
6. Skill B uses data as typed input
7. Skill B writes to ./brand/file-b.json
```

**NOT this:**
```
❌ Skill A completes
❌ User copy-pastes output to new session
❌ User re-explains to Skill B
```

---

### Pattern 2: Parallel Dispatch

**When:** Skills A, B, C have no dependencies on each other

**Example:** Foundation Blitz (company-context + self-intelligence + competitor-intel)

**Protocol:**
```
1. Orchestrator checks dependencies
2. All 3 have no deps → dispatch in PARALLEL
3. Wait for all 3 to complete
4. Read outputs
5. Present combined report
6. Continue to next layer
```

**Wall-clock time:** Max(A, B, C) not Sum(A, B, C)

---

### Pattern 3: Conditional Routing

**When:** Next skill depends on data from current skill

**Example:** If product score < 3.0 → Pre-Product path, else → Foundation Deep

**Protocol:**
```
1. Skill A completes
2. Orchestrator reads ./brand/file-a.json
3. Orchestrator evaluates condition
4. If condition true → route to Skill B
5. Else → route to Skill C
```

**Example code:**
```python
product_analysis = read_brand("product-analysis.json")

if product_analysis.avg_review_score < 3.0:
    route_to("pre-product-path")
    context = {"product_issues": product_analysis.key_complaints}
else:
    route_to("foundation-orchestrator", mode="Deep")
    context = {"product_analysis": product_analysis}
```

---

### Pattern 4: Feedback Loop (Learning)

**When:** User uses output from skill, reports performance

**Example:** Email sequence shipped → user reports "minor edits" → log learning

**Protocol:**
```
1. Skill creates deliverable
2. Ask feedback: "How did this perform? (a/b/c/d)"
3. Log to ./brand/learnings.md
4. Next time skill runs:
   - Read learnings.md
   - Filter to this skill's learnings
   - Apply patterns that worked
   - Avoid patterns that didn't
```

**Example:**
```markdown
# In learnings.md
| 2026-02-19 | email-sequences | welcome | b | Numbers in subject > questions |

# Next email-sequences run
→ Reads learnings.md
→ Sees "numbers > questions"
→ Generates subject lines with numbers (not questions)
```

---

### Pattern 5: Graceful Degradation

**When:** Skill needs file that doesn't exist

**Example:** email-sequences runs but no voice-profile.md exists

**Protocol:**
```
1. Check for ./brand/voice-profile.md
2. File not found
3. DON'T error
4. Proceed with defaults
5. Note to user: "No voice profile found. Using generic tone.
   Run /brand-voice first for personalized output."
6. At end: "Output will be MUCH better with voice profile (~10 min)."
```

**NOT this:**
```
❌ Error: "voice-profile.md not found. Cannot proceed."
```

---

## Orchestrator Communication Protocol

### sancho-start → foundation-orchestrator

**Handoff:**
```yaml
from: sancho-start
to: foundation-orchestrator
mode: Lite | Deep
context:
  blitz_results:
    company_context: ./brand/company-context.md
    product_analysis: ./brand/product-analysis.md
    competitors: ./brand/competitors.md
  user_meta: "LEADS"
  user_resources: ["website", "budget €5K"]
  sancho_role: "FULL_STACK_CMO"
instruction: "Complete remaining pillars. Blitz already done (3/7 for Lite)."
```

**Report back:**
```yaml
from: foundation-orchestrator
to: sancho-start
status: complete | in_progress | stalled
pillars_complete: 7 | 16
next_phase_ready: true | false
recommendation: "Phase 2: Trust Engine" | "Continue Phase 1 Deep"
```

**NO clash:** sancho-start does Blitz + routes. foundation-orchestrator continues from there.

---

### foundation-orchestrator → Pillar Skills

**Dispatch:**
```yaml
from: foundation-orchestrator
to: competitor-intelligence
context:
  company_context: ./brand/company-context.md
  positioning: ./brand/positioning.md (if exists)
lens: 1 | "1-3"  # Lite = Lens 1, Deep = Lens 1-3
instruction: "Analyze top 3 competitors. Output to ./brand/competitors.md"
```

**Report back:**
```yaml
from: competitor-intelligence
to: foundation-orchestrator
status: complete
file_written: ./brand/competitors.md
next_unlocked: ["swot-analysis", "positioning-messaging"]
```

---

## Context Passing Rules (The Paradox)

### Rule 1: Load Only What You Need

Each skill declares dependencies in SKILL.md:
```markdown
**Reads from ./brand/:**
- voice-profile.md
- positioning.md

**Does NOT need:**
- keyword-plan.md
- competitors.md
- swot.md
```

### Rule 2: Pass Minimal Context

**Example: email-sequences**

```python
# ❌ WRONG - Pass everything
context = {
    "voice": read_brand("voice-profile.md"),  # ✅ Needed
    "positioning": read_brand("positioning.md"),  # ✅ Needed
    "competitors": read_brand("competitors.md"),  # ❌ NOT needed
    "market": read_brand("market.md"),  # ❌ NOT needed
    "swot": read_brand("swot.md"),  # ❌ NOT needed
    "keyword_plan": read_brand("keyword-plan.md")  # ❌ NOT needed
}

# ✅ RIGHT - Pass only needed
context = {
    "voice": {
        "tone": voice.tone_summary,
        "platform_adaptations": voice.email_adaptations
    },
    "positioning": {
        "primary_angle": positioning.primary_angle,
        "proof_points": positioning.proof_points
    },
    "magnet": {
        "title": magnet.title,
        "hook": magnet.hook,
        "key_benefit": magnet.key_benefit
    }
}
```

### Rule 3: Flag Stale Data

```python
def pass_context(file_path):
    data = read_brand(file_path)
    days_old = today - data.last_updated

    if days_old > 90:
        return None, f"⚠️ {file_path} is {days_old} days old (stale)"
    elif days_old > 30:
        return data, f"○ {file_path} is {days_old} days old (aging)"
    else:
        return data, None
```

---

## File Ownership & Write Rules

### Profile Files (create-or-overwrite)

**Owner:** ONE skill per file

| File | Owner | Others Can |
|------|-------|-----------|
| company-context.md | company-context | Read only |
| voice-profile.md | brand-voice | Read only |
| positioning.md | positioning-messaging | Read only |
| competitors.md | competitor-intelligence | Read only |
| swot.md | swot-analysis | Read only |

**Writing Protocol:**
```
1. Check if file exists
2. If exists:
   a. Read current content
   b. Generate new content
   c. Diff the changes
   d. Show user: "Current: X. New: Y. Replace? (y/n)"
   e. Wait for confirmation
   f. Only overwrite if confirmed
3. If not exists:
   a. Generate content
   b. Write to ./brand/{filename}.md
   c. Confirm: "Created {filename}.md"
```

### Append-Only Files (NEVER truncate)

**Files:** assets.md, learnings.md

**Writing Protocol:**
```
1. Read existing file (to see current entries)
2. Generate new entry
3. Append to bottom of appropriate section
4. NEVER replace or truncate
5. Confirm: "Added entry to {filename}.md"
```

**Example (assets.md):**
```markdown
| Asset | Type | Date | Campaign | Status | Notes |
|-------|------|------|----------|--------|-------|
| welcome-series | email-sequence | 2026-02-19 | onboarding | live | 6 emails |
| monzo-lp | landing-page | 2026-02-18 | launch | draft | Trust Engine angle |
```

---

## Skill Invocation Protocol

### From Orchestrator to Skill

**Minimal invocation:**
```yaml
dispatch:
  skill: competitor-intelligence
  context:
    company_name: "Monzo"
    industry: "Fintech"
    business_model: "Neobank"
  instruction: "Analyze top 3 competitors, output to ./brand/competitors.md"
```

**NOT this:**
```yaml
❌ WRONG - Context dump
dispatch:
  skill: competitor-intelligence
  context:
    ENTIRE_BRAND_DIRECTORY_DUMP
```

### From Skill Back to Orchestrator

**Completion report:**
```yaml
completion:
  from: competitor-intelligence
  status: complete
  files_written:
    - ./brand/competitors.md
  files_updated:
    - ./brand/learnings.md (appended)
  next_unlocked:
    - swot-analysis
    - positioning-messaging
  recommendation: "Run swot-analysis next (needs self + competitor + market)"
```

---

## Error Handling

### Missing Dependencies

**Example:** positioning-messaging runs but no competitors.md

**Protocol:**
```
1. Check for ./brand/competitors.md
2. NOT found
3. Options:
   a. If CRITICAL dependency → warn + suggest running dependency first
   b. If OPTIONAL dependency → proceed with degraded output + note
4. User chooses

Example message:
"Positioning works better with competitor data. Options:
 ① Run /competitor-intelligence first (~15 min)
 ② Continue without (generic positioning)
```

### Stale Data

**Example:** Skill reads competitors.md that's 120 days old

**Protocol:**
```
1. Check file age
2. > 90 days → flag as STALE
3. Options:
   a. Refresh data first (recommended)
   b. Proceed with stale data (note limitations)
4. User chooses

Example message:
"Your competitor data is 120 days old. Market may have
changed. Options:
 ① Refresh competitor-intel first (~15 min, recommended)
 ② Use stale data (positioning may miss recent changes)
```

---

## Workflow Chaining

### Sequential Chain

**Example:** Lead Magnet Funnel

```
1. /lead-magnet
   → Creates magnet concept + content
   → Writes: ./brand/campaigns/{name}/lead-magnet.md

2. /direct-response-copy
   → Reads: lead-magnet.md
   → Creates: LP copy for magnet
   → Writes: ./brand/campaigns/{name}/landing-page.md

3. /email-sequences
   → Reads: lead-magnet.md + landing-page.md
   → Creates: Welcome sequence (6 emails)
   → Writes: ./brand/campaigns/{name}/emails/*.md

4. /content-atomizer
   → Reads: lead-magnet.md + landing-page.md
   → Creates: Social promo content
   → Writes: ./brand/campaigns/{name}/social/*.md
```

**Context passing:**
- Step 2 gets: magnet.title, magnet.hook, magnet.key_benefit
- Step 3 gets: magnet.title, lp.headline, voice.email_adaptations, positioning.primary_angle
- Step 4 gets: magnet.title, lp.url, voice.platform_adaptations

**NOT:** Each step gets entire brand directory.

### Parallel Dispatch

**Example:** Foundation Blitz

```
Dispatch in parallel:
├─ company-context (no deps)
├─ self-intelligence (no deps - uses URL)
└─ competitor-intel (no deps - uses industry from URL)

Wait for all 3
Read outputs
Present combined report
```

---

## The Handoff Block (YAML)

When passing context skill → skill, use this format:

```yaml
# Context Handoff to /email-sequences

business:
  name: "Monzo"
  industry: "Fintech - Neobank"

goal: "Welcome sequence for lead magnet subscribers"

voice:
  tone: "Direct, proof-heavy, conversational"
  email_adaptations: "Warmer, personal stories, single CTA"
  avoid: "Jargon, corporate speak, exclamation marks"

positioning:
  angle: "The Trust Engine Bank"
  proof: "4.5/5 rating, 2M users"

audience:
  segment: "UK residents, 25-40, mobile-first"
  pain: "Traditional banks feel impersonal, slow"
  language: "They say 'switch banks' not 'migrate accounts'"

lead_magnet:
  title: "The Bank Switching Kit"
  hook: "Switch to Monzo in 15 minutes"
  format: "PDF checklist"

campaign:
  name: "bank-switching-welcome"
  sequence_type: "welcome"
  emails_requested: 6

relevant_learnings:
  - "Fintech audience responds to trust signals over features"
  - "Subject lines with time savings outperform benefit claims"
```

**This block contains ONLY what /email-sequences needs.**

It does NOT contain:
- Full voice profile (only relevant sections)
- All 5 positioning angles (only primary)
- Competitor details
- Market sizing
- SWOT analysis
- Keyword plan

**Why:** Focused input → focused output.

---

## Sancho Role Adaptation

Based on client resources, Sancho adapts which skills to use:

```python
if sancho_role == "STRATEGIC_ADVISOR":
    # Client has agencies for execution
    use_skills = ["foundation", "positioning", "strategy"]
    skip_skills = ["visual-generator", "direct-response-copy", "paid-ads"]
    handoff_to = "client's agencies"

elif sancho_role == "FULL_STACK_CMO":
    # Client has nothing
    use_skills = ALL_SKILLS
    skip_skills = []
    handoff_to = "none (Sancho does everything)"
```

**Communication:**
When STRATEGIC_ADVISOR, output format changes:
```
Instead of: "Here's the landing page copy" (full execution)
Output: "Landing page brief for your copywriter:
         - Angle: Trust Engine
         - Hero headline options (3)
         - Key proof points (5)
         - CTA: 'Start switching in 15 min'
         Your copywriter executes from here."
```

---

## Summary

**5 Pillars Applied:**

1. **Persistent Memory** → ./brand/ directory (ONE owner per file)
2. **Scored Context** → Context Matrix + TTLs (selective, not dump)
3. **Schema Contracts** → JSON outputs → typed inputs
4. **Learning Loops** → Feedback → learnings.md → adapt
5. **Shared Protocol** → brand-memory.md (like HTTP)

**Communication Patterns:**

1. Sequential Chain (A → B → C)
2. Parallel Dispatch (A + B + C)
3. Conditional Routing (if X then Y else Z)
4. Feedback Loop (deliver → feedback → log → adapt)
5. Graceful Degradation (missing file → proceed with note)

**The Result:**

> "Day 1: it works.
> Day 7: it works better.
> Day 14: it works like it knows you."

Skills compound because they communicate through structured memory, pass selective context, learn from feedback, and follow shared protocols.

---

**Apply this protocol to EVERY skill communication.**

**If unclear:** Read vibe Marketer's brand-memory.md or start-here.md for examples.
