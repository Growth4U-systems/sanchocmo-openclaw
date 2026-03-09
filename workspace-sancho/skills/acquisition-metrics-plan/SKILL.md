---
name: acquisition-metrics-plan
description: "Design a complete acquisition metrics plan for any business type. Classifies the business into archetypes (SaaS/App, Fintech, Marketplace, E-commerce/D2C, Lead-to-Sale, Hybrid), defines activation events, builds 4-level metrics hierarchy, sets benchmarks, creates review cadence, and generates a personalized Excel tracking template. Reads company-context, budget, ecps from Context Lake. Writes metrics-plan.md to brand/. Use when onboarding a new client, launching a product, restructuring metrics tracking, or user says design metrics plan, what should we measure, acquisition KPIs, metrics setup, tracking plan. Do NOT use for diagnosing existing metrics (use diagnose) or for designing experiments (use design-experiment)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: Execute
  pillar: acquisition-metrics-plan
  layer: "Execute"
  depends_on: company-context
  chains_to: channel-prioritization, diagnose
---

# Acquisition Metrics Plan — Design Your Measurement System

> "If you can't measure it, you can't improve it. But measuring the WRONG thing is worse than not measuring at all."

This skill designs the measurement system for any business: what to measure, how, with what benchmarks, and at what cadence. It sits between Foundation (understanding the business) and Execution (running campaigns). Without the right metrics framework, channel-prioritization scores blindly and diagnose has no data to work with.

Read ./brand/ per _system/brand-memory.md

Follow _system/output-format.md

---

## Prerequisites

**Required (will not run without these):**
- `./brand/company-context.md` -- Industry, stage, business model, monetization (from company-context)

**Recommended (better output with these):**
- `./brand/budget.md` -- Budget range, team capacity (from budget-constraints)
- `./brand/ecps.md` -- Target personas (from niche-discovery-100x)
- `./brand/stack.md` -- Available tools and integrations (from sancho-start)
- `./brand/channel-plan.md` -- Selected channels (from channel-prioritization)

---

## Core Principle

**The activation event is NEVER the signup.** It is the moment where the user sees real value. All cohorts start here.

---

## Workflow: 7 Steps

### Step 1: Classify the Business (~2 min)

Load `./brand/company-context.md`. Extract monetization model, customer journey, regulatory requirements. If company-context exists, INFER the archetype -- do not ask unless ambiguous.

If company-context is missing, ask these questions then map to archetype:

1. How does it monetize? (subscription / transaction / one-time / ad-supported / service fee)
2. How do customers arrive? (self-serve / sales-assisted / marketplace / local search / referral)
3. Is there regulatory onboarding? (KYC, verification, approval)
4. Is it two-sided? (supply + demand)
5. Digital or physical product?
6. Local/geographic business? (defined catchment area)

| Archetype | Examples | Signals |
|-----------|----------|---------|
| **SaaS / App** | Slack, Notion, mobile games | Self-serve signup, product-led, subscription/freemium |
| **Fintech** | Monzo, Revolut, Criptan | KYC/regulatory onboarding, transactions, deposits |
| **Marketplace** | Airbnb, Wallapop, FellowFunders | Two-sided, platform takes cut |
| **E-commerce / D2C** | Shopify stores, Nike.com | Product catalog, cart, purchase, shipping |
| **Lead-to-Sale** | Agencies, law firms, clinics, SaaS Enterprise | Leads -> qualification -> meeting/appointment -> deal |
| **Hybrid** | Crypto exchanges, fintech marketplaces | Combination of 2+ archetypes |

**Lead-to-Sale sub-variants** (same metrics structure, different channels and naming):
- **B2B Services**: LinkedIn, cold email, networking. Funnel: Lead -> Meeting -> Proposal -> Deal
- **SaaS Enterprise**: LinkedIn Ads, SDR outbound, events. Funnel: MQL -> SQL -> Demo -> Proposal -> Won
- **Local Services**: Google Business Profile, local SEO, directories (Doctoralia, etc). Funnel: Search -> Call/Form -> Appointment -> Visit -> Treatment/Service
- **Lead Gen**: Paid ads, SEO, content. Funnel: Visit -> Form Fill -> MQL -> SQL -> Appointment

Present classification: "Based on company-context, I classify this as [Archetype]. Validate or correct."

---

### Step 2: Define the Activation Event (~1 min)

| Archetype | Activation Event | Why |
|-----------|-----------------|-----|
| SaaS / App | First core feature used | Predicts retention |
| Fintech | First transaction (deposit or spend) | No money = no visible value |
| Marketplace | First completed transaction (buy OR sell) | Proves platform utility |
| E-commerce / D2C | First purchase | Product-market fit |
| Lead-to-Sale | First qualified meeting/appointment/demo | Prospect experiences value |

For Hybrid: use the primary archetype's activation event, add secondary archetype steps to the funnel.

---

### Step 3: Build the Metrics Hierarchy (~3 min)

**Level 1 - Primary Acquisition KPI** (one metric, the one that rules):
- = Activation Event count (e.g., First Transactions, SQLs, First Purchases)

**Level 2 - Quality KPIs** (2-3 metrics):
- **Activation Rate** = Primary KPI / Signups (or equivalent top-of-funnel)
- **CAC** = Total Spend / Primary KPI
- **Business-specific value metric** (Amount Deposited, AOV, Deal Size, Treatment Value)

**Level 3 - Funnel Steps** (diagnostic, to find bottlenecks):

| Archetype | Funnel |
|-----------|--------|
| SaaS / App | Visit/Install -> Signup -> Onboarding -> Core Feature Used -> Paid/D7 Return |
| Fintech | Download -> Signup -> KYC -> First Deposit -> First Transaction |
| Marketplace | Visit -> Signup -> First Listing/Search -> First Transaction |
| E-commerce / D2C | Visit -> Add to Cart -> Checkout Started -> Purchase |
| Lead-to-Sale | Contact -> Lead -> Qualified Lead -> Meeting/Cita/Demo -> Proposal -> Deal |

**Level 4 - Return/Sustainability KPIs** (validate quality):
- **LTV/CAC Ratio** (target: >3x, enterprise >5x)
- **ROAS** per channel (7d, 30d, 90d windows)
- **Payback Period** = CAC / monthly ARPU
- **Cohort retention** (transaction-based, NOT activity-based)

---

### Step 4: Define Channel Tracking (~2 min)

Read `./brand/channel-plan.md` if it exists -- use the selected channels. If not, use standard channel groups:

**Standard channel groups**:
- Affiliates (partners, influencers, ranking sites)
- Paid SRN (Meta, Google, TikTok, Apple Search, Snapchat)
- Adnetworks (programmatic)
- Organic (SEO, direct)
- Brand (web, blog, social organic)
- Referral (referral program)
- Offline (events)

**Lead-to-Sale channel additions by sub-variant**:
- Local: Google Business Profile, Local SEO, Local Ads (geo-targeted), Directories, Word of Mouth
- Enterprise: LinkedIn Ads, SDR Outbound, Partnerships, Conferences
- B2B Services: LinkedIn organic, Cold email, Networking, Referral partners

**Per channel, track**: Fixed Payment + VAT, Variable Fee per activation, Variable Total, Total Spend, each funnel step count, CAC, Activation Rate, Value/User, estimated ARPU.

---

### Step 5: Map Data Sources (~3 min)

Read `./brand/stack.md` if it exists -- adapt sources to client's actual tools.

For each metric in the hierarchy, identify WHERE the data comes from and HOW to collect it.

**Common data sources by metric type**:

| Metric Category | Source | Collection Method |
|----------------|--------|-------------------|
| Web traffic (sessions, users, bounce) | Google Analytics 4, PostHog | API (daily cron) |
| Product usage (events, funnels, retention) | PostHog, Amplitude | API (daily cron) |
| SEO (keywords, CTR, positions) | Google Search Console | API (daily cron) |
| Paid ads (spend, clicks, CPA, ROAS) | Google Ads, Meta Ads Manager | API (daily cron) |
| Social media (posts, engagement, reach) | Metricool | API (daily cron) |
| Outbound (emails sent, opens, replies) | Instantly, Lemlist | API (daily cron) |
| CRM / Pipeline (leads, meetings, deals) | HubSpot, Pipedrive, Notion | API or manual |
| Revenue, payments, churn | Stripe, billing system | API or manual |
| Manual metrics (not in any tool) | Google Sheets | Manual entry by client/team |

**Source mapping by archetype** (defaults):

| Archetype | Typical Sources |
|-----------|----------------|
| SaaS / App | PostHog/Amplitude (product), GA4 (web), Stripe (revenue), Google Ads + Meta (paid) |
| Fintech | Internal DB (transactions/KYC), GA4 (web), Google Ads + Meta + TikTok (paid) |
| Marketplace | Internal DB (transactions), GA4 (web), PostHog (product), paid platforms |
| E-commerce / D2C | Shopify/WooCommerce (orders), GA4 (web), Meta + Google (paid), Metricool (social) |
| Lead-to-Sale | CRM (pipeline), GA4 (web), Instantly (outbound), Metricool (social), Google Ads (paid) |

**For each metric, document**:
- Metric name
- Source tool
- Collection method: `api-auto` (cron), `api-manual` (on-demand), `manual` (human entry)
- Frequency: daily, weekly, monthly
- Owner: who is responsible for the data being accurate

**Storage**: JSON as source of truth (`metrics-data.json`), synced to Google Sheets for client visibility.

---

### Step 5.5: Credential Collection & Connection Setup (~5-15 min)

**Purpose**: For each data source marked `api-auto` in Step 5, collect the client's credentials and verify the connection works.

**Reference files**:
- `skills/acquisition-metrics-plan/schemas/api-catalog.json` — Master catalog: what to ask per source
- `skills/acquisition-metrics-plan/schemas/integrations-schema.json` — Storage schema

**Flow**:

1. **Check existing integrations**: Read `./brand/integrations.json` if it exists. Skip sources already `connected`.

2. **Present the list**: Show the client which integrations are needed, grouped by priority:
   - 🔴 **Critical** (blocks metrics): Primary KPI source, web analytics
   - 🟡 **Important** (blocks channels): Paid ads platforms, CRM
   - 🟢 **Nice to have**: Social, outbound tools

3. **Collect credentials one by one**: For each source, use the `api-catalog.json` to:
   - Tell the client exactly what to provide (key name, where to find it, what permissions)
   - Accept the credential in the thread
   - Store secrets in `./brand/.env` with naming: `{SLUG_UPPER}_{SOURCE}_{KEY}` (e.g. `PAYMATICO_GA4_SA_KEY`)
   - Store non-sensitive config in `./brand/integrations.json`

4. **Test each connection**: After receiving credentials:
   ```bash
   node skills/acquisition-metrics-plan/scripts/test-connection.js --slug {slug} --source {source}
   ```
   - ✅ Connected → update status, move to next
   - ❌ Error → show error to client, ask to verify and retry

5. **Generate integrations.json**: Create/update `./brand/integrations.json` with all sources, their status, and env var references.

6. **Summary**: Present final status table:
   ```
   📊 Integration Status for [Client]:
   ✅ GA4 — Connected (Property: 123456789)
   ✅ GSC — Connected (Site: https://example.com)
   ❌ Meta Ads — Error: Invalid token
   ⚫ Metricool — Not configured (client doesn't use)
   ```

**Three-level API resolution** (for system-level APIs like LLMs):
```
Client has own key? → Use client's key
No client key? → Fallback to system key (Growth4U)
No system key? → Mark "not_configured"
```

**Security rules**:
- NEVER log or display full API keys/tokens in chat — show only last 4 chars
- Secrets go in `.env` files ONLY, never in JSON, never in markdown
- `.env` files must be gitignored

**If client doesn't have credentials ready**: Mark as `pending`, set a note with what's needed, and continue with other sources. The skill can run with partial data — just flag which metrics won't populate.

---

### Step 6: Set Benchmarks & Decision Criteria (~2 min)

Choose ONE quick decision framework:

1. **Theoretical CAC**: From business plan or competitor benchmarks. Day 1 ready.
2. **CAC + Transaction Cohort**: Take CAC of channels with good cohorts as benchmark. Needs ~3 months data.
3. **Theoretical Payback Period**: Estimate ARPU -> desired payback -> max CAC. Aligns acquisition with sustainability.

**Default benchmarks by archetype**:

| Archetype | Activation Rate | CAC Payback | LTV/CAC |
|-----------|----------------|-------------|---------|
| SaaS / App | 15-30% | 6-12 months | >3x |
| Fintech | 20-25% | 3-6 months | >4x |
| Marketplace | 10-20% | Variable | >3x |
| E-commerce / D2C | 2-5% (visit->purchase) | Immediate-3m | >3x |
| Lead-to-Sale | 10-25% (lead->meeting) | 1-6 months | >3x (SMB), >5x (enterprise) |

---

### Step 7: Define Review Cadence (~1 min)

**Weekly**:
- Primary KPI (activations) total and by channel
- Activation Rate by channel -- kill bad channels, double down on good ones
- Funnel step-by-step conversion rates (diagnostic)

**Monthly**:
- CAC per activation by channel
- ARPU global and per channel
- Step-by-step activation rate (signup->KYC->transaction, etc.)
- Share of Search / Share of Voice (awareness leading indicator)

**Quarterly**:
- Cohort analysis (transactional retention, not activity-based)
- LTV/CAC ratio updated with real data
- Payback period actual vs theoretical
- ROAS per channel at 90 days
- Recalibrate benchmarks and decision criteria

---

## Output

Generate TWO deliverables:

### 1. Metrics Plan Document

Save to `./brand/metrics-plan.md`:

```markdown
# Acquisition Metrics Plan: [Business Name]

## Last Updated
[date] by /acquisition-metrics-plan

**Archetype**: [Primary] (+ [Secondary] if Hybrid)

## Business Profile
- **Monetization**: [model]
- **Customer journey**: [how they arrive]
- **Activation Event**: [specific event]

## Metrics Dashboard

### Level 1 - Primary KPI
- **[Metric name]**: [definition and formula]

### Level 2 - Quality KPIs
- **Activation Rate**: [formula] | Benchmark: [X%]
- **CAC**: [formula] | Benchmark: [EUR X]
- **[Value metric]**: [formula]

### Level 3 - Funnel Steps
[Step] -> [Step] -> [Step] -> [Activation Event]
Track conversion rate between each step.

### Level 4 - Return KPIs
- LTV/CAC: target [Xx]
- Payback Period: target [X months]
- ROAS: measure at [7d/30d/90d]

## Channel Tracking
| Channel Group | Channels | Expected Role |
|....|....|....|

## Data Sources
| Metric | Source | Method | Frequency | Owner |
|--------|--------|--------|-----------|-------|
| [Primary KPI] | [tool] | [api-auto/manual] | [daily/weekly] | [who] |
| [Activation Rate] | Calculated | auto | weekly | system |
| [CAC] | Calculated | auto | monthly | system |
| ... | ... | ... | ... | ... |

## Decision Criteria
- **Framework**: [chosen framework]
- **Max CAC**: EUR [X] per [activation event]
- **Min Activation Rate**: [X%]
- **Action**: Kill channels below [threshold] after [timeframe]

## Review Cadence
- Weekly: [what to review]
- Monthly: [what to review]
- Quarterly: [what to review]

## Cohort Design
- **Start event**: [activation event]
- **Cohort types**: [transaction/revenue/balance as applicable]
- **Dimensions**: by channel, by product (if applicable)
```

### 2. Excel Tracking Template

Run the generator script to create a personalized .xlsx:

```bash
node skills/acquisition-metrics-plan/scripts/generate-template.js \
  --name "Business Name" \
  --archetype "fintech" \
  --output "./brand/"
```

The script generates a .xlsx with sheets adapted to the archetype (Dashboard, Total Expense, Data Sources, Attribution, Cohorts). See `scripts/generate-template.js` for parameters and customization.

---

## Context Lake Integration

| Action | File | Description |
|--------|------|-------------|
| READ | `./brand/company-context.md` | Industry, stage, business model, monetization |
| READ | `./brand/budget.md` | Budget range, team capacity |
| READ | `./brand/ecps.md` | Target personas |
| READ | `./brand/stack.md` | Available tools and integrations |
| READ | `./brand/channel-plan.md` | Selected channels (from channel-prioritization) |
| WRITE (owns) | `./brand/metrics-plan.md` | Metrics hierarchy + benchmarks + cadence |
| WRITE (owns) | `./brand/integrations.json` | API integration status + config (no secrets) |
| WRITE (owns) | `./brand/.env` | API secrets (gitignored, never committed) |
| READ | `skills/.../schemas/api-catalog.json` | Master catalog of supported APIs |
| APPEND | `./brand/assets.md` | Metrics plan summary |

---

## Frequency

- **Initial**: After company-context complete (minimum). Better after Foundation complete.
- **Quarterly**: Re-evaluate benchmarks with real data
- **Ad-hoc**: When business model changes, new product launches, or archetype shifts

---

## Feedback Collection

After generating the metrics plan, ask:

"El plan de metricas refleja bien tu negocio? Hay alguna metrica clave que falte o alguna fuente de datos que no haya considerado?"

Log feedback to `./brand/learnings.md`:
```
[date] acquisition-metrics-plan: [feedback summary]
```
