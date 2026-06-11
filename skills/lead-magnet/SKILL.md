---
name: lead-magnet
description: "Create high-converting lead magnets from concept to build. Use when the user wants to create, plan, or optimize a lead magnet for email capture or lead generation. Also use when the user mentions 'lead magnet,' 'gated content,' 'content upgrade,' 'downloadable,' 'ebook,' 'cheat sheet,' 'checklist,' 'template download,' 'opt-in,' 'freebie,' 'PDF download,' 'resource library,' 'content offer,' 'email capture content,' 'Notion template,' 'spreadsheet template,' or 'what should I give away for emails.' Pipeline: Context → Format Selection → Concept Generation → Build Mode → Funnel Chain. Supports 12+ formats. For interactive tools as lead magnets, see free-tool-strategy. For the email sequence after capture, see email-sequence."
metadata:
  context_required:
    - brand/{slug}/brand-voice/brand-voice.current.md
    - brand/{slug}/go-to-market/positioning/*/*.current.md
    - brand/{slug}/go-to-market/ecps/ecps.current.md
  context_writes:
    - campaigns/{slug}/lead-magnet/
    - brand/{slug}/operational/learnings.md
    - brand/{slug}/operational/assets.md
---

# Lead Magnet — Concept to Content

> Create lead magnets that people actually want. From idea to fully built asset.

Read ./brand/ per `_system/intelligence/brand-memory.md`
Follow output formatting from `_system/output/output-format.md`

---

## Core Job

Take a marketing goal + audience pain point → produce a lead magnet that:
1. Solves a specific, immediate problem (Quick Win)
2. Demonstrates expertise without giving away the whole solution
3. Creates a natural bridge to the paid offer
4. Is worth sharing (organic amplification)

---

## Workflow

### Phase 1: Context Loading
- Load brand memory (voice, positioning, ECPs)
- If content exists → Refresh Mode (iterate, don't recreate)
- Competitor research: what lead magnets do competitors offer?
- See `references/workflow.md` for detailed context integration

### Phase 2: Format Selection
- 12+ formats: checklist, template, mini-course, calculator, toolkit, swipe file, case study, quiz, cheat sheet, workbook, resource list, framework
- Selection based on: audience sophistication, topic complexity, distribution channel, production capacity
- See `references/templates.md` for Format Selection Framework

### Phase 3: Concept Generation (3-5 concepts)
For each concept: title, hook, format, target ECP, bridge to paid offer, competitive differentiation, distribution plan.
- See `references/templates.md` for Concept Output Format

### Phase 4: Build Mode
User selects a concept → produce the full lead magnet content.
- Structure varies by format (see `references/workflow.md`)
- Apply brand voice throughout
- Include CTAs bridging to paid offer

### Phase 5: Funnel Chain
- Connect to email-sequences (nurture post-download)
- Landing page brief for the lead magnet
- Distribution plan (channels, ads, partnerships)
- See `references/workflow.md` (Funnel Chain section)

---

## Output

**Concept phase**: 3-5 concept cards with hook, format, audience, bridge
**Build phase**: Full lead magnet content in markdown + campaign brief

Files saved to `campaigns/{slug}/lead-magnet/`

---

## Quality

- See `references/quality.md` for pre-generation, per-concept, build, and post-build checklists
- See `references/examples.md` for example outputs

---

## References

| File | Content |
|------|---------|
| `references/workflow.md` | Detailed phase instructions, framework, hooks, funnel chain |
| `references/templates.md` | Format selection framework, output templates |
| `references/examples.md` | Example lead magnets and build outputs |
| `references/quality.md` | All checklists (pre-gen, per-concept, build, post-build) |
| `references/connections.md` | How this connects to other skills |

---

## Rules

1. **Hook > Content** — If the title doesn't make them click, the content doesn't matter
2. **Quick Win mandatory** — Every lead magnet must deliver one actionable result immediately
3. **Bridge to paid** — Always include natural transition to the paid offer
4. **Brand voice** — Apply brand-voice/brand-voice.current.md tone throughout (not generic marketing speak)
5. **Competitive check** — Don't create what competitors already give away free
