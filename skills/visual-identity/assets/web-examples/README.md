# Web UI Style Examples — Step 0b: UI System Discovery

> 6 UI system examples usando los systems que ya tenemos (comic-ui, glossy-ui, soft-ui, glass-ui, sharp-ui, retro-ui)

## Purpose

En Step 0b (después de mostrar 8 image styles), mostrar estos 6 UI system examples para que usuario vea diferentes approaches de web styling.

**Workflow**:
```
Step 0a: Mostrar 8 image styles → User: "Me gusta #1 (acuarela)"
    ↓
Step 0b: Mostrar 6 web UI styles → User: "Me gusta #2 (glossy) y #3 (soft)"
    ↓
Combinación informa Layer 3 aesthetic
```

---

## Los 6 UI Systems

### 1. Comic UI (Bold Vintage Print)
**File**: `01_comic_ui_example.png` (placeholder - usar actual comic-ui landing page)

**Características**:
- Bold 4px borders, offset shadows
- Halftone patterns, vintage print aesthetic
- Comic book panels, speech bubbles
- Warm parchment backgrounds
- Space Grotesk + Nunito fonts

**Cuándo**: Playful, memorable, storytelling brands (SanchoCMO)

**Existing**: `~/.claude/skills/comic-ui-system/`

---

### 2. Glossy UI (Premium Polished)
**File**: `02_glossy_ui_example.png` (placeholder)

**Características**:
- Wet reflections, shine overlays
- Premium sheen, polished lacquer look
- Sophisticated, luxury feel
- Deep colors with gloss effects

**Cuándo**: Premium brands, luxury products, high-end SaaS

**Existing**: `~/.claude/skills/glossy-ui-system/`

---

### 3. Soft UI (Refined Modern)
**File**: `03_soft_ui_example.png` (placeholder)

**Características**:
- Signature gradients, multi-layer shadows
- Hover transforms, micro-interactions
- Refined, premium, modern
- Soft transitions, elegant

**Cuándo**: Dashboards, control panels, professional SaaS

**Existing**: `~/.claude/skills/soft-ui-system/`

---

### 4. Glass UI (Translucent Depth)
**File**: `04_glass_ui_example.png` (placeholder)

**Características**:
- Glassmorphism, frosted blur
- Iridescent borders, floating transforms
- Ambient glow, depth through translucency
- Modern, premium, wow-factor

**Cuándo**: Media apps, creative tools, modern dashboards

**Existing**: `~/.claude/skills/glass-ui-system/`

---

### 5. Sharp UI (Brutalist Bold)
**File**: `05_sharp_ui_example.png` (placeholder)

**Características**:
- Hard edges, offset shadows
- Glitch effects, HUD-style accents
- Bold, no-nonsense, technical
- Brutalist aesthetic

**Cuándo**: Developer tools, admin panels, technical dashboards

**Existing**: `~/.claude/skills/sharp-ui-system/`

---

### 6. Retro UI (8-bit Nostalgia)
**File**: `06_retro_ui_example.png` (placeholder)

**Características**:
- Dot grids, stepped gradients
- Scanlines, CRT effects
- Synthwave neon colors (magenta, cyan, purple)
- Pixel shadows, blink animations

**Cuándo**: Gaming, retro-themed, creative tools with nostalgic vibe

**Existing**: `~/.claude/skills/retro-ui-system/`

---

## How to Use (In Meta-Skill)

### Step 0b in visual-identity:

```markdown
After showing 8 image styles, show these 6 UI system examples:

1. Load screenshots from assets/web-examples/ (or reference existing UI skills)
2. Show all 6 with brief description
3. Ask: "¿Qué estilo de web te gusta para tu brand?"
4. User selects:
   - Single: "Me gusta #3 (Soft UI)"
   - Hybrid: "Mezcla de #2 y #3 - glossy pero más suave"
   - None: "Ninguno, tengo referencias propias" → proceed to web search
5. Selected UI style + Image style → Foundation for Layer 3

Benefits:
- Uses existing assets (no cost)
- User sees ACTUAL implementations (not abstract)
- Easier decision (concrete examples vs descriptions)
```

---

## Screenshot Generation (TODO Next Session)

**Option A**: Generate 1 landing page example per UI system, screenshot
**Option B**: Use existing examples from each UI skill if available
**Option C**: Create simple component showcase per system

**For now**: Placeholders listed, actual screenshots TBD

---

## Integration with UI Systems

When user selects a UI system style:
- Load that system's SKILL.md
- Extract design tokens, component patterns
- Adapt colors/typography to new brand
- Generate customized UI system maintaining selected aesthetic

Example: User selects Soft UI → Generate `[brand]-ui-system` based on soft-ui patterns but with brand colors.
