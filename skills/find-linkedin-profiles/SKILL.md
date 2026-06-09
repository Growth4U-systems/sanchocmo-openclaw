---
name: find-linkedin-profiles
description: "Find relevant LinkedIn profiles (thought leaders, influencers, creators) for a client's niche. Used in Atalaya chat thread atalaya:linkedin:{slug}."
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/positioning/positioning.current.md
- brand/{slug}/atalaya/config.json
context_writes:
- brand/{slug}/atalaya/config.json
---

# Find LinkedIn Profiles — Atalaya

> Busca y sugiere perfiles de LinkedIn relevantes para monitorizar como fuente de inspiración de contenido.

---

## Workflow

### 1. Understand the Niche
Read `company-brief/company-brief.current.md` and `positioning/positioning.current.md` to understand:
- Industry and sector
- Target audience (ICPs/ECPs)
- Key topics and themes
- Competitive positioning

### 2. Search for Profiles
Use `web_search` to find LinkedIn thought leaders in the client's niche:
- Search: `"{industry}" "thought leader" site:linkedin.com/in`
- Search: `"{topic}" "creator" linkedin`
- Search: `"{industry}" "top voices" linkedin`
- Search: `best "{niche}" linkedin influencers`

### 3. Evaluate Relevance
For each profile found, assess:
- Content alignment with client's niche
- Posting frequency (active creators preferred)
- Audience overlap with client's target
- Content quality and engagement

### 4. Present Suggestions
Present top 5-10 profiles with:
- Name and LinkedIn URL
- Why they're relevant to this client
- Content themes they cover
- Suggested category (Growth, Founder, SEO, AI, Marketing, etc.)
- Ask user which ones to add

### 5. Add to Config
When user approves, add selected profiles to `brand/{slug}/atalaya/config.json` under `followed_profiles.linkedin` with:
- Generated UUID for `id`
- `active: true`
- `added_at: now`
- `posts_monitored: 0`

---

## Guidelines
- Suggest profiles that produce **content** (not just corporate pages)
- Prefer creators who post regularly (weekly minimum)
- Mix of categories: industry experts, competitors' founders, adjacent niches
- Max 30 LinkedIn profiles per client to keep scan costs manageable
