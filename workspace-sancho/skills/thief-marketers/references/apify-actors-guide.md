# Apify Actors Guide — For Thief Marketers

## Apify MCP Server Setup

**URL:** `https://mcp.apify.com/`
**Auth:** OAuth (Apify API token)
**Pricing:** Pay-per-use (see Apify pricing)

**Installation for SanchoCMO:**
```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com/",
      "transport": "http",
      "auth": {
        "type": "oauth",
        "token": "${APIFY_API_TOKEN}"
      }
    }
  }
}
```

---

## Relevant Actors for Thief Marketers

### 1. Facebook Ads Library Scraper

**Actor ID:** `facebook-ads-library-scraper`

**Input:**
```json
{
  "searchTerm": "Competitor Name",
  "countries": ["ES"],
  "adActiveStatus": "ACTIVE",
  "maxResults": 50
}
```

**Output:**
```json
{
  "ads": [
    {
      "adArchiveID": "123456",
      "adCreationTime": "2026-01-15",
      "adCreativeBody": "Struggling with X? Y makes it easy",
      "adCreativeLinkCaption": "Learn More",
      "adCreativeLinkTitle": "Start Free Trial",
      "platforms": ["facebook", "instagram"],
      "impressions": "10K-50K",
      "spend": "€500-€1000",
      "adSnapshot": "https://...jpg"
    }
  ]
}
```

**Use for:**
- Extract ad copy hooks
- Analyze creative themes
- Identify winning CTAs
- Measure ad longevity (creation date)

---

### 2. Instagram Scraper

**Actor ID:** `instagram-scraper`

**Input:**
```json
{
  "username": ["competitor_handle"],
  "resultsLimit": 60,
  "includeEngagement": true
}
```

**Output:**
```json
{
  "posts": [
    {
      "id": "post123",
      "type": "carousel",
      "caption": "How [Client] grew 10x...",
      "timestamp": "2026-02-15T10:00:00Z",
      "likes": 340,
      "comments": 45,
      "url": "https://instagram.com/p/...",
      "mediaUrls": ["https://...jpg"]
    }
  ]
}
```

**Use for:**
- Content calendar analysis
- Format distribution (carousel vs reel vs image)
- Engagement patterns
- Posting cadence

---

### 3. LinkedIn Scraper

**Actor ID:** `linkedin-company-scraper` or `linkedin-posts-scraper`

**Input:**
```json
{
  "companyUrl": "https://linkedin.com/company/competitor",
  "maxPosts": 60
}
```

**Output:**
```json
{
  "posts": [
    {
      "text": "We just launched X! Now you can...",
      "timestamp": "2026-02-10T09:00:00Z",
      "reactions": 127,
      "comments": 23,
      "shares": 12,
      "url": "https://linkedin.com/posts/..."
    }
  ]
}
```

**Use for:**
- Content pillar identification
- B2B content themes
- Professional tone analysis
- Engagement benchmarks

---

### 4. Web Scraper (Universal)

**Actor ID:** `web-scraper`

**Input:**
```json
{
  "startUrls": [
    {"url": "https://competitor.com/changelog"}
  ],
  "pageFunction": "context => context.jQuery('article.changelog-entry').toArray().map(el => ({...}))"
}
```

**Output:**
- Custom structure based on selectors
- HTML parsing
- Multi-page crawling

**Use for:**
- Changelog scraping
- Landing page structure analysis
- Blog content extraction
- Pricing page monitoring

---

### 5. Twitter Scraper

**Actor ID:** `twitter-scraper`

**Input:**
```json
{
  "handles": ["@competitor"],
  "tweetsDesired": 100,
  "includeReplies": false
}
```

**Output:**
```json
{
  "tweets": [
    {
      "text": "Thread: How we scaled from 0 to 10K users...",
      "timestamp": "2026-02-18T14:00:00Z",
      "likes": 89,
      "retweets": 23,
      "replies": 12,
      "isThread": true
    }
  ]
}
```

**Use for:**
- Thread strategy analysis
- Engagement patterns
- Viral content identification
- Real-time marketing

---

## Workflow Example (Apify MCP)

### Step 3A: Facebook Ads Analysis (Updated)

**Instead of:**
```markdown
❌ Navigate to FB Ads Library with Stealth Browser
❌ Scrape with anti-detection
```

**Now:**
```markdown
✅ Call Apify MCP actor: facebook-ads-library-scraper

Input:
  - searchTerm: "Revolut"
  - countries: ["ES"]
  - adActiveStatus: "ACTIVE"

Output: JSON with 50+ active ads
  → Extract patterns (hooks, CTAs, creatives)
  → Generate Content Ideas DB
```

**Cost:** ~$0.10 per competitor analysis (50 ads)

---

## Cost Estimates (Apify Pay-Per-Use)

| Task | Actor | Approx Cost | Frequency |
|------|-------|-------------|-----------|
| FB Ads analysis (1 competitor) | facebook-ads-library-scraper | $0.10 | Monthly |
| Instagram content (60 posts) | instagram-scraper | $0.05 | Monthly |
| LinkedIn content (60 posts) | linkedin-company-scraper | $0.08 | Monthly |
| Changelog scraping | web-scraper | $0.02 | Monthly |

**Total per competitor:** ~$0.25/month
**For 3 competitors:** ~$0.75/month

**Very affordable** for the value.

---

## Integration Code Example

```javascript
// SanchoCMO calls Apify MCP
const apify = mcp.getServer('apify');

// Run Facebook Ads scraper
const adsData = await apify.call('facebook-ads-library-scraper', {
  searchTerm: competitor.name,
  countries: ['ES'],
  adActiveStatus: 'ACTIVE',
  maxResults: 50
});

// Process results
const ideas = extractPatterns(adsData.ads);

// Save to Content Ideas DB
await saveToContextLake('./brand/content-ideas.json', ideas);
```

---

*Apify MCP Server = Remote scraping for web-hosted AI. Perfect for SanchoCMO.*
