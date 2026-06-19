# Visual Identity — Strategic Questions & Build Details

> Detalle de las 15 preguntas estratégicas y el pipeline de 9 steps.
> El flujo principal está en SKILL.md. Este archivo es referencia de detalle.

## Extract Mode: 5 Analysis Categories

When analyzing existing visual materials (brandbook, URL, social):

### 1. Logo Patterns
- Variants (primary, secondary, icon-only), dark/light mode
- Consistency across channels, clear space, minimum sizing

### 2. Color Patterns
- Primary, secondary, accent colors (with hex codes)
- Consistency or drift, accessibility contrast ratios
- Competitor color overlaps (colors to avoid)

### 3. Typography Patterns
- Fonts (heading, body, accents), hierarchy consistency
- Serif vs sans-serif, pairing rules, web vs print

### 4. Imagery Patterns
- Photography style, illustration style, treatments
- Visual metaphors, stock vs custom

### 5. Component Patterns
- Buttons, cards, forms, spacing, responsive behavior

---

## Build Mode: 15 Strategic Questions (Detail)

> En SKILL.md se presentan como 3 rondas conversacionales. Aquí el detalle de cada pregunta.

### Block 1: Visual Personality (Q1-Q3)

**Q1: Core Visual Traits** — 3-4 words: modern/classic, minimal/complex, bold/subtle, playful/serious, warm/cool, organic/geometric

**Q2: Brand Voice Alignment** — How visuals express voice personality. Load AI Brand Kit.

**Q3: Competitive Differentiation** — What do competitors look like? What clichés to avoid?

### Block 2: Color Psychology (Q4-Q6)

**Q4: Color Meaning** — What should primary colors communicate? (Trust=blue, Energy=red, Growth=green, etc.)

**Q5: Color Preferences** — Existing associations + colors to AVOID. **⚠️ Si hay brandbook, estos ya están definidos.**

**Q6: Accessibility** — WCAG 2.2 AA (4.5:1) vs AAA (7:1). Legal requirement vs ethical vs nice-to-have.

### Block 3: Typography (Q7-Q9)

**Q7: Typography Personality** — Serif ↔ Sans-serif ↔ Display scale. **⚠️ Si hay brandbook, ya definido.**

**Q8: Readability vs Personality** — Legibility first vs personality first vs balanced.

**Q9: Pairing** — One family vs heading+body vs full system. **⚠️ Si hay brandbook, ya definido.**

### Block 4: Imagery (Q10-Q12)

**Q10: Primary Type** — Photography, illustration, abstract, mix.

**Q11: Mood** — Candid/posed, diverse/specific, calm/energetic, etc.

**Q12: AI Generation** — Will you use AI? Style keywords? Combine AI + human editing?

### Block 5: Visual World & Mapping (Q13-Q15)

**Q13: Visual Universe** — Objects, scenes, characters in brand's world.

**Q14: Exclusions** — What should NEVER appear.

**Q15: Content Type Adaptation** — Blog vs social vs landing vs technical → different visual treatment?

---

## Build Pipeline Steps (Detail)

### Step 1: Synthesize Visual Personality
From Q1-Q3 → 3-4 core aesthetic traits aligned with brand voice.

### Step 2: Color System (WCAG Tested)
From Q4-Q6 + **brandbook** → primary, secondary, accent, neutrals, semantic. Test all combos for WCAG.

### Step 3: Typography Hierarchy
From Q7-Q9 + **brandbook** → H1-H6, body, captions with font/size/weight/line-height.

### Step 4: Visual World (Layer 1)
From Q13-Q14 → 5-7 object categories + scenes + exclusions → `visual-world.md`

### Step 5: Idea Mapping (Layer 2)
From Q15 + Layer 1 → decision tree → `idea-mapping.md`

### Step 6: Aesthetic (Layer 3)
From Q10-Q12 + personality → 7 dimensions + AI prompt library → `visual-style.md`
**⚠️ COST-CONSCIOUS: máx 2-3 generaciones aquí.**

### Step 7: Sample Visuals (Validation)
3 different topics → verify cohesion. Pass 4 criteria: flexible, distinctive, consistent, scalable.

### Step 8: Visual Do's / Don'ts
5-10 paired examples with reasoning. **Include anti-pegote as explicit Don't.**

### Step 9: Component Library (Lightweight)
Buttons, cards, forms, navigation, spacing scale (8pt grid).

---

## Brand Voice → Visual Alignment Table

| Voice Trait | Visual Expression |
|-------------|-------------------|
| Playful | Bright colors, rounded corners, friendly illustrations |
| Authoritative | Deep blues/grays, serif typography, structured layouts |
| Innovative | Bold colors, modern sans-serif, geometric patterns |
| Approachable | Warm colors, open spacing, real people |
| Premium | Restrained palette, generous white space, elegant serif |
| Rebellious | Unconventional colors, asymmetric layouts, edgy imagery |
| Trustworthy | Consistent colors, clear typography, professional photography |
| Energetic | Vibrant colors, dynamic compositions, bold typography |
