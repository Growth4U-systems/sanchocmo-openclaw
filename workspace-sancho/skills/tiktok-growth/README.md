# TikTok Growth (Metricool Edition)

**Fork of Larry** — TikTok slideshow automation engine, adapted to use Metricool instead of Postiz.

## What Changed

This is a complete fork of the Larry skill (`skills/larry/`) with the following adaptations:

### ✅ Core Functionality Preserved
- Competitor research (browser-based)
- AI image generation (OpenAI/Stability/Replicate/Local)
- Text overlay system
- TikTok posting automation
- Cross-posting to Instagram/YouTube/Threads
- RevenueCat conversion tracking
- Hook performance tracking
- Daily diagnostic reports with funnel analysis
- Feedback loop (views → conversions → hook iteration)

### 🔄 Key Changes: Postiz → Metricool

#### 1. **Posting System** (`scripts/post-to-tiktok.js`)
- **Before (Postiz):** Direct file upload via FormData
- **After (Metricool):** Requires publicly accessible image URLs
- **Impact:** You must upload slides to a CDN/S3 before posting
- **Setup:** Configure `config.metricool.imageBaseUrl` in config.json

#### 2. **Analytics** (`scripts/check-analytics.js`)
- **Before (Postiz):** Per-post analytics via `/analytics/post/{id}`, manual post-to-video ID linking via `/posts/{id}/release-id`
- **After (Metricool):** Uses `/v2/analytics/posts/tiktok` endpoint (no manual ID linking)
- **Impact:** Analytics only available for posts created via Metricool (not retroactive)

#### 3. **Daily Report** (`scripts/daily-report.js`)
- **Before (Postiz):** Platform-level deltas (follower growth, total views), per-post analytics with release ID matching
- **After (Metricool):** Per-post analytics only (impressions, likes, comments, shares, engagement %)
- **Impact:** No follower growth tracking, no platform-level trend analysis

#### 4. **Config Schema**
```json
// Before (Postiz)
"postiz": {
  "apiKey": "...",
  "integrationId": "..."
}

// After (Metricool)
"metricool": {
  "userToken": "...",
  "userId": "...",
  "blogId": "...",
  "imageBaseUrl": "https://cdn.example.com/tiktok-posts/",
  "timezone": "Europe/Madrid"
}
```

### ⚠️ Limitations vs Postiz

| Feature | Postiz | Metricool |
|---------|--------|-----------|
| File upload | ✅ Direct upload | ❌ Requires public URLs |
| Post-to-video ID linking | ✅ Manual via API | ❌ Not supported |
| Platform-level analytics | ✅ Followers, total views | ❌ Per-post only |
| Retroactive analytics | ✅ Via release ID | ❌ Only Metricool-created posts |
| Analytics granularity | ✅ Per-post + platform | ⚠️ Per-post only |

### 📁 Files Modified

| File | Changes |
|------|---------|
| `_meta.json` | Slug: `larry` → `tiktok-growth` |
| `SKILL.md` | Postiz references → Metricool, added limitations section, updated config schema |
| `scripts/post-to-tiktok.js` | Rewritten to call `skills/metricool/scripts/schedule-post.js`, added image URL requirement |
| `scripts/check-analytics.js` | Rewritten to use Metricool `/v2/analytics/posts/tiktok` endpoint |
| `scripts/daily-report.js` | Analytics source: Postiz API → Metricool API, removed platform-level deltas |
| `scripts/onboarding.js` | Config template: `postiz` → `metricool` |

### 🔧 Setup Requirements

Before using this skill:

1. **Sign up for Metricool** at https://metricool.com
2. **Connect TikTok** in Metricool dashboard
3. **Get credentials:**
   - User token (X-Mc-Auth header)
   - User ID
   - Blog ID (brand/account ID)
4. **Set up image hosting:**
   - Option A: CloudFlare R2 (recommended, free tier)
   - Option B: Amazon S3
   - Option C: Your own web server
5. **Configure imageBaseUrl** in `config.json`

### 📖 Full Documentation

See `SKILL.md` for complete usage, onboarding flow, and all features.

---

## Why This Fork Exists

Martin wanted to use Larry but with Metricool instead of Postiz. This fork preserves all of Larry's intelligence (feedback loop, hook tracking, diagnostic framework, RevenueCat integration) while adapting the posting and analytics systems to Metricool's API.

**Use Larry (Postiz)** if: You need follower growth tracking, automatic post-to-video ID matching, or platform-level analytics.

**Use this (Metricool)** if: You already use Metricool, want multi-platform scheduling in one tool, or don't need platform-level growth tracking.

---

**Original Larry:** `skills/larry/`  
**Metricool skill:** `skills/metricool/`  
**Metricool adapter:** `skills/metrics-collector/scripts/adapters/metricool.js`
