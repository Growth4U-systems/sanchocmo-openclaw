---
name: idea-builder
description: "Single-pass skill that turns research signals into ideas with brand-aligned angle drafts. Replaces the legacy combo of insight-classifier + insight-to-content-mapper. Reads research-signals + pov-bank.json + content-pillars + cadence-config to produce ideas with: pillar match, signal_type classification, target channel, and a SHORT POV paragraph (max ~80 words) — not a full article copy."
context_required:
- brand/{slug}/content/research-signals/
- brand/{slug}/content/content-pillars.md
- brand/{slug}/content/pov-bank.json
- brand/{slug}/content/configs/cadence-config.yml
context_optional:
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
- brand/{slug}/content/clarify-history.json
context_writes:
- brand/{slug}/content/idea-queue.json
- brand/{slug}/content/research-signals/*.json (in place — adds signal_type)
---

# Idea Builder — From Signal to POV-Driven Idea

> One skill that does the full job: classify signals, match to pillar,
> derive a brand-specific angle from the POV Bank, and append to the
> idea-queue.
>
> The angle_draft this skill writes is a **POV STATEMENT (1 paragraph,
> ~60-80 words)**. It is NOT an article. It states our take on the signal
> citing the relevant POV from the bank. The actual content gets written
> later by the writer skill after the human approves.

## Why this exists

The old flow used two skills — `insight-classifier` (tagged signals) +
`insight-to-content-mapper` (generated angles). Both deprecated. The split
added overhead without value. This skill does both in one pass with the
added benefit of consulting the **POV Bank** so angles are differentiated
and on-brand instead of generic "industry insights".

## The 7 signal types (kept from the legacy classifier)

| Type | What it means | Angle pattern it tends to enable |
|------|--------------|----------------------------------|
| `aha-moment` | Surprising insight, counterintuitive data | "Did you know…" eye-openers |
| `conflict` | Industry debate or tension | Hot takes |
| `contrarian` | Goes against conventional wisdom | "Everyone says X. They're wrong." |
| `system` | Framework, process, methodology | Step-by-step playbooks |
| `milestone` | Achievement, growth metric, before/after | Proof posts |
| `vulnerability` | Honest failure, lesson learned | Personal narrative |
| `metric` | Data point, benchmark, statistic | Data-driven posts |

A signal can have multiple types.

## Workflow

### 1. Read inputs

- All `research-signals/{date}-*.json` files of today (news, creators, paa, keywords, pulse)
- `content-pillars.md` — the canonical pillars (P1–PN with names + topics)
- **`pov-bank.json` — the POV per pillar (this is the new key input)**
- `cadence-config.yml` — to know which channels are active and what content_types they accept
- Optional: `brand-voice.current.md` for fallback if pov-bank entry is empty
- Optional: `clarify-history.json` last 20 entries — to spot recent human-edited patterns

### 2. For each signal

1. **Classify** in 1+ of the 7 signal_types. Write back to the signal file in place.
2. **Match to pillar** by topic overlap with content-pillars.md (best fit, not multiple).
3. **Pick target_channel** from cadence-config (active channels) using channel-fit heuristics:
   - signal with hard data + framework → blog or newsletter
   - signal with conflict / contrarian → linkedin or twitter
   - signal with personal story → linkedin
   - if nothing matches well, default to linkedin
4. **Pick content_type** from the channel's `content_types` list in cadence-config.
5. **Derive angle_draft from the POV Bank** (see next section).
6. **Compute pov_confidence** (0–1) based on:
   - +0.3 if pov-bank entry for this pillar has core_belief filled
   - +0.2 if signal cites concrete data/quote
   - +0.2 if signal source is in `evidence_we_cite` of the pillar
   - +0.15 if signal is recent (≤7 days)
   - +0.15 if angle pattern matches a `preferred_angles` template

### 3. Generate angle_draft (THE CRITICAL PART)

**Format requirements — strict:**
- **1 paragraph max, 60-80 words** (not a full draft, not an article)
- Open with "Nuestro POV:" (or equivalent if english)
- State the POSITION we take on the signal (taken from pov-bank `core_belief` or `preferred_angles`)
- Cite ONE concrete piece of evidence from the signal (number, name, quote)
- Optionally cite ONE piece of `evidence_we_cite` from the POV bank
- End with the FRAME we're using (the angle template from `preferred_angles`)

**What NOT to do:**
- ❌ Don't write the article hook, body, CTA
- ❌ Don't write copy formatted for LinkedIn / X / Blog
- ❌ Don't paraphrase the signal as the angle (signal ≠ angle)
- ❌ Don't write generic "industry insights" angles

**Good example (~70 words):**
> Nuestro POV: las nuevas reglas MiCA validan lo que decimos desde Bnext —
> compliance no frena growth, lo escala. Quien tenga el playbook de
> notificaciones pre-aprobado podrá lanzar mientras la competencia espera
> permisos de la CNMV. La regulación es un cheat code competitivo, no un
> obstáculo. Frame: 'compliance-as-moat' (preferred angle del pillar P3).

**Bad examples:**
- ❌ Paraphrase: "MiCA entra en vigor el 1 de julio. Tu plataforma necesita autorización." (eso es el signal, no nuestro POV)
- ❌ Article hook: "1 de julio de 2026. Esa es la fecha en la que tu plataforma…" (eso es la primera frase del copy, no el angle)
- ❌ Generic: "Las regulaciones afectan al growth de fintechs." (sin postura)

### 4. Append to idea-queue.json

Per idea:
```json
{
  "id": "idea-{date}-{n}",
  "pillar_id": "P3",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": {
    "summary": "<from research-signals>",
    "source": "<source name>",
    "url": "<url>",
    "date": "<signal date YYYY-MM-DD>"
  },
  "signal_type": ["contrarian", "system"],
  "angle_draft": "<the 60-80 word POV paragraph>",
  "pov_confidence": 0.87,
  "source_signals": ["<signal_id_1>", "<signal_id_2>"],
  "created_at": "<now ISO>",
  "status": "ready"
}
```

Do NOT duplicate ideas already in queue (check by signal URL + pillar).

### 5. Save

- Append new ideas to `brand/{slug}/content/idea-queue.json`
- Save back the `signal_type[]` enrichment into the original `research-signals/*.json` files

### 6. Confirm

Resume al humano:
- N signals procesados → M ideas nuevas (algunas signals no produjeron ideas si el match a pillar era débil)
- Distribución por pillar: P1 (X), P2 (Y), …
- Ideas con `pov_confidence > 0.8`: cuántas
- Pillars con POV débil (core_belief null en pov-bank) — sugerir refrescar pov-bank

## Rules

- **NEVER write copy / drafts / hooks**. Only the POV paragraph.
- **NEVER use generic angles**. If pov-bank entry for a pillar is empty,
  flag the idea with `pov_confidence ≤ 0.5` and add a note in the idea
  description: "POV bank vacío para este pillar — revisar y poblar."
- **NEVER skip the POV bank lookup**. Even if brand-voice covers tone,
  the POV per-pillar is what makes angles differentiated.
- **NEVER produce more than 5-8 ideas per day**. Quality > quantity.
- **If a pillar's pov-bank entry is well-populated, lean on it heavily**
  (cite preferred_angles by name, use evidence_we_cite as references).
- **Brand-voice is a fallback**, not a substitute for pov-bank. If both
  are weak, output low-confidence ideas and recommend running
  `pov-bank-builder` again.
