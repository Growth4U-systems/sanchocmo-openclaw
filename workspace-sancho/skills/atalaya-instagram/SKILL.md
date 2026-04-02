---
name: atalaya-instagram
description: "Scan followed Instagram profiles. Extract full post content. Generate adapted content ideas."
context_required:
- brand/{slug}/atalaya/config.json
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/{slug}/atalaya/profiles-scan/instagram-YYYY-MM-DD.json
- brand/{slug}/atalaya/profiles-pending.json
---

# Atalaya — Instagram Profile Scan

> Scrapea perfiles de Instagram seguidos. Extrae posts COMPLETOS. Genera ideas adaptadas.

## Workflow

1. Read `brand/{slug}/atalaya/config.json` → `followed_profiles.instagram` (only `active: true`)
2. For each profile, use Apify `instagram-scraper` with handle, resultsLimit=30
3. Extract: full caption, type (carousel/reel/image), likes, comments, date
4. Compare with last run in `brand/{slug}/atalaya/profiles-scan/instagram-*.json`
5. For each new post: identify pattern (visual style, format, engagement), generate adapted idea, assign priority
6. Save report to `brand/{slug}/atalaya/profiles-scan/instagram-YYYY-MM-DD.json`
7. Append ideas to `brand/{slug}/atalaya/profiles-pending.json`
8. Update `posts_monitored` in config.json
9. Present results in chat
