# Visual Style / Aesthetic Guidelines (Layer 3 Template)

> Defines HOW everything looks exactly — colors, line weight, detail level, texture, shadows. The most time-intensive layer.

## What are Aesthetic Guidelines?

Aesthetic Guidelines are the **precise visual specifications** that make all generated images look consistent. This is what transforms "generate an image of a desk" into "generate an image that looks unmistakably like YOUR brand."

**Key principle**: This defines HOW things look (style, treatment), not WHAT to show (that's Layer 1 Visual World + Layer 2 Idea Mapping).

## Why It Matters

Without Aesthetic Guidelines:
- ❌ Every image looks different (inconsistent style)
- ❌ User must recreate complex prompts each time
- ❌ Output feels generic AI-generated

With Aesthetic Guidelines:
- ✅ Consistent "look and feel" across all visuals
- ✅ AI loads base prompt + style specs automatically
- ✅ Distinctive brand aesthetic (not generic)
- ✅ Scales: same quality for 1 image or 1,000 images

---

## Visual Style Specifications

### 1. Illustration Style

Overall artistic approach.

**Options**:
- Clean line art (minimalist, modern)
- Realistic rendering (photographic quality)
- Flat illustration (simplified shapes, solid colors)
- Textured illustration (grain, brush strokes)
- Geometric (angular, structured)
- Organic (flowing, hand-drawn)
- Comic book (bold outlines, dynamic)
- Isometric (3D perspective, technical)

**Example**: "Clean line art, minimalist, 2-3 color max per image"

### 2. Color Usage

How color is applied within images (separate from brand color palette).

**Specifications**:
- **Palette constraint**: "3-color max per image" vs "full palette available"
- **Color strategy**: "Strategic pops of accent color on neutral base" vs "Bold color blocks"
- **Saturation**: "Vibrant, saturated" vs "Muted, pastel" vs "Desaturated, monochromatic"
- **Contrast**: "High contrast for drama" vs "Low contrast for subtlety"

**Example**: "Limited 4-color palette (primary + 3 accents), halftone dot shading for dimension, high contrast"

### 3. Line Weight

Thickness and consistency of outlines/strokes.

**Specifications**:
- **Thickness**: "Consistent 3px outlines" vs "Varied 1-5px for depth" vs "No outlines"
- **Consistency**: "Uniform thickness throughout" vs "Varied for emphasis"
- **Style**: "Clean vector lines" vs "Hand-drawn variation" vs "Rough/sketchy"

**Example**: "Bold 4px outlines, consistent thickness, no variation"

### 4. Detail Level

How much complexity/texture in illustrations.

**Options**:
- Minimal (simplified geometric shapes, no texture)
- Moderate (some detail, selective texture)
- Detailed (high fidelity, rich texture)

**Specifications**:
- "Simplified forms, avoid excessive texture — just enough for recognition"
- "High detail where it matters (faces, key objects), simplified elsewhere"
- "Minimal detail everywhere, rely on shape and color"

**Example**: "Simplified forms, strategic detail on hero objects only, flat backgrounds"

### 5. Shadows & Lighting

How light/shadow create depth and mood.

**Options**:
- Flat (no shadows, 2D appearance)
- Subtle drop shadows (light depth)
- Dramatic lighting (strong contrast, mood)
- Realistic shadows (photographic)

**Specifications**:
- "Subtle drop shadows (2px offset, 20% opacity) for light depth"
- "No shadows, completely flat for minimalist feel"
- "Dramatic side lighting with hard shadows for comic book drama"

**Example**: "Flat lighting, no gradients, halftone patterns for shading instead of realistic shadows"

### 6. Texture

Surface quality and finish.

**Options**:
- Smooth (clean gradients, vector quality)
- Grain/noise (subtle texture)
- Halftone (comic book/print aesthetic)
- Brushstrokes (painterly)
- Rough (sketch/hand-drawn)

**Specifications**:
- "Smooth gradients, no noise or grain, clean vector aesthetic"
- "Subtle paper texture overlay on all illustrations"
- "Halftone dot patterns for shading and texture (vintage print)"

**Example**: "Halftone patterns for dimension, vintage print aesthetic, no smooth gradients"

### 7. Background

How backgrounds are treated.

**Options**:
- Transparent (no background, PNG)
- Solid color (from brand palette)
- Gradient (simple to complex)
- Scene background (contextual environment)

**Constraint**: "Never complex backgrounds — simple or transparent only"

**Example**: "Transparent background preferred for flexibility, solid brand color when transparency not supported"

---

## Example: SanchoCMO Comic Book Aesthetic

### Complete Aesthetic Specification

**Illustration Style**: 1970s Bronze Age comic book
- Bold, dramatic compositions
- Dynamic character poses
- Action-oriented framing

**Color Usage**:
- 4-color palette maximum (primary + 3 accents)
- Halftone dot shading for dimension (not gradients)
- High contrast, vibrant saturation
- Strategic use of black for outlines and drama

**Line Weight**:
- Bold 4px outlines, consistent thickness
- Black outlines on all shapes and characters
- No line variation (uniformly thick)

**Detail Level**:
- High-contrast, simplified forms
- Detail on faces and key objects
- Flat backgrounds or simple patterns
- No photographic realism

**Shadows & Lighting**:
- Flat lighting, no realistic shadows
- Halftone patterns indicate dimension
- Dramatic compositions via framing, not lighting

**Texture**:
- Halftone dot patterns (Ben-Day dots) for shading
- Vintage print aesthetic
- No smooth gradients or modern effects

**Background**:
- Solid colors (from 4-color palette)
- Simple halftone patterns
- Occasional dramatic sky (limited colors, high contrast)

### AI Prompt Library (SanchoCMO)

**Base Prompt**:
```
1970s Bronze Age comic book style, bold 4px black outlines, limited 4-color palette, halftone dot shading for dimension, dynamic composition, high contrast, vibrant colors, [SUBJECT], clean simplified forms, vintage print aesthetic
```

**Style Keywords**:
- 1970s comic book
- Bronze Age comics
- Ben-Day dots
- Halftone shading
- Bold outlines
- Limited color palette
- Dynamic composition
- Vintage print

**Negative Prompts** (what to avoid):
```
realistic photography, modern CGI, soft gradients, detailed textures, photorealism, smooth shading, thin lines, complex backgrounds, watercolor, minimalist flat design, 3D rendering
```

**Variation Parameters** (for iteration):
- Color intensity: "more vibrant" / "more muted"
- Detail level: "more simplified" / "more detailed"
- Composition: "closer crop" / "wider scene"
- Mood: "more dramatic" / "more playful"

---

## Example: Builder Methods (Brian Castle)

### Complete Aesthetic Specification

**Illustration Style**: Clean modern line art
- Minimalist, professional
- Calm, focused aesthetic
- Relatable workspace scenes

**Color Usage**:
- 2-3 colors max per image
- Strategic pops of brand accent color on neutral base
- Muted, professional palette (not vibrant)

**Line Weight**:
- Consistent 2-3px outlines
- Clean vector lines, no variation
- Modern, refined feel

**Detail Level**:
- Simplified forms
- Just enough detail for object recognition
- Avoid excessive texture or complexity

**Shadows & Lighting**:
- Subtle drop shadows for depth (2px offset, 20% opacity)
- Soft, even lighting
- No dramatic lighting effects

**Texture**:
- Smooth gradients
- Clean, no grain or noise
- Vector-quality finish

**Background**:
- Transparent (preferred)
- Or solid neutral color
- Never complex or distracting

### AI Prompt Library (Builder Methods)

**Base Prompt**:
```
Clean modern line art illustration, minimalist, 2-3 color palette, professional workspace aesthetic, simplified forms, subtle drop shadows, [SUBJECT], transparent background, vector quality
```

**Negative Prompts**:
```
photorealistic, complex textures, busy backgrounds, dramatic lighting, excessive detail, watercolor, sketch style, multiple conflicting styles
```

---

## Iteration Criteria (Layer 3 Testing)

A good aesthetic passes 4 checks:

### 1. Flexible?

Can the style expand to many different subjects and use cases?

**Test**: Generate 5 images with completely different subjects (object, person, scene, concept, sequence).
- ✅ All feel cohesive despite different subjects
- ❌ Style only works for certain types of images

### 2. Distinctive?

Does it look different from generic AI-generated images?

**Test**: Compare to typical Midjourney/DALL-E outputs.
- ✅ Has unique characteristics (specific line weight, color treatment, texture)
- ❌ Looks like default AI aesthetic

### 3. Consistent?

Does it match brand voice personality?

**Test**: Load brand-voice AI Brand Kit. Do visuals EXPRESS voice traits?
- Brand voice "playful" → visuals should feel playful (rounded shapes, bright colors)
- Brand voice "authoritative" → visuals should feel authoritative (structured, deep colors)
- ✅ Visual aesthetic embodies brand voice
- ❌ Visual and voice feel misaligned

### 4. Scalable?

Does it work across different formats and contexts?

**Test**: Apply style to web (large), social (small), print (high-res).
- ✅ Style maintains quality and recognition across formats
- ❌ Style breaks down at certain sizes or mediums

---

## Building Aesthetic Guidelines During Meta-Skill Run

### Process (Layer 3 of visual-identity meta-skill):

**Most time-intensive layer — expect 5-10 iterations.**

1. **Load brand-voice AI Brand Kit** (alignment check)
2. **Ask**: "Describe your ideal visual aesthetic" OR show Dribbble/Behance examples
3. **Extract** aesthetic from examples OR **propose** 2-3 style directions
4. **Generate 3-5 sample images** (Nanobanana) with proposed aesthetic(s)
5. **Present samples**: "Which resonates? Want variations?"
6. **User feedback**:
   - "Option B, but try thicker lines"
   - "More colorful"
   - "Less detail, more simplified"
   - "Like the style but wrong colors"
7. **Regenerate** with requested variations
8. **Repeat steps 6-7** until user says "This is it" or "Perfect"
9. **Codify final aesthetic**:
   - Write precise specifications for all 7 dimensions
   - Build AI prompt library (base + keywords + negatives)
10. **Test consistency**: Generate 3 images with different subjects using final prompt
11. **Verify**: Do they look cohesive? Pass 4 criteria?
12. **Finalize** → write this file

### Sample Feedback Patterns

Users rarely say "this is perfect" on first try. Expect:
- "I like this, but..."
- "Can you try..."
- "More [X], less [Y]"
- "Like option A and B combined"
- "Completely different direction: [new description]"

Each iteration refines the aesthetic. By iteration 5-7, patterns emerge. By 8-10, final aesthetic is locked.

---

## Usage in Child Skills

The generated `[brand]-visual-generator` skill:
1. Copies this file to `references/visual-style.md`
2. Loads it before EVERY image generation
3. Uses AI Base Prompt as foundation
4. Adds subject (from Idea Mapping) + user preferences (colors, dimensions)
5. Passes complete prompt to Nanobanana API

This ensures every generated image follows the same aesthetic specifications without user intervention.

---

## Aesthetic Guidelines Template (For Writing This File)

Use this structure when writing brand-specific visual-style.md:

```markdown
# [Brand Name] Visual Style Guidelines

## Style Summary
[1-2 sentences capturing overall aesthetic]

## Aesthetic Specifications

### Illustration Style
[Clean line art / Realistic / Flat / Textured / Geometric / Organic / Comic / Isometric]
[Additional notes on artistic approach]

### Color Usage
- Palette constraint: [2-color / 3-color / full palette / etc.]
- Color strategy: [Pops of accent / Bold blocks / Muted throughout / etc.]
- Saturation: [Vibrant / Muted / Desaturated]
- Contrast: [High / Medium / Low]

### Line Weight
- Thickness: [Xpx outlines]
- Consistency: [Uniform / Varied]
- Style: [Vector / Hand-drawn / Rough]

### Detail Level
[Minimal / Moderate / Detailed]
[Where to focus detail, where to simplify]

### Shadows & Lighting
[Flat / Subtle drops / Dramatic / Realistic]
[Specific treatment description]

### Texture
[Smooth / Grain / Halftone / Brushstrokes / Rough]
[How texture is applied]

### Background
[Transparent / Solid color / Gradient / Scene]
[Constraints and preferences]

## AI Prompt Library

### Base Prompt
```
[Exact prompt structure for image generation]
[Include all style specifications]
[Subject placeholder: [SUBJECT]]
```

### Style Keywords
- [keyword 1]
- [keyword 2]
- [keyword 3+]

### Negative Prompts
```
[What to avoid in generation]
[Styles/treatments that break brand]
```

### Variation Parameters
For iteration requests:
- More [X]: [how to adjust]
- Less [Y]: [how to adjust]
- Different [Z]: [alternatives]

## Iteration Criteria
✅ Flexible: Works for many subjects
✅ Distinctive: Not generic AI
✅ Consistent: Matches brand voice
✅ Scalable: Works across formats
```

---

## Advanced: Per-ECP Visual Adaptations (Optional)

If different customer niches need different visual treatments:

**Example** (B2B SaaS with Enterprise + SMB segments):
- **Enterprise ECP**: More formal aesthetic (structured, professional, muted colors)
- **SMB ECP**: More friendly aesthetic (approachable, vibrant colors, playful)

Document adaptations:
```markdown
### Per-ECP Visual Shifts

**Base aesthetic** applies to all. Shifts below are ADDITIONS to base, not replacements.

#### Enterprise ECP
- Color: Use deeper, more muted versions of brand colors
- Composition: Structured, organized layouts
- Mood: Professional, authoritative

#### SMB ECP
- Color: Use brighter, more vibrant versions
- Composition: Dynamic, energetic
- Mood: Friendly, approachable
```

Most brands DON'T need this. Only add if ECPs require genuinely different visual treatments.

---

## Usage in Child Skills

Generated `[brand]-visual-generator` skill:
1. Loads visual-style.md before generation
2. Assembles prompt: Base Prompt + Subject (from Idea Mapping) + User preferences
3. Passes to Nanobanana API
4. Returns generated image
5. User can request variations (regenerate with adjusted parameters)

Generated `[brand]-ui-system` skill:
1. Loads design tokens (colors, typography, spacing)
2. Applies to component library (buttons, cards, forms)
3. Ensures web components match illustration aesthetic
