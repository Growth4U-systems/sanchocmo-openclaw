---
name: social-writer
description: "LinkedIn + X/Twitter content writer with Clarify protocol embedded. Takes an approved idea with signal+angle, runs Clarify (NEVER skips), generates platform-native drafts. Each platform gets a different angle/hook/structure — NOT reformatted copies."
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
- brand/{slug}/content/clarify-history.json
- brand/{slug}/content/configs/cadence-config.yml
context_writes:
- brand/{slug}/content/published/{date}.json
- brand/{slug}/content/clarify-history.json
---

# Social Writer

> Writes LinkedIn and X/Twitter posts from approved ideas.
> Implements the Clarify Protocol (see `_system/clarify-protocol.md`).
> CRITICAL: Clarify NEVER gets skipped, regardless of confidence.

## Input

An approved idea from `idea-queue.json`:
```json
{
  "pillar_id": "P1",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": { "summary": "...", "source": "...", "url": "...", "date": "..." },
  "angle_draft": "...",
  "pov_confidence": 0.78
}
```

## Workflow

### 1. Read Context
- Brand Voice (tone, vocabulary, do/don't)
- Content Pillars (which pillar this idea belongs to)
- Clarify History (learn from past decisions)
- Cadence Config (channel rules)

### 2. Clarify (ALWAYS — see _system/clarify-protocol.md)

Generate 2-3 questions with predictions + confidence:

**Question 1: Angle**
- Prediction: "[contrarian/proof/personal/system/...]" + 1-line draft
- Confidence: 0.XX

**Question 2: Tone for this piece**
- Prediction: "[insider-vulnerable/coaching/data-driven/provocative/...]"
- Confidence: 0.XX

**Question 3: CTA**
- Prediction: "[question/link-in-comments/no-cta/book-call/...]"
- Confidence: 0.XX

Present to human. Wait for confirmation or adjustment.
High confidence = good predictions to confirm with 1 click.
Low confidence = open questions for human to answer.
**BOTH cases pass through the step.**

### 3. Write Draft — LinkedIn

read("references/linkedin-formats.md")

**Rules**:
- First line is EVERYTHING (truncates at ~210 chars with "see more")
- Sweet spot: 1,300-2,000 chars
- Short paragraphs, one idea per paragraph
- Links in first comment, NEVER in body
- No hashtags in body (max 3 at very end if any)
- Personal narratives win ("I learned...", "3 months ago I...")
- Use brand voice but adapted to LinkedIn professional tone

**Formats**:
1. Personal Narrative — "I [did/learned/failed]..."
2. Listicle — "N things I learned about..."
3. Contrarian Take — "Everyone says X. Here's why that's wrong."
4. Case Study — Challenge → Solution → Results
5. Document/Carousel — (describe the carousel, text-only draft)

### 4. Write Draft — X/Twitter

read("references/x-formats.md")

**Rules**:
- 280 chars tweet, 1,000-2,000 chars long-form sweet spot
- Casual, lowercase default, punchy
- No hashtags ever
- Links in reply, never in main tweet
- Line breaks between every thought

**Formats**:
1. Step-by-Step Thread — "Here's N steps to [outcome]:"
2. Short Take — 2-4 lines, bold claim + context + punchline
3. Proof Post — "[Metric] → [metric] in [timeframe]" + breakdown
4. Resource Drop — "I just found [thing] — [why it matters]"
5. Long-Form Tweet — 1,000-2,000 chars deep breakdown

### 5. CRITICAL RULE

**The output is NOT 2 copies of the same text reformatted.**
Each platform gets a piece that THINKS about the topic differently.
Same topic, different angle, hook, voice, structure, and format.

### 6. Save Clarify to POV Bank

Append to `content/clarify-history.json`:
```json
{
  "date": "2026-04-25",
  "pillar_id": "P1",
  "channel": "linkedin",
  "content_type": "Hot Take",
  "clarify_responses": { "angle": "...", "tone": "...", "cta": "..." },
  "prediction_accuracy": { "angle": 0.82, "tone": 0.65, "cta": 0.91 },
  "human_adjusted": ["tone"]
}
```

### 7. Output Draft

Present draft to human in the thread. Human can:
- Approve as-is → publish to Metricool
- Edit inline → re-approve
- Give instructions ("hook mas fuerte", "mas corto", "cita X") → regenerate

## Gating Rules (from cadence-config)

- **LinkedIn**: NEVER gated (B2B demand creation ungated)
- **X/Twitter**: NEVER gated
- Lead magnets only apply to Blog SEO (bottom funnel) — NOT here

## Related Skills

- `seo-content` — Blog SEO long-form (separate skill, also uses Clarify)
- `newsletter` — Newsletter weekly (separate skill, also uses Clarify)
- `content-atomizer` — Repurposing (out of scope for this skill)
