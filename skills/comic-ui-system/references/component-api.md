# Comic UI Component API Reference

All components are in `app/(marketing)/sanchocmo/components/comic-primitives.tsx`.

## SpeechBubble

Container styled as a comic speech bubble with optional triangular tail.

```tsx
interface SpeechBubbleProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tail?: "bottom-left" | "bottom-right" | "none"  // default: "bottom-left"
}
```

**Styling:**
- Background: `bg-comic-paper` (#FDF8EF)
- Border: `border-[4px] border-comic-ink` (4px solid #1A1A2E)
- Radius: `rounded-[20px]`
- Font: Nunito (`var(--font-nunito)`)
- Tail: CSS triangle borders (outer ink + inner paper fill)

**Usage:**
```tsx
<SpeechBubble tail="bottom-left">
  <p>Dialogue text here</p>
</SpeechBubble>

<SpeechBubble tail="none">  {/* No tail — for inline quotes */}
  <p>Inline quote</p>
</SpeechBubble>
```

---

## NarratorCaption

Yellow caption box used as section badges/chapter labels.

```tsx
interface NarratorCaptionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}
```

**Styling:**
- Background: `bg-comic-yellow` (#F2C94C)
- Border: `border-[4px] border-comic-ink`
- Shadow: `shadow-comic` (6px 6px 0 0 #1A1A2E)
- Font: Playfair Display italic (`var(--font-playfair)`)

**Usage:**
```tsx
<NarratorCaption className="mb-6">
  <span className="text-sm font-semibold tracking-wider uppercase"
        style={{ color: "#1A1A2E" }}>
    CHAPTER TITLE
  </span>
</NarratorCaption>
```

---

## ActionBurst

Starburst/explosion shape for highlighting metrics or emphasis.

```tsx
interface ActionBurstProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  color?: string         // default: "#F2C94C" (yellow)
  size?: "sm" | "md" | "lg"  // default: "md"
  rotation?: number      // default: 0 (degrees)
}
```

**Sizes:**
- `sm`: 80x80px, text-sm
- `md`: 110x110px, text-lg
- `lg`: 140x140px, text-2xl

**Styling:**
- Shape: CSS `clip-path: polygon(...)` (27-point star)
- Text: Space Grotesk font, bold, centered

**Usage:**
```tsx
<ActionBurst size="md" color="#F2C94C" rotation={-8}>
  <span className="text-xs text-comic-ink">&lt;2% alucinaciones</span>
</ActionBurst>
```

---

## ComicPanel

Content container with halftone pattern and paper texture.

```tsx
interface ComicPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  halftone?: "warm" | "cool" | "yellow" | "none"  // default: "none"
  heavy?: boolean  // default: false (5px border instead of 4px)
}
```

**Styling:**
- Background: `bg-comic-paper`
- Border: `border-[4px]` (or `border-[5px]` if heavy)
- Texture: `comic-paper-texture` overlay
- Content: wrapped in `relative z-[2]` to sit above texture

**Usage:**
```tsx
<ComicPanel halftone="warm" className="p-8">
  <h3>Panel content</h3>
</ComicPanel>

<ComicPanel halftone="yellow" heavy className="p-12">
  <h3>Highlighted panel</h3>
</ComicPanel>
```

---

## ComicCard

Hoverable card with lift animation and rotation.

```tsx
interface ComicCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  halftone?: "warm" | "cool" | "yellow" | "none"
  hoverLift?: boolean  // default: true
}
```

**Styling:**
- Background: `bg-comic-paper`
- Border: `border-[4px] border-comic-ink`
- Shadow: `shadow-comic` → `hover:shadow-comic-lg`
- Hover: `-translate-x-[3px] -translate-y-[3px] -rotate-[0.5deg]`
- Transition: `duration-200 ease-soft-out`

**Usage:**
```tsx
<ComicCard halftone="warm" className="p-6">
  <h3>Card title</h3>
  <p>Card content</p>
</ComicCard>
```

---

## ComicButton

CTA button with gradient, shine overlay, and lift interaction.

```tsx
interface ComicButtonProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: "primary" | "secondary"  // default: "primary"
  size?: "sm" | "md" | "lg"         // default: "md"
}
```

**Sizes:**
- `sm`: px-4 py-2 text-sm
- `md`: px-7 py-3.5 text-lg
- `lg`: px-8 py-4 text-xl

**Variants:**
- `primary`: rust gradient + white text + shine overlay
- `secondary`: paper bg + ink text

**Interaction:**
- Hover: shadow-comic → shadow-comic-lg, translate -3px/-3px
- Active: translate +1px/+1px, shadow-comic-sm
- Font: Space Grotesk uppercase, letter-spacing 0.05em

**Usage:**
```tsx
<ComicButton variant="primary" size="md">
  Join the Adventure →
</ComicButton>
```

---

## ComicStamp

Rotated category badge/label.

```tsx
interface ComicStampProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  rotation?: number  // default: -12 (degrees)
  color?: "red" | "rust" | "sage" | "navy" | "cyan" | "yellow"  // default: "red"
}
```

**Colors:**
- `red`: bg-comic-red, white text
- `rust`: bg-comic-rust, white text
- `sage`: bg-comic-sage, white text
- `navy`: bg-comic-navy, white text
- `cyan`: bg-comic-cyan, white text
- `yellow`: bg-comic-yellow, ink text

**Styling:**
- Border: `border-[2px]` (thinner than other elements)
- Font: Nunito Bold, 13px, uppercase, letter-spacing 0.06em
- Transform: `rotate(Ndeg)`

**Usage:**
```tsx
<ComicStamp rotation={-12} color="red">
  RECOMMENDED
</ComicStamp>
```

## Navbar (Page Chrome)

Not a reusable primitive — the navbar is page chrome that varies per page type. See `SKILL.md > Page Chrome & Visual Rhythm > Navbar` for the full template with property table and code snippet.

## Footer (Page Chrome)

Not a reusable primitive — the footer is page chrome that varies per client. See `SKILL.md > Page Chrome & Visual Rhythm > Footer` for the full template with property table and code snippet.
