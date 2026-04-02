---
name: atalaya-linkedin
description: "Scan followed LinkedIn profiles. Extract full post content from thought leaders. Generate adapted content ideas."
context_required:
- brand/{slug}/atalaya/config.json
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/{slug}/atalaya/profiles-scan/linkedin-YYYY-MM-DD.json
- brand/{slug}/atalaya/profiles-pending.json
---

# Atalaya — LinkedIn Profile Scan

> Scrapea perfiles de LinkedIn seguidos. Extrae posts COMPLETOS. Genera ideas adaptadas.

## Workflow

1. Read `brand/{slug}/atalaya/config.json` → `followed_profiles.linkedin` (only `active: true`)
2. For each profile, use Apify `linkedin-posts-scraper` with profile URL, maxPosts=30
3. Extract: full post text, reactions, comments, shares, format (text/image/carousel/video), date
4. Compare with last run in `brand/{slug}/atalaya/profiles-scan/linkedin-*.json`
5. For each new post: identify pattern, generate adapted idea in our brand voice, assign priority
6. Save report to `brand/{slug}/atalaya/profiles-scan/linkedin-YYYY-MM-DD.json`
7. Append ideas to `brand/{slug}/atalaya/profiles-pending.json`
8. Update `posts_monitored` in config.json
9. Present results in chat
