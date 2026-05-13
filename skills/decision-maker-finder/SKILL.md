---
name: decision-maker-finder
description: Find decision makers at target companies.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-one)
  depends_on: company-finder
  chains_to: contact-enrichment
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- campaigns/
- brand/{slug}/operational/assets.md
---

# Decision Maker Finder — Find the Person Who Can Say YES

> "No vendas a empresas. Vende a personas dentro de empresas." — Sancho
> "The company doesn't buy. A human with a budget and a problem does."

Este skill convierte una lista de **empresas target** en una lista de **personas concretas**: el decision maker que puede decir YES a tu producto. No buscamos emails (eso es contact-enrichment). Buscamos **quienes son**, validamos que son **los correctos**, y priorizamos por **probabilidad de respuesta**.

**Diferencia con skills vecinos:**
- **company-finder**: Encuentra empresas target (COMPANIES)
- **decision-maker-finder**: Encuentra personas dentro de esas empresas (PEOPLE)
- **contact-enrichment**: Encuentra emails y datos de contacto (CHANNELS)

Read ./brand/ per _system/intelligence/brand-memory.md (if using SanchoCMO framework)

Follow _system/output/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input:**
- Companies list from company-finder (`brand/{slug}/operational/companies-YYYYMMDD.json` or manual list)
- At minimum: company name + domain + employee count

**Tools needed (in priority order):**
1. **LinkedIn Sales Navigator** (best: advanced filters, lead lists)
2. **Apollo.io** (good: email + role search, free tier available)
3. **Apify MCP Server** (remote, web-hosted compatible)
   - URL: https://mcp.apify.com/
   - Actors: linkedin-profile-scraper, apollo-scraper
   - Auth: OAuth (Apify API token)
4. **WebSearch** (fallback: manual search)

**Optional context:**
- brand/{slug}/go-to-market/ecps.json (buyer personas with target roles)
- ./brand/{slug}/go-to-market/positioning/*/current.md (to identify relevant departments)
- brand/{slug}/market-and-us/competitors.json (to identify warm paths via mutual connections)

---

## Workflow

### Step 0: Tool Detection (Automatic)

**Check available tools:**

```
IF LinkedIn Sales Navigator access available:
  mode = "SALES_NAV" (highest quality)
  notify = "LinkedIn Sales Navigator detected — premium search"
ELIF Apollo.io API configured:
  mode = "APOLLO" (good automation)
  notify = "Apollo.io connected — automated people search"
ELIF mcp.apify.com is configured with valid API token:
  mode = "APIFY" (actor-based)
  notify = "Apify MCP connected — using scraper actors"
ELSE:
  mode = "LIGHT" (manual WebSearch + LinkedIn manual)
  notify = "No specialized tools — using manual search workflow"
```

**Present:**

```
TOOL DETECTION

|- Tool: LinkedIn Sales Navigator / Apollo / Apify / Manual
|- Mode: SALES_NAV / APOLLO / APIFY / LIGHT
|- Companies to search: [N] from company-finder
|- Estimated time: 15 min (auto) / 3-5 hours (manual)

Proceed?
```

---

### Step 1: Load Companies

```
Read from Context Lake (if SanchoCMO):
  brand/{slug}/operational/companies-YYYYMMDD.json

Extract per company:
  |- Company name
  |- Domain
  |- Employee count (for seniority targeting)
  |- Industry (for title variations)
  |- ICP segment (for role prioritization)
  |- LinkedIn company URL (if available)

If NO companies list exists:
  ERROR: Run /company-finder first
  OR: Provide a manual list of companies
```

**Present:**

```
LOADED — [N] Companies from company-finder

Company A (SaaS, 250 employees)
  |- Domain: example.com
  |- LinkedIn: linkedin.com/company/example
  |- ICP: Mid-Market B2B SaaS

Company B (Fintech, 80 employees)
  ...

Companies to search: All [N] / Select specific?
```

---

### Step 2: Define Target Roles

Using [role-mapping.md](references/role-mapping.md) + buyer persona from ECPs:

```
From ECP buyer persona:
  |- Primary role: VP Marketing
  |- Department: Marketing
  |- Seniority: VP-Level (mid-market deal)

Expand to search aliases:
  |- "VP Marketing"
  |- "Head of Marketing"
  |- "Marketing Director"
  |- "VP Growth"
  |- "Head of Growth"
  |- "CMO" (at smaller companies)

Apply seniority decision tree:
  Company size 250 employees + Deal $20K
  -> Target: VP-Level (primary) + Director-Level (backup)
```

**Present:**

```
TARGET ROLES (Based on ECPs + Company Sizes)

Primary roles (search first):
  1. VP Marketing / Head of Marketing
  2. VP Growth / Head of Growth
  3. CMO (for companies <100 employees)

Backup roles (if primary not found):
  4. Director of Marketing / Director Demand Gen
  5. Marketing Manager / Growth Manager

Aliases included: 12 title variations per role

Adjust roles? Or proceed with these?
```

---

### Step 3: Search Decision Makers

**For each company, search using selected tool:**

**SALES_NAV mode:** Filter by Company + Title + Seniority. Sort by connection degree. Extract: Name, title, LinkedIn URL, mutual connections.

**APOLLO mode:** Search by company domain + title keywords + seniority. Output: Name, title, LinkedIn URL, company, department.

**APIFY mode:** Actor `linkedin-people-search` with company + role keywords, maxResults: 10. Output: JSON with profiles.

**LIGHT mode:** Manual search per company:
1. WebSearch: `"[company name]" "[target role]" site:linkedin.com`
2. Check company website /about or /team page
3. Cross-reference LinkedIn results (~5-10 min per company)

**Progress tracking:**

```
SEARCHING — [N] Companies

[####------] 4/10 companies searched

Company A: Found VP Marketing (Jane Doe) + Director Growth (John Smith)
Company B: Found CMO (Maria Garcia) — small company, CMO = VP-level
Company C: Searching...
Company D: Pending...
```

---

### Step 4: Validate Profiles

Using [validation-criteria.md](references/validation-criteria.md):

**For each candidate found:**

```
VALIDATE — Jane Doe (VP Marketing @ Company A)

Profile Quality:
  |- Photo: Yes (+1)
  |- Connections: 2,400 (+1)
  |- Recent activity: Posted 3 days ago (+2)
  |- Complete history: Yes (+1)
  |- Skills endorsed: 27 (+1)
  |- Recommendations: 8 (+1)
  |- Custom headline: Yes (+1)
  |- Creator mode: No (+0)
  Profile Quality Score: 8/9 (Excellent)

Relevance:
  |- Title exact match: "VP Marketing" = Yes (+3)
  |- Department match: Marketing = Yes (+2)
  |- Seniority match: VP for mid-market = Yes (+2)
  |- Active profile: Yes (+1)
  Relevance Score: 8/10

Red Flags: None
Warnings: None

Warm Path:
  |- 2nd degree via Carlos Lopez (mutual connection) (+2)
  |- Shared group: "SaaS Growth Spain" (+1)
  Warm Path Score: +3

COMPOSITE SCORE: 8 + 2 (quality bonus) + 3 (warm path) = 13/15
```

---

### Step 5: Score & Prioritize

**Composite Score Formula:**

```
COMPOSITE = Relevance (1-10) + Quality Bonus + Warm Path Bonus

Quality Bonus:
  - Profile 8-9: +2
  - Profile 6-7: +1
  - Profile 4-5: +0
  - Profile 0-3: -2

Warm Path Bonus:
  - 1st degree: +3
  - 2nd degree: +2
  - Shared group: +1
  - No connection: +0

Maximum: 15  |  Primary threshold: 8+  |  Backup threshold: 5+
```

**Rank all candidates per company:**

```
SCORING — Company A

#1 Jane Doe (VP Marketing)
   Composite: 13/15  |  Role: primary

#2 John Smith (Director Growth)
   Composite: 9/15   |  Role: backup

#3 Mike Johnson (Marketing Manager)
   Composite: 6/15   |  Role: backup (lower seniority)
```

---

### Step 6: Select Top Contacts (1-3 per Company)

**Selection rules:**
- **1 Primary**: Highest composite score, correct seniority
- **1-2 Backups**: Next highest scores, ideally different seniority level
- **Multi-thread for enterprise**: Primary (economic buyer) + Champion (user) + Technical evaluator

```
SELECTION — Company A

PRIMARY: Jane Doe
  |- VP Marketing | Score: 13/15 | Warm path via Carlos Lopez

BACKUP 1: John Smith
  |- Director Growth | Score: 9/15 | No warm path

BACKUP 2: (none — 2 contacts sufficient for mid-market)
```

---

### Step 7: Present Results

```
DECISION MAKER FINDER — Resultados

Empresas buscadas: 10
Contactos encontrados: 24
Contactos validados: 19
Primary seleccionados: 10 (1 per company)
Backup seleccionados: 8

TOP RESULTS (By Company)

1. Company A (SaaS, 250 emp)
   PRIMARY: Jane Doe — VP Marketing
   |- Score: 13/15 | Quality: Excellent | Warm path: 2nd via Carlos Lopez
   |- LinkedIn: linkedin.com/in/janedoe
   |- Last active: 3 days ago
   BACKUP: John Smith — Director Growth
   |- Score: 9/15 | Quality: Good | No warm path

2. Company B (Fintech, 80 emp)
   PRIMARY: Maria Garcia — CMO
   |- Score: 11/15 | Quality: Good | Warm path: Shared group
   WARNING: "Open to Work" badge — may be leaving

... (remaining companies)

WARNINGS:
- Company B: Maria Garcia has "Open to Work" — consider backup
- Company F: No decision maker found for target role — try different seniority

NEXT STEPS:
1. Review contacts and approve
2. Run /contact-enrichment to get emails + phone
3. Start outreach sequence

Save results? [Y/N]
```

---

### Step 8: Save Output

**Write to:** `brand/{slug}/operational/decision-makers-YYYYMMDD.json`

```json
{
  "date": "2026-02-21",
  "source": "decision-maker-finder",
  "tool_used": "apollo",
  "target_roles": ["VP Marketing", "Head of Growth", "CMO"],
  "contacts": [
    {
      "name": "Jane Doe",
      "title": "VP Marketing",
      "company": "Example Corp",
      "company_domain": "example.com",
      "linkedin_url": "linkedin.com/in/janedoe",
      "seniority": "VP",
      "department": "Marketing",
      "relevance_score": 8,
      "profile_quality": "high",
      "profile_quality_score": 8,
      "composite_score": 13,
      "last_active": "2026-02-18",
      "warm_path": "2nd degree via Carlos Lopez",
      "warm_path_score": 2,
      "shared_groups": ["SaaS Growth Spain"],
      "role_type": "primary",
      "red_flags": [],
      "warnings": []
    },
    { "...": "same structure for backup contacts" }
  ],
  "stats": {
    "companies_searched": 10,
    "candidates_found": 24,
    "candidates_validated": 19,
    "primary_selected": 10,
    "backup_selected": 8,
    "warnings_flagged": 2,
    "no_match_companies": 0
  }
}
```

**Append to:** `./brand/{slug}/operational/assets.md` — Summary with count of primary/backup contacts, avg composite score, warm paths available.

---

## LIGHT Mode — Manual Workflow

When no specialized tools are available:

### Per Company (5-10 min each):

1. **Google Search**: `"[company name]" "[target role]" site:linkedin.com`
2. **Company Website**: Check /about, /team, /leadership pages
3. **LinkedIn Manual**: Search company page > People tab > filter by title
4. **Cross-Reference**: Verify person appears on both LinkedIn AND company site

### Validation in LIGHT mode:

- Profile photo: Check LinkedIn profile
- Connections: Visible on public profiles (500+ shows)
- Activity: Check if recent posts visible
- Title: Compare LinkedIn vs company website
- Warm path: Check mutual connections manually

### Output in LIGHT mode:

Same JSON format. Mark `"tool_used": "manual"`. Profile quality assessment may be limited (mark `"profile_quality": "estimated"`).

### Time estimates:

| Companies | LIGHT Mode | FULL Mode |
|-----------|-----------|-----------|
| 10 | 1-2 hours | 15 min |
| 50 | 5-8 hours | 30 min |
| 100 | 10-15 hours | 1 hour |

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| brand/{slug}/operational/companies-YYYYMMDD.json | Target companies list | Source list for people search |
| brand/{slug}/go-to-market/ecps.json | Buyer personas with roles | Defines which roles to target |
| ./brand/{slug}/go-to-market/positioning/*/current.md | Our value proposition | Identifies relevant departments |
| brand/{slug}/market-and-us/competitors.json | Competitor data | Warm path identification via shared connections |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| brand/{slug}/operational/decision-makers-YYYYMMDD.json | All validated contacts (structured) |
| ./brand/{slug}/operational/assets.md | Append: Decision makers summary |

### Chains to

| Skill | Relationship |
|-------|-------------|
| **company-finder** | INPUT: Provides companies list |
| **contact-enrichment** | OUTPUT: Takes decision makers, finds emails + phone |
| **signal-monitor** | ENRICHMENT: Provides engagement signals for prioritization |
| **direct-response-copy** | OUTPUT: Writes personalized outreach using contact context |
| **email-sequences** | OUTPUT: Sequences for validated contacts |

### Pipeline Position

```
company-finder → DECISION-MAKER-FINDER → contact-enrichment → email-sequences
   (companies)        (people)                (channels)          (outreach)
```

---

## Reference Files

Read these for detailed criteria:

- [role-mapping.md](references/role-mapping.md) — **START HERE** — Seniority levels, role aliases, decision tree
- [validation-criteria.md](references/validation-criteria.md) — Profile quality signals, relevance scoring, red flags

---

## Frequency

**Recommended cadence:**
- **Initial run**: After each company-finder batch
- **Refresh**: Every 60 days (people change roles)
- **Ad-hoc**: When targeting a specific company for a deal
- **Re-validate**: Before outreach campaign (check for job changes)

**Why regular refresh:**
- People change jobs (avg tenure: 2-3 years)
- New hires in target roles (fresh decision makers, open to new tools)
- Warm paths evolve (new mutual connections appear)
- Company restructuring changes reporting lines

---

*No contactes a la empresa. Contacta a la persona que puede decir YES.*
