---
name: brand-voice
description: Define brand tone, vocabulary, Do/Don't rules.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: brand-voice
  layer: 0+4
  depends_on: none (Quick) | niche-discovery-100x, positioning-messaging (Full)
context_required:
- brand/company-context.md
- brand/positioning.md
context_writes:
- brand/voice-profile.md
- brand/learnings.md
- brand/assets.md
---

# Brand Voice

> How the brand speaks — codified so every piece of content is consistent. Quick extraction gets you started; Full refinement makes every niche hear the right tone. Produces an AI-ready "Brand Kit" that downstream skills load directly.

Two execution depths tied to the Foundation layer system:

| Mode | Layer | Time | When | Output |
|------|-------|------|------|--------|
| **Quick** | 0 (always-first) | ~30 min | Start of every engagement | Voice Snapshot + light Visual Notes |
| **Full** | 4 (dependent) | ~2-3 hours | After ECPs + positioning decided | Complete Voice Guide + AI Brand Kit + Per-ECP & Per-Channel Adaptation |

Quick mode is MANDATORY before any content creation. Full mode is triggered by foundation-orchestrator when ECPs and positioning are ready.

> **Note**: Deep visual identity (colors, typography, design system, illustration style) lives in the **visual-identity** skill. This skill captures light visual notes in Quick mode but focuses on WORDS.

---

## Quick Mode (Layer 0)

Runs immediately — requires only a URL or existing brand materials. No dependencies.

### Two Paths

**Path A — Has a URL (preferred):**
1. Scrape website: homepage, about page, product pages, blog (3-5 posts)
2. Check social profiles: LinkedIn, Twitter/X, Instagram (tone, frequency)
3. Extract voice patterns + light visual notes
4. Present findings for validation

**Path B — No URL:**
1. Ask the 5 Quick Questions (see below)
2. If they have brand materials (pitch deck, brand guide, previous content), analyze those
3. Construct voice snapshot from answers + materials

### 5 Quick Questions (Path B only)

1. **3 adjectives** that describe how your brand should feel to customers
2. Where do you sit: **formal ↔ casual**? (1-5 scale, 1=very formal, 5=very casual)
3. **Technical or simple** language? (audience-dependent)
4. Name a **brand you admire** for how they communicate — what do you like about them?
5. Any **words or phrases you hate** seeing in your industry?

### Quick Mode Analysis (Path A)

When analyzing existing content, look for these patterns:

**Voice patterns:**
- Tone: formal↔casual, serious↔playful, reserved↔bold
- Vocabulary: jargon level, signature phrases, avoided words
- POV: first person (I/we), reader address (you/folks), relationship stance
- Rhythm: sentence length, paragraph length, use of fragments

**Light visual notes** (for visual-identity skill later):
- Primary colors observed
- Typography style (serif, sans-serif, display)
- Image style (photography, illustration, abstract)
- Overall aesthetic feel

### Quick Mode Output: Voice Snapshot

```
## Voice Snapshot — [Company Name]

**3 Words**: [adjective], [adjective], [adjective]

**Tone Spectrum**:
- Formal ↔ Casual: [position + note]
- Serious ↔ Playful: [position + note]
- Simple ↔ Technical: [position + note]

**Signature patterns**: [2-3 distinctive voice elements observed]

**Words to USE**: [5-10 on-brand words/phrases]
**Words to AVOID**: [5-10 off-brand words/phrases]

**Do This / Not That**:
- ✅ "[on-brand example]" → ❌ "[off-brand version of same idea]"
- ✅ "[on-brand example]" → ❌ "[off-brand version]"
- ✅ "[on-brand example]" → ❌ "[off-brand version]"

**Example by content type**:
- Social post: "[example sentence in brand voice]"
- Email subject: "[example]"
- Landing page headline: "[example]"

**Visual Notes** (light — feeds visual-identity skill):
- Colors: [primary + secondary, hex if available]
- Typography: [style observed]
- Image style: [description]
- Overall feel: [1 sentence]

**Confidence**: [High/Medium/Low — based on available data]
**Gaps**: [What's missing for Full mode]
```

---

## Full Mode (Layer 4)

Requires ECPs from niche-discovery-100x and messaging from positioning-messaging. Refines the Quick Snapshot into a comprehensive voice guide with per-ECP and per-channel adaptation.

### Input Requirements

Before starting Full mode, load:
1. **Voice Snapshot** from Quick mode (always exists at this point)
2. **Selected ECPs** with personas and JTBDs
3. **Messaging Playbook** per ECP (UVP, USPs, bilingual)
4. **Positioning data** (differentiators, opportunity zones)
5. **Existing content** for Extract analysis (3-5 pieces they're proud of)

### Full Mode: Extract or Build

**Choose based on Quick Snapshot confidence:**
- **High confidence** (consistent existing voice): Extract mode — codify and deepen
- **Medium confidence** (some patterns, gaps): Extract + Build hybrid
- **Low confidence** (no consistent voice): Build mode — construct strategically

### Extract Mode Process

Analyze 3-5 content pieces the client considers "most them":
- Website copy (especially homepage, about page)
- Emails or newsletters they've sent
- Social posts that performed well
- Video/podcast transcripts
- Any content where they felt "this sounds like us"

For each piece, analyze the 6 pattern categories detailed in [references/brand-voice-questions.md](references/brand-voice-questions.md).

### Build Mode Process

Use the 15 Strategic Questions organized in 5 blocks. See [references/brand-voice-questions.md](references/brand-voice-questions.md) for the complete question set and synthesis pipeline.

| Block | Questions | Purpose |
|-------|-----------|---------|
| Identity | 4 questions | Who the brand IS |
| Audience | 3 questions | Who they talk to |
| Positioning | 3 questions | How they position |
| Aspiration | 2 questions | Voice models |
| Practical | 3 questions | Specific preferences |

From answers, construct voice profile following the Build Pipeline:
1. Synthesize personality → core traits
2. Define tone spectrum → 5 dimensions with positions
3. Set vocabulary rules → use/avoid lists
4. Establish rhythm → sentence and paragraph patterns
5. Create "Do This / Not That" library → paired examples showing right vs wrong
6. Define boundaries → explicit don'ts

### Per-ECP Tone Adaptation (Full Mode Only)

The core voice stays the same. But tone ADAPTS per ECP:

For each selected ECP, define:
- **Tone shift**: Which spectrum dimensions move? (e.g., more formal for enterprise ECP, more casual for indie ECP)
- **Vocabulary shift**: Technical terms for technical ECPs, simpler for non-technical
- **Proof emphasis**: Which trust signals matter most to this ECP?
- **Content type priority**: Where does this ECP consume content? (LinkedIn vs Reddit vs email)

**Format per ECP:**
```
### ECP: [Name]
- Tone shift: [which dimensions move, direction]
- Vocabulary: [add/remove specific terms]
- Proof style: [what convinces them]
- Primary channels: [where they are]
- Example headline: "[adapted example]"
```

### Per-Channel Tone Guidance (Full Mode Only)

Same voice, different energy per channel. Define for each active channel:

| Channel | Tone Flex | Length | Structure | Example |
|---------|-----------|--------|-----------|---------|
| LinkedIn | More authoritative, data-backed | Medium-long | Hook → insight → CTA | "[example]" |
| Twitter/X | Sharper, bolder, more direct | Short | Punchy statement or thread | "[example]" |
| Email | Warmer, more personal | Variable | Personal opener → value → ask | "[example]" |
| Blog | Most detailed, educational | Long | Structured with headers | "[example]" |
| Landing page | Most persuasive, benefit-driven | Scannable | Headline → proof → CTA | "[example]" |
| Ads | Sharpest, highest-impact | Very short | Hook → benefit → action | "[example]" |

Only fill in channels the client actively uses. Skip irrelevant ones.

---

## Full Mode Output: Voice Guide + AI Brand Kit

See [references/brand-voice-schema.md](references/brand-voice-schema.md) for the complete field-by-field specification.

### Two outputs from Full mode:

**1. Complete Voice Guide** (human-readable, comprehensive reference)
All sections from the schema: voice profile, tone spectrum, vocabulary, rhythm, examples, per-ECP, per-channel.

**2. AI Brand Kit** (AI-ready, 2-3 page snapshot for downstream skills)

The AI Brand Kit is the KEY deliverable — a condensed, AI-loadable document that every content skill reads before producing output:

```
## AI Brand Kit — [Company Name]

### Voice DNA
- **Personality**: [3-4 core traits with 1-line descriptions]
- **Tone**: [dominant tone in 1 sentence]
- **POV**: [I/we + how we address reader]
- **Relationship**: [peer/mentor/authority/insider]

### Do This / Not That
| ✅ Do This | ❌ Not That | Why |
|------------|-------------|-----|
| "[on-brand phrase]" | "[off-brand version]" | [which trait it violates] |
| "[on-brand phrase]" | "[off-brand version]" | [reason] |
| "[on-brand phrase]" | "[off-brand version]" | [reason] |
| "[on-brand phrase]" | "[off-brand version]" | [reason] |
| "[on-brand phrase]" | "[off-brand version]" | [reason] |
(5-10 pairs minimum)

### Vocabulary Rules
- **USE**: [10-15 words/phrases with context]
- **AVOID**: [10-15 words/phrases with reasons]
- **Jargon level**: [heavy/moderate/light/translated]

### Rhythm
- **Sentences**: [e.g., "Mix short punchy (5-8 words) with medium (15-20). Rarely exceeds 25."]
- **Paragraphs**: [pattern]
- **Openings**: [how to start content]

### Channel Quick-Reference
| Channel | Energy | Key Rule |
|---------|--------|----------|
| LinkedIn | [1-word] | [1-line guidance] |
| Email | [1-word] | [1-line guidance] |
| [etc.] | | |

### Per-ECP Cheat Sheet
| ECP | Tone Shift | Key Vocab | Proof Style |
|-----|-----------|-----------|-------------|
| [ECP 1] | [shift] | [+/- terms] | [what convinces] |
| [ECP 2] | [shift] | [+/- terms] | [what convinces] |
```

**Why two outputs**: The full Voice Guide is the reference document. The AI Brand Kit is the operational document — what actually gets loaded into every content generation prompt.

### Summary (always generated)

> **Voz de marca para [Company Name]:**
>
> **Personalidad**: [3-4 core traits]
> **Tono dominante**: [1-sentence description]
> **Diferenciador de voz**: [What makes this voice unique vs competitors]
>
> **Adaptaciones por ECP:**
> - [ECP 1]: [1-line tone shift]
> - [ECP 2]: [1-line tone shift]
> - [ECP 3]: [1-line tone shift]

---

## Voice Test + Iterate

A good voice profile passes 5 checks:

1. **Recognizable**: Could someone identify content as "theirs" without a byline?
2. **Actionable**: Could a writer (human or AI) produce on-brand content using only the AI Brand Kit?
3. **Differentiated**: Does it sound different from competitors?
4. **Authentic**: Does it feel true to who they are (or want to be)?
5. **Consistent**: Can it be applied across formats (social, email, landing page, ad)?

### Iterate Until It Passes

If any check fails:
1. Identify which check failed and why
2. Generate 3 sample pieces using the current AI Brand Kit (1 social post, 1 email, 1 ad headline)
3. Review with client: "¿Esto suena a ti?"
4. Adjust the specific section that's weak (traits, vocabulary, rhythm, or examples)
5. Re-run the 5 checks

Typically 1-2 rounds of iteration. Do not skip this — the AI Brand Kit is only as good as its test results.

---

## Lite vs Deep Criteria

**Lite done** (minimum for downstream, Quick mode complete):
- Voice Snapshot produced (3 adjectives + tone spectrum + examples)
- Light Visual Notes captured (colors + typography + feel)
- Words to use/avoid list (5+ each)
- Do This / Not That pairs (3+ pairs)
- 1 example per content type (social, email, landing page)

**Deep done** (comprehensive, Full mode complete):
- All Lite criteria met
- Complete Voice Profile with all sections
- AI Brand Kit produced (2-3 pages, AI-loadable)
- Per-ECP tone adaptations (for all selected ECPs)
- Per-channel tone guidance (for all active channels)
- Do This / Not That library (5-10 pairs with reasoning)
- On-brand vs off-brand example library (5+ each)
- Voice Test passed (5 checks) + at least 1 iteration round

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| Voice Snapshot (3 adjectives + tone) | ALL content skills (social-content, email-sequences, landing-pages, direct-response-copy) |
| AI Brand Kit | ALL downstream skills — loaded as context before any content generation |
| Words to use/avoid | Every piece of copy produced by any skill |
| Do This / Not That library | Content quality checks, AI prompt engineering |
| Per-ECP tone adaptation | positioning-messaging (voice-consistent messaging), outreach-workflow (personalized outreach) |
| Per-channel guidance | social-content (channel-specific posts), email-sequences (email tone), paid-ads (ad copy tone) |
| Light Visual Notes | visual-identity skill (as input for deep visual work) |
| On-brand examples | Phase 3 content workflow (voice consistency check), AI content generation prompts |

---

## Edge Cases

**Brand voice exists but is inconsistent across channels:**
- Extract from ALL channels, note inconsistencies
- "Tu voz en LinkedIn es formal pero en Instagram es casual. ¿Cuál es la real? ¿O quieres mantener la diferencia?"
- Decide: unify or intentionally vary by channel (document either way in per-channel guidance)

**Multiple founders with different voices:**
- Company voice ≠ personal voice
- Define company voice profile + note how each founder's personal voice relates
- "La voz de la empresa es X. [Founder A] es más casual, [Founder B] es más técnico — ambos dentro del rango."

**B2B with very different ECPs (e.g., technical user vs C-suite buyer):**
- Core voice stays the same. Per-ECP adaptation handles the shift.
- Technical ECP gets jargon, C-suite gets business impact language
- Same personality, different vocabulary and proof emphasis

**No existing content at all (pre-launch):**
- Build mode mandatory
- Use competitor voice analysis as reference ("They all sound like X — here's how we differentiate")
- Create sample content in the defined voice for validation before launch

**Client wants to sound like a specific brand:**
- Analyze that brand's voice profile
- Extract what specifically they want to emulate (tone? structure? vocabulary?)
- Adapt to client's own identity — never copy, always translate
- "Te gusta cómo suena [Brand] — específicamente su tono directo y uso de números. Adaptamos eso a tu personalidad."

**Voice needs to work in multiple languages:**
- Core personality traits and tone spectrum are universal
- Vocabulary lists and Do This / Not That pairs are per-language
- Examples must be written natively in each language (not translated)
- AI Brand Kit needs a section per language
- "La voz es la misma personalidad en ES y EN, pero las expresiones son nativas de cada idioma."
