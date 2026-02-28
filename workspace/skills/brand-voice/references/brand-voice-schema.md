# Brand Voice — Schema

Complete field-by-field specification for the brand-voice pillar. Covers both Quick (Voice Snapshot + light Visual Notes) and Full (Voice Guide + AI Brand Kit + Per-ECP + Per-Channel Adaptations).

> **Note**: Deep visual identity schema (colors, typography, design system) lives in the **visual-identity** skill schema. This schema covers VOICE only, plus light visual notes captured during Quick mode.

---

## Section 0: Mode Tracking

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| mode_completed | enum: quick, full | REQUIRED | Execution tracking | foundation-orchestrator |
| quick_path | enum: url_analysis, manual_questions, materials_analysis | REQUIRED | How Quick was done | Audit |
| full_approach | enum: extract, build, hybrid | Full only | Analysis of Quick confidence | Audit |
| source_materials | string[] | Lite | URLs + docs analyzed | Reproducibility |

---

## Section 1: Voice Snapshot (Quick Mode Output)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| three_adjectives | string[3] | REQUIRED | URL analysis or Q1 | ALL content skills |
| tone_spectrum | object[] (3 dimensions minimum) | REQUIRED | Content analysis or Q2-Q3 | ALL content skills |
| signature_patterns | string[] (2-3) | Lite | Content analysis | Voice consistency |
| words_to_use | string[] (5-10) | REQUIRED | Content analysis or Q5 | Copy creation |
| words_to_avoid | string[] (5-10) | REQUIRED | Content analysis or Q5 | Copy creation |
| do_this_not_that | object[] (3+ pairs) | REQUIRED | Generated | AI Brand Kit, content quality |
| examples_by_type | object {social, email, landing_page} | REQUIRED | Generated | Content templates |
| confidence | enum: high, medium, low | REQUIRED | Self-assessment | Full mode routing |
| gaps_identified | string[] | Lite | Analysis | Full mode planning |

Tone spectrum object:
```
{
  dimension: string,        // e.g., "Formal ↔ Casual"
  position: string,         // e.g., "Casual, but not sloppy"
  score: number (1-5),      // Numeric position
  notes: string             // Specific observations
}
```

Do This / Not That object:
```
{
  do_this: string,          // On-brand phrasing
  not_that: string,         // Off-brand version of same idea
  why: string               // Which trait the off-brand version violates
}
```

---

## Section 2: Light Visual Notes (Quick Mode Output)

Captured during Quick mode URL analysis. Feeds into the visual-identity skill — NOT expanded here.

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| primary_colors | object[] {hex, name} | Lite | Website/materials | visual-identity skill |
| typography_style | string | Lite | Website/materials | visual-identity skill |
| image_style | string | Lite | Website/materials | visual-identity skill |
| overall_feel | string | Lite | Synthesis | visual-identity skill |

---

## Section 3: Voice Profile (Full Mode — Core)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| voice_summary | string (2-3 sentences) | REQUIRED | Synthesis | Quick reference |
| core_traits | object[] (3-4) | REQUIRED | Extract or Build | ALL content |
| tone_spectrum_full | object[] (5 dimensions) | REQUIRED | Analysis | Content calibration |
| vocabulary_use | object[] {word, context} (10-15) | REQUIRED | Analysis | Copy creation |
| vocabulary_avoid | object[] {word, reason} (10-15) | REQUIRED | Analysis | Copy guardrails |
| jargon_level | enum: heavy, moderate, light, translated | REQUIRED | Audience analysis | Content calibration |
| profanity_level | enum: never, rare, occasional, frequent | Lite | Style preference | Content guardrails |
| rhythm_sentences | string | REQUIRED | Pattern analysis | Writing guidance |
| rhythm_paragraphs | string | REQUIRED | Pattern analysis | Writing guidance |
| rhythm_openings | string | REQUIRED | Pattern analysis | Content templates |
| formatting_prefs | string | Lite | Pattern analysis | Content formatting |
| pov_first_person | enum: I, we, mix | REQUIRED | Pattern analysis | Copy creation |
| pov_reader_address | string | REQUIRED | Pattern analysis | Copy creation |
| relationship_stance | string | REQUIRED | Positioning analysis | Tone calibration |

Core trait object:
```
{
  trait: string,            // Short label: "Calm confidence"
  description: string,      // What this means in practice
  writing_implication: string // How it affects actual writing
}
```

---

## Section 4: Example Library (Full Mode)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| do_this_not_that_full | object[] (5-10 pairs) | REQUIRED | Generated | AI Brand Kit, quality checks |
| on_brand_examples | object[] (5+) | REQUIRED | Generated/Extracted | Voice validation |
| off_brand_examples | object[] (5+) | REQUIRED | Generated | Voice guardrails |
| dos | string[] (5+) | REQUIRED | Synthesis | Writing guidance |
| donts | string[] (5+) | REQUIRED | Synthesis | Writing guardrails |

Example objects:
```
{
  phrase: string,           // The example text
  context: string,          // Where this would appear (social, email, etc.)
  why: string              // Why it's on/off-brand (off-brand: which trait it violates)
}
```

---

## Section 5: Per-ECP Tone Adaptations (Full Mode)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| ecp_adaptations | object[] (one per selected ECP) | REQUIRED (Full) | ECP + positioning analysis | Per-niche content |

ECP adaptation object:
```
{
  ecp_name: string,
  tone_shifts: object[] {dimension, direction, degree},
  vocabulary_add: string[],     // Terms to ADD for this ECP
  vocabulary_remove: string[],  // Terms to REMOVE for this ECP
  proof_emphasis: string,       // What trust signals matter most
  primary_channels: string[],   // Where this ECP consumes content
  example_headline: string,     // On-brand + adapted for this ECP
  content_type_priority: string[] // Ordered by ECP preference
}
```

---

## Section 6: Per-Channel Tone Guidance (Full Mode)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| channel_guidelines | object[] (one per active channel) | REQUIRED (Full) | Voice profile + channel analysis | Per-channel content skills |

Channel guideline object:
```
{
  channel: string,            // "linkedin", "twitter_x", "email", "blog", "landing_page", "ads"
  tone_flex: string,          // How tone shifts for this channel
  length_range: string,       // Typical content length
  structure: string,          // Expected structure pattern
  example: string             // Sample content in brand voice for this channel
}
```

---

## Section 7: AI Brand Kit (Full Mode — Key Deliverable)

The condensed, AI-loadable output that downstream skills read before producing content.

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| voice_dna | object {personality, tone, pov, relationship} | REQUIRED | Voice Profile synthesis | ALL downstream skills |
| do_this_not_that_kit | object[] (5-10 pairs) | REQUIRED | Example Library | ALL content generation |
| vocabulary_rules_kit | object {use, avoid, jargon_level} | REQUIRED | Voice Profile | ALL content generation |
| rhythm_kit | object {sentences, paragraphs, openings} | REQUIRED | Voice Profile | ALL content generation |
| channel_quick_ref | object[] {channel, energy, key_rule} | REQUIRED | Channel Guidelines | Content routing |
| ecp_cheat_sheet | object[] {ecp, tone_shift, key_vocab, proof_style} | REQUIRED | ECP Adaptations | Per-niche content |

---

## Section 8: Voice Test Results (Full Mode)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| test_recognizable | boolean | REQUIRED | Review | Quality gate |
| test_actionable | boolean | REQUIRED | Review | Quality gate |
| test_differentiated | boolean | REQUIRED | Review | Quality gate |
| test_authentic | boolean | REQUIRED | Review | Quality gate |
| test_consistent | boolean | REQUIRED | Review | Quality gate |
| all_passed | boolean | REQUIRED | Computed | Foundation-orchestrator |
| iteration_rounds | number | REQUIRED | Count | Audit |
| sample_pieces_tested | string[] | Lite | Generated during test | Reproducibility |

---

## Coverage Calculation

```
Lite threshold (Quick mode complete):
  three_adjectives + tone_spectrum (3+) +
  words_to_use (5+) + words_to_avoid (5+) +
  do_this_not_that (3+ pairs) +
  examples_by_type (3 types) +
  confidence

Deep threshold (Full mode complete):
  All Lite +
  voice_summary + core_traits (3-4) +
  tone_spectrum_full (5 dimensions) +
  vocabulary_use (10+) + vocabulary_avoid (10+) +
  rhythm (sentences + paragraphs + openings) +
  do_this_not_that_full (5-10 pairs) +
  on_brand_examples (5+) + off_brand_examples (5+) +
  dos (5+) + donts (5+) +
  ecp_adaptations (all selected ECPs) +
  channel_guidelines (all active channels) +
  ai_brand_kit produced +
  voice_test all_passed = true +
  iteration_rounds >= 1
```

---

## Storage

- **Tier 1 (always loaded)**: three_adjectives, tone_spectrum (Quick), words_to_use[0:5], words_to_avoid[0:5], do_this_not_that[0:3], confidence, ai_brand_kit (full kit when available)
- **Tier 2 (loaded when relevant)**: Full Voice Profile, per-ECP adaptations, per-channel guidelines, full example library, voice test results
- **Tier 3 (raw)**: Source content analyzed, individual content pieces, extracted patterns pre-synthesis
