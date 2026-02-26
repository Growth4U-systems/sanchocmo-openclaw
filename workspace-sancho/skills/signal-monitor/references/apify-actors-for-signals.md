# Apify Actors for Signal Monitoring

## Relevant Actors by Signal Type

### 1. LinkedIn Jobs Scraper (Hiring Signals)

**Actor:** `linkedin-jobs-scraper`

**Use for:**
- "Hiring VP Sales" signal
- "Hiring SDRs" signal
- Job posting keyword matching

**Input:**
```json
{
  "searchQuery": "VP Sales OR SDR OR Account Executive",
  "location": "Spain",
  "maxResults": 100,
  "companySize": "10-50 employees"
}
```

**Output:**
```json
{
  "jobs": [
    {
      "title": "VP of Sales",
      "company": "Example Corp",
      "companyUrl": "https://linkedin.com/company/example",
      "location": "Madrid",
      "postedDate": "2026-02-18",
      "description": "We're looking for a VP Sales to scale our SaaS product..."
    }
  ]
}
```

---

### 2. Tech Stack Detector (Tech Stack Signals)

**Actor:** `web-scraper` + BuiltWith data

**Use for:**
- "Implemented Stripe" signal
- "Using Shopify" signal
- Tech stack change detection

**Input:**
```json
{
  "startUrls": [{"url": "https://example.com"}],
  "detectTechnologies": true
}
```

**Output:**
```json
{
  "technologies": {
    "payment": ["Stripe"],
    "analytics": ["Google Analytics", "PostHog"],
    "crm": ["HubSpot"]
  }
}
```

---

### 3. Company Profile Scraper (Company Signals)

**Actor:** `linkedin-company-scraper`

**Use for:**
- Company size changes
- New office locations
- Growth signals

**Input:**
```json
{
  "companyUrl": "https://linkedin.com/company/example",
  "includeEmployees": true
}
```

**Output:**
```json
{
  "company": {
    "name": "Example Corp",
    "industry": "SaaS",
    "size": "25 employees",
    "locations": ["Madrid", "Barcelona"],
    "recentGrowth": "+5 employees last 30 days"
  }
}
```

---

### 4. Twitter Keyword Monitor (Complaints & Trigger Signals)

**Actor:** `twitter-keyword-scraper`

**Use for:**
- "Posted complaint about Competitor" signal
- Frustration keywords
- Alternative searches

**Input:**
```json
{
  "keywords": [
    "frustrated with Competitor",
    "Competitor alternative",
    "looking for better CRM"
  ],
  "language": "en",
  "maxTweets": 100
}
```

**Output:**
```json
{
  "tweets": [
    {
      "text": "@Competitor support is terrible. Looking for alternatives",
      "author": "John Doe",
      "authorProfile": "https://twitter.com/johndoe",
      "timestamp": "2026-02-19T14:30:00Z",
      "engagement": {"likes": 12, "retweets": 3}
    }
  ]
}
```

---

### 5. Review Monitor (Complaints in Reviews)

**Actor:** `g2-reviews-scraper` or `trustpilot-scraper`

**Use for:**
- Competitor review trends
- New negative reviews
- Feature requests in reviews

**Input:**
```json
{
  "productUrl": "https://g2.com/products/competitor/reviews",
  "minRating": 1,
  "maxRating": 3,
  "maxReviews": 50
}
```

**Output:**
```json
{
  "reviews": [
    {
      "rating": 2,
      "title": "Terrible support",
      "text": "Support takes days to respond...",
      "date": "2026-02-15",
      "reviewer": "Marketing Manager",
      "companySize": "50-100 employees"
    }
  ]
}
```

---

## Monitoring Workflow with Apify

### Real-Time Signals (Intent)

**Not Apify** - Use PostHog/GA4 webhooks:
```
PostHog event "pricing_page_visit" (count >= 3)
  → Webhook to SanchoCMO
  → Tag as HOT lead
  → Trigger outreach
```

### Daily Signals (Company + Trigger)

**Apify Actors via cron:**
```javascript
// Daily 6am cron
const signals = await Promise.all([
  // Hiring signals
  apify.run('linkedin-jobs-scraper', {
    searchQuery: signalsConfig.hiring_keywords,
    location: signalsConfig.location
  }),

  // Twitter complaints
  apify.run('twitter-keyword-scraper', {
    keywords: signalsConfig.competitor_complaint_keywords
  }),

  // Review monitoring
  apify.run('g2-reviews-scraper', {
    productUrl: competitor.g2_url,
    minRating: 1,
    maxRating: 3
  })
]);

// Filter + score + enrich
const hotLeads = processSignals(signals);

// Save + alert
await saveToContextLake('./brand/hot-leads.json', hotLeads);
await notifySlack(hotLeads.filter(l => l.score >= 90));
```

### Weekly Signals (Tech Stack, Growth)

**Apify Actors via weekly cron:**
```javascript
// Monday 9am cron
const companies = getICPCompanies(); // From company-finder

for (const company of companies) {
  const profile = await apify.run('linkedin-company-scraper', {
    companyUrl: company.linkedinUrl
  });

  const techStack = await apify.run('web-scraper', {
    startUrls: [{url: company.website}],
    detectTechnologies: true
  });

  // Check for signals
  if (profile.recentGrowth > 0) {
    addSignal('company-growth', company);
  }

  if (techStack.payment.includes('Stripe')) {
    addSignal('tech-stack-match', company);
  }
}
```

---

## Cost Estimates (Apify)

| Signal Type | Actor | Frequency | Cost/Month |
|------------|-------|-----------|------------|
| Hiring (100 jobs) | linkedin-jobs-scraper | Daily | $15 |
| Twitter (1000 tweets) | twitter-keyword-scraper | Daily | $10 |
| Reviews (200 reviews) | g2-reviews-scraper | Weekly | $5 |
| Tech stack (50 sites) | web-scraper | Weekly | $10 |
| Company profiles (50) | linkedin-company-scraper | Weekly | $20 |

**Total:** ~$60/month for comprehensive signal monitoring

---

*Apify MCP = Scalable signal monitoring for web-hosted SanchoCMO.*
