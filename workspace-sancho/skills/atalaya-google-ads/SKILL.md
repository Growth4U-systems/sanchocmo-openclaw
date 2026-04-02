---
name: atalaya-google-ads
description: "Search Google Ads Transparency Center for competitor ads. Extract headlines, descriptions. Generate adapted search ad ideas."
context_required:
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/{slug}/atalaya/ads-scan/google-YYYY-MM-DD.json
- brand/{slug}/atalaya/ads-pending.json
---

# Atalaya — Google Ads Library Scan

> Busca en Google Ads Transparency Center los anuncios de cada competidor. Extrae headlines y descriptions. Genera ideas de search ads adaptadas.

## Workflow

1. Read `brand/{slug}/market-and-us/competitors/sources.json` for competitor names and websites
2. For each competitor, search Google Ads Transparency Center:
   - Use Apify `web-scraper` on `https://adstransparency.google.com` with competitor name/domain
   - Or use `web_search` with `site:adstransparency.google.com {competitor_name}`
3. Extract per ad: headlines, descriptions, ad format (search/display/video), date range
4. Identify patterns:
   - Keyword themes they're targeting
   - Headline formulas and benefit claims
   - CTA patterns
   - Display creative themes
5. For each pattern: generate adapted search/display ad idea for our positioning
6. Save report to `brand/{slug}/atalaya/ads-scan/google-YYYY-MM-DD.json`
7. Append ideas to `brand/{slug}/atalaya/ads-pending.json`
8. Present results in chat: ads found per competitor, keyword themes, adapted ideas
