---
name: find-instagram-profiles
description: "Find relevant Instagram accounts for a client's niche. Used in Atalaya chat thread atalaya:instagram:{slug}."
context_required:
- brand/{slug}/company-brief/company-brief-current.md
- brand/{slug}/go-to-market/positioning/positioning-current.md
- brand/{slug}/atalaya/config.json
context_writes:
- brand/{slug}/atalaya/config.json
---

# Find Instagram Profiles — Atalaya

> Busca y sugiere cuentas de Instagram relevantes para monitorizar como fuente de inspiración visual y de contenido.

---

## Workflow

### 1. Understand the Niche
Read `company-brief/company-brief-current.md` and `positioning/positioning-current.md` to understand the client's industry, audience, and visual identity.

### 2. Search for Accounts
Use `web_search` to find active Instagram creators:
- Search: `"{industry}" instagram influencers`
- Search: `"{topic}" best instagram accounts`
- Search: `"{niche}" instagram creators reels`
- Search: `"{industry}" instagram carousels educational`

### 3. Evaluate Relevance
For each account, assess:
- Content format (carousels, reels, stories)
- Visual style alignment
- Engagement patterns
- Content themes and posting frequency

### 4. Present Suggestions
Present top 5-10 accounts with:
- @handle
- Content style (carousels, reels, mix)
- Why they're relevant
- Suggested category (Growth, Founder, SEO, AI, Marketing, etc.)

### 5. Add to Config
When user approves, add to `brand/{slug}/atalaya/config.json` under `followed_profiles.instagram` with:
- Generated UUID, `active: true`, `added_at: now`, `posts_monitored: 0`
- URL format: `@handle`

---

## Guidelines
- Focus on accounts with strong **visual content strategy** (carousels, reels)
- Prefer creators over brands — individual creators often have more innovative formats
- Look for educational content creators in the niche
- Max 20 Instagram accounts per client
