---
name: google-search-console
description: |
  Google Search Console API integration using system Service Account.
  Query search analytics, manage sitemaps, and monitor site performance.
  Uses the SA at .secrets/google-service-account.json — no Maton dependency.
compatibility: Requires .secrets/google-service-account.json and site access granted to SA email
metadata:
  author: Growth4U (adapted from maton)
  version: "2.0"
  clawdbot:
    emoji: 🔍
    requires:
      files:
        - .secrets/google-service-account.json
context_required:
- brand/{slug}/integrations.json
context_writes:
- brand/{slug}/operational/learnings.md
---

# Google Search Console

Access GSC API using our system Service Account (`sancho-analytics@gen-lang-client-0422972889.iam.gserviceaccount.com`).

## Authentication

Uses `.secrets/google-service-account.json` (Service Account). The SA email must have **Full** permission on the GSC property.

**Get access token:**
```bash
python3 scripts/google-api-helper.py --service gsc --action token
```

## Site URL

Read from `brand/{slug}/integrations.json` → `dataSources.gsc.config.SITE_URL`.
Growth4U: `sc-domain:growth4u.io`

Site URLs must be URL-encoded in API paths: `sc-domain%3Agrowth4u.io`

## Common Operations

### List Sites
```bash
python3 scripts/google-api-helper.py --service gsc --action sites
```

### Top Queries (last 28 days)
```bash
python3 scripts/google-api-helper.py --service gsc --action query \
  --slug growth4u --days 28 --dimensions query --limit 25
```

### Top Pages
```bash
python3 scripts/google-api-helper.py --service gsc --action query \
  --slug growth4u --days 28 --dimensions page --limit 25
```

### Daily Performance
```bash
python3 scripts/google-api-helper.py --service gsc --action query \
  --slug growth4u --days 28 --dimensions date
```

### Device Breakdown
```bash
python3 scripts/google-api-helper.py --service gsc --action query \
  --slug growth4u --days 28 --dimensions device
```

### Filtered Query
```bash
python3 scripts/google-api-helper.py --service gsc --action query \
  --slug growth4u --days 28 --dimensions query \
  --filter "query contains growth"
```

## Raw API Access

For custom queries, get a token and call the API directly:

```bash
TOKEN=$(python3 scripts/google-api-helper.py --service gsc --action token)
SITE_URL="sc-domain%3Agrowth4u.io"

# Search Analytics query
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://searchconsole.googleapis.com/webmasters/v3/sites/${SITE_URL}/searchAnalytics/query" \
  -d '{
    "startDate": "2026-02-01",
    "endDate": "2026-03-01",
    "dimensions": ["query"],
    "rowLimit": 25
  }' | python3 -m json.tool
```

## API Reference

### Sites
- `GET /webmasters/v3/sites` — List all sites
- `GET /webmasters/v3/sites/{siteUrl}` — Get site info

### Search Analytics
- `POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query` — Query analytics

### Sitemaps
- `GET /webmasters/v3/sites/{siteUrl}/sitemaps` — List sitemaps
- `PUT /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` — Submit sitemap
- `DELETE /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` — Delete sitemap

## Dimensions
- `query` — Search query
- `page` — Page URL
- `country` — Country code
- `device` — DESKTOP, MOBILE, TABLET
- `date` — Date

## Metrics (returned automatically)
- `clicks` — Number of clicks
- `impressions` — Number of impressions
- `ctr` — Click-through rate (0-1)
- `position` — Average position

## Notes
- Date range limited to 16 months
- Maximum 25,000 rows per request
- Use `startRow` for pagination
- Data has 2-3 day delay
- Site URLs must be URL-encoded in paths

## Resources
- [Search Console API Reference](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
