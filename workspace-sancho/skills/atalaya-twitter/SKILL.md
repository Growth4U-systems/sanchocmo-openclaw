---
name: atalaya-twitter
description: "Scan followed Twitter/X profiles. Extract full tweet content. Generate adapted content ideas."
context_required:
- brand/{slug}/atalaya/config.json
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/{slug}/atalaya/profiles-scan/twitter-YYYY-MM-DD.json
- brand/{slug}/atalaya/profiles-pending.json
---

# Atalaya — Twitter/X Profile Scan

> Scrapea perfiles de Twitter/X seguidos. Extrae tweets COMPLETOS. Genera ideas adaptadas.

## Workflow

1. Read `brand/{slug}/atalaya/config.json` → `followed_profiles.twitter` (only `active: true`)
2. For each profile, use Apify `twitter-scraper` or X API with handle, tweetsDesired=30
3. Extract: full tweet text, likes, retweets, replies, isThread, date
4. Compare with last run in `brand/{slug}/atalaya/profiles-scan/twitter-*.json`
5. For each new post: identify pattern, generate adapted idea in our brand voice, assign priority
6. Save report to `brand/{slug}/atalaya/profiles-scan/twitter-YYYY-MM-DD.json`
7. Append ideas to `brand/{slug}/atalaya/profiles-pending.json`
8. Update `posts_monitored` in config.json
9. Present results in chat
