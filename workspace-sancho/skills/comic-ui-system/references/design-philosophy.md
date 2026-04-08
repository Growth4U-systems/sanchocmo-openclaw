# Comic UI Design Philosophy

## Origin

The Comic UI system was born from the SanchoCMO marketing homepage — an AI marketing sidekick inspired by Sancho Panza. The visual language draws from three sources:

1. **Vintage American comics** (1950s-1970s): Ben-Day dots (halftone), heavy black outlines, speech bubbles, action bursts, narrator captions. The structural vocabulary.
2. **Gemini Bold aesthetic**: Aggressive border weights, heavy offset shadows, text-stroke on headlines, section dividers, full-page background layers. The visual weight.
3. **Modern Soft UI**: Smooth cubic-bezier transitions, gradient shine overlays, shadow escalation on hover. The interaction quality.

## Core Principles

### 1. Printed, Not Digital
Everything should look like it was printed on slightly aged paper with heavy ink. This means:
- Backgrounds are warm (beige, off-white, aged paper) — never pure white or gray
- Borders are always solid ink black (#1A1A2E) — never colored, never gray
- Shadows are flat offsets (no blur) — simulating printed drop shadows
- Texture is physical (paper grain, halftone dots) — simulating print artifacts

### 2. Structured Like a Comic Page
Information flows through comic conventions:
- **Panels** frame content (ComicPanel with halftone backgrounds)
- **Speech bubbles** contain dialogue and quotes (Nunito font)
- **Narrator captions** introduce sections (Playfair Display italic on yellow)
- **Action bursts** highlight key metrics (starburst clip-path)
- **Gutters** (dark gaps) separate panels in grid layouts

### 3. Warm and Approachable
Despite the bold outlines, the palette is warm and inviting:
- Parchment (#F5F0E6) as primary background
- Rust (#C45D35) as primary action color — warm, not aggressive
- Navy (#1E3A5F) for headlines — authoritative but not cold
- Yellow (#F2C94C) for highlights — optimistic, attention-grabbing
- Sage (#4A5D23) for success states — natural, grounded

### 4. Heavy Ink, Smooth Motion
The visual weight is bold (4px borders, 6px shadows), but interactions are smooth:
- `ease-soft-out` (cubic-bezier(0.16, 1, 0.3, 1)) for all transitions
- Shadow escalation on hover (comic → comic-lg)
- Subtle rotation on card hover (-0.5deg) for hand-drawn personality
- Active states compress (translate + shadow reduction) for tactile feedback
- No jarring animations — everything decelerates smoothly

### 5. Background Rhythm
Sections alternate backgrounds to create visual rhythm:
```
Hero:       parchment (#F5F0E6)
Social:     paper (#FDF8EF)
Problem:    aged (#E8DCC8)
Solution:   parchment (#F5F0E6)
How:        paper (#FDF8EF)
Playbooks:  aged (#E8DCC8)
Enablers:   parchment (#F5F0E6)
Content:    paper (#FDF8EF)
Outreach:   aged (#E8DCC8)
Integ:      parchment (#F5F0E6)
Pricing:    paper (#FDF8EF)
Story:      aged (#E8DCC8)
FAQ:        parchment (#F5F0E6)
CTA:        navy (#1E3A5F)
Footer:     ink (#1A1A2E)
```

Each section divider (4px ink border-top) reinforces the panel-to-panel reading metaphor.

## Font Roles

| Font | Role | Comic Equivalent | Example |
|------|------|-----------------|---------|
| Space Grotesk | Action text, headlines, CTAs, badges | Sound effects, title cards | "BOOM!", section titles |
| Nunito | Speech, body, descriptions, input | Dialogue in speech bubbles | "Sancho te conoce mejor" |
| Playfair Display | Narrator captions, story text | Caption boxes | "*Meanwhile, in the marketing department...*" |
| Source Sans 3 | Metadata, small labels | Fine print | "v1.0 • Feb 2026" |

## Color Psychology

- **Rust (#C45D35)**: Action, warmth, energy. Used for CTAs, highlights, Sancho's identity.
- **Navy (#1E3A5F)**: Authority, trust, depth. Used for headlines, dark sections.
- **Cyan (#3B9EBF)**: Intelligence, technology, clarity. Used for secondary accents.
- **Yellow (#F2C94C)**: Optimism, attention, highlight. Used for narrator captions, first steps.
- **Sage (#4A5D23)**: Success, growth, reliability. Used for checkmarks, confirmation.
- **Ink (#1A1A2E)**: Structure, definition, weight. Used for all borders and shadows.
