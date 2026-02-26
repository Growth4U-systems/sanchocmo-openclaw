---
name: signal-definition
description: Define marketing automation triggers.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-one)
  depends_on: company-context, niche-discovery-100x
  chains_to: signal-monitor
context_required:
- brand/company-context.md
- brand/icp.md
- brand/ecps.md
context_writes:
- campaigns/
- brand/learnings.md
---

# Signal Definition — Define Qué Señales Importan

> "Everyone monitors LinkedIn. Winners monitor the RIGHT signals for THEIR ICP."

Este skill es **STEP 0** del Signal Detection workflow. Define QUÉ señales monitore ar, NO las monitorea (eso es signal-monitor).

**Analogía:** Si signal-monitor es el radar, signal-definition programa QUÉ buscar en el radar.

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input:**
- company-context (producto, industria, pain points)
- ICPs/ECPs (de niche-discovery-100x)
- Business model (de business-model-audit)

**Optional but helpful:**
- Existing customer data (buying patterns)
- Competitor Battle Cards (what triggers THEIR buyers)

---

## Workflow

### Step 1: Load Client Context

```
Read from Context Lake (if SanchoCMO):
  ├─ ./brand/company-context.json
  ├─ ./brand/icp.json
  ├─ ./brand/ecps.json
  ├─ ./brand/business-model.json
  └─ ./brand/customer-data.json (if exists)

Extract:
  ├─ Product category (e.g., "CRM for SaaS")
  ├─ Pain points solved
  ├─ ICP characteristics (company size, industry, stage)
  ├─ Buyer personas (decision makers)
  └─ Sales cycle (length, complexity)
```

**Present:**

```
LOADED — Client Context

Product: [CRM for SaaS companies]
Pain Points:
  ├─ Manual lead tracking
  ├─ Poor sales visibility
  └─ Lost follow-ups

ICP:
  ├─ SaaS companies
  ├─ 10-50 employees
  ├─ Series A funded
  └─ B2B sales model

Buyer: VP Sales, Head of Revenue

Sales Cycle: 30-45 days (demo → trial → close)
```

### Step 2: Propose Signals (Automated)

Based on client context, propose relevant signals using [signal-types.md](references/signal-types.md):

**Signal proposal logic:**

```python
def propose_signals(client_context):
    signals = []

    # Intent Signals (ALWAYS relevant)
    signals.append({
        "category": "Intent",
        "signal": "Visited pricing page 2+ times",
        "urgency": 9,
        "qualification": 10,
        "why": "High intent, ready to buy",
        "source": "PostHog / GA4"
    })

    # Funding (if ICP = funded companies)
    if "funded" in client_context.icp or "Series" in client_context.icp:
        signals.append({
            "category": "Company",
            "signal": "Raised Series A/B funding",
            "urgency": 6,
            "qualification": 9,
            "why": "New budget, need infrastructure",
            "source": "Crunchbase, TechCrunch"
        })

    # Hiring (if buyer persona = VP Sales)
    if "VP Sales" in client_context.buyer or "sales" in client_context.pain_points:
        signals.append({
            "category": "Company",
            "signal": "Hiring SDRs or AEs",
            "urgency": 7,
            "qualification": 8,
            "why": "Scaling sales team = need tools",
            "source": "LinkedIn Jobs"
        })

    # Tech Stack (if product integrates with X)
    if client_context.integrations:
        for integration in client_context.integrations:
            signals.append({
                "category": "Company",
                "signal": f"Implemented {integration}",
                "urgency": 8,
                "qualification": 9,
                "why": f"Using {integration} = likely need {client_context.product}",
                "source": "BuiltWith, Wappalyzer"
            })

    # Competitor Complaints
    if client_context.competitors:
        signals.append({
            "category": "Trigger",
            "signal": f"Posted complaint about {client_context.competitors[0]}",
            "urgency": 10,
            "qualification": 9,
            "why": "Active pain, ready to switch",
            "source": "Twitter, G2, Trustpilot"
        })

    # Industry-Specific
    signals.extend(industry_specific_signals(client_context.industry))

    # Score and sort
    for signal in signals:
        signal["score"] = (signal["urgency"] + signal["qualification"]) / 2

    signals.sort(key=lambda x: x["score"], reverse=True)

    return signals
```

**Present:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNAL RECOMMENDATIONS

Based on your ICP + product, here are the TOP 10
buying signals to monitor:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. [Score: 95] Posted Complaint About [Competitor]
   └─ Urgency: 10 | Qualification: 9
   └─ Why: Active pain, ready to switch NOW
   └─ Source: Twitter, G2 reviews, Trustpilot
   └─ Monitor: Social listening, review scraping

2. [Score: 95] Visited Pricing Page 3+ Times
   └─ Urgency: 9 | Qualification: 10
   └─ Why: High intent, evaluating seriously
   └─ Source: PostHog / GA4
   └─ Monitor: Website analytics

3. [Score: 80] Implemented Stripe
   └─ Urgency: 8 | Qualification: 9
   └─ Why: Using Stripe = need CRM with Stripe integration
   └─ Source: BuiltWith, Wappalyzer
   └─ Monitor: Tech stack detection

4. [Score: 75] Hiring VP Sales or SDRs
   └─ Urgency: 7 | Qualification: 8
   └─ Why: Scaling sales = need sales tools
   └─ Source: LinkedIn Jobs
   └─ Monitor: Job posting scraping

5. [Score: 75] Raised Series A/B Funding
   └─ Urgency: 6 | Qualification: 9
   └─ Why: New budget for infrastructure
   └─ Source: Crunchbase, TechCrunch
   └─ Monitor: Funding announcement tracking

...top 10...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Which signals should I track?
① Top 5 (focused, easiest to monitor)
② Top 10 (comprehensive)
③ All proposed signals
④ Let me customize the list
```

### Step 3: Customize Signals (Interactive)

User can:
- ✅ Accept proposed signals
- ➕ Add custom signals
- ❌ Remove proposed signals
- 📝 Adjust scoring

**Example custom signal:**

```
User: "Also track companies that mention 'sales ops' in job postings"

Signal added:
{
  "category": "Company",
  "signal": "Job posting mentions 'sales ops'",
  "urgency": 7,
  "qualification": 8,
  "why": "Sales ops = need for process/tools",
  "source": "LinkedIn Jobs, Indeed",
  "monitor_method": "Keyword search in job descriptions",
  "custom": true
}
```

### Step 4: Define Negative Signals (Disqualifiers)

**Equally important:** What signals mean "DON'T contact"?

```
NEGATIVE SIGNALS (Disqualifiers)

⛔ Company < 5 employees
   └─ Why: Too small for ICP
   └─ Auto-exclude: Yes

⛔ Recent layoffs announced
   └─ Why: Budget freeze likely
   └─ Auto-exclude: No (flag for review)

⛔ Portfolio company of [Competitor VC]
   └─ Why: Conflict of interest
   └─ Auto-exclude: Yes

⛔ Just signed 3-year contract with [Competitor]
   └─ Why: Locked in, no switching soon
   └─ Auto-exclude: No (monitor for complaints)
```

User can add custom disqualifiers.

### Step 5: Define Monitoring Strategy

For each signal, specify:

**1. Monitoring frequency:**
- Real-time (intent signals, complaints)
- Daily (funding, hiring)
- Weekly (tech stack, growth signals)
- Monthly (industry trends)

**2. Data sources:**
- Which APIs/tools to use
- Backup method if API fails
- Cost per signal (if paid data)

**3. Alert threshold:**
- When to notify (single signal vs multiple signals)
- Score threshold for auto-alert
- Notification channel (email, Slack, CRM)

**Example:**

```json
{
  "signal": "Visited pricing page 3+ times",
  "monitoring": {
    "frequency": "real-time",
    "source": "PostHog event tracking",
    "backup": "GA4 + BigQuery",
    "cost": "$0 (included in PostHog plan)",
    "alert_threshold": {
      "visits": 3,
      "timeframe": "7 days",
      "notify_via": "Slack + CRM tag"
    }
  }
}
```

---

## Step 6: Write signals-to-track.json

**Output format:**

```json
{
  "client": "Example SaaS Inc",
  "generated_date": "2026-02-20",
  "icp_summary": "SaaS companies, 10-50 employees, Series A funded",
  "positive_signals": [
    {
      "id": "signal-001",
      "category": "Trigger",
      "signal": "Posted complaint about Competitor on Twitter",
      "urgency": 10,
      "qualification": 9,
      "score": 95,
      "why": "Active pain, ready to switch",
      "source": "Twitter API, keyword alerts",
      "monitoring": {
        "frequency": "real-time",
        "keywords": ["Competitor", "frustrated with", "looking for alternative"],
        "notify_via": "Slack",
        "auto_enrich": true
      }
    },
    {
      "id": "signal-002",
      "category": "Intent",
      "signal": "Visited pricing page 3+ times in 7 days",
      "urgency": 9,
      "qualification": 10,
      "score": 95,
      "why": "High intent, evaluating",
      "source": "PostHog",
      "monitoring": {
        "frequency": "real-time",
        "threshold": {"visits": 3, "days": 7},
        "notify_via": "CRM tag + Slack",
        "trigger_outreach": true
      }
    }
  ],
  "negative_signals": [
    {
      "id": "disqualifier-001",
      "signal": "Company < 5 employees",
      "why": "Too small for ICP",
      "source": "LinkedIn, Crunchbase",
      "action": "auto-exclude"
    },
    {
      "id": "disqualifier-002",
      "signal": "Recent layoffs",
      "why": "Budget freeze likely",
      "source": "News, LinkedIn posts",
      "action": "flag for review"
    }
  ],
  "total_signals": 10,
  "monitoring_cost_estimate": "$200/month (APIs + tools)"
}
```

**Save to:** `./brand/signals-to-track.json`

**Append to:** `./brand/assets.md`

```markdown
## Signal Detection Setup

Generated: 2026-02-20
Signals defined: 10 positive, 2 negative
Monitoring cost: ~$200/month

Next step: /signal-monitor to start tracking

File: ./brand/signals-to-track.json
```

---

## Step 7: Present Setup Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNAL DETECTION — Setup Complete ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POSITIVE SIGNALS: 10
├─ Intent (3) - Website behavior, content engagement
├─ Company (4) - Funding, hiring, tech stack, growth
└─ Trigger (3) - Complaints, contract renewals, events

NEGATIVE SIGNALS: 2
├─ Auto-exclude (1) - Company too small
└─ Flag for review (1) - Recent layoffs

MONITORING STRATEGY
├─ Real-time: 3 signals (intent, complaints)
├─ Daily: 4 signals (funding, hiring)
└─ Weekly: 3 signals (tech stack, growth)

TOOLS NEEDED
├─ PostHog / GA4 (intent signals)
├─ Crunchbase API (funding)
├─ LinkedIn Jobs scraper (hiring)
├─ BuiltWith / Wappalyzer (tech stack)
└─ Twitter API (social listening)

ESTIMATED COST: $200/month

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILES SAVED

✓ ./brand/signals-to-track.json
✓ ./brand/assets.md (appended)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS

① Start monitoring signals
   → /signal-monitor (reads signals-to-track.json)

② Refine signals based on results
   → Re-run /signal-definition after 30 days

③ Integrate with outreach
   → Hot leads → /outreach-sequence-builder
```

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| ./brand/company-context.json | Product, industry, pain points | Determines relevant signal categories |
| ./brand/icp.json | ICP characteristics | Filters signals by company fit |
| ./brand/ecps.json | Specific buyer personas | Identifies decision-maker hiring signals |
| ./brand/business-model.json | Revenue model, sales process | Informs sales cycle-specific signals |
| ./brand/customer-data.json | Existing customer patterns | Validates which signals historically converted |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| ./brand/signals-to-track.json | Defined signals + monitoring strategy |
| ./brand/assets.md | Append: Signal setup summary |

### Chains to

- `/signal-monitor` - Start monitoring defined signals (consumes signals-to-track.json)
- `/company-finder` - Find companies (filtered by signals)
- `/outreach-sequence-builder` - Create outreach for hot leads

---

## Signal Scoring Framework

**Score formula:** `(Urgency × 0.5) + (Qualification × 0.5) × 10`

- **Urgency** (1-10): ¿Qué tan pronto comprarán?
- **Qualification** (1-10): ¿Qué tan bien fit ICP?

**Priority tiers:**
- **90-100**: Hot lead (contact immediately)
- **70-89**: Warm lead (nurture, monitor)
- **50-69**: Cold lead (long-term nurture)
- **< 50**: Disqualify or wait for stronger signal

**Examples:**

| Signal | Urgency | Qual | Score | Action |
|--------|---------|------|-------|--------|
| Posted competitor complaint | 10 | 9 | 95 | Contact now |
| Downloaded whitepaper | 8 | 9 | 85 | Warm outreach |
| Raised Series A | 6 | 7 | 65 | Long nurture |
| Visited homepage once | 3 | 7 | 50 | Monitor only |

---

## Industry-Specific Signal Templates

### SaaS/Tech Product
- GitHub stars spike (for dev tools)
- API usage spike (for infrastructure)
- Downtime incident (for reliability tools)
- Support ticket volume spike (for support tools)

### Fintech
- Regulatory deadline approaching
- Payment processor change
- Fraud incident publicized
- Cross-border expansion announcement

### E-commerce
- Shopify/WooCommerce tech stack detected
- Launched on new marketplace
- Black Friday prep season (Aug-Sept)
- Inventory system change

### B2B Services
- Client churn mentioned publicly
- Expanding to new vertical
- Rebranding announcement
- Office expansion

---

## Reference Files

- [signal-types.md](references/signal-types.md) - Complete signal catalog (intent, company, trigger, negative)

---

## Frequency

**When to run:**
- **Initial**: When starting outreach strategy (after niche-discovery-100x)
- **Refresh**: Every 90 days (market evolves, ICP shifts)
- **Ad-hoc**: When launching new ECP (different signals per persona)

---

*Define the RIGHT signals. Monitor the RIGHT signals. Reach out at the RIGHT time.*
