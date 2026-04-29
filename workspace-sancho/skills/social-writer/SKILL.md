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

### 1.5 Deep Research (ALWAYS — pre-step before Clarify)

Invoke the `deep-research` skill with:
- Input: `angle_draft` + `signal.url` + `signal.summary`
- Goal: verify the data point in the signal, surface adjacent stats / quotes / studies that strengthen the angle, and pull 1-2 named examples we can cite.
- Constraint: do NOT rewrite the angle here — only enrich the evidence.

Output goes into a `research_pack` object that the Clarify step shows the human and the draft step cites:
```json
{
  "verified_data_points": [{ "claim": "...", "source": "...", "url": "..." }],
  "supporting_examples": [{ "name": "...", "outcome": "...", "source": "..." }],
  "counter_evidence": [{ "claim": "...", "source": "..." }],
  "summary": "1-2 sentence brief"
}
```

Skip ONLY if `signal_type` is purely `personal-story` and there's nothing external to verify. In that case write `research_pack: { skipped: true, reason: "personal-story" }` so the next step still has the field.

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

**Format selection by `content_type`**:
| `content_type` | Section in linkedin-formats.md |
|---|---|
| Hot Take, Personal Story, Vulnerability | Personal Narrative |
| Listicle, Tips | Listicle |
| Contrarian | Contrarian Take |
| Proof Post, Case Study | Case Study |
| Framework, System | Framework/Playbook |
| **Carousel** | **Document/Carousel** (slide-by-slide draft + caption) |
| **Article** | **Article** (long-form, 800-1500 words) |
| **Strategic Comments** | **Strategic Comments** (5 reply drafts, no main post) |

If `content_type` is unset, infer from `signal_type[]` and `angle_draft` length.

### 4. Write Draft — X/Twitter

read("references/x-formats.md")

**Rules**:
- 280 chars tweet (sweet spot 200-240), 1,000-2,000 chars long-form sweet spot
- Casual, lowercase default, punchy
- No hashtags ever
- Links in reply, never in main tweet
- Line breaks between every thought

**Format selection by `content_type`**:
| `content_type` | Section in x-formats.md |
|---|---|
| Framework, System, How-to | Step-by-Step Thread (numbered `x/n`) |
| Hot Take, Contrarian | Short Take |
| Proof Post, Case Study | Proof Post |
| Resource, Tip | Resource Drop |
| Long Take, Deep Dive | Long-Form Tweet |
| **Quote Tweet** | **Quote Tweet** (3 variants on the source tweet/news) |
| **Strategic Replies** | **Strategic Replies** (5 reply drafts, no main tweet) |

For threads: spend disproportionate time on tweet 1 — the hook is 80% of thread success.

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
