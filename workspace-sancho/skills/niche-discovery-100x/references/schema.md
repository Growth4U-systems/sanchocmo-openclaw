# Niche Discovery v3 — Output Schema

## Final Table Columns (Phase 10 output)

| Column | Type | Description |
|--------|------|-------------|
| Niche_ID | string | lowercase-hyphenated (e.g., "ecommerce-payment-fees") |
| Valid | boolean | TRUE if passed all filters |
| Category | string | 5-8 categories per run |
| Niche (Consolidated) | string | Specific business segment (80-200 chars). Defines WHO. |
| Unified Problem Statement | string | First-person voice from persona (150-300 chars) |
| Why {company}? | string | How product solves this (max 30 words) |
| Persona (Example) | string | Role + business type |
| Emotional Load | string | Key emotional driver |
| Alternatives | string | Current solutions/workarounds |
| Tentative Marketing Channels | string | Where to reach this segment |
| Positioning and Messaging | string | Key message angle (max 15 words) |
| Reference URLs | string | Source URLs (comma-separated) |
| SWOT_Score | PASS/PARTIAL/FAIL | Foundation SWOT alignment |
| ICP_Score | PASS/PARTIAL/FAIL | Reachability + fit |
| Product_Score | PASS/PARTIAL/FAIL | Current capability to solve |
| Triple_Filter_Result | PASS/PARTIAL/FAIL | Combined Foundation validation |
| Pain Score | 2-99 | JTBD analysis from Deep Research |
| Reachability Score | 2-99 | Community + channel analysis |
| Market Size | number | SAM estimate (people in country) |
| Pain Explanation | string | Root causes, consequences (600-800 chars) |
| Reachability Explanation | string | Specific communities, platforms, events |
| Market Size Explanation | string | Sources, method, trend |
| Reachability Channels | string | Exact subreddits, handles, platforms |

## Intermediate File Formats

| Phase | File | Format |
|-------|------|--------|
| 2 | config.json | JSON: life_contexts[], product_words[], sources{} |
| 3 | urls.json | JSON array: {url, title, snippet, life_context, product_word, source_type} |
| 4 | docs/*.md | One markdown per scraped page + manifest.json |
| 5 | problems.md | Markdown table: Problem, Persona, Functional Cause, Emotional Load, Evidence, Alternatives, URLs |
| 6 | niches-raw/merged.md | Markdown table: 14 columns (see Phase 6 prompt) |
| 7 | niches-filtered.md | Same 14 columns + Valid/Reason updated |
| 7b | niches-triple.md | 14 columns + SWOT_Score, ICP_Score, Product_Score, Triple_Filter_Result |
| 8 | niches-confirmed.md | Same as 7b, user-edited |
| 9 | scored.md | Markdown sections per niche: Pain, Market Size, Reachability |
| 10 | current.md | Final 23-column table |
| 10 | final-table.csv | CSV export of current.md |

## Cross-Pillar Data Flow

| Data | Consumed By |
|------|-------------|
| Selected ECPs (name, JTBD, scores) | positioning-messaging, content-workflow |
| JTBD per ECP | content-workflow, outreach-workflow |
| Pain scores | phase-0-diagnostic, experiment design |
| Reachability + channels | channel-prioritization, outreach-sequence-builder |
| Market size | budget-constraints, scaling decisions |
| Current alternatives | positioning-messaging, pricing-hooks |
| Triple Filter results | ecp-validation (downstream) |

## Coverage Thresholds

- **Lite**: 50+ problems scraped, Triple Filter applied, 3-7 ECPs scored, top 3 recommended
- **Deep**: 500+ problems, 5+ source types, TAM/SAM per ECP, customer data integrated, multi-market analysis
