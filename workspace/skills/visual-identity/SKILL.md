---
name: visual-identity
description: "META-SKILL that defines brand visual identity through an iterative 3-layer process (Visual World, Idea Mapping, Aesthetic Guidelines) and GENERATES 2-3 child skills: [brand]-ui-system (create web pages/components), [brand]-visual-generator (create images via Nanobanana), and optionally [brand]-deck-creator (presentations). Two modes — Quick (30 min, Visual Snapshot) and Full (2-3 hours, generates child skills). Use when user says visual identity, brand visuals, how should we look, visual system, design system, or needs skills to create web pages and images. Do NOT use for brand voice (use brand-voice), copywriting (use direct-response-copy), or single image generation (use generated child skill after this runs)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: "1"
  pillar: "visual-identity"
  layer: "0+4"
  type: "meta-skill"
  depends_on: "none (Quick) | brand-voice, niche-discovery-100x, positioning-messaging (Full)"
---

# Visual Identity (Meta-Skill)

> Defines how the brand LOOKS — and generates production skills to create visuals at scale

This is a **META-SKILL** that generates other skills. It doesn't create images directly—it creates the SKILLS that create images.

## What This Meta-Skill Does

**Input**: Brand context, existing materials (optional), brand-voice AI Brand Kit
**Process**: Iterative 3-layer visual identity definition with examples
**Output**: 2-3 production-ready child skills installed and ready to use

### The Complete System

```
brand-voice                    (how brand speaks)
    +
visual-identity (meta)         (defines how brand looks)
    ↓ GENERATES ↓
[brand]-ui-system             (creates web pages/components)
[brand]-visual-generator      (creates images via Nanobanana)
[brand]-deck-creator          (creates presentations - optional)
    +
copywriting skills            (direct-response-copy, etc.)
    =
COMPLETE CONTENT CREATION CAPABILITY
```

### Child Skills Generated

| Child Skill | Purpose | When to Use | Based On |
|-------------|---------|-------------|----------|
| `[brand]-ui-system` | Create web pages, landing pages, UI components | Building websites, web apps | comic-ui-system template |
| `[brand]-visual-generator` | Create images, illustrations, graphics via Nanobanana | Need hero images, social graphics, illustrations | Brian Castle's brand-illustrator pattern |
| `[brand]-deck-creator` | Create presentation decks with brand styling | Building pitch decks, workshops | pptx skill + brand styling (optional) |

---

## Two Execution Modes

| Mode | Layer | Time | When | Output |
|------|-------|------|------|--------|
| **Quick** | 0 (always-first) | ~30 min | Start of engagement, need basics | Visual Snapshot + Lite Visual World |
| **Full** | 4 (dependent) | ~2-3 hours | After brand-voice complete, ready for production skills | Visual DNA Kit + 2-3 Generated Child Skills |

Quick mode gives you enough to start. Full mode gives you production skills.

---

## Quick Mode (Layer 0)

Runs immediately with minimal dependencies. Outputs Visual Snapshot — enough to enable basic visual consistency.

### Two Paths

**Path A — Has URL or Materials (preferred)**:
1. Scrape website: homepage, about, product pages
2. Check social profiles: LinkedIn, Instagram, Twitter/X
3. Extract visual patterns: colors, typography, imagery style, logo
4. Present Visual Snapshot for validation

**Path B — No URL**:
1. Ask 5 Quick Questions (below)
2. If they have materials (logo, brand guide, deck), analyze those
3. Construct Visual Snapshot from answers + materials

### 5 Quick Questions (Path B)

1. **3 adjectives** describing how your brand should LOOK (not sound)
2. **Reference brands**: 1-2 brands whose visual identity you admire — what specifically?
3. **Primary colors**: What colors do you already use or associate with your brand?
4. **Typography**: serif ↔ sans-serif ↔ display? (1-5 scale, or "not sure")
5. **Imagery style**: Photography, illustration, abstract, or mix? What mood?

### Quick Mode Output: Visual Snapshot

```markdown
## Visual Snapshot — [Brand Name]

**3 Visual Adjectives**: [adjective], [adjective], [adjective]

**Color Palette** (preliminary):
- Primary: #hexcode ([color name])
- Secondary: #hexcode ([color name])
- Accent: #hexcode ([color name])

**Typography**:
- Style: [serif/sans-serif/display/mixed]
- Observed fonts: [names if extracted, else TBD]

**Imagery Style**:
- Type: [photography/illustration/abstract/mixed]
- Mood: [description]

**Logo Notes** (if exists):
- Style: [wordmark/icon/combination]
- Usage: [brief observation]

**Lite Visual World** (3-5 objects):
- [Object 1 that appears in brand visuals]
- [Object 2]
- [Object 3]

**Overall Aesthetic**: [1-2 sentences]

**Design Tokens** (lite):
```json
{
  "colors": {"primary": "#hex", "secondary": "#hex"},
  "typography": {"heading": "font", "body": "font"}
}
```

**Confidence**: [High/Medium/Low]
**Gaps for Full Mode**: [What's missing]
**Integrates with**: Brand Voice [link to AI Brand Kit if exists]
```

---

## Full Mode (Layer 4)

Requires brand-voice AI Brand Kit, ECPs, and positioning. Runs **Step 0** (style direction discovery), then iterative 3-layer process with examples, then **GENERATES child skills**.

---

## Step 0: Style Direction Discovery (FIRST STEP - Visual Examples)

**Purpose**: Show visual style options BEFORE defining layers. Saves 1 hour of blind exploration.

### Process

1. **Load 8 style examples** from `assets/style-examples/`
   - All show same generic subject ("professional consultation")
   - Easy to compare styles side-by-side

2. **Show all 8 styles**:
   | # | Style | When It Works | Example |
   |---|-------|---------------|---------|
   | 1 | Acuarela Hiperrealista | Profesional + cálido + único | Salort (validated) |
   | 2 | Fotorrealismo | Máxima confianza, real | Enterprise B2B |
   | 3 | Line Art Minimalista | Tech, moderno, simple | Notion, Linear |
   | 4 | Flat Illustration Bold | Startups, energético | Dropbox, Mailchimp |
   | 5 | 3D Render | Premium, tech-forward | Apple, Stripe |
   | 6 | Sketch Hand-drawn | Artesanal, auténtico | Craft brands |
   | 7 | Comic / Cartoon | Playful, memorable | SanchoCMO, Duolingo |
   | 8 | Vintage / Retro | Nostálgico, heritage | Coca-Cola retro |

3. **Ask user**: "¿Qué estilo resuena más con tu brand?"

4. **User selects**:
   - **Single style**: "Me gusta #1 (Acuarela hiperrealista)"
   - **Hybrid**: "Mezcla de #1 y #3 - acuarela con líneas más limpias"
   - **Custom**: "Ninguno exactly, pero cercano a #6 con más [X]"
   - **Extract from URL**: "Tengo sitio web, extrae de ahí y compara con estos"

5. **Selected style** → Becomes foundation for Layer 3
   - Reduce iterations from 8-12 to 3-5
   - Clear starting point (no blind exploration)

### Benefits

- ✅ User sees VISUAL options (not text descriptions)
- ✅ Faster to "This is it" in Layer 3
- ✅ Saves ~1 hour per meta-skill run
- ✅ Clear decision point at start

**After Step 0**, proceed to Layer 1 (Visual World Definition).

---

### Critical Insight: Brian Castle's Process

This skill follows Brian Castle's proven workflow (Builder Methods):

**Problem**: AI image generation creates one-off images, but brands need a **repeatable system** that maintains aesthetic without recrafting complex prompts each time.

**Solution**: 3-layer guidelines (Visual World, Idea Mapping, Aesthetic) that enable AI to REASON about visuals, not just execute rigid steps.

**Output**: Production skills (not just documentation) that create on-brand content at scale.

### Input Requirements

Before starting Full Mode, gather:
1. Visual Snapshot from Quick Mode
2. brand-voice AI Brand Kit (for alignment)
3. Selected ECPs with personas
4. Positioning data (differentiators, opportunity zones)
5. Existing visual materials for Extract analysis (if available)

### Full Mode: Extract or Build

**Choose based on Visual Snapshot confidence:**
- **High confidence** (consistent existing visuals): Extract mode
- **Medium confidence** (some patterns, gaps): Hybrid
- **Low confidence** (no consistent visuals): Build mode

---

## Three-Layer Build System

Each layer is iterative: propose → show examples → refine → validate.

### Layer 1: Visual World Definition

**What it defines**: WHAT objects/scenes exist in the brand's visual universe (NOT how they look).

**Purpose**: Inventory of visual elements that can appear. Foundation for all visual decisions.

**Process**:
1. Ask: "What types of objects, scenes, or characters belong in your brand's visual world?"
2. Propose 5-7 object categories based on brand context
3. Show examples from similar brands:
   - Builder Methods: "Home studio desk, coffee mug, notebook, laptop, plant, chair"
   - SanchoCMO: "Speech bubbles, action bursts, vintage objects (rotary phone, typewriter), hero characters"
4. User validates, adds, removes
5. Define EXCLUSIONS: what should NEVER appear
6. Write `visual-world.md` (see template in references/)

**Output**: `references/visual-world.md` with object inventory

**Validation**: "When I say 'create a hero image for blog post about [topic],' which objects from this world would you use?"

### Layer 2: Idea-to-Visual Mapping

**What it defines**: System to decide WHAT to illustrate for any content type.

**Purpose**: Automatic decision tree AI can execute. Maps content topics → visual concepts → objects from Visual World.

**Process**:
1. Load Visual World from Layer 1
2. Ask: "How should visuals adapt by content type?" (blog vs landing page vs social)
3. Propose decision tree: content type → core idea → visual metaphor → specific objects
4. Show example mappings from Brian Castle:
   - "Prompt Engineering" → Chat interface, text bubbles
   - "Spec-Driven Development" → Blueprint, architectural drawing, wireframes
   - "Morning Coffee Rituals" → Mug on desk, notebook, morning light
5. User validates, adds domain-specific mappings
6. Build decision tree with IF-THEN logic AI can execute
7. Write `idea-mapping.md` (see template in references/)

**Output**: `references/idea-mapping.md` with decision tree

**Validation**: "For a blog post about [random topic], what would you illustrate and why?"

### Layer 3: Aesthetic Guidelines (COST-CONSCIOUS APPROACH)

**What it defines**: HOW everything looks exactly (colors, style, line weight, detail level, texture).

**Purpose**: Precise visual specifications so all generated images are consistent.

**CRITICAL**: Use references-first approach to minimize costly generation.

**Process** (References >> Generation):

#### Step 3.1: Check if User Has References

Ask: "¿Tienes webs o imágenes de referencia que te gusten?"

**If YES** (BEST case - free):
- User shares web URLs or images
- Analyze those references
- Extract aesthetic specifications
- Codify style
- Generate ONLY 1-2 samples to validate (€1-3)
- **Cost: €1-3** ✅

**If NO**: Continue to Step 3.2

#### Step 3.2: Show Step 0 Examples (Free)

Remind: "Viste estos estilos en Step 0:"
- **Image styles**: 8 options (acuarela, photo, line art, etc.)
- **Web UI styles**: 6 options (comic-ui, glossy-ui, soft-ui, etc.)

Ask: "¿Alguno de estos captura lo que quieres?"

**If YES**:
- Use selected style as foundation
- Refine with brand colors/personality
- Generate ONLY 1-2 samples to validate
- **Cost: €1-3** ✅

**If NO**: Continue to Step 3.3

#### Step 3.3: Search Web References (Free)

Ask: "¿Qué fuente de inspiración prefieres?"

**Fuentes por perfil**:
- **Diseñadores**: Dribbble, Behance
- **No técnico**: Pinterest (más accesible)
- **Cualquiera**: Awwwards, SiteInspire
- **Default**: Dribbble

**Process**:
1. WebSearch en fuente elegida: "[brand personality adjectives] illustration style"
2. Show 10-15 reference images/webs from results
3. User selects 2-3 favoritos: "Me gusta este #3 y #7"
4. Analyze selected references (describe estilo sin generar)
5. Codify aesthetic specs based on references
6. Generate ONLY 1-2 samples to validate
7. **Cost: €1-3** ✅

#### Step 3.4: Generate Final Validation Samples

**Only after** aesthetic is codified from references:
1. Generate 1 sample with codified style
2. User: "Perfect" OR "Ajusta [specific element]"
3. If adjust: Generate 1 more with tweak
4. Maximum 2-3 generations total

**Output**: `references/visual-style.md` with:
- Precise aesthetic specifications (7 dimensions)
- AI prompt library (base + keywords + negatives)
- Reference links (sources of inspiration)

**Total Cost Target**: €1-3 (2-3 images max)

**Iteration Criteria** (same):
- ✅ **Flexible**: Style works for many subjects/use cases
- ✅ **Distinctive**: Doesn't look generic AI-generated
- ✅ **Consistent**: Matches brand voice personality
- ✅ **Scalable**: Works across web, social, print

**Anti-Pattern**: ❌ Generating 10+ images to "explore" (use web references for exploration)

---

## Child Skill Generation Process

Once all 3 layers are validated, the meta-skill GENERATES child skills.

### Step 1: Confirm Readiness

Before generating, verify:
- ✅ Visual World defined (Layer 1 complete)
- ✅ Idea Mapping defined (Layer 2 complete)
- ✅ Aesthetic validated with generated samples (Layer 3 complete)
- ✅ User approved all 3 layers
- ✅ brand-voice AI Brand Kit available (for alignment check)

### Step 2: Generate `[brand]-ui-system` Skill

**Template**: `templates/ui-system-template/`

**Process**:
1. Load `SKILL.md.template` and `references/components.md.template`
2. Replace placeholders:
   - `{{brand_name}}` → actual brand name
   - `{{primary_color}}` → from Layer 3 color system
   - `{{secondary_color}}` → from Layer 3
   - `{{accent_color}}` → from Layer 3
   - `{{font_heading}}` → from Layer 3 typography
   - `{{font_body}}` → from Layer 3 typography
   - `{{design_tokens}}` → complete JSON from Layer 3
3. Customize component library (buttons, cards, forms) with brand styling
4. Write to `.claude/skills/[brand]-ui-system/`

**Output**: Complete UI system skill ready to create web pages

**Verification**: Read generated SKILL.md, confirm valid YAML + customizations applied

### Step 3: Generate `[brand]-visual-generator` Skill

**Template**: `templates/visual-generator-template/`

**Process**:
1. Load `SKILL.md.template` and `scripts/generate_image.py.template`
2. Copy files to skill's `references/`:
   - `visual-world.md` (Layer 1)
   - `idea-mapping.md` (Layer 2)
   - `visual-style.md` (Layer 3)
   - Brand colors from visual-identity
3. Customize `generate_image.py`:
   - Inject brand-specific base prompt from Layer 3
   - Set Nanobanana API parameters
   - Configure project folder naming (brand-specific)
4. Replace placeholders in SKILL.md.template:
   - `{{brand_name}}`
   - `{{base_prompt}}` → from Layer 3
   - `{{visual_world_summary}}` → 1-sentence summary
5. Write to `.claude/skills/[brand]-visual-generator/`

**Output**: Complete image generation skill with Nanobanana integration

**Verification**: Test script runs: `python scripts/generate_image.py --test`

### Step 4: Generate `[brand]-deck-creator` Skill (Optional)

Ask user: "Do you need a skill to create presentation decks with your brand styling?"

If yes:

**Template**: `templates/deck-creator-template/`

**Process**:
1. Load `SKILL.md.template` and `templates/slide-layouts.md`
2. Inject brand colors, typography, logo
3. Create slide templates (title, content, closing) with styling
4. Write to `.claude/skills/[brand]-deck-creator/`

**Output**: Deck creation skill

### Step 5: Verify Installation

For each generated skill:
1. Verify folder exists in `.claude/skills/`
2. Check SKILL.md has valid YAML frontmatter
3. Verify required files exist (scripts, references, assets)
4. Test skill is loadable: try to invoke it

### Step 6: Generate Usage Examples

For each child skill, provide 1-2 concrete usage examples:

**Example for sanchocmo-visual-generator**:
```
"I need a hero image for a blog post about marketing psychology"
  → Skill analyzes topic using Idea Mapping
  → Proposes 3 concepts: (A) Sancho reading psychology book, (B) thought bubbles with psychology symbols, (C) vintage brain diagram
  → User selects B
  → Generates image in 1970s comic book aesthetic
  → User: "Me gusta, pero prueba con más color"
  → Regenerates with color variation
```

**Example for sanchocmo-ui-system**:
```
"Create a landing page for our new marketing course"
  → Skill applies SanchoCMO comic-ui styling
  → Generates page with 4px borders, halftone patterns, comic aesthetic
  → Uses design tokens from visual-identity
```

---

## Visual DNA Kit Specification

The Visual DNA Kit is the **documentation artifact** produced by Full Mode (separate from generated child skills).

2-3 page AI-loadable document consumed by downstream content skills.

**Format**:

```markdown
## Visual DNA Kit — [Brand Name]

### Visual Personality
- **Core aesthetic**: [3-4 traits, aligned with brand voice]
- **Design emotion**: [dominant mood]
- **Differentiation**: [What makes this unique vs competitors]

### Visual World Inventory (Layer 1 Quick-Ref)
**Core Objects**: [5-7 objects that can appear]
**Scenes**: [2-3 typical settings]
**Exclusions**: [What should NEVER appear]

### Idea Mapping Quick-Ref (Layer 2 Summary)
| Content Type | Visual Approach | Example |
|--------------|-----------------|---------|
| Blog Post | Single hero image (metaphorical) | Topic: X → Visual: Y |
| Landing Page | Multiple supporting visuals | Progression narrative |
| Social Media | Bold, immediate visual | High recognition object |

### Aesthetic Specifications (Layer 3 Summary)
**Style**: [description]
**Colors**: Primary #hex, Secondary #hex, Accent #hex
**Typography**: Heading [font], Body [font]
**Line Weight**: [specification]
**Detail Level**: [specification]

**AI Base Prompt**: "[exact prompt for Nanobanana/image generation]"
**Negative Prompts**: "[what to avoid]"

### Design Tokens (JSON)
```json
{
  "colors": {...},
  "typography": {...},
  "spacing": {...}
}
```

### Accessibility Compliance
- **WCAG Level**: 2.2 AA minimum
- **Contrast Ratios**: All text meets 4.5:1 minimum
- **Color-blind Safe**: Palette tested

### Visual Do's / Don'ts
| ✅ Do This | ❌ Not That | Why |
|------------|-------------|-----|
| [Example] | [Wrong version] | [Trait violated] |

(5+ pairs)
```

---

## Lite vs Deep Criteria

**Lite done** (Quick Mode complete):
- Visual Snapshot produced
- Lite Visual World (3-5 objects)
- Basic design tokens (JSON)
- Confidence + gaps identified
- Enough to start creating basic visuals

**Deep done** (Full Mode complete):
- All Lite criteria
- All 3 layers complete and validated (Visual World, Idea Mapping, Aesthetic)
- Visual DNA Kit produced
- **2-3 child skills GENERATED and installed**:
  - `[brand]-ui-system/` exists in `.claude/skills/`
  - `[brand]-visual-generator/` exists in `.claude/skills/`
  - `[brand]-deck-creator/` exists (if requested)
- Each child skill verified loadable
- Generation test passed (child skill creates sample output)
- Alignment with brand-voice confirmed

---

## Cross-Pillar Data Flow

### From visual-identity (this meta-skill):

| Output | Consumed By |
|--------|-------------|
| Visual Snapshot | Quick reference for early content creation |
| Visual DNA Kit | landing-pages, social-content, email-sequences, paid-ads (documentation) |
| Visual World inventory | Generated child skills (object selection) |
| Idea Mapping decision tree | Generated child skills (what to illustrate) |
| Aesthetic Guidelines + AI prompts | Generated child skills (how to generate) |
| Design Tokens (JSON/CSS) | Generated child skills (web/UI styling) |
| **[brand]-ui-system skill** | User invokes to create web pages |
| **[brand]-visual-generator skill** | User invokes to create images |
| **[brand]-deck-creator skill** | User invokes to create presentations |

### To visual-identity (inputs):

| Input | From |
|-------|------|
| Light Visual Notes | brand-voice Quick Mode (optional kickstart) |
| AI Brand Kit | brand-voice Full Mode (alignment required) |
| Selected ECPs | niche-discovery-100x (per-ECP adaptations if needed) |
| Messaging Playbook | positioning-messaging (visual supports messaging) |

---

## Edge Cases

### 1. Existing UI system skill (e.g., comic-ui-system already exists for SanchoCMO)

**Action**:
- Ask: "You already have comic-ui-system. Generate new [brand]-ui-system or use existing?"
- If use existing: Skip ui-system generation, only generate visual-generator + deck-creator
- If generate new: Proceed with generation (may want different styling)

### 2. No existing brand visuals (pre-launch)

**Action**:
- Build mode mandatory
- Use competitor visual analysis as reference: "Competitors look like X — here's how we differentiate"
- Generate MORE sample images in Layer 3 (7-10 instead of 3-5) to explore options

### 3. Inconsistent visual identity across channels

**Action**:
- Extract from ALL channels
- Show inconsistencies: "LinkedIn is formal/clean, Instagram is playful/colorful"
- Ask: "Unify into one identity or maintain intentional differences?"
- If unify: choose one as primary
- If maintain: document per-channel variation in Visual DNA Kit

### 4. Multiple brand guidelines in conflict

**Action**:
- List all conflicting guidelines found
- Ask: "Which is source of truth? Most recent? CEO preference? Official brand book?"
- Use chosen source for extraction

### 5. User wants to look like specific brand

**Action**:
- Analyze that brand's visual identity
- Extract WHAT they want to emulate (color palette? illustration style? layout patterns?)
- ADAPT to client's own identity — never copy directly
- "You like [Brand]'s bold use of color and geometric patterns — here's how we adapt that to YOUR personality"

### 6. Budget constraints (can't afford design iterations)

**Action**:
- Extract mode from existing materials (no costly generation)
- Codify what already exists rather than building from scratch
- Skip Layer 3 iteration (use existing aesthetic as-is)
- Generate child skills with current visual specs

### 7. SanchoCMO comic aesthetic (specific style requirements)

**Action**:
- Layer 1 Visual World preset: speech bubbles, action bursts, hero characters, vintage objects, dramatic skies
- Layer 3 Aesthetic preset:
  - Style: 1970s Bronze Age comic book
  - Line Weight: Bold 4px outlines
  - Color: 4-color palette, halftone dot shading
  - Detail: High-contrast, dramatic compositions
  - Typography: Bold sans-serif, action words in burst shapes
- AI Base Prompt: "1970s Bronze Age comic book style, bold 4px outlines, limited 4-color palette, halftone dot shading, dynamic composition, [subject]"
- Negative: "realistic photography, modern CGI, soft gradients, detailed textures"

### 8. Multi-language/culture requirements

**Action**:
- Core visual identity universal (same colors, typography)
- Imagery may need cultural adaptations
- Layer 1 Visual World: note culturally-specific vs universal objects
- Per-region Visual DNA Kit sections if significant differences

### 9. Child skill generation fails (invalid template, missing data)

**Action**:
- Log error details
- Verify all 3 layers are complete
- Check template files exist and are valid
- Retry generation with verbose logging
- If still fails: generate partial (e.g., only ui-system + visual-generator, skip deck-creator)
- Alert user which skills generated successfully

### 10. User wants different template (not comic-ui-system)

**Action**:
- Ask: "Which UI system template to use as base? (comic-ui, glossy-ui, glass-ui, sharp-ui, soft-ui, retro-ui)"
- Load chosen template
- Proceed with customization

### 11. Nanobanana API fails during Layer 3 iteration

**Action**:
- Fallback to showing text descriptions instead of generated images
- "Proposed Style A: Clean line art, minimal, 2-color palette. Imagine: [detailed description]"
- User selects based on descriptions
- Codify chosen style in visual-style.md
- Note in child skill: "Nanobanana integration ready but not tested during meta-skill run"

---

## Workflow Tips

### Start with Existing Materials

If the brand has ANY existing visuals:
- Website, social profiles, pitch decks, previous ads, logo files
- Use Extract mode (faster, respects brand equity)
- Fill gaps with Build mode only where needed

### Align with Brand Voice

Visual identity must EXPRESS brand voice personality:
- If voice is "playful" → visuals should be colorful, rounded, friendly
- If voice is "authoritative" → visuals should be structured, deep colors, serif fonts
- If voice is "rebellious" → visuals should be unconventional, asymmetric, edgy

Load brand-voice AI Brand Kit and reference it throughout all 3 layers.

### Iterate Until "This is It"

Especially in Layer 3 (Aesthetic):
- Don't rush to codify
- Generate samples → get feedback → regenerate
- Typical: 5-10 iterations
- User will know when it's right: "This is it"

### Test Child Skills Immediately

After generation:
- Invoke each child skill with a simple request
- Verify output quality
- If output is off-brand: trace back to which layer needs adjustment
- Fix layer → regenerate child skill

---

## For Implementation Details

See reference files:
- [visual-identity-schema.md](references/visual-identity-schema.md) - Complete field-by-field specification
- [visual-identity-questions.md](references/visual-identity-questions.md) - 15 strategic questions + build pipeline
- [visual-world.md](references/visual-world.md) - Layer 1 template
- [idea-mapping.md](references/idea-mapping.md) - Layer 2 template
- [visual-style.md](references/visual-style.md) - Layer 3 template

Child skill templates:
- [templates/ui-system-template/](templates/ui-system-template/) - UI system skill generation
- [templates/visual-generator-template/](templates/visual-generator-template/) - Visual generator skill generation
- [templates/deck-creator-template/](templates/deck-creator-template/) - Deck creator skill generation (optional)
