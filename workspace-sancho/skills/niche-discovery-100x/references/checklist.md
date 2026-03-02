# Niche Discovery v3 — Self-QA Checklist

> Check BEFORE delivering. For each item: ✅ done | ⚠️ not applicable (with reason) | ❌ pending (investigate more)
> Only deliver when all items are ✅ or ⚠️. Any ❌ → investigate further.

---

## Phase 1: Intake (Foundation Context)

- [ ] **Foundation pillars loaded**: company-context, self-intelligence, competitors, SWOT
- [ ] **company_name, product, industry, target, country, context_type** extracted
- [ ] **Missing pillars flagged** to user (if any)

## Phase 2: Strategy

- [ ] **10-15 life context words** generated (semi-permanent situations, NOT adjectives)
- [ ] **8-12 product domain words** generated (concrete nouns)
- [ ] **Forum sources** identified (Reddit, thematic, general)
- [ ] **User explicitly approved** strategy before proceeding
- [ ] **config.json saved** to `brand/{slug}/niche-discovery/`

## Phase 3: SERP Search

- [ ] **serp_search.py executed** with config.json
- [ ] **urls.json saved** with deduplicated URLs
- [ ] **Cost reported** to user

## Phase 4: Scraping

- [ ] **scrape_urls.py executed** with urls.json
- [ ] **docs/ folder** populated with markdown files
- [ ] **manifest.json** created with scrape results
- [ ] **Reddit URLs** handled via JSON API (not Firecrawl)

## Phase 5: Extraction

- [ ] **extract_problems.py executed** with correct params
- [ ] **problems.md saved** with consolidated problem tables
- [ ] **Extraction rate** reasonable (>30% of docs yield problems)
- [ ] **Each problem** has source URL traceable to a scraped doc

## Phase 6: Grouping

- [ ] **Problems split** into ~5 chunks
- [ ] **Each chunk** processed with Sonnet 4
- [ ] **Merge** executed with Opus — deduplicated across chunks
- [ ] **Supplement pass** done if merge was truncated
- [ ] **merged.md saved** in niches-raw/
- [ ] **40-150 niches** identified (less = too aggressive, more = not enough consolidation)

## Phase 7: Quality Filter

- [ ] **5 filter criteria** applied (generic, small, not relevant, consumer, duplicate)
- [ ] **niches-filtered.md saved** with Valid/Reason columns updated
- [ ] **30-40% filtered out** (less = not strict enough, more = too aggressive)

## Phase 7b: Triple Filter (Foundation Validation)

- [ ] **SWOT Filter applied**: each niche checked against Strengths/Opportunities
- [ ] **ICP Filter applied**: reachability + long-term fit evaluated
- [ ] **Product Filter applied**: current capability to solve checked
- [ ] **SWOT_Score, ICP_Score, Product_Score columns** added
- [ ] **niches-triple.md saved**
- [ ] **Only PASS or PARTIAL** niches proceed

## Phase 8: User Review

- [ ] **Full table presented** to user
- [ ] **User explicitly approved** before proceeding to scoring
- [ ] **niches-confirmed.md saved** with user edits applied

## Phase 9: Scoring (Deep Research)

- [ ] **deep-research skill invoked** for each confirmed niche
- [ ] **Pain Intensity (2-99)** scored with JTBD explanation
- [ ] **Market Size** estimated with sources (INE, Eurostat, Statista)
- [ ] **Reachability (2-99)** scored with specific channels
- [ ] **scored.md saved** with per-niche sections

## Phase 10: Consolidation

- [ ] **Final table** generated with all 21+ columns
- [ ] **current.md saved** to `brand/{slug}/niche-discovery/`
- [ ] **final-table.csv exported**
- [ ] **Versioning**: v{N}.md backup + history.json updated

## META (Quality)

- [ ] **Every niche traces** to real pain points in scraped data
- [ ] **0 invented niches** — all from actual forum conversations
- [ ] **5-10 URLs spot-checked** with web_fetch
- [ ] **Coherence with Foundation** (SWOT, competitors, self-intelligence)
- [ ] **Scores justified** — every score has written rationale
- [ ] **Cross-pillar data flow** documented (which downstream skills consume what)
- [ ] **All intermediate files saved** (config.json through final-table.csv)

---

## Usage Flow

```
1. Execute Phases 1-10
2. Read this checklist
3. Mark each item: ✅ / ⚠️ (with reason) / ❌ (investigate)
4. If any ❌ → fix before delivering
5. Spot-check: verify 5-10 URLs with web_fetch
6. Cross-reference against Foundation files
7. Add Self-QA metadata tag to current.md
8. ONLY THEN deliver to user
```

**No document delivered with pending ❌.**
