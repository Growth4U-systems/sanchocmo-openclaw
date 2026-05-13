# Monitoring Tools & Data Sources

## Intent Signals (Website Behavior)

### PostHog
**What it tracks:**
- Page visits (pricing, features, demo)
- Event tracking (button clicks, form starts)
- Session recordings
- Funnel analytics

**API:** Yes - https://posthog.com/docs/api
**Cost:** Free tier: 1M events/month
**Setup:** JS snippet on website

### Google Analytics 4 (GA4)
**What it tracks:**
- Page views
- Events (configured)
- Conversion funnels
- User demographics

**API:** Yes - Google Analytics Data API
**Cost:** Free
**Setup:** GA4 tag on website

**Export to BigQuery:**
- Real-time querying
- Custom signal detection
- Cross-reference with CRM

---

## Company Signals

### Crunchbase (Funding)
**What it tracks:**
- Funding rounds (seed, Series A/B/C)
- Acquisitions
- IPOs
- Investor info

**API:** Yes - Enterprise tier
**Cost:** $29/month (Starter) to $99/month (Pro)
**Alternative:** TechCrunch RSS, web scraping

### LinkedIn (Hiring & Company Info)
**What it tracks:**
- Job postings
- Company size changes
- New office locations
- Employee count growth

**API:** Official API (limited), scraping (risky)
**Cost:** Free (scraping), Paid (official API)
**Tools:**
- Phantom Buster (LinkedIn scraper)
- Apify (LinkedIn actors)
- Manual: Stealth Browser MCP

### BuiltWith / Wappalyzer (Tech Stack)
**What it tracks:**
- Technologies used on website
- E-commerce platforms
- Analytics tools
- CRM/Marketing stack

**API:** Yes (BuiltWith)
**Cost:** BuiltWith $295/month, Wappalyzer free tier
**Alternative:** Manual browser extension

---

## Trigger Signals

### Twitter/X (Complaints, Mentions)
**What it tracks:**
- Mentions of competitors
- Complaints about tools
- Questions about alternatives
- Industry discussions

**API:** Official API (paid), scraping (limited)
**Cost:** Twitter API: $100/month (Basic)
**Tools:**
- Twitter search: `"[competitor]" + "frustrated"`
- Keyword alerts (manual)

### G2 / Trustpilot / Capterra (Reviews)
**What it tracks:**
- New reviews for competitors
- Rating changes
- Complaint themes

**API:** Limited (G2 has API for verified vendors)
**Cost:** Free (scraping), Paid (API)
**Tools:**
- Review scraping scripts
- RSS feeds (if available)
- Manual checks

---

## Event Signals

### Conference Attendance
**What it tracks:**
- Who attended industry conferences
- Sponsor lists
- Speaker lineups

**Sources:**
- Conference websites
- LinkedIn posts (attendees tagging event)
- Event platforms (Hopin, Eventbrite)

---

## Monitoring Workflow by Signal Type

### Real-Time Signals (Immediate Alert)
**Signals:**
- Visited pricing page 3+ times
- Posted competitor complaint on Twitter
- Started signup but abandoned

**Workflow:**
1. PostHog/GA4 webhook → Zapier → Slack
2. Twitter keyword alert → Slack
3. Auto-enrich contact (email, LinkedIn)
4. Notify sales team
5. Trigger outreach sequence

### Daily Signals (Morning Digest)
**Signals:**
- Funding announcements
- Job postings
- Tech stack changes

**Workflow:**
1. Daily cron job (6am)
2. Query APIs: Crunchbase, LinkedIn, BuiltWith
3. Filter by ICP criteria
4. Score each signal
5. Email digest to sales team
6. Add to CRM as "Hot Lead" if score > 80

### Weekly Signals (Review & Prioritize)
**Signals:**
- Review trends (G2, Trustpilot)
- Social media engagement
- Industry news

**Workflow:**
1. Weekly cron job (Monday 9am)
2. Aggregate signals from past 7 days
3. Identify top 20 companies by signal score
4. Sales team reviews and selects targets
5. Assign to outreach sequences

---

## Output Format (Per Signal Detection)

```json
{
  "signal_detected": "Raised Series A funding",
  "company": {
    "name": "Example Corp",
    "domain": "example.com",
    "industry": "SaaS",
    "size": "25 employees",
    "icp_match": true
  },
  "signal_details": {
    "type": "Company - Funding",
    "amount": "$5M Series A",
    "investors": ["Accel", "Sequoia"],
    "announced_date": "2026-02-15",
    "source": "Crunchbase",
    "source_url": "https://crunchbase.com/..."
  },
  "scoring": {
    "urgency": 6,
    "qualification": 9,
    "score": 75,
    "tier": "Warm Lead"
  },
  "enrichment": {
    "decision_maker": "John Doe, VP Sales",
    "email": "john@example.com",
    "linkedin": "linkedin.com/in/johndoe"
  },
  "recommended_action": {
    "action": "Warm outreach",
    "sequence": "Series A Funding Congrats",
    "timing": "Within 7 days",
    "message_angle": "Congrats on funding! As you scale sales, here's how [Product] helps"
  }
}
```

---

## Cost Estimate by Tool Stack

### Minimal Stack ($50/month)
- PostHog Free tier (intent signals)
- Crunchbase Starter $29 (funding)
- Manual LinkedIn scraping (hiring)
- Twitter search (manual, free)

### Standard Stack ($300/month)
- PostHog $20 (2M events)
- Crunchbase Pro $99
- LinkedIn scraper (Phantom $60)
- Twitter API Basic $100
- BuiltWith $295 (or Wappalyzer free)

### Enterprise Stack ($1,000+/month)
- PostHog $99+ (10M+ events)
- Crunchbase Enterprise $500+
- ZoomInfo $250+ (B2B data)
- LinkedIn Sales Navigator $80/seat
- Full social listening (Brandwatch, $500+)

**Recommendation:** Start Minimal, upgrade based on pipeline ROI.

---

*The right tools make signal monitoring scalable. Start simple, compound over time.*
