# Visual Identity — Concepts & Methodology

## Meta-Skill Architecture

This is a **META-SKILL** that generates other skills. It doesn't create images directly — it creates the SKILLS that create images.

```
brand-voice (how brand speaks)
    +
visual-identity (meta) → defines how brand looks
    ↓ GENERATES ↓
[brand]-ui-system        (web pages/components)
[brand]-visual-generator (images via Nanobanana)
[brand]-deck-creator     (presentations — optional)
```

### Child Skills Generated

| Child Skill | Purpose | Based On |
|-------------|---------|----------|
| `[brand]-ui-system` | Web pages, landing pages, UI | comic-ui-system template |
| `[brand]-visual-generator` | Images, illustrations, graphics | Brian Castle's brand-illustrator pattern |
| `[brand]-deck-creator` | Presentations (optional) | pptx skill + brand styling |

---

## Two Modes

| Mode | Layer | Time | Output |
|------|-------|------|--------|
| **Quick** | 0 | ~30 min | Visual Snapshot + Lite Visual World |
| **Full** | 4 | ~2-3 hours | Visual DNA Kit + 2-3 Generated Child Skills |

### Quick Paths
**Path A (URL)**: Scrape website + social → extract visual patterns → Visual Snapshot
**Path B (No URL)**: 5 Quick Questions → construct from answers/materials

### 5 Quick Questions (Path B)
1. **3 adjectives** for how brand should LOOK
2. **Reference brands** visually admired — what specifically?
3. **Primary colors** already used/associated
4. **Typography**: serif ↔ sans-serif ↔ display?
5. **Imagery style**: Photography, illustration, abstract, mix? Mood?

---

## Brian Castle's Insight

**Problem**: AI creates one-off images; brands need a repeatable system.
**Solution**: 3-layer guidelines (Visual World, Idea Mapping, Aesthetic) enabling AI to REASON about visuals.
**Output**: Production skills, not just documentation.

---

## Step 0: Style Direction Discovery

Show 8 style examples (same subject, different styles):
1. Acuarela Hiperrealista | 2. Fotorrealismo | 3. Line Art Minimalista | 4. Flat Illustration Bold
5. 3D Render | 6. Sketch Hand-drawn | 7. Comic/Cartoon | 8. Vintage/Retro

User selects single, hybrid, custom, or extract-from-URL. Reduces iterations from 8-12 to 3-5.

---

## Three-Layer Build System

### Layer 1: Visual World Definition
- WHAT objects/scenes exist in the brand's visual universe
- 5-7 object categories + scenes + exclusions
- Output: `references/visual-world.md`

### Layer 2: Idea-to-Visual Mapping
- System to decide WHAT to illustrate per content type
- Decision tree: content type → core idea → visual metaphor → objects
- Output: `references/idea-mapping.md`

### Layer 3: Aesthetic Guidelines (COST-CONSCIOUS)
- HOW everything looks (colors, style, line weight, detail, texture)
- **References-first approach**: user refs (free) → Step 0 examples (free) → web search (free) → generate only 1-2 validation samples (€1-3)
- Output: `references/visual-style.md`

---

## Child Skill Generation

After 3 layers validated:
1. Verify readiness (3 layers + user approved + AI Brand Kit)
2. Generate `[brand]-ui-system` from template (colors, fonts, design tokens)
3. Generate `[brand]-visual-generator` from template (visual-world, idea-mapping, visual-style, Nanobanana config)
4. Optional: `[brand]-deck-creator`
5. Verify installation (YAML valid, files exist, loadable)
6. Provide usage examples

---

## Lite vs Deep

**Lite** (Quick): Visual Snapshot + Lite Visual World (3-5 objects) + design tokens lite + confidence
**Deep** (Full): All 3 layers validated + Visual DNA Kit + 2-3 child skills generated & verified + WCAG tested

---

## Edge Cases

- **Existing UI system**: Ask if use existing or generate new
- **No existing visuals (pre-launch)**: Build mode, more samples in Layer 3
- **Inconsistent across channels**: Extract all, ask unify or maintain
- **Budget constraints**: Extract mode, codify existing, skip Layer 3 iteration
- **SanchoCMO comic aesthetic**: Preset 1970s Bronze Age comic book, 4px outlines, halftone
- **Multi-language/culture**: Core visual universal, imagery may need cultural adaptation
- **Nanobanana API fails**: Fallback to text descriptions, codify anyway
- **Child skill generation fails**: Log error, retry, generate partial if needed
