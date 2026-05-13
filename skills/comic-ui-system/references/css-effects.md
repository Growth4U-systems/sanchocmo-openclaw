# Comic UI CSS Effects Reference

All CSS effects are defined in `app/globals.css` under the "COMIC BOOK DESIGN SYSTEM" section. All effects are pure CSS — no images required.

## CSS Custom Properties

```css
:root {
  /* Comic Colors */
  --comic-parchment: #F5F0E6;
  --comic-paper: #FDF8EF;
  --comic-aged: #E8DCC8;
  --comic-ink: #1A1A2E;
  --comic-ink-soft: #2D2D44;
  --comic-rust: #C45D35;
  --comic-rust-light: #D4734F;
  --comic-rust-dark: #A34A28;
  --comic-navy: #1E3A5F;
  --comic-cyan: #3B9EBF;
  --comic-cyan-light: #5BBAD9;
  --comic-yellow: #F2C94C;
  --comic-yellow-pale: #FFF3C4;
  --comic-sage: #4A5D23;
  --comic-red: #C0392B;

  /* Timing */
  --ease-soft-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-soft-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## Halftone Patterns

Three variants of radial-gradient dot patterns that simulate vintage print halftone screens.

### Warm Halftone (rust dots)
```css
.comic-halftone-warm {
  background-image: radial-gradient(circle, rgba(196, 93, 53, 0.12) 1px, transparent 1px);
  background-size: 6px 6px;
}
```
**Use for**: Action-oriented panels, CTAs, Sancho-related content.

### Cool Halftone (navy dots)
```css
.comic-halftone-cool {
  background-image: radial-gradient(circle, rgba(30, 58, 95, 0.1) 1.5px, transparent 1.5px);
  background-size: 4px 4px;
}
```
**Use for**: Information panels, technical content, social proof.

### Yellow Halftone
```css
.comic-halftone-yellow {
  background-image: radial-gradient(circle, rgba(242, 201, 76, 0.18) 1px, transparent 1px);
  background-size: 5px 5px;
}
```
**Use for**: First steps, highlights, positive content.

## Paper Texture

SVG-based noise texture that simulates aged paper grain.

```css
.comic-paper-texture {
  position: relative;
}
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

**Important**: Content inside paper-textured elements must use `relative z-[2]` to sit above the texture pseudo-element.

## Full-Page Background Layers

Fixed layers that create unified visual continuity across all sections.

### Page Halftone
```css
.comic-page-halftone {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, rgba(59, 158, 191, 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

### Page Texture
```css
.comic-page-texture {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background-image: url("data:image/svg+xml,...");
  opacity: 0.03;
  mix-blend-mode: multiply;
}
```

**Usage in page wrapper:**
```tsx
<main className="min-h-screen relative" style={{ backgroundColor: "#F5F0E6" }}>
  <div className="comic-page-halftone" />
  <div className="comic-page-texture" />
  <div className="relative z-[2]">
    {/* Sections */}
  </div>
</main>
```

## Speed Lines

### Linear Speed Lines
Diagonal stripes for narrative/story sections.
```css
.comic-speed-lines-linear {
  background-image: repeating-linear-gradient(
    -15deg, transparent, transparent 8px,
    rgba(26, 26, 46, 0.04) 8px, rgba(26, 26, 46, 0.04) 10px
  );
}
```

### Radial Speed Lines
Conic gradient from center for CTA/focus sections.
```css
.comic-speed-lines-radial {
  background-image: repeating-conic-gradient(
    from 0deg, transparent 0deg 8deg,
    rgba(26, 26, 46, 0.04) 8deg 10deg
  );
}
```

## Comic Grid (Panel Layout)

Creates a multi-panel layout with dark gutters simulating comic page panel separation.

```css
.comic-grid {
  display: grid;
  gap: 8px;
  background: var(--comic-ink);
  padding: 8px;
  border: 5px solid var(--comic-ink);
  border-radius: 6px;
}

.comic-grid > .comic-panel {
  background: var(--comic-paper);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
```

**Usage:**
```tsx
<div className="comic-grid grid-cols-1 md:grid-cols-3">
  <ComicPanel>Panel 1</ComicPanel>
  <ComicPanel>Panel 2</ComicPanel>
  <ComicPanel>Panel 3</ComicPanel>
</div>
```

## Text Stroke

Ink outline on large headlines for dimensionality.

```css
.comic-text-stroke {
  -webkit-text-stroke: 1.5px #1A1A2E;
  paint-order: stroke fill;
}
```

**Use only on**: Hero headline (the largest text on the page). Do not use on section titles or body text.

## Section Border Divider

4px ink line at the top of every section (except Hero).

```css
.comic-section-border {
  border-top: 4px solid var(--comic-ink);
}
```

## Navbar Scroll Shadow

Shadow appears on navbar when page is scrolled. Applied via JavaScript class toggle (`window.scrollY > 0`).

```css
.comic-navbar-scrolled {
  box-shadow: 0 4px 0 #1A1A2E;
}
```

## Animations

### Comic Float
Gentle floating animation for badges/bursts.
```css
@keyframes comic-float {
  0%, 100% { transform: translateY(0) rotate(-0.5deg); }
  50% { transform: translateY(-6px) rotate(0.5deg); }
}
.animate-comic-float { animation: comic-float 3s ease-in-out infinite; }
```

### Comic Pop
Scale-in animation for elements entering the viewport.
```css
@keyframes comic-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-comic-pop { animation: comic-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
```
