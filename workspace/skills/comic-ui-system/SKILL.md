---
name: comic-ui-system
description: >
  Design system for comic book interfaces: halftone, speech bubbles, panel layouts, vintage print + modern interactions. 7 React/Tailwind components + design tokens. Use for marketing pages and landing pages.
license: Complete terms in LICENSE.txt
tags:
  - design
  - frontend
  - react
  - ui-style
  - comic
  - marketing
archetype: guidance
---

# Comic UI Design System

A complete design system for creating bold, warm comic book interfaces that feel like vintage print with modern interaction quality. Three visual languages fused into one cohesive system.

## The Three Visual Languages

### 1. Classic Comic (Structure)
Speech bubbles, action bursts, narrator captions, panel layouts, halftone dot patterns, paper texture overlays, and speed lines. Provides the structural vocabulary — how information is framed and presented.

### 2. Gemini Bold (Weight)
4px borders, 6px offset shadows, text-stroke on headlines, section border dividers, full-page halftone/texture layers, card hover rotation. Provides the visual weight — everything feels printed with heavy ink on thick stock.

### 3. Soft UI Transitions (Feel)
`ease-soft-out` timing, shine overlays on buttons, gradient CTAs, smooth shadow escalation on hover, springy animations. Provides the interaction quality — despite the bold visuals, interactions feel fluid and premium.

**The rule**: Comic for structure, Gemini for weight, Soft UI for feel. Never let one language override the others.

## Design Philosophy

### Visual Identity
- **Printed, not digital**: Everything looks like it was printed on textured paper with heavy ink. Halftone dots, paper grain, bold outlines.
- **Warm and approachable**: Parchment backgrounds, warm rust accents, hand-drawn personality through Comic Neue and Bangers fonts.
- **Structured like a comic page**: Content lives in panels. Information flows through speech bubbles, narrator captions, and action bursts.
- **Bold separation**: 4px ink borders between sections create clear panel-to-panel reading flow.

### Hard Boundaries (Never Break)
- Explicit comic borders use `border-comic-ink` (#1A1A2E) — general UI borders use `--border` (#2D2D44) for lighter weight
- Offset shadows are always flat (no blur) and always ink-colored
- Speech bubble tails use inline SVG `<path>` + `<rect>` cover — NOT CSS border triangles (they create seams on rounded corners)
- Halftone dots use `radial-gradient`, never images
- Paper texture uses SVG `feTurbulence` filter, never images
- Fonts: Bangers for h1-h2 display headlines only, Comic Neue Bold for h3-h6, Comic Neue Regular for body/speech, Playfair Display italic for narrator captions
- Background palette rotates: parchment → paper → aged → paper (never white, never gray)
- No `-webkit-font-smoothing: antialiased` — it makes Comic Neue too thin. Use browser defaults (subpixel-antialiased)

### Extendable Rules (Creative Freedom)
- Halftone dot size and opacity per section
- Which sections get speed lines (linear vs radial)
- Action burst star point count and rotation
- Badge/stamp rotation angles (-2deg to -15deg)
- Card hover rotation amount (0.3deg to 1deg)
- Color accents per card (rust, cyan, sage, navy, yellow)

**Full philosophy**: See `references/design-philosophy.md`

## Page Chrome & Visual Rhythm

This section defines how a full comic-styled page looks — navbar, footer, and section background flow. It bridges the gap between **page-builder** (which section goes where) and this skill (how it looks in comic aesthetic).

**Two-layer architecture:**
- **page-builder** owns: section order, conversion flow, copy, SEO
- **comic-ui-system** owns: how those sections LOOK — backgrounds, borders, fonts, effects
- When building a page: load page-builder for structure, then this skill for visual styling

### Navbar

| Property | Value |
|----------|-------|
| Background | Parchment `#F5F0E6` |
| Bottom border | `3px solid #1A1A2E` (ink) |
| Position | `sticky top-0 z-50` |
| Height | `h-16` (64px) |
| Logo | Bangers font, comic-rust `#C45D35` |
| Nav links | Comic Neue Regular, ink-soft `#2D2D44`, hover → `#C45D35` |
| CTA | ComicButton `variant="primary" size="sm"` |
| On scroll | Add `shadow-comic-sm` via JS class toggle |
| Mobile | Hamburger icon → slide-out drawer (ink `#1A1A2E` bg) |

```tsx
<nav className="sticky top-0 z-50 border-b-[3px] border-comic-ink"
     style={{ backgroundColor: "#F5F0E6" }}>
  <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
    <a href="/" className="text-xl"
       style={{ fontFamily: "var(--font-bangers), cursive", color: "#C45D35" }}>
      BrandName
    </a>
    <div className="hidden md:flex items-center gap-6">
      <a href="#features" className="text-sm transition-colors duration-200"
         style={{ fontFamily: "var(--font-comic-neue), cursive", color: "#2D2D44" }}>
        Features
      </a>
      {/* ... more links ... */}
      <ComicButton variant="primary" size="sm">Get Started</ComicButton>
    </div>
    <button className="md:hidden" aria-label="Menu">☰</button>
  </div>
</nav>
```

**Navbar anti-patterns:**
- `backdrop-blur` / `bg-background/80` — glassmorphism is the wrong design language for comic
- `border-white/[0.06]` — invisible borders are not comic; use 3px ink
- Missing bottom border — navbar must be a visually distinct panel

### Footer

| Property | Value |
|----------|-------|
| Background | Ink `#1A1A2E` |
| Top border | `3px solid #C45D35` (rust accent) |
| Brand | Bangers font, comic-rust `#C45D35` |
| Headings | Comic Neue Bold, paper `#FDF8EF` |
| Body text | Comic Neue, `rgba(253, 248, 239, 0.7)` |
| Links | Comic Neue, `rgba(253, 248, 239, 0.6)`, hover → `#FDF8EF` |
| Copyright | Source Sans 3, 13px, `rgba(253, 248, 239, 0.5)` |
| Layout | 3-4 column grid on desktop, stacked on mobile |
| Padding | `py-16 md:py-20` |

```tsx
<footer className="border-t-[3px] py-16 md:py-20"
        style={{ backgroundColor: "#1A1A2E", borderTopColor: "#C45D35" }}>
  <div className="max-w-6xl mx-auto px-6">
    <div className="grid gap-8 md:grid-cols-4">
      <div>
        <span className="text-xl"
              style={{ fontFamily: "var(--font-bangers), cursive", color: "#C45D35" }}>
          BrandName
        </span>
        <p className="mt-2 text-sm"
           style={{ fontFamily: "var(--font-comic-neue), cursive",
                    color: "rgba(253, 248, 239, 0.7)" }}>
          One-line tagline here.
        </p>
      </div>
      <div>
        <h4 className="text-sm font-bold tracking-wider uppercase mb-4"
            style={{ fontFamily: "var(--font-comic-neue), cursive", color: "#FDF8EF" }}>
          Product
        </h4>
        <ul className="space-y-2">
          <li><a href="#" className="text-sm transition-colors duration-200"
                 style={{ fontFamily: "var(--font-comic-neue), cursive",
                          color: "rgba(253, 248, 239, 0.6)" }}>
            Features
          </a></li>
        </ul>
      </div>
      {/* ... more columns ... */}
    </div>
    <div className="mt-12 pt-8 border-t"
         style={{ borderTopColor: "rgba(253, 248, 239, 0.1)" }}>
      <p className="text-center text-xs"
         style={{ fontFamily: "var(--font-source-sans), sans-serif",
                  color: "rgba(253, 248, 239, 0.5)" }}>
        &copy; 2026 Company. All rights reserved.
      </p>
    </div>
  </div>
</footer>
```

### Visual Rhythm — Section Backgrounds

**Core rule**: No two adjacent sections may share the same background color.

This table maps page-builder's standard section order to comic backgrounds:

| # | Section | Background | Hex | Border Top | Halftone |
|---|---------|-----------|-----|------------|----------|
| 1 | Navbar | Parchment | `#F5F0E6` | none | none |
| 2 | Hero | Parchment | `#F5F0E6` | none | radial speed lines (optional) |
| 3 | Social Proof | Paper | `#FDF8EF` | 4px ink | cool |
| 4 | Problem | Aged | `#E8DCC8` | 4px ink | warm + linear speed lines |
| 5 | Solution | Parchment | `#F5F0E6` | 4px ink | yellow |
| 6 | How It Works | Paper | `#FDF8EF` | 4px ink | cool |
| 7 | Social Proof #2 | Aged | `#E8DCC8` | 4px ink | warm |
| 8 | Use Cases | Paper | `#FDF8EF` | 4px ink | none |
| 9 | FAQ | Aged | `#E8DCC8` | 4px ink | none |
| 10 | Final CTA | Navy | `#1E3A5F` | 4px ink | radial speed lines |
| 11 | Footer | Ink | `#1A1A2E` | 3px rust | none |

For pages with fewer sections, maintain the alternation rule: rotate through **parchment → paper → aged** for light sections. Use navy for CTA, ink for footer.

### Spacing

| Element | Padding |
|---------|---------|
| Standard sections | `py-20 md:py-28` |
| Hero | `py-24 md:py-32` |
| Social Proof (logo bar) | `py-12 md:py-16` |
| Footer | `py-16 md:py-20` |
| Content max-width | `max-w-6xl` (default), `max-w-4xl` (centered text-heavy) |
| Horizontal padding | `px-6` |

### Z-Index Map

| Layer | Z-Index |
|-------|---------|
| Page halftone / texture | `z-0`, `z-1` |
| Section content | `z-[2]` |
| Sticky navbar | `z-50` |
| Mobile nav drawer | `z-[60]` |
| Modals / dialogs | `z-[100]` |
| Toast notifications | `z-[110]` |

### Responsive Behavior

| Element | Mobile (<768px) | Tablet (768-1024px) | Desktop (>1024px) |
|---------|----------------|--------------------|--------------------|
| h1 (Bangers) | `text-3xl` | `text-4xl` | `text-5xl lg:text-6xl` |
| h2 (Bangers) | `text-2xl` | `text-3xl` | `text-4xl lg:text-5xl` |
| h3 (Comic Neue Bold) | `text-lg` | `text-xl` | `text-xl` |
| Section padding | `py-16` | `py-20` | `py-28` |
| Grids | 1 column | 2 columns | 3+ columns |
| Nav | Hamburger menu | Links visible | Full layout |

## Mode Selection

**REQUIRED GATE** — Determine mode before generating output.

| Mode | Triggers | Action |
|------|----------|--------|
| **Template** | "exact", "copy", "standard", "give me a [Component]" | Copy from `assets/` verbatim |
| **Creative** | "creative", "interpret", "apply to existing", "redesign" | Honor Hard Boundaries, interpret freely |
| **New Section** | "new section", "add section", "build me" | Full creative freedom within system |

**If Unclear, Ask**: "Would you like (1) exact component templates, (2) creative interpretation applied to existing code, or (3) a new section from scratch?"

## Skill Protocol

Complete these steps before generating output:

### Step 1: Confirm Mode (REQUIRED)
Do not proceed without mode determination.

### Step 2: Determine Section Context (REQUIRED)

**CRITICAL — Background rhythm is the #1 visual differentiator between a polished comic page and a flat one.** Consult the "Page Chrome & Visual Rhythm" section above for the full background sequence. Adjacent sections MUST differ in background color. Navbar and footer have their own distinct treatments.

Identify where this component/section lives in the page flow. Each section alternates background colors:

| Pattern | Background | Hex | Use |
|---------|-----------|-----|-----|
| Parchment | Warm beige | `#F5F0E6` | Hero, Solution, Enablers |
| Paper | Off-white | `#FDF8EF` | How It Works, Pricing, Social Proof, Outreach |
| Aged | Darker beige | `#E8DCC8` | Problem, Playbooks, FAQ, Story, Content Library, Integrations |
| Dark | Navy | `#1E3A5F` | CTA sections |
| Ink | Deep navy | `#1A1A2E` | Footer |

### Step 3: Choose Comic Elements
Select which primitives the section needs:

| Element | When to Use |
|---------|-------------|
| NarratorCaption | Section badge/chapter label (always present) |
| SpeechBubble | Quotes, user input, dialogue |
| ActionBurst | Key metrics, badges, emphasis |
| ComicPanel | Content containers with halftone |
| ComicCard | Hoverable content items |
| ComicButton | CTAs |
| ComicStamp | Category badges, labels |
| ComicGrid | Multi-panel layouts (2-col, 3-col) |

### Step 4: Apply Gemini Bold Layer
Every section MUST have:
- `comic-section-border` class (except Hero)
- 3px borders on panels/cards, 2px on small elements (chat bubbles, inputs)
- Offset shadows on interactive elements (comic-xs for small, comic for default)
- Hover: shadow escalation + translate + optional rotation

### Step 5: Apply Soft UI Transitions
All interactive elements MUST have:
- `transition-all duration-200 ease-soft-out`
- Shadow escalation: `shadow-comic` → `hover:shadow-comic-lg`
- Translate: `hover:-translate-x-[3px] hover:-translate-y-[3px]`
- Active state: `active:translate-x-[1px] active:translate-y-[1px] active:shadow-comic-sm`

## Design Tokens

### Colors

```
Backgrounds:
  parchment:    #F5F0E6   (primary warm bg)
  paper:        #FDF8EF   (secondary light bg)
  aged:         #E8DCC8   (tertiary dark bg)

Ink & Text:
  ink:          #1A1A2E   (borders, headlines, shadows)
  ink-soft:     #2D2D44   (body text)

Accents:
  rust:         #C45D35   (primary action, CTAs)
  rust-light:   #D4734F   (gradient end)
  rust-dark:    #A34A28   (hover states)
  navy:         #1E3A5F   (headlines, dark sections)
  cyan:         #3B9EBF   (secondary accent)
  cyan-light:   #5BBAD9   (hover)
  yellow:       #F2C94C   (highlights, narrator bg)
  yellow-pale:  #FFF3C4   (subtle highlight)
  sage:         #4A5D23   (success, checkmarks)
  red:          #C0392B   (stamps, warnings)
```

### Shadows (Flat Offset, No Blur)

```
comic-xs:  2px 2px 0 #1A1A2E   (small elements, chat bubbles)
comic-sm:  3px 3px 0 #1A1A2E   (compact cards, active states)
comic:     4px 4px 0 #1A1A2E   (default — cards, panels)
comic-md:  5px 5px 0 #1A1A2E   (medium emphasis)
comic-lg:  6px 6px 0 #1A1A2E   (hover state)
comic-xl:  8px 8px 0 #1A1A2E   (heavy emphasis)
```

### Typography

| Font | CSS Variable | Role | Weight |
|------|-------------|------|--------|
| **Bangers** | `var(--font-bangers)` | h1-h2 display headlines, CTAs, action bursts | 400 |
| **Comic Neue** | `var(--font-comic-neue)` | h3-h6 (bold), body text, speech bubbles | 400, 700 |
| **Playfair Display** | `var(--font-playfair)` | Narrator captions, story text | 400 italic |
| **Source Sans 3** | `var(--font-source-sans)` | Small text, metadata | 400, 600 |

**Heading hierarchy**: h1-h2 use Bangers (display), h3-h6 use Comic Neue Bold. This keeps large headings bold/punchy while making sub-headings readable.

**Font-size overrides**: Tailwind `text-xs` = 13px (not 12px), `text-sm` = 15px (not 14px). Comic Neue needs this bump for readability at small sizes.

**Stamps**: Use Comic Neue Bold (not Bangers) at 13px — Bangers is illegible below 16px. Letter-spacing 0.06em, uppercase.

### Borders

```
Standard:  3px solid #1A1A2E   (panels, cards, speech bubbles, sidebar regions)
Heavy:     4-5px solid #1A1A2E (hero panel, highlighted pricing, section dividers)
Thin:      2px solid #1A1A2E   (avatars, icons, stamps, chat bubbles, inputs)
Section:   4px solid #1A1A2E   (top border between page sections)
UI border: var(--border) #2D2D44 (general UI via Tailwind `border-border` — lighter weight)
```

### Timing

```
ease-soft-out:    cubic-bezier(0.16, 1, 0.3, 1)   (standard transitions)
ease-soft-spring: cubic-bezier(0.34, 1.56, 0.64, 1) (bouncy animations)
```

## CSS Effects (Pure CSS, No Images)

### Halftone Patterns
```css
/* Warm (rust dots) — for action panels */
.comic-halftone-warm {
  background-image: radial-gradient(circle, rgba(196, 93, 53, 0.12) 1px, transparent 1px);
  background-size: 6px 6px;
}

/* Cool (navy dots) — for info panels */
.comic-halftone-cool {
  background-image: radial-gradient(circle, rgba(30, 58, 95, 0.1) 1.5px, transparent 1.5px);
  background-size: 4px 4px;
}

/* Yellow (warm highlight) — for first steps, highlights */
.comic-halftone-yellow {
  background-image: radial-gradient(circle, rgba(242, 201, 76, 0.18) 1px, transparent 1px);
  background-size: 5px 5px;
}
```

### Paper Texture (SVG Noise)
```css
.comic-paper-texture::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.04;
  pointer-events: none;
  mix-blend-mode: multiply;
  z-index: 1;
}
```

### Full-Page Background Layers
```css
/* Subtle cyan dots across entire page */
.comic-page-halftone {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, rgba(59, 158, 191, 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Subtle paper grain across entire page */
.comic-page-texture {
  position: fixed; inset: 0; z-index: 1;
  pointer-events: none;
  background-image: url("data:image/svg+xml,..."); /* same feTurbulence */
  opacity: 0.03;
  mix-blend-mode: multiply;
}
```

### Speed Lines
```css
/* Linear (diagonal) — for story/narrative sections */
.comic-speed-lines-linear {
  background-image: repeating-linear-gradient(
    -15deg, transparent, transparent 8px,
    rgba(26, 26, 46, 0.04) 8px, rgba(26, 26, 46, 0.04) 10px
  );
}

/* Radial (from center) — for CTA/focus sections */
.comic-speed-lines-radial {
  background-image: repeating-conic-gradient(
    from 0deg, transparent 0deg 8deg,
    rgba(26, 26, 46, 0.04) 8deg 10deg
  );
}
```

### Text Stroke (Large Display Text Only, >2rem)
```css
.comic-text-stroke {
  -webkit-text-stroke: 0.8px #1A1A2E;
  paint-order: stroke fill;
}
```
**Note**: Use sparingly. Heavy text-stroke (>1px) causes fuzzy rendering on retina displays. Prefer letter-spacing (0.04em) for display text instead.

### Section Dividers
```css
.comic-section-border {
  border-top: 4px solid var(--comic-ink);
}
```

**Complete CSS**: See `references/css-effects.md`

## Component Library

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| **SpeechBubble** | Quotes, dialogue, user input | `tail`: bottom-left, bottom-right, none |
| **NarratorCaption** | Section badges, chapter labels | Yellow bg, italic Playfair |
| **ActionBurst** | Starburst emphasis badges | `size`: sm/md/lg, `color`, `rotation` |
| **ComicPanel** | Content containers | `halftone`: warm/cool/yellow/none, `heavy` |
| **ComicCard** | Hoverable cards with lift | `halftone`, `hoverLift` (includes rotation) |
| **ComicButton** | CTA buttons | `variant`: primary/secondary, `size`: sm/md/lg |
| **ComicStamp** | Rotated category labels | `color`: red/rust/sage/navy/cyan/yellow, `rotation` |

**Component API**: See `references/component-api.md`

## Section Anatomy

Every homepage section follows this structure. **The `backgroundColor` is REQUIRED** — use the correct hex from the Visual Rhythm table above.

```tsx
<section className="py-20 md:py-28 comic-section-border"
         style={{ backgroundColor: "#E8DCC8" }}> {/* ← REQUIRED: match Visual Rhythm table */}
  <div className="max-w-{size} mx-auto px-6">
    {/* 1. Badge */}
    <AnimatedSection>
      <div className="text-center mb-12">
        <NarratorCaption className="mb-6">
          <span className="text-sm font-semibold tracking-wider uppercase"
                style={{ color: "#1A1A2E" }}>
            {t("section.badge")}
          </span>
        </NarratorCaption>
        {/* 2. Headline (Bangers) */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "var(--font-bangers), cursive",
                     color: "#1E3A5F", letterSpacing: "0.02em" }}>
          {t("section.title")}
        </h2>
        {/* 3. Subtitle (Comic Neue) — optional */}
        <p className="text-lg max-w-2xl mx-auto leading-relaxed"
           style={{ fontFamily: "var(--font-comic-neue), cursive", color: "#2D2D44" }}>
          {t("section.subtitle")}
        </p>
      </div>
    </AnimatedSection>

    {/* 4. Content (varies per section) */}
    <AnimatedSection delay={0.1}>
      {/* ComicPanel, ComicCards, ComicGrid, etc. */}
    </AnimatedSection>
  </div>
</section>
```

### Section Layout Patterns

| Pattern | Layout | Example Sections |
|---------|--------|------------------|
| **Split Panel** | `comic-grid grid-cols-2` with gutter | Problem (Expectativa vs Realidad) |
| **3-Panel Strip** | `comic-grid grid-cols-3` | How It Works |
| **Card Grid** | `grid md:grid-cols-3 gap-6` | Playbooks, Pricing, Outreach |
| **Vertical Pipeline** | Stacked ComicPanels + arrow connectors | Content Library |
| **Integration Grid** | `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` | Integrations |
| **Vertical Stack** | `space-y-5` with cards | Enablers |
| **Dialogue** | Alternating left/right SpeechBubbles | FAQ |
| **Centered Story** | Single ComicPanel + image below | Story |
| **Hero Splash** | Full-screen panel with 2-col layout | Hero |
| **Dark CTA** | Navy bg + speed lines + email form | CTA |

## Premium Patterns

### ComicButton (Primary CTA)
```tsx
<button className="
  relative overflow-hidden inline-flex items-center justify-center gap-2
  border-[3px] border-comic-ink rounded-[10px] shadow-comic
  transition-all duration-200 ease-soft-out
  hover:shadow-comic-lg hover:-translate-x-[3px] hover:-translate-y-[3px]
  active:translate-x-[1px] active:translate-y-[1px] active:shadow-comic-sm
  bg-gradient-to-br from-comic-rust to-comic-rust-light text-white
  px-7 py-3.5 text-lg
" style={{ fontFamily: "var(--font-bangers), cursive", letterSpacing: "0.08em", textTransform: "uppercase" }}>
  {/* Shine overlay */}
  <span className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
  <span className="relative z-[2]">Button Text</span>
</button>
```

### Hoverable Card with Rotation
```tsx
<div className="
  relative bg-comic-paper border-[4px] border-comic-ink rounded-lg
  shadow-comic overflow-hidden
  transition-all duration-200 ease-soft-out
  hover:shadow-comic-lg hover:-translate-x-[3px] hover:-translate-y-[3px] hover:-rotate-[0.5deg]
">
  {children}
</div>
```

### Comic Panel Grid (with gutters)
```tsx
<div className="comic-grid grid-cols-1 md:grid-cols-3">
  {/* comic-grid = display:grid + 8px gap + ink bg + 5px ink border */}
  <ComicPanel halftone="yellow" className="p-6 md:p-8">
    {/* Panel 1 */}
  </ComicPanel>
  <ComicPanel halftone="warm" className="p-6 md:p-8">
    {/* Panel 2 */}
  </ComicPanel>
  <ComicPanel halftone="cool" className="p-6 md:p-8">
    {/* Panel 3 */}
  </ComicPanel>
</div>
```

### Full-Page Background Setup
```tsx
<main className="min-h-screen relative" style={{ backgroundColor: "#F5F0E6" }}>
  <div className="comic-page-halftone" />
  <div className="comic-page-texture" />
  <div className="relative z-[2]">
    {/* All sections here */}
  </div>
</main>
```

## i18n Pattern

All text uses the `useLanguage()` hook with `t("key")` pattern:

```tsx
const { t } = useLanguage()
// Usage: {t("section.title")}
// Fallback: {t("section.title") || "Fallback text"}
```

Keys follow `section.element` naming: `hero.title`, `problem.chapter`, `faq.1.q`, etc.

## Anti-Patterns

### Never Do
- **Gray backgrounds** — always use parchment/paper/aged
- **Blur shadows** — always flat offset (`Npx Npx 0 #1A1A2E`)
- **Sans-serif body text** — use Comic Neue for all readable text
- **Image-based textures** — all effects are pure CSS
- **CSS border triangles for tails** — use inline SVG (border triangles create seams on rounded corners)
- **Heavy text-stroke (>1px)** — causes fuzzy rendering on retina; use letter-spacing instead
- **`-webkit-font-smoothing: antialiased`** — makes Comic Neue too thin and hard to read
- **Bangers below 16px** — illegible at small sizes; stamps/labels use Comic Neue Bold instead
- **Bangers for small headings** — only h1-h2; h3-h6 use Comic Neue Bold for readability
- **Thin borders (1px)** — minimum 2px for small elements, 3px for panels/bubbles
- **Missing section-border** — every section (except Hero) must have `comic-section-border`
- **Missing AnimatedSection wrapper** — all content blocks use scroll-triggered animation
- **Same background for consecutive sections** — adjacent sections MUST differ; consult Visual Rhythm table
- **Glassmorphism on navbar** (`backdrop-blur`, `bg-background/80`) — comic uses solid parchment + 3px ink border
- **Invisible footer** (same bg as page, thin border) — footer is ink `#1A1A2E` with rust top border
- **Missing `backgroundColor` on sections** — every `<section>` needs explicit `style={{ backgroundColor }}`
- **`bg-background` CSS variable for sections** — use explicit hex from Visual Rhythm table, not CSS variables

### Always Do
- Alternate background colors between sections (rotate parchment → paper → aged; see Visual Rhythm table)
- Use NarratorCaption as the first element in every section
- Apply `comic-paper-texture` to ComicPanels for grain
- Use Bangers for h1-h2 display text and action bursts — anything "shouted" in a comic
- Use Comic Neue Bold for h3-h6 and emphasis — anything "spoken firmly"
- Use Comic Neue Regular for body text, descriptions — anything "spoken normally"
- Use Playfair Display italic for narrator captions — anything "narrated"
- Include `relative z-[2]` on content inside panels (to sit above halftone/texture layers)
- Use SVG `<path>` + `<rect>` for speech bubble tails (not CSS border triangles)

## Checklist

Before shipping any component or section:

- [ ] Background color matches section position in page flow
- [ ] `comic-section-border` present (unless Hero)
- [ ] Explicit comic borders use 2-3px ink color; general UI uses `--border` (#2D2D44)
- [ ] Shadows use flat offset tokens (comic/comic-lg/comic-sm)
- [ ] Interactive elements have `ease-soft-out` transitions
- [ ] Hover includes shadow escalation + translate
- [ ] Fonts: Bangers for h1-h2 only, Comic Neue Bold for h3-h6, Comic Neue for body, Playfair for captions
- [ ] NarratorCaption badge at top of section
- [ ] `AnimatedSection` wrapper on all content blocks
- [ ] i18n keys used for all visible text
- [ ] Navbar: parchment bg + 3px ink bottom border (NOT glassmorphism)
- [ ] Footer: ink bg `#1A1A2E` + 3px rust top border
- [ ] No two adjacent sections share the same background color
- [ ] Every `<section>` has explicit `style={{ backgroundColor }}`
- [ ] `z-50` on sticky navbar, `z-[2]` on section content
- [ ] Content wrapped in `relative z-[2]` inside panels
- [ ] Halftone pattern applied where appropriate
