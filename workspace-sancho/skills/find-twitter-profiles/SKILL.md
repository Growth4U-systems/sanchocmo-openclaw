---
name: find-twitter-profiles
description: "Find relevant Twitter/X accounts for a client's niche. Used in Atalaya chat thread atalaya:twitter:{slug}."
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/positioning/current.md
- brand/{slug}/atalaya/config.json
context_writes:
- brand/{slug}/atalaya/config.json
---

# Find Twitter/X Profiles — Atalaya

> Busca y sugiere cuentas de X/Twitter relevantes para monitorizar como fuente de inspiración de contenido.

---

## Workflow

### 1. Understand the Niche
Read `company-brief/current.md` and `positioning/current.md` to understand the client's industry, audience, and positioning.

### 2. Search for Accounts
Use `web_search` to find active X/Twitter accounts:
- Search: `"{industry}" "must follow" twitter`
- Search: `"{topic}" twitter influencers list`
- Search: `best "{niche}" accounts x.com`
- Search: `"{industry}" threads site:x.com`

### 3. Evaluate Relevance
For each account, assess:
- Content alignment with client's niche
- Posting frequency and thread usage
- Engagement levels (replies, retweets)
- Audience relevance

### 4. Present Suggestions
Present top 5-10 accounts with:
- @handle
- Why they're relevant
- Content style (threads, hot takes, news, tutorials)
- Suggested category (Growth, Founder, SEO, AI, Marketing, etc.)

### 5. Add to Config
When user approves, add to `brand/{slug}/atalaya/config.json` under `followed_profiles.twitter` with:
- Generated UUID, `active: true`, `added_at: now`, `posts_monitored: 0`
- URL format: `@handle`

---

## Guidelines
- Prefer accounts that create **original content** (not just retweets)
- Look for thread creators — threads provide the richest content for idea extraction
- Mix: industry experts, founders building in public, niche commentators
- Max 25 Twitter accounts per client
