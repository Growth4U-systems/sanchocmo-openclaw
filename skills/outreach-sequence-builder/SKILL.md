---
name: outreach-sequence-builder
description: "Build cold outreach sequences that get replies. Use when the user wants to write cold outreach emails, prospecting emails, cold email campaigns, sales development emails, SDR emails, or multi-channel outbound sequences. Also use when the user mentions 'cold outreach,' 'prospecting email,' 'outbound email,' 'email to leads,' 'reach out to prospects,' 'sales email,' 'follow-up email sequence,' 'nobody is replying to my emails,' 'how do I write a cold email,' 'cold email,' 'LinkedIn outreach,' 'outbound sequence,' or 'book more meetings.' Covers subject lines, opening lines, body copy, CTAs, personalization, multi-touch follow-up sequences, and multi-channel (email + LinkedIn + video). For warm/lifecycle email sequences, see email-sequence. For sales collateral beyond emails, see sales-enablement."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Decide (one-to-one)
  pillar: outreach-sequence-builder
  layer: Decide
  depends_on: channel-prioritization, contact-enrichment, signal-definition
  chains_to: email-outreach-executor, linkedin-outreach-executor
  context_required:
    - brand/{slug}/go-to-market/channel-plan.md
    - brand/{slug}/go-to-market/positioning/*/*-current.md
    - brand/{slug}/go-to-market/ecps/ecps-current.md
    - brand/{slug}/brand-voice/brand-voice-current.md
    - brand/{slug}/outreach-playbook/sequence-templates.md
    - brand/{slug}/outreach-playbook/discovery-guide.md
  context_writes:
    - campaigns/
    - brand/{slug}/operational/learnings.md
    - brand/{slug}/operational/assets.md
---

# Outreach Sequence Builder — Cold to Warm in 5-7 Touches

> "Relevance beats volume. One perfectly-timed, signal-based email outperforms 100 spray-and-pray messages."

This skill creates personalized OUTBOUND cold sequences per ECP. It is NOT email-sequences (which handles INBOUND post-opt-in nurture). The distinction matters:

| Dimension | email-sequences (INBOUND) | THIS skill (OUTBOUND) |
|-----------|--------------------------|----------------------|
| Audience | Opted-in subscribers | Cold prospects |
| Channels | Email only | Email + LinkedIn + video |
| Tone | Nurture, educational | Personalized, relevant, peer-to-peer |
| Trigger | Opt-in event (lead magnet) | Buy signal or ICP match |
| Goal | Convert subscriber → customer | Book meeting / demo |
| Personalization | Light (name, segment) | Deep (company, role, signal, pain) |

**If the user asks for warm nurture sequences, redirect to email-sequences.**

Read ./brand/ per _system/intelligence/brand-memory.md (if using SanchoCMO framework)

Follow _system/output/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required (will not run without these):**
- `./brand/{slug}/go-to-market/channel-plan.md` — Confirms outreach is a selected channel (from channel-prioritization)
- `./brand/{slug}/go-to-market/ecps/ecps-current.md` — Target personas with pain points (from niche-discovery-100x)
- `./brand/{slug}/go-to-market/positioning/*/*-current.md` — Value proposition angles per ECP (from positioning-messaging)

**Recommended (better output with these):**
- `./brand/{slug}/brand-voice/brand-voice-current.md` — Tone for email copy (from brand-voice)
- brand/{slug}/outreach-playbook/sequence-templates.md
- brand/{slug}/outreach-playbook/discovery-guide.md
- `brand/{slug}/operational/contacts-enriched.json` — Enriched contacts for personalization (from contact-enrichment)
- `brand/{slug}/operational/signals-to-track.json` — Buy signals for triggers (from signal-definition)

---

## Step 0: Tool Detection

Check environment for outreach tool availability:

```
Check for API keys / tool access:
  INSTANTLY_API_KEY  → Instantly (email sequencing)
  LEMLIST_API_KEY    → Lemlist (email + LinkedIn)
  EXPANDI_API_KEY    → Expandi (LinkedIn automation)
  DRIPIFY_API_KEY    → Dripify (LinkedIn automation)
```

**FULL mode** (2+ tools detected): Generate tool-ready sequences with platform-specific merge fields. Include import instructions.

**STANDARD mode** (1 tool or email client detected): Generate sequences optimized for that tool. LinkedIn touches are manual.

**LIGHT mode** (no tools): Generate copy-paste sequences. All touches are manual. Include timing calendar for manual tracking.

Announce detected mode to user. If LIGHT mode, note: "No outreach tools detected. Generating manual sequences. Consider Instantly (from EUR 30/mo) for email automation."

---

## Workflow: 7 Steps

### Step 1: Load ECP Context (~3 min)

For each ECP, extract from Context Lake:

```
From ecps.md:
  - ECP name and description
  - Pain points (ranked by intensity)
  - Decision maker title
  - Where they spend time online
  - Buying triggers (what makes them look for solutions)
  - Common objections

From positioning.md:
  - Value proposition angle for THIS ECP
  - Key differentiators vs alternatives
  - Proof points (metrics, case studies)

From brand-voice/brand-voice-current.md (if exists):
- brand/{slug}/outreach-playbook/sequence-templates.md
- brand/{slug}/outreach-playbook/discovery-guide.md
  - Tone guidelines
  - Platform-specific adaptations
  - Words to use / words to avoid
```

If the user specifies a single ECP, generate for that one. If no ECP specified, ask:

```
Which ECP should I build sequences for?

  [1] [ECP 1 name] — [brief description]
  [2] [ECP 2 name] — [brief description]
  [3] All ECPs (generates one sequence per ECP)
```

---

### Step 2: Load Signal Context (~2 min)

Read `brand/{slug}/operational/signals-to-track.json` if it exists. Map signals to sequence triggers:

```
Signal               → Sequence Variant        → Angle
──────────────────── ─ ──────────────────────── ─ ─────────────────────────
Fundraise            → signal-fundraise.md      → "Scale post-funding"
Hiring VP Marketing  → signal-hiring.md         → "Quick wins for new hire"
Tech stack change    → signal-tech.md           → "Maximize new tool ROI"
Competitor mention   → signal-competitor.md     → "Better alternative"
Content published    → signal-content.md        → "Continue the conversation"
```

If no signals-to-track.json exists, use the base sequence without signal variants. Note: "Signal variants improve reply rates 2-3x. Consider running signal-definition to define relevant signals."

---

### Step 3: Select Sequence Structure (~2 min)

Present structure options from [references/sequence-templates.md](references/sequence-templates.md):

```
Sequence structure options:

  [1] Multi-Channel Blitz — 7 touches, 14 days (email + LinkedIn + video)
      Best for: high-value prospects, ABM-style
      RECOMMENDED for most B2B outreach

  [2] Value-First — 5 touches, 12 days (email + LinkedIn)
      Best for: thought leadership brands, consultancies

  [3] 3-3-3 Classic — 9 touches, 21 days (3 email + 3 LinkedIn + 3 follow-up)
      Best for: enterprise, long sales cycles

  [4] AIDA 4-Touch — 4 touches, 14 days (email only)
      Best for: clear product, short sales cycle, SMB
```

Default to [1] Multi-Channel Blitz unless client context suggests otherwise.

---

### Step 4: Define Personalization Variables (~3 min)

Using [references/personalization-variables.md](references/personalization-variables.md), determine personalization depth based on available data:

**Level 1 (Basic)**: `{first_name}`, `{company}`, `{title}` — always available
**Level 2 (Context)**: `{industry}`, `{company_size}`, `{funding_stage}`, `{tech_stack}` — from contact-enrichment
**Level 3 (Signal)**: `{recent_signal}`, `{trigger_event}`, `{pain_point_inferred}` — from signal-monitor
**Level 4 (Deep)**: `{mutual_connection}`, `{content_they_published}`, `{custom_insight}` — manual research

Present detected level: "Personalization Level 2 available (contacts-enriched.json found). For Level 3, run signal-monitor first."

Define fallback values for each variable used.

---

### Step 5: Generate Sequence Per ECP (~10 min)

For each selected ECP, generate the full sequence following the chosen template structure.

Each touchpoint file includes:

```
# Touch [N]: [Channel] — [Name]

**Day**: [X]
**Channel**: Email / LinkedIn / Video
**Goal**: [What this touch achieves]

## Subject / LinkedIn Note
[Subject line with merge fields]

## Body
[Full copy with merge fields and fallbacks]

## Internal Notes
- Personalization level: [1-4]
- Merge fields used: [list]
- Fallback values: [list]
- Signal variant: [if applicable]
```

**Copy rules:**
- Email: Max 100 words per email (cold outreach is short)
- LinkedIn connection note: Max 300 characters
- LinkedIn DM: Max 150 words
- Always end with 1 clear CTA (never 2)
- Use the prospect's language (from ECP pain points), not your jargon
- First email: NEVER lead with "I" or "We" — lead with THEM

---

### Step 6: GDPR Compliance Check (~2 min)

Present compliance checklist for the generated sequences:

```
GDPR Compliance Check:

  [x] Legitimate interest basis documented
      → Reaching out about [specific business need relevant to their role]

  [x] Opt-out mechanism in every email
      → "Not interested? Reply 'stop' and I'll remove you immediately."

  [x] Professional context only
      → Using business email + LinkedIn (no personal data)

  [x] Data source documented
      → Contact data from [Apollo/LinkedIn/company website]

  [x] No purchased personal email addresses
      → All contacts sourced from professional databases

  [ ] Data retention policy
      → Delete prospect data after 90 days of no engagement
      → ACTION: Set reminder in CRM/tool
```

If any item fails, flag it and suggest remediation.

---

### Step 7: Present for Approval (~1 min)

```
Outreach sequence for [ECP name] ready:

  [1] Accept (writes to ./campaigns/outreach-{ecp}/)
  [2] Modify copy tone (more aggressive / more subtle)
  [3] Change sequence structure
  [4] Add/remove signal variants
  [5] Generate for another ECP
```

Wait for user input before writing files.

---

## Output

### File Structure

```
./campaigns/outreach-{ecp-slug}/
  brief.md                       ← Campaign overview + metrics targets
  sequences/
    01-cold-intro-email.md       ← Day 0: Email
    02-linkedin-connect.md       ← Day 1: LinkedIn
    03-value-email.md            ← Day 3: Email
    04-linkedin-engage.md        ← Day 5: LinkedIn
    05-proof-email.md            ← Day 7: Email
    06-linkedin-ask.md           ← Day 10: LinkedIn DM
    07-breakup-email.md          ← Day 14: Email
  signal-variants/               ← Optional (if signals defined)
    signal-fundraise.md
    signal-hiring.md
    signal-tech.md
  personalization-map.md         ← Merge field definitions + fallbacks
```

### brief.md Template

```markdown
# Outreach Campaign — [ECP Name]

Generated: [date]
ECP: [name] — [description]
Sequence: [template name] — [N] touches over [N] days
Channels: [email, LinkedIn, video]
Personalization: Level [1-4]
Tool mode: [FULL/STANDARD/LIGHT]

## Target Metrics
- Open rate target: 40-60% (cold email benchmark)
- Reply rate target: 5-15%
- Meeting booked rate: 2-5%
- Sequence completion: < 3% unsubscribe

## Signal Variants
[list of signal variants included]

## GDPR Status
[compliance checklist summary]
```

Append summary to `./brand/{slug}/operational/assets.md`:
```
[date] outreach-{ecp} — [N]-touch sequence ([channels]). Signal variants: [N].
```

---

## Context Lake Integration

| Action | File | Description |
|--------|------|-------------|
| READ | `./brand/{slug}/go-to-market/channel-plan.md` | Confirms outreach is selected channel |
| READ | `./brand/{slug}/go-to-market/positioning/*/*-current.md` | Value prop angle per ECP |
| READ | `./brand/{slug}/go-to-market/ecps/ecps-current.md` | Target persona details |
| READ | `./brand/{slug}/brand-voice/brand-voice-current.md` | Tone for email copy |
- brand/{slug}/outreach-playbook/sequence-templates.md
- brand/{slug}/outreach-playbook/discovery-guide.md
| READ | `brand/{slug}/operational/contacts-enriched.json` | Enriched contacts (optional) |
| READ | `brand/{slug}/operational/signals-to-track.json` | Buy signals for triggers |
| WRITE | `./campaigns/outreach-{ecp}/` | Sequence files (multiple) |
| APPEND | `./brand/{slug}/operational/assets.md` | Outreach sequence summary |

---

## Frequency

- **Per ECP**: Create once, iterate monthly based on reply rates
- **Signal variants**: Add new variant when new signal type defined
- **Refresh**: When positioning changes or new case studies available
- **A/B testing**: After 50+ sends, create variant B for subject lines and opening hooks

---

## Feedback Collection

After generating sequences, ask:

"Hay algun angulo de venta que funcione especialmente bien con este tipo de prospect? Alguna objecion comun que deberia anticipar?"

Log feedback to `./brand/{slug}/operational/learnings.md`:
```
[date] outreach-sequence-builder: [ECP] — [feedback summary]
```
