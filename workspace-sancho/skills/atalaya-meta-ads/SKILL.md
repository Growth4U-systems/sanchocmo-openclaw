---
name: atalaya-meta-ads
description: "Search Meta Ads Library for competitor ads. Extract full ad copy, creatives, CTAs. Generate adapted ad ideas."
context_required:
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/{slug}/atalaya/ads-scan/meta-YYYY-MM-DD.json
- brand/{slug}/atalaya/ads-pending.json
---

# Atalaya — Meta Ads Library Scan

> Busca en Meta Ads Library los anuncios activos de cada competidor. Extrae copy COMPLETO. Genera ideas de ads adaptadas.

## Workflow

1. Read `brand/{slug}/market-and-us/competitors/sources.json` for competitor names
2. For each competitor, use Apify `facebook-ads-library-scraper`:
   - searchTerm: competitor name
   - adActiveStatus: ACTIVE
   - countries: based on client market (default ES)
   - maxResults: 30
3. Extract per ad: full adCreativeBody, headline, CTA text, platforms (FB/IG/Messenger), start date, impressions range
4. Identify winning patterns:
   - Long-running ads (45+ days) = proven winners
   - Multiple variants = A/B testing
   - Hook structures, creative themes, CTA strategies
5. For each pattern: generate adapted ad idea in our brand voice and positioning
6. Save report to `brand/{slug}/atalaya/ads-scan/meta-YYYY-MM-DD.json`
7. Save ideas to `brand/{slug}/atalaya/ads-pending.json`
8. Present results in chat: ads found per competitor, top patterns, adapted ideas
