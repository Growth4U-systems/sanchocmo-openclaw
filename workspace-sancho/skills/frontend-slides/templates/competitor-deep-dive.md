# Template: Competitor Deep-Dive

## Data Required (per competitor)

From `brand/{slug}/competitor-intelligence/current.md`, extract per competitor:

```yaml
name: "Competitor Name"
headline_thesis: "1-line provocative strategic summary"
strategy_summary: "1-paragraph strategic analysis"
strengths:
  - "Strength 1: explanation"
  - "Strength 2: explanation"
  - "Strength 3: explanation"
weaknesses:
  - "Weakness 1: explanation"
  - "Weakness 2: explanation"
  - "Weakness 3: explanation"
positive_reviews:
  - quote: "Exact customer quote"
    label: "2-3 word label"
  - quote: "..."
    label: "..."
negative_reviews:
  - quote: "Exact customer quote"
    label: "2-3 word label"
  - quote: "..."
    label: "..."
ratings:
  trustpilot: { score: "4.1/5", count: "40K" }
  app_store: { score: "4.8/5", count: "58K" }
  google_play: { score: "3.7/5", count: "110K" }
kpis:
  - { label: "Users", value: "8M+ global, >1.5M ES" }
  - { label: "Revenue", value: "~€440M (2024)" }
  - { label: "Market", value: "3.2% new accts ES" }
  - { label: "NPS", value: "N/A" }
docs_link: "URL to full docs"
section_label: "Competitors" # or "Competitors & SWOT"
```

## Layout Specification

```
┌──────────────────────────────────────────────────────────────────┐
│ [Section Label]                              [★ TP] [★ AS] [★ GP]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HEADLINE THESIS (large, bold)                                   │
│                                                                  │
│  Strategy summary paragraph (regular, gray)                      │
│                                                                  │
├─────────────────────────────┬────────────────────────────────────┤
│  ▌ Strengths                │  ▌ Weaknesses                      │
│  • Strength 1               │  • Weakness 1                      │
│  • Strength 2               │  • Weakness 2                      │
│  • Strength 3               │  • Weakness 3                      │
├─────────────────────────────┼────────────────────────────────────┤
│  💬 Positive reviews        │  💬 Negative reviews               │
│  Label: "quote..."          │  Label: "quote..."                 │
│  Label: "quote..."          │  Label: "quote..."                 │
├─────────────────────────────┴────────────────────────────────────┤
│  [Users: X] [Revenue: X] [Market: X] [NPS: X]    [📄 Full docs] │
└──────────────────────────────────────────────────────────────────┘
```

## Slide HTML Structure

```html
<section class="slide competitor-deep-dive">
    <!-- Header bar -->
    <div class="slide-header">
        <span class="section-label">Competitors</span>
        <div class="ratings-bar">
            <div class="rating-badge" data-platform="trustpilot">
                <span class="rating-icon">★</span>
                <span class="rating-score">4.1/5</span>
                <span class="rating-count">40K</span>
            </div>
            <!-- repeat for app_store, google_play -->
        </div>
    </div>
    
    <!-- Headline -->
    <div class="competitor-headline">
        <h2 class="headline-thesis">The Headline Thesis Goes Here</h2>
        <p class="strategy-summary">Strategy summary paragraph...</p>
    </div>
    
    <!-- Two-column: Strengths / Weaknesses -->
    <div class="sw-grid">
        <div class="sw-column strengths">
            <h3>Strengths</h3>
            <ul>
                <li><strong>Label:</strong> explanation</li>
            </ul>
        </div>
        <div class="sw-column weaknesses">
            <h3>Weaknesses</h3>
            <ul>
                <li><strong>Label:</strong> explanation</li>
            </ul>
        </div>
    </div>
    
    <!-- Two-column: Reviews -->
    <div class="reviews-grid">
        <div class="reviews-column positive">
            <h4>Positive reviews</h4>
            <div class="review">
                <span class="review-label">Label</span>
                <blockquote>"Quote text..."</blockquote>
            </div>
        </div>
        <div class="reviews-column negative">
            <h4>Negative reviews</h4>
            <div class="review">
                <span class="review-label">Label</span>
                <blockquote>"Quote text..."</blockquote>
            </div>
        </div>
    </div>
    
    <!-- Footer: KPIs + docs link -->
    <div class="slide-footer">
        <div class="kpi-bar">
            <div class="kpi"><span class="kpi-label">Users:</span> <span class="kpi-value">8M+</span></div>
            <!-- repeat -->
        </div>
        <a class="docs-link" href="#">📄 Full docs</a>
    </div>
</section>
```

## CSS for this template

Key styles (add to the presentation's `<style>` block):

```css
/* === COMPETITOR DEEP-DIVE SLIDE === */
.competitor-deep-dive {
    padding: clamp(1rem, 3vw, 2.5rem);
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    gap: clamp(0.4rem, 1vh, 0.8rem);
    background: var(--brand-light);
    color: var(--brand-text-on-light);
}

.slide-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.section-label {
    font-family: var(--brand-font-body);
    font-size: var(--small-size);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--brand-primary);
    font-weight: 500;
}

.ratings-bar {
    display: flex;
    gap: clamp(0.3rem, 1vw, 0.8rem);
}

.rating-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--brand-dark);
    color: var(--brand-text-on-dark);
    padding: clamp(0.15rem, 0.5vh, 0.3rem) clamp(0.4rem, 1vw, 0.8rem);
    border-radius: 999px;
    font-size: var(--small-size);
}

.rating-icon { color: #fbbf24; }

.headline-thesis {
    font-family: var(--brand-font-display);
    font-size: clamp(1.1rem, 2.5vw, 1.8rem);
    font-weight: 800;
    line-height: 1.2;
    color: var(--brand-text-on-light);
}

.strategy-summary {
    font-family: var(--brand-font-body);
    font-size: var(--body-size);
    color: #555;
    line-height: 1.5;
    max-width: 90ch;
}

.sw-grid, .reviews-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(0.5rem, 2vw, 1.5rem);
}

.sw-column {
    padding: clamp(0.5rem, 1.5vw, 1rem);
    border-radius: 8px;
}

.sw-column h3 {
    font-family: var(--brand-font-display);
    font-size: clamp(0.8rem, 1.5vw, 1.1rem);
    font-weight: 700;
    margin-bottom: clamp(0.3rem, 0.8vh, 0.6rem);
    padding-bottom: clamp(0.2rem, 0.5vh, 0.4rem);
}

.strengths { border-left: 3px solid var(--rating-green); background: rgba(34, 197, 94, 0.05); }
.strengths h3 { color: var(--rating-green); border-bottom: 1px solid rgba(34, 197, 94, 0.2); }

.weaknesses { border-left: 3px solid var(--rating-red); background: rgba(239, 68, 68, 0.05); }
.weaknesses h3 { color: var(--rating-red); border-bottom: 1px solid rgba(239, 68, 68, 0.2); }

.sw-column ul {
    list-style: none;
    padding: 0;
}

.sw-column li {
    font-size: var(--body-size);
    line-height: 1.4;
    padding: clamp(0.15rem, 0.4vh, 0.3rem) 0;
}

.sw-column li strong {
    color: var(--brand-text-on-light);
}

.reviews-column h4 {
    font-size: var(--small-size);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: clamp(0.2rem, 0.5vh, 0.4rem);
}

.positive h4 { color: var(--rating-green); }
.negative h4 { color: var(--rating-red); }

.review {
    margin-bottom: clamp(0.2rem, 0.5vh, 0.4rem);
}

.review-label {
    font-family: var(--brand-font-display);
    font-weight: 700;
    font-size: var(--small-size);
}

.review blockquote {
    font-family: var(--brand-font-body);
    font-size: var(--small-size);
    font-style: italic;
    color: #666;
    margin: 0;
    line-height: 1.3;
}

.slide-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: clamp(0.3rem, 0.8vh, 0.6rem);
    border-top: 1px solid rgba(0,0,0,0.1);
}

.kpi-bar {
    display: flex;
    gap: clamp(0.5rem, 2vw, 1.5rem);
}

.kpi {
    font-size: var(--small-size);
}

.kpi-label {
    color: #888;
    font-weight: 400;
}

.kpi-value {
    font-weight: 700;
    color: var(--brand-text-on-light);
}

.docs-link {
    font-size: var(--small-size);
    color: var(--brand-primary);
    text-decoration: none;
}
```

## Generation Instructions

When generating a Competitor Deep-Dive slide:

1. Read `brand/{slug}/visual-identity/current.md` → resolve brand theme (see `brand-theme.md`)
2. Read `brand/{slug}/competitor-intelligence/current.md` → extract data per competitor
3. For EACH competitor, generate one `<section class="slide competitor-deep-dive">` using the structure above
4. Truncate text to fit viewport:
   - Headline thesis: max 120 chars
   - Strategy summary: max 300 chars  
   - Strengths/Weaknesses: max 3 items, each max 150 chars
   - Reviews: max 2 per column, each quote max 120 chars
   - KPIs: max 4
5. All font sizes use `clamp()` — NEVER fixed px
6. Include viewport-base.css in full
