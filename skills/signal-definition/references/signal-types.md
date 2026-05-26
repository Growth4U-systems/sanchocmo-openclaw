# Signal Types — Qué Señales Importan

## Intent Signals (High Priority)

**Definition:** Actions that indicate active interest in your product category.

### 1. Content Engagement
- Downloaded whitepaper about [your category]
- Read blog post about [pain point you solve]
- Watched demo video
- Attended webinar
- Subscribed to newsletter

### 2. Website Behavior
- Visited pricing page 2+ times
- Spent 5+ minutes on product page
- Compared plans (viewed multiple tiers)
- Started signup but didn't complete
- Visited from competitor comparison content

### 3. Search Intent
- Searched for "[your category] tool"
- Searched for "[competitor] alternative"
- Searched for "[problem] solution"
- Clicked ad for related keyword

---

## Company Signals (Medium-High Priority)

**Definition:** Changes in company state that create buying windows.

### 1. Funding Events
- Raised Series A/B/C
- Raised seed round
- Announced acquisition
- IPO or SPAC

**Why it matters:** New budget available, pressure to grow, need new tools

### 2. Hiring Signals
- Hiring VP Sales (need CRM, sales tools)
- Hiring Head of Marketing (need marketing tools)
- Hiring Data Analyst (need analytics tools)
- Job posting mentions specific tech stack

**Why it matters:** New department = new budget line, new decision maker

### 3. Tech Stack Changes
- Implemented [tool in your category]
- Removed [competing tool]
- Posted about migration from [old tool]
- Job posting requires [complementary tool]

**Why it matters:** Active evaluation mode, open to alternatives

### 4. Growth Signals
- Opened new office/location
- Launched new product line
- Expanded to new market
- Announced partnership

**Why it matters:** Expansion = need for new infrastructure

---

## Trigger Events (High Priority)

**Definition:** Specific moments that create urgency.

### 1. Competitive Triggers
- Posted complaint about [competing tool] on Twitter
- Left negative review for [competing tool]
- Asked "alternatives to [competing tool]?" on Reddit
- Contract renewal date with [competing tool]

**Why it matters:** Active pain, ready to switch

### 2. Regulatory/Compliance
- New regulation announced (GDPR, HIPAA, SOC2)
- Compliance deadline approaching
- Posted about compliance challenges
- Job posting for Compliance Officer

**Why it matters:** Forced to adopt new tools, budget allocated

### 3. Seasonal/Cyclical
- Q4 budget planning (Sept-Oct)
- New year tool refreshes (Jan)
- Fiscal year start (varies by company)
- Industry event attendance

**Why it matters:** Predictable buying windows

---

## Negative Signals (Disqualifiers)

**Definition:** Signals that a company is NOT a good fit.

### 1. Wrong Stage
- Pre-seed, no funding, < 3 employees
- Enterprise (>10,000 employees) when you serve SMB
- Consumer-focused when you serve B2B

### 2. Wrong Vertical
- Industry outside your ICP
- Geographic region you don't serve
- Regulatory constraints (you can't serve healthcare if not HIPAA compliant)

### 3. Competitive Conflicts
- Portfolio company of competitor's VC
- Public partnership with competitor
- CEO previously worked at competitor

### 4. Timing Signals
- Just signed 3-year contract with competitor
- Recent layoffs (budget freeze)
- Announced hiring freeze
- Posted about cost-cutting initiatives

---

## Signal Sources by Type

| Signal Type | Where to Find It | Tools |
|------------|-----------------|-------|
| **Funding** | Crunchbase, TechCrunch, press releases | Web scraping, APIs |
| **Hiring** | LinkedIn Jobs, company careers page, Indeed | LinkedIn scraper, job board APIs |
| **Tech Stack** | BuiltWith, Wappalyzer, job postings | Tech stack detection tools |
| **Intent** | Your website analytics, content downloads | PostHog, GA4, CRM |
| **Social** | Twitter, LinkedIn posts, Reddit | Social listening, keyword alerts |
| **Complaints** | G2 reviews, Trustpilot, Twitter | Review scraping, social monitoring |
| **Events** | Conference attendance, webinar signups | Event platforms, LinkedIn |

---

## Signal Scoring Framework

Not all signals are equal. Score each signal type:

| Signal | Urgency | Qualification | Score |
|--------|---------|---------------|-------|
| **Posted competitor complaint** | 10 | 9 | 95 |
| **Downloaded your whitepaper** | 8 | 9 | 85 |
| **Raised Series A** | 6 | 7 | 65 |
| **Hiring relevant role** | 7 | 8 | 75 |
| **Visited pricing page 3x** | 9 | 10 | 95 |
| **Tech stack change** | 8 | 8 | 80 |
| **Contract renewal in 90 days** | 9 | 9 | 90 |

**Score formula:** `(Urgency × 0.5) + (Qualification × 0.5) × 10`

- **Urgency** (1-10): How soon will they buy?
- **Qualification** (1-10): How well do they fit ICP?

**Priority tiers:**
- **90-100**: Hot lead (contact immediately)
- **70-89**: Warm lead (nurture, monitor)
- **50-69**: Cold lead (long-term nurture)
- **< 50**: Disqualify or wait for stronger signal

---

## Custom Signals by Industry

### SaaS/Tech
- GitHub stars spike (dev tool)
- API usage spike (infrastructure tool)
- Support ticket volume spike (need better support tool)
- Downtime incidents (need reliability tool)

### Fintech
- Regulatory compliance deadline
- Payment processor change
- Fraud incident
- Cross-border expansion

### E-commerce
- Shopify/WooCommerce detected
- High cart abandonment rate (public data)
- Launched on new marketplace
- Seasonal: Black Friday prep (Aug-Sept)

### B2B Services
- Client churn mentioned (need CRM)
- Hiring SDRs (need sales tools)
- Expanding to new vertical
- Rebranding announcement

---

*Define the RIGHT signals. Monitor the RIGHT signals. Reach out at the RIGHT time.*
