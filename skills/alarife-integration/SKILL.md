---
name: alarife-integration
description: Integrate SanchoCMO with Alarife LP Factory. Use when creating/managing client websites, landing pages, blog posts, funnels, or syncing Foundation data to Alarife. Triggers on "crear web", "crear landing", "publicar en Alarife", "sync a Alarife", "push to Alarife", "generar página", "landing page", "homepage", "funnel", "blog post en Alarife", or any mention of Alarife in the context of web/content creation.
---

# Alarife Integration Skill

## Overview
Alarife is Growth4U's LP Factory — a multi-tenant platform for pages (homepages, landings, product pages), blog posts, funnels, A/B tests, and legal pages. This skill connects Sancho's Foundation data with Alarife's content API.

## Architecture
```
Sancho (Foundation)           Alarife (Production)
─────────────────            ───────────────────
ECPs, Brand Voice    ──API──►  Client Settings (voice, audience, brand)
Copy, Headlines      ──API──►  Pages (homepage, landing, product, etc.)
Blog topics + text   ──API──►  Blog posts (draft → publish)
CRO suggestions      ──API──►  A/B Experiments
HTML from skills     ──API──►  Import & Publish
```

## ⚠️ CAPABILITY STATUS (updated 2026-03-25 from official API reference)

### ✅ Working
- **Clients**: List, Create
- **Pages** (unified): CRUD + Publish + Preview (categories: homepage, landing, producto, servicio, pricing, about, equipo, contacto, otra)
- **Import**: Quick save, Crawl (SSE), Classify/decompose
- **Blog Posts**: CRUD + Publish
- **Partner LPs**: CRUD + Publish
- **Legal Pages**: CRUD (privacy_policy, terms_of_service, cookie_policy, legal_notice)
- **Funnels**: CRUD + Steps + Publish
- **Experiments**: CRUD + Variants + Start/Stop/Promote
- **Domains**: CRUD (primary, alias, module)
- **Upload Image**: multipart/form-data
- **Auth**: Bearer token `ak_...`

### ❌ NOT Working
- **Public Serving**: Routes `/s/{slug}/{page}` return 404 — frontend serving NOT IMPLEMENTED yet

### ⚠️ CRITICAL: Never Promise Public URLs
Do NOT generate or share URLs like `https://alarife.growth4u.io/s/{slug}/{page}` — they don't work.
Use the **preview endpoint** or direct users to the **admin dashboard**: `https://alarife.growth4u.io/dashboard`

## Configuration

### API Key
- Stored in: `brand/sanchocmo/.env` → `SANCHOCMO_ALARIFE_API_KEY`
- Format: `ak_...` (Bearer token)

### Base URL
- Production: `https://alarife.growth4u.io`

### Read credentials
```bash
KEY=$(grep SANCHOCMO_ALARIFE_API_KEY brand/sanchocmo/.env | cut -d= -f2)
BASE="https://alarife.growth4u.io"
```

## API Reference

> Source of truth: https://github.com/Growth4U-systems/alarife/blob/main/docs/api-reference-sancho.md

### Authentication
```
Authorization: Bearer ak_...
Content-Type: application/json
```

---

### Clients

#### List clients
```
GET /api/clients
→ [{ id, name, slug, domain, ... }]
```

#### Create client
```
POST /api/clients
Body: { "name": "Acme Corp", "slug": "acme-corp" }
```

---

### Pages (UNIFIED endpoint — replaces old /homepages)

⚠️ **IMPORTANT**: All page types use `/api/clients/{clientId}/pages` with a `category` field.
The old `/homepages` endpoint may still work but `/pages` is the canonical API.

#### List pages
```
GET /api/clients/{clientId}/pages
→ [{ id, title, slug, category, status, sections, ... }]
```

#### Create page
```
POST /api/clients/{clientId}/pages
```
```json
{
  "title": "Mi Página",
  "slug": "mi-pagina",
  "category": "homepage",
  "template": "freeform",
  "sections": [
    {
      "type": "raw_html",
      "name": "Contenido principal",
      "config": {
        "html": "<div>...HTML...</div>",
        "css": ".mi-clase { color: red; }",
        "scopeClass": "mi-scope"
      }
    }
  ],
  "status": "draft",
  "metaTitle": "SEO Title",
  "metaDescription": "SEO Description",
  "position": 0
}
```

**Categories**: `homepage`, `landing`, `producto`, `servicio`, `pricing`, `about`, `equipo`, `contacto`, `otra`

**Templates**: `freeform` (HTML libre), `default` (structured sections)

#### Get page
```
GET /api/clients/{clientId}/pages/{pageId}
```

#### Update page (PATCH, not PUT!)
```
PATCH /api/clients/{clientId}/pages/{pageId}
```
All fields optional:
```json
{
  "title": "Nuevo título",
  "slug": "nuevo-slug",
  "category": "landing",
  "sections": [...],
  "status": "published",
  "metaTitle": "...",
  "metaDescription": "..."
}
```

#### Publish page
```
PATCH /api/clients/{clientId}/pages/{pageId}
Body: { "status": "published" }
```

#### Unpublish page
```
PATCH /api/clients/{clientId}/pages/{pageId}
Body: { "status": "draft" }
```

#### Delete page
```
DELETE /api/clients/{clientId}/pages/{pageId}
```

#### Preview page (rendered HTML)
```
GET /api/clients/{clientId}/pages/{pageId}/preview
→ Content-Type: text/html (full rendered page)
```

---

### Import (Quick HTML Import)

#### Import HTML as page
```
POST /api/clients/{clientId}/import/save
```
```json
{
  "detectedType": "page",
  "data": {
    "title": "LP Fitness",
    "slug": "lp-fitness",
    "category": "landing",
    "template": "freeform",
    "sections": [
      {
        "type": "raw_html",
        "name": "Página completa",
        "config": {
          "html": "<!DOCTYPE html>...HTML completo..."
        }
      }
    ]
  }
}
```
**detectedType values**: `page`, `homepage`, `partner_lp`, `blog_post`, `legal_page`

#### Crawl a site
```
POST /api/clients/{clientId}/import/crawl
Body: { "url": "https://example.com" }
→ SSE stream with discovered pages
```

#### Classify/decompose HTML
```
POST /api/clients/{clientId}/import
Body: { "url": "https://example.com/about", "pageType": "auto" }
```

---

### Domains

```
GET    /api/clients/{clientId}/domains
POST   /api/clients/{clientId}/domains       → { "domain": "example.com", "type": "primary" }
PUT    /api/clients/{clientId}/domains/{id}
DELETE /api/clients/{clientId}/domains/{id}
```
Types: `primary` (one only), `alias` (redirects to primary), `module` (subdomain for specific module)

---

### Blog Posts

```
GET    /api/clients/{clientId}/blog-posts
POST   /api/clients/{clientId}/blog-posts
PATCH  /api/clients/{clientId}/blog-posts/{id}
POST   /api/clients/{clientId}/blog-posts/{id}/publish
DELETE /api/clients/{clientId}/blog-posts/{id}
```

#### Create blog post
```json
{
  "title": "Mi Post",
  "slug": "mi-post",
  "content": "# Markdown o HTML",
  "excerpt": "Resumen",
  "category": "marketing",
  "tags": ["seo", "growth"],
  "featuredImage": "https://..."
}
```

---

### Partner Landing Pages

```
GET    /api/clients/{clientId}/partner-lps
POST   /api/clients/{clientId}/partner-lps
PATCH  /api/clients/{clientId}/partner-lps/{id}
DELETE /api/clients/{clientId}/partner-lps/{id}
POST   /api/clients/{clientId}/partner-lps/{id}/publish
```

---

### Legal Pages

```
GET    /api/clients/{clientId}/legal-pages
POST   /api/clients/{clientId}/legal-pages
PATCH  /api/clients/{clientId}/legal-pages/{id}
DELETE /api/clients/{clientId}/legal-pages/{id}
```
Types: `privacy_policy`, `terms_of_service`, `cookie_policy`, `legal_notice`

---

### Funnels

```
GET    /api/clients/{clientId}/funnels
POST   /api/clients/{clientId}/funnels
PATCH  /api/clients/{clientId}/funnels/{id}
DELETE /api/clients/{clientId}/funnels/{id}
POST   /api/clients/{clientId}/funnels/{id}/publish
```

#### Steps
```
GET    /api/clients/{clientId}/funnels/{id}/steps
POST   /api/clients/{clientId}/funnels/{id}/steps
PATCH  /api/clients/{clientId}/funnels/{id}/steps/{stepId}
DELETE /api/clients/{clientId}/funnels/{id}/steps/{stepId}
POST   /api/clients/{clientId}/funnels/{id}/steps/reorder
```

---

### Experiments (A/B Testing)

```
GET    /api/clients/{clientId}/experiments
POST   /api/clients/{clientId}/experiments
PATCH  /api/clients/{clientId}/experiments/{id}
POST   /api/clients/{clientId}/experiments/{id}/start
POST   /api/clients/{clientId}/experiments/{id}/stop
POST   /api/clients/{clientId}/experiments/{id}/promote
```

#### Variants
```
GET    /api/clients/{clientId}/experiments/{id}/variants
POST   /api/clients/{clientId}/experiments/{id}/variants
PATCH  /api/clients/{clientId}/experiments/{id}/variants/{variantId}
DELETE /api/clients/{clientId}/experiments/{id}/variants/{variantId}
```

---

### Utility

#### Health check
```
GET /api/health
```

#### Upload image
```
POST /api/upload-image
Content-Type: multipart/form-data
```

---

## Workflows

### 1. Import HTML Page (most common flow)

**When**: User sends HTML/CSS and wants it in Alarife.

**Steps:**
1. Read the HTML content
2. **Fix broken references** before importing:
   - Local file paths (`file:///C:/...`) → replace with real URLs
   - Broken image paths → replace with Unsplash or client's real images
   - Local font references → replace with CDN/Google Fonts URLs
   - `href="#"` or broken CTAs → replace with client's real URLs
3. Use the **import/save** endpoint (simplest) or create via `/pages`:
   ```
   POST /api/clients/{clientId}/import/save
   {
     "detectedType": "page",
     "data": {
       "title": "Page Title",
       "slug": "page-slug",
       "category": "landing",
       "template": "freeform",
       "sections": [{
         "type": "raw_html",
         "name": "Contenido completo",
         "config": {
           "html": "<extracted body content>",
           "css": "<extracted styles>",
           "scopeClass": "fp-Ab12Cd34"
         }
       }]
     }
   }
   ```
4. Publish: `PATCH /api/clients/{clientId}/pages/{id}` with `{"status": "published"}`
5. Preview: `GET /api/clients/{clientId}/pages/{id}/preview`
6. Confirm to user with **preview link** or **dashboard link**:
   - Preview: `https://alarife.growth4u.io/api/clients/{clientId}/pages/{id}/preview`
   - Dashboard: `https://alarife.growth4u.io/dashboard`

**⚠️ Max 2 messages**: One "working on it" + one "done with result". No narration.

### 2. Sync Foundation → Alarife Client Profile
When Foundation is complete for a client:
1. Read `brand/{slug}/foundation/` files
2. Map to client settings (voice, audience, brand, products)
3. Create or update client

### 3. Create Page from Foundation
1. Read ECPs + brand voice from Foundation
2. Generate copy (headlines, CTAs, body) using copywriting skill
3. Use `template: "freeform"` with `sections: [{type: "raw_html", ...}]`
4. `POST /api/clients/{clientId}/pages` with `category: "landing"` (or appropriate)
5. Publish via PATCH

### 4. Import existing website
1. Use crawl endpoint: `POST /api/clients/{clientId}/import/crawl` with site URL
2. Process SSE stream of discovered pages
3. Save selected pages via `/import/save`

## Error Handling
- `401` → API key invalid or expired
- `403` → Missing scope
- `400` → Validation error (check required fields)
- `404` → Client or resource not found
- `409` → Duplicate (e.g., slug already exists)
- `500` → Server error. Report to Cervantes/Martin.

## Known Clients (verified 2026-03-25)
| Name | ID | Slug |
|---|---|---|
| Paymatico | 7SRxn8rDeE3PWEi-oQjle | paymatico |
| Growth4U | qx52hhSmnqLWi0UC_9cLc | growth4u |
| Test API | QEJ7clelBh0CjIFuc4G40 | test-api-sancho |

## Notes
- **API Reference source of truth**: https://github.com/Growth4U-systems/alarife/blob/main/docs/api-reference-sancho.md
- Alarife URL: https://alarife.growth4u.io
- Admin dashboard: https://alarife.growth4u.io/dashboard
- Repo: github.com/Growth4U-systems/alarife (private)
- Hosting: Hetzner CX23, Helsinki, IP 37.27.22.139
- DB: Neon PostgreSQL
- Public serving NOT IMPLEMENTED — use preview endpoint or dashboard
