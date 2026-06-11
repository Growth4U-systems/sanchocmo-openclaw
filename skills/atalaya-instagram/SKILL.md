---
name: atalaya-instagram
description: "Scan followed Instagram profiles. Extract full post content. Generate adapted content ideas."
context_required:
- brand/{slug}/atalaya/config.json
- brand/{slug}/brand-voice/brand-voice-current.md
- brand/{slug}/go-to-market/ecps/ecps-current.md
- brand/{slug}/content-playbook/writing-guide.md
context_writes:
- brand/{slug}/atalaya/profiles-scan/instagram-YYYY-MM-DD.json
- brand/{slug}/ideas.json
- brand/{slug}/recommendations.json
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
7. Append ideas to `brand/{slug}/ideas.json
- brand/{slug}/recommendations.json`
8. Update `posts_monitored` in config.json
9. Present results in chat

## Content Playbook Enrichment

After completing the scan, if `brand/{slug}/content-playbook/writing-guide.md` exists:

1. **Update hooks**: Add any new hooks detected from scanned profiles to the hooks table for the corresponding platform. Include engagement data.
2. **Update formats**: Add any new effective formats detected. Include engagement benchmarks.
3. **Do NOT change pillar strategy or cadence** — only add new data rows to existing tables.

## Ideas Output

Write ideas as **concrete articles** (not vague topics) to `brand/{slug}/ideas.json` via the ideas API:
- Title: specific, actionable (e.g., "Tu startup tiene producto. No tiene sistema de growth.")
- Keyword: main keyword to target
- Hook: the hook pattern to use
- Pilar: which content pillar this belongs to
- Channel: linkedin, twitter, instagram, blog
- Description: enough detail to start writing (2-3 sentences minimum)
- Inspiration: which profile/post inspired this idea

## Grouped Recommendations

After generating ideas, group them by pillar/theme and write task proposals to `brand/{slug}/recommendations.json`:
- Each task groups 3-10 related ideas
- Title: "Publicar N posts [channel] sobre [theme]"
- Include idea_ids, suggested_project, task_type="content"
