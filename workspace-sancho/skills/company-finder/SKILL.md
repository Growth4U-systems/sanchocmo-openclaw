---
name: company-finder
description: Find ICP-matching companies.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-one)
  depends_on: niche-discovery-100x, company-context
  chains_to: decision-maker-finder
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/market-and-us/competitors/current.md
context_writes:
- campaigns/
- brand/{slug}/operational/assets.md
---

# Company Finder

> Finding the right 100 companies beats spamming 10,000. Precision targeting with ICP-scored prospecting.

Takes the ICP defined in niche-discovery-100x, translates it into search filters for Apollo.io, Clay, or LinkedIn Sales Navigator, executes the search, enriches with firmographics, scores each company against the ICP (1-10), and delivers a prioritized list of target companies ready for decision-maker-finder.

This skill is the bridge between "knowing who your ideal customer is" and "having a list of real companies to pursue." It does NOT find people within those companies — that's decision-maker-finder's job.

---

## Read ./brand/

Before starting, load context from the brand directory:

- `brand/{slug}/company-brief/current.md` — Our company context (what we sell, to whom)
- `brand/{slug}/go-to-market/ecps.json` — ICP definition (industry, size, geo, tech stack, etc.)
- `brand/{slug}/go-to-market/ecps.json` — Early Customer Profiles with scoring from niche-discovery-100x
- `brand/{slug}/market-and-us/competitors.json` — Competitor data (to exclude or identify competitor customers)

## Follow _system/output/output-format.md

All output follows the standard SanchoCMO output format. JSON outputs use the schema defined in the Output Format section below.

---

## Prerequisites

1. **ICP defined** — niche-discovery-100x must be at least Lite-done. `brand/{slug}/go-to-market/ecps.json` and `brand/{slug}/go-to-market/ecps.json` must exist.
2. **API keys** (for FULL mode) — At least ONE of:
   - Apollo.io API key (environment variable `APOLLO_API_KEY`)
   - Clay API access (environment variable `CLAY_API_KEY`)
   - Apify API token (environment variable `APIFY_TOKEN`) for LinkedIn scraping
3. **No API keys** (LIGHT mode) — Skill degrades gracefully to manual research workflow using WebSearch.

---

## Workflow: 9 Steps

```
Step 0: Tool Detection       → Check available APIs → FULL vs LIGHT mode
Step 1: Load ICP             → Read brand/{slug}/go-to-market/ecps.json + ecps.json
Step 2: Select Tool          → Decision tree: Apollo vs Clay vs LinkedIn
Step 3: Map ICP to Filters   → Translate ICP attributes to API parameters
Step 4: Execute Search       → Run API calls with pagination
Step 5: Enrich Companies     → Firmographics, tech stack, funding, signals
Step 6: Score & Filter       → ICP fit score, filter >=7, prioritize
Step 7: Present Results      → Formatted table with scores for review
Step 8: Save Output          → companies-YYYYMMDD.json
```

---

### Step 0: Tool Detection (~1 min)

Check which tools are available and set execution mode.

**Detection sequence:**
1. Check `APOLLO_API_KEY` environment variable → Apollo available?
2. Check `CLAY_API_KEY` environment variable → Clay available?
3. Check `APIFY_TOKEN` environment variable → Apify/LinkedIn available?
4. Check if Apify MCP tools are loaded → Apify MCP available?

**Mode determination:**

| Available Tools | Mode | Behavior |
|----------------|------|----------|
| Apollo API key | **FULL (Apollo)** | Direct API search + enrichment |
| Clay API key | **FULL (Clay)** | Waterfall enrichment workflow |
| Apify token | **FULL (Apify)** | Actor-based search (LinkedIn, Google Maps) |
| Multiple keys | **FULL (Best fit)** | Select per decision tree (Step 2) |
| None | **LIGHT** | Manual research with WebSearch |

**Communicate mode to user:**
- FULL: "Tengo acceso a [Apollo/Clay/Apify]. Procedo con busqueda automatizada."
- LIGHT: "No detecto API keys. Uso modo LIGHT — busqueda manual con WebSearch. Resultados mas limitados pero funcional."

---

### Step 1: Load ICP (~2 min)

Read ICP definition from the brand directory.

**Required data from `brand/{slug}/go-to-market/ecps.json`:**
- Industry / vertical
- Company size (employee range)
- Revenue range (if available)
- Geography (countries, cities)
- Tech stack requirements (if relevant)
- Funding stage (if relevant)
- Business model (B2B, B2C, marketplace, etc.)

**Required data from `brand/{slug}/go-to-market/ecps.json`:**
- Selected ECPs with pain scores and reachability
- ECP-specific criteria that narrow the ICP further

**Validation:**
- If `icp.json` is missing or empty: STOP. "Necesitas definir tu ICP primero. Ejecuta niche-discovery-100x."
- If ICP has fewer than 3 filterable attributes: WARN. "Tu ICP tiene pocos criterios filtrables. Los resultados seran amplios. Quieres refinar antes de buscar?"

---

### Step 2: Select Tool (~1 min)

Apply the decision tree from [references/tool-comparison.md](references/tool-comparison.md):

```
Standard ICP (industria + tamano + geo)  → Apollo
Complex ICP (multi-signal, conditional)  → Clay
People-first (roles + seniority)         → LinkedIn (via Apify)
No API keys                              → LIGHT mode (WebSearch)
```

**Present selection to user:**
"Basandome en tu ICP, recomiendo [tool] porque [reason]. Procedo?"

If multiple tools available, explain trade-off:
"Puedo usar Apollo (rapido, 275M empresas) o Clay (mas preciso con waterfall enrichment). Para un ICP standard como el tuyo, Apollo es suficiente. Quieres Clay para mayor precision?"

---

### Step 3: Map ICP to Filters (~5 min)

Translate each ICP attribute to the selected tool's filter format using [references/icp-to-filters.md](references/icp-to-filters.md).

**Process:**
1. For each ICP attribute, find the equivalent filter in the mapping table
2. Translate the value to the tool's expected format (API parameter, column name, etc.)
3. Flag attributes with NO direct equivalent — these become manual enrichment tasks in Step 5
4. Build the complete query object

**Example mapping (Apollo):**

```
ICP: "SaaS B2B fintech, 10-50 empleados, Espana, usa Stripe, Series A"

Apollo query:
{
  "q_organization_keyword_tags": ["SaaS", "fintech", "B2B"],
  "organization_num_employees_ranges": ["11,50"],
  "organization_locations": ["Spain"],
  "currently_using_any_of_technology_uids": ["stripe_uid"],
  "organization_latest_funding_stage_cd": ["series_a"],
  "per_page": 100,
  "page": 1
}
```

**Show the mapped filters to user before executing:**
"Estos son los filtros mapeados. Confirma o ajusta antes de ejecutar la busqueda."

---

### Step 4: Execute Search (~10-15 min)

Run the search with proper pagination and rate limiting.

**Apollo execution:**
```
POST https://api.apollo.io/api/v1/mixed_companies/search
- Paginate: page 1, 2, 3... until no more results or limit reached
- Rate limit: max 100 calls/min (free), 300/min (paid)
- Collect all results into a single array
- Target: 100-500 raw companies (before filtering)
```

**Clay execution:**
- Create or trigger Clay workflow with mapped filters
- Waterfall enrichment runs automatically per Clay configuration
- Export results as CSV/JSON

**Apify execution:**
```
# LinkedIn company search
Actor: apify/linkedin-company-scraper
Input: { "searchUrl": "[mapped LinkedIn search URL]", "maxItems": 200 }

# Google Maps (for local/geo businesses)
Actor: apify/google-maps-scraper
Input: { "searchTerms": ["fintech Spain"], "maxItems": 200 }
```

**During execution, report progress:**
- "Buscando... pagina 1/n, [X] empresas encontradas hasta ahora."
- "Busqueda completada: [total] empresas en raw. Procediendo a enrichment."

---

### Step 5: Enrich Companies (~10-20 min)

Add missing data points needed for scoring.

**Enrichment priority:**

| Data Point | Source Priority | Why |
|------------|----------------|-----|
| Industry | Apollo > Clay > LinkedIn | Core ICP filter |
| Employee count | LinkedIn > Apollo > Clay | Most accurate on LinkedIn |
| Revenue | Clay (waterfall) > Apollo | Clay cross-validates |
| Tech stack | BuiltWith > Apollo > Clay | BuiltWith most comprehensive |
| Funding | Crunchbase > Apollo > Clay | Crunchbase is source of truth |
| Growth signals | LinkedIn + Apollo dept changes | Combine for best coverage |
| Domain | Apollo > Clay > manual | Primary dedup key |

**Enrichment rules:**
- ALWAYS enrich by domain (primary key for deduplication)
- If a company appears in multiple sources, merge data (take best value per field)
- Mark data confidence: HIGH (verified by multiple sources), MEDIUM (single source), LOW (estimated)
- Skip enrichment for companies that clearly fail ICP on primary criteria (saves API credits)

**Deduplication:**
- Primary key: `domain` (company website)
- If no domain: use `company_name + hq_city` as composite key
- Merge duplicates: keep richest data profile

---

### Step 6: Score & Filter (~5 min)

Apply ICP Fit Score to every enriched company. See [references/icp-to-filters.md](references/icp-to-filters.md) for full scoring methodology.

**Scoring process:**
1. For each company, evaluate each ICP criterion against the mapping weights
2. Calculate weighted score (max 10.0)
3. Apply signal boosters (hiring, recent funding, leadership change, etc.)
4. Cap boosted score at 10.0

**Filtering:**
- **Score >= 7.0**: Include in output (HOT or WARM)
- **Score 6.0-6.9**: Include only if total results < 50 (need more volume)
- **Score < 6.0**: Exclude from output

**Priority assignment:**
- **HOT** (8.0-10.0): Pursue immediately. Strong ICP fit + active signals.
- **WARM** (6.0-7.9): Good fit, investigate further before pursuing.
- **COLD** (4.0-5.9): Only included if volume is low. Monitor for signal changes.

**If fewer than 20 companies pass the filter:**
"Solo [X] empresas pasan el filtro de score >= 7. Opciones: (1) Relajar filtros, (2) Ampliar geografia, (3) Incluir industrias adyacentes. Que prefieres?"

**If more than 200 companies pass:**
"[X] empresas pasan el filtro. Recomiendo subir el threshold a score >= 8 para priorizar los mejores. O puedo segmentar por ECP."

---

### Step 7: Present Results (~3 min)

Show results in a formatted, scannable table.

**Summary first:**

> **Resultados Company Finder para [Company Name]:**
>
> **Busqueda**: [tool used] | **Filtros**: [summary of key filters]
> **Raw**: [n] empresas | **Filtered (score >= 7)**: [n] empresas
> **HOT**: [n] | **WARM**: [n] | **COLD**: [n]

**Top 10 table:**

| # | Company | Domain | Industry | Size | Revenue | Geo | Score | Priority | Top Signal |
|---|---------|--------|----------|------|---------|-----|-------|----------|------------|
| 1 | Example Corp | example.com | SaaS/Fintech | 45 | $5M-10M | Madrid | 9.2 | HOT | Hiring 3 engineers |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Ask for feedback:**
"Estos son los top 10. Quieres ver la lista completa, ajustar filtros, o guardar y proceder a decision-maker-finder?"

---

### Step 8: Save Output (~1 min)

Save the complete results to `brand/{slug}/operational/companies-YYYYMMDD.json`.

**JSON Schema:**

```json
{
  "date": "2026-02-21",
  "source": "company-finder",
  "search_criteria": {
    "industry": ["SaaS", "fintech"],
    "size": "11-50",
    "geo": ["Spain"],
    "tech_stack": ["Stripe"],
    "funding": "Series A",
    "additional_filters": {}
  },
  "tool_used": "apollo",
  "mode": "FULL",
  "companies": [
    {
      "name": "Example Corp",
      "domain": "example.com",
      "industry": "SaaS",
      "sub_industry": "Fintech",
      "employees": 45,
      "revenue_range": "$1M-$10M",
      "hq_location": "Madrid, Spain",
      "hq_country": "ES",
      "tech_stack": ["Stripe", "HubSpot", "AWS"],
      "funding": "Series A ($5M)",
      "funding_date": "2025-09-15",
      "founded_year": 2021,
      "growth_signals": [
        "Hiring 3 engineering roles",
        "New office in Barcelona"
      ],
      "icp_score": 8.5,
      "signal_boost": 0.7,
      "final_score": 9.2,
      "priority": "hot",
      "data_confidence": "high",
      "linkedin_url": "https://linkedin.com/company/example",
      "source": "apollo",
      "enriched_from": ["apollo", "builtwith"]
    }
  ],
  "stats": {
    "total_found": 234,
    "enriched": 234,
    "filtered": 87,
    "hot": 12,
    "warm": 45,
    "cold": 30,
    "discarded": 147,
    "avg_score": 7.8,
    "top_industries": ["SaaS", "Fintech", "Payments"],
    "top_geos": ["Madrid", "Barcelona", "Valencia"]
  },
  "metadata": {
    "skill_version": "1.0",
    "execution_time_minutes": 25,
    "api_calls_used": 15,
    "credits_consumed": 234
  }
}
```

**Also save a human-readable summary** to `brand/{slug}/operational/companies-YYYYMMDD-summary.md` with the table from Step 7.

---

## LIGHT Mode Workflow

When no API keys are available, the skill degrades to manual research using WebSearch and public sources.

### LIGHT Step 1: Define Search Queries

Translate ICP into Google search queries:

```
"[industry] companies [geo] [size indicator]"
"[industry] startups [geo] [funding stage]"
"top [industry] companies [geo] [year]"
site:linkedin.com/company "[industry]" "[geo]"
site:crunchbase.com "[industry]" "[geo]"
```

### LIGHT Step 2: Search & Collect

Execute WebSearch queries (5-10 queries). Sources to prioritize:
- Crunchbase lists (free tier shows basic company data)
- LinkedIn company search (public profiles)
- Industry directories and rankings
- AngelList / Wellfound (startups)
- Local business registries (e.g., eInforma for Spain)
- G2/Capterra categories (for software companies)

### LIGHT Step 3: Manual Enrichment

For each company found, manually check:
- Website (employee count from LinkedIn badge, tech stack from BuiltWith free)
- LinkedIn company page (headcount, recent posts, growth indicators)
- Crunchbase free profile (funding, investors)

### LIGHT Step 4: Score & Prioritize

Apply the same ICP Fit Score methodology, with lower data confidence scores.

**LIGHT mode limitations:**
- Typically yields 20-50 companies (vs 100-500 in FULL mode)
- Lower data confidence (fewer data points per company)
- More manual effort (~45-60 min vs ~25 min in FULL)
- No automated signal detection

**Communicate clearly:**
"En modo LIGHT he encontrado [X] empresas. La precision es menor que con APIs — recomiendo validar manualmente los top 10 antes de proceder a decision-maker-finder."

---

## Integration with SanchoCMO Framework

| Connection | Direction | What Flows |
|------------|-----------|------------|
| **niche-discovery-100x** | INPUT | ICP definition, ECPs, pain scores, reachability data |
| **company-context** | INPUT | Our company profile (for relevance filtering) |
| **competitor-intelligence** | INPUT | Competitor list (to identify competitor customers or exclude) |
| **decision-maker-finder** | OUTPUT | Filtered company list → find people within these companies |
| **contact-enrichment** | OUTPUT | Company data enriches contact profiles downstream |
| **signal-monitor** | BIDIRECTIONAL | Signals feed scoring; new companies feed monitoring |
| **daily-pulse** | OUTPUT | New HOT companies appear in daily briefing |

### Data Flow in the Encuentra Phase

```
niche-discovery-100x (ICP)
        |
        v
  COMPANY-FINDER (this skill)  ←── competitor-intelligence (exclude/identify)
        |
        v
  decision-maker-finder (find people in target companies)
        |
        v
  contact-enrichment (enrich contact data)
        |
        v
  outreach execution (personalized sequences)
```

---

## Reference Files

| File | Purpose |
|------|---------|
| [references/tool-comparison.md](references/tool-comparison.md) | Detailed comparison of Apollo, Clay, LinkedIn SN, Apify |
| [references/icp-to-filters.md](references/icp-to-filters.md) | ICP attribute to search filter mapping + scoring methodology |

---

## Edge Cases

**ICP is very niche (few companies exist):**
- Lower score threshold to >= 6
- Expand geography or adjacent industries
- "Tu ICP es muy especifico — solo [X] empresas matchean. Recomiendo ampliar [criterio] para tener volumen suficiente."

**ICP spans multiple ECPs with different criteria:**
- Run separate searches per ECP
- Tag each company with which ECP(s) it matches
- "Tu ICP tiene 3 ECPs diferentes. Ejecuto 3 busquedas separadas y consolido resultados."

**Competitor companies appear in results:**
- Flag but do NOT remove — competitor customers are valuable intelligence
- Tag with `is_competitor: true` and note which competitor
- "He encontrado [X] competidores en los resultados. Los marco pero no los elimino — sus clientes actuales pueden ser prospects si estan descontentos."

**Data quality is low (many unknowns):**
- Switch to Clay waterfall enrichment if available
- In LIGHT mode, increase manual validation for top 20
- "Muchos campos vacios en los resultados de Apollo. Recomiendo usar Clay para enriquecer via waterfall, o validar manualmente los top 20."

**Too many HOT companies (>50):**
- Good problem. Segment by ECP and prioritize by signal recency.
- "Tienes 50+ empresas HOT. Recomiendo segmentar por ECP y empezar por las que tienen signals mas recientes."

---

## Frequency

- **Initial run**: When launching outreach for a new ECP
- **Monthly refresh**: Re-run to catch new companies, updated signals, and market changes
- **Triggered refresh**: When signal-monitor detects significant market shifts
- **Post-pivot**: After changing ICP or adding new ECPs

**On refresh:** Compare new results against previous `companies-YYYYMMDD.json`. Flag new companies, score changes, and companies that dropped below threshold.
