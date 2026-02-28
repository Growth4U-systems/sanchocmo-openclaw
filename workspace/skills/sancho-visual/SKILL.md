---
name: sancho-visual
description: >
  Generate visual assets and creative concepts for marketing. Use for 'create visual', 'design this', 'make an image for'. Coordinates with brand voice and visual identity.
---

# SanchoCMO Visual Generation

Generate on-brand images for SanchoCMO using the NanoBanana MCP tool (`mcp__nanobanana__generate_image`).

## Before Every Generation

1. Read `assets/reference-sanchocmo2.jpg` — PRIMARY source of truth for Sancho's character design
2. Read `references/visual-guide.md` for full style reference and character models
3. Optionally read other `assets/reference-*.jpg` files for scene/composition inspiration

## Prompt Formula

Every prompt MUST include ALL 7 components in this order:

**1. Scan Quality** (mandatory prefix):
`Scanned page from a 1970s Bronze Age comic book printed on cheap yellowed newsprint.`

**2. Inking Style**:
`Heavy black ink outlines with bold brush weight variation, flat CMYK vintage colors, prominent visible Ben-Day halftone dot patterns on all shadows and midtones, dense black chiaroscuro ink shadows.`

**3. Sancho Character** (use verbatim — derived from reference-sanchocmo2.jpg):
`Sancho Panza (short stocky solid-build Spanish peasant, round tanned Mediterranean face, short-cropped dark brown bushy beard, expressive thick eyebrows, soft brown flat-brimmed Spanish campesino felt hat, white cream button shirt with sleeves rolled to elbows showing hairy forearms, muted brownish-khaki wool vest buttoned up with a dark square S logo fabric patch hand-sewn on chest with visible thick stitches, brown baggy breeches tucked into leather gaiters, thick leather belt)`

**4. Action**: What the character is doing — always active/narrative

**5. Environment**: BOTH layers always:
- 17th century: La Mancha plains, cracked earth, windmills, dramatic sky
- Retro tech: Floppy disks, CRT monitors, cables, windmill-bots, data beams

**6. Comic Elements**: Caption boxes, speech bubbles, onomatopoeias, panel border

**7. Print Imperfections** (mandatory suffix):
`Yellowed newsprint paper grain texture with visible fibers, colors bleeding outside black ink lines, slight cyan-magenta CMYK misregistration offset, desaturated muted vintage palette absorbed into cheap pulp paper.`

## NanoBanana Settings

Always: `styles: ["vintage"]`, `outputCount: 1`, `preview: true`

After generating, ALWAYS read the output to verify against the reference.

## Quality Checklist

- [ ] Hat: soft brown flat-brim campesino (NOT cowboy, NOT medieval)
- [ ] Beard: short-cropped dark brown bushy (NOT long, NOT black)
- [ ] Vest: muted brownish-khaki with "S" patch + stitches (NOT bright orange)
- [ ] Ink: thick lines with weight variation (NOT uniform/thin)
- [ ] Halftone: visible Ben-Day dots (NOT smooth gradients)
- [ ] Paper: yellowed grain (NOT clean white)
- [ ] Colors: desaturated/aged (NOT fresh/digital)
- [ ] Background: detailed environment (NOT empty/flat)

If checks fail, adjust prompt and regenerate.

## Image Contexts

| Context | Format | Notes |
|---------|--------|-------|
| Hero/landing | Square | Sancho solo or with donkey, heroic pose |
| Section art | Landscape | Full narrative comic panel |
| Social media | Square/landscape | Speech bubbles, onomatopoeias |
| Blog header | Wide landscape | Both characters, epic panorama |

## Full Reference

For character models, color palette, world-building, and exclusion list see [references/visual-guide.md](references/visual-guide.md).
