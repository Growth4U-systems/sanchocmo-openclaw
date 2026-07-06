# Frontend Slides — Template System

## How It Works

Each template is a self-contained HTML generator that:
1. Reads brand colors/fonts from `brand/{slug}/visual-identity/` (or uses defaults)
2. Reads pilar data from `brand/{slug}/{pilar}/{pilar}.current.md`
3. Generates a single HTML file with all CSS/JS inline

## Templates Available

| Template | Slides | Data Source |
|----------|--------|-------------|
| `competitor-deep-dive` | 1 per competitor | `market-and-us/competitors/competitors.current.md` |
| `swot-analysis` | 1 | `swot-analysis/swot-analysis.current.md` |
| `ope-canvas` | 1 | `ope-canvas/ope-canvas.current.md` |
| `gap-analysis` | 1-2 | `market-and-us/competitors/competitors.current.md` |
| `competitor-landscape` | 1 | `market-and-us/competitors/competitors.current.md` |
| `niche-value-engine` | 1 per ECP | `positioning-messaging/positioning-messaging.current.md` |
| `cross-niche-authorities` | 1 | `niche-discovery-100x/niche-discovery-100x.current.md` |
| `platform-assets` | 1 | `positioning-messaging/positioning-messaging.current.md` |
| `market-context` | 1-2 | `market-intelligence/market-intelligence.current.md` |
| `cover` | 1 | Manual input |
| `section-divider` | 1 | Manual input |
| `index-toc` | 1 | Auto-generated from slide set |

## Composite Presentations

| Presentation | Templates Combined |
|-------------|-------------------|
| **Foundation Report** | cover → index-toc → market-context → section-divider → gap-analysis → section-divider → competitor-landscape → competitor-deep-dive (×N) → swot-analysis → ope-canvas |
| **Market Strategy** | cover → methodology → index-toc → platform-assets → cross-niche-authorities → niche-value-engine (×N) |

## Brand Integration

The skill reads from `brand/{slug}/visual-identity/visual-identity.current.md` for:
- `--brand-primary`: Primary color
- `--brand-accent`: Accent color  
- `--brand-dark`: Dark background
- `--brand-light`: Light background
- `--brand-font-display`: Display/heading font
- `--brand-font-body`: Body font
- Logo path (base64 embedded)

If no visual identity exists, defaults to a neutral dark preset.

## Output

Files are saved to `brand/{slug}/presentations/` and served via MC at:
`<MC_BASE>/portal/{mcToken}/brand/{slug}/presentations/{name}.html`

> `<MC_BASE>` is the pre-resolved host shown in `workspace-sancho/PROTOCOLS.md` / `TOOLS.md`. `{mcToken}` comes from `clients.json`. Never hardcode the hostname.
