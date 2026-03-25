---
name: alarife-integration
description: Integrate SanchoCMO with Alarife LP Factory. Use when creating/managing client websites, landing pages, blog posts, funnels, or syncing Foundation data to Alarife. Triggers on "crear web", "crear landing", "publicar en Alarife", "sync a Alarife", "push to Alarife", "generar página", "landing page", "homepage", "funnel", "blog post en Alarife", or any mention of Alarife in the context of web/content creation.
---

# Alarife Integration Skill

## Overview
Alarife is Growth4U's LP Factory — a multi-tenant platform for landing pages, homepages, blog posts, pSEO pages, funnels, and A/B tests. This skill connects Sancho's Foundation data with Alarife's content creation API.

## Architecture
```
Sancho (Foundation)           Alarife (Production)
─────────────────            ───────────────────
ECPs, Brand Voice    ──API──►  Client Settings (voice, audience, brand)
Copy, Headlines      ──API──►  Homepage / Landing Page content
Blog topics + text   ──API──►  Blog posts (draft → publish)
CRO suggestions      ──API──►  A/B Experiments
```

## ⚠️ CAPABILITY STATUS (verified 2026-03-25)

### ✅ Working
- **Clients**: List, Create, Update settings
- **Homepages**: CRUD + Publish (freeform + default templates)
- **Partner LPs**: CRUD + Publish
- **Funnels**: CRUD + Publish
- **pSEO Pages**: CRUD + Publish
- **Experiments**: CRUD + Start/Stop/Promote
- **Legal Pages**: CRUD
- **Auth**: Bearer token `ak_...`

### ❌ NOT Working
- **Blog Posts**: API returns 500 (broken endpoint)
- **Public Serving**: Routes `/s/{slug}/{page}` return 404 — frontend serving NOT IMPLEMENTED yet

### ⚠️ CRITICAL: Never Promise Public URLs
Do NOT generate or share URLs like `https://alarife.growth4u.io/s/{slug}/{page}` — they don't work.
Direct users to the **admin dashboard** instead: `https://alarife.growth4u.io/dashboard`

## Configuration

### API Key
- Stored in: `brand/sanchocmo/.env` → `SANCHOCMO_ALARIFE_API_KEY`
- Also in Mission Control: `brand/sanchocmo/integrations.json` → `alarife`
- Format: `ak_...` (Bearer token)

### Base URL
- Production: `https://alarife.growth4u.io`

### Read credentials
```bash
KEY=$(grep SANCHOCMO_ALARIFE_API_KEY brand/sanchocmo/.env | cut -d= -f2)
BASE="https://alarife.growth4u.io"
```

## API Reference

### Authentication
All requests use Bearer token:
```
Authorization: Bearer ak_...
```

### Clients

#### List clients
```
GET /api/clients
→ [{id, name, slug, domain, logoUrl, createdAt}]
```

#### Create client
```
POST /api/clients
Body: {name, slug, locale: "es"|"en"|"pt", currency: "EUR", timezone: "Europe/Madrid", domain?, logoUrl?, company?, brand?, voice?, products?, audience?}
→ {id, name, slug, ...}
```

#### Update client settings (profile enrichment)
```
PUT /api/clients/{clientId}/settings
Body: {theme?, company?, brand?, voice?, products?, audience?, routing?}
→ {success: true, settings: {...}}
```

### Client Settings Schema (for Foundation sync)

#### voice
```json
{
  "tone": ["profesional", "cercano"],
  "style": "Directo, orientado a datos",
  "tagline": "Tu CMO con IA",
  "doList": ["Usar datos", "Ser directo"],
  "dontList": ["Jerga técnica sin explicar"],
  "sampleCopy": "Ejemplo de copy en la voz de marca"
}
```

#### audience
```json
{
  "description": "CMOs y founders de startups B2B",
  "demographics": "25-45, urbano, tech-savvy",
  "painPoints": ["No saben qué medir", "Sin tiempo"],
  "motivations": ["Crecer rápido", "Datos claros"],
  "objections": ["¿Es fiable una IA para marketing?"]
}
```

#### brand
```json
{
  "colors": {"primary": "#C45D35", "secondary": "#1A1A2E", "accent": "#F2C94C", "background": "#F5F0E6", "foreground": "#1A1A2E"},
  "fonts": {"heading": "Space Grotesk", "body": "Nunito"},
  "logoDarkUrl": "https://...",
  "faviconUrl": "https://...",
  "ogImageUrl": "https://..."
}
```

#### products
```json
{
  "items": [
    {
      "name": "SanchoCMO Pro",
      "description": "CMO con IA para tu startup",
      "features": ["Foundation", "Content", "Analytics"],
      "price": "€200/mes",
      "ctaText": "Empezar",
      "ctaUrl": "https://...",
      "highlighted": true
    }
  ]
}
```

### Homepages

```
GET    /api/clients/{clientId}/homepages
POST   /api/clients/{clientId}/homepages          → Create homepage
PUT    /api/clients/{clientId}/homepages/{id}      → Update
DELETE /api/clients/{clientId}/homepages/{id}      → Delete
POST   /api/clients/{clientId}/homepages/{id}/publish → Publish
```

#### Homepage Templates

**Two template types verified:**

##### 1. `freeform` — Raw HTML/CSS (for importing existing pages)
```json
{
  "title": "Mi Página",
  "slug": "mi-pagina",
  "template": "freeform",
  "sections": [
    {
      "type": "raw_html",
      "config": {
        "html": "<section>...</section>",
        "css": ".my-class { color: red; }",
        "scopeClass": "fp-UniqueId123"
      }
    }
  ],
  "metaTitle": "SEO Title",
  "metaDescription": "SEO description",
  "ogImage": "https://..."
}
```

##### 2. `default` — Structured sections
```json
{
  "title": "Mi Página",
  "template": "default",
  "sections": [
    {"type": "hero", "config": {"title": "...", "subtitle": "...", "ctaText": "...", "ctaHref": "#", "bgColor": "#..."}},
    {"type": "features", "config": {"heading": "...", "columns": 3, "items": [...]}},
    {"type": "cta", "config": {"heading": "...", "subheading": "...", "ctaText": "...", "ctaHref": "#", "bgColor": "#..."}}
  ]
}
```

⚠️ **IMPORTANT**: HTML and CSS go INSIDE `sections[].config`, NOT as top-level fields. Using top-level `html`/`css` fields will save an empty page.

### Partner Landing Pages
```
GET    /api/clients/{clientId}/partner-lps
POST   /api/clients/{clientId}/partner-lps         → Create LP
PUT    /api/clients/{clientId}/partner-lps/{id}     → Update
POST   /api/clients/{clientId}/partner-lps/{id}/publish → Publish
```

### Blog Posts ⚠️ BROKEN
```
GET    /api/clients/{clientId}/blog-posts          → ❌ Returns 500
POST   /api/clients/{clientId}/blog-posts          → ❌ Untested (endpoint likely broken)
```
**Status**: Blog endpoint returns Internal Server Error. Escalate to Cervantes/Martin for fix.

### Funnels
```
GET    /api/clients/{clientId}/funnels
POST   /api/clients/{clientId}/funnels             → Create funnel
PUT    /api/clients/{clientId}/funnels/{id}         → Update
POST   /api/clients/{clientId}/funnels/{id}/publish → Publish
GET    /api/clients/{clientId}/funnels/{id}/steps   → List steps
POST   /api/clients/{clientId}/funnels/{id}/steps   → Add step
```

### pSEO Pages
```
GET    /api/clients/{clientId}/pseo-pages
POST   /api/clients/{clientId}/pseo-pages          → Create page
PUT    /api/clients/{clientId}/pseo-pages/{id}      → Update
POST   /api/clients/{clientId}/pseo-pages/{id}/publish → Publish
```

### pSEO Entities (competitors/categories)
```
GET    /api/clients/{clientId}/pseo-entities
POST   /api/clients/{clientId}/pseo-entities       → Create entity
PUT    /api/clients/{clientId}/pseo-entities/{id}   → Update
```

### Experiments (A/B Tests)
```
GET    /api/clients/{clientId}/experiments
POST   /api/clients/{clientId}/experiments          → Create experiment
POST   /api/clients/{clientId}/experiments/{id}/start → Start
POST   /api/clients/{clientId}/experiments/{id}/stop  → Stop
POST   /api/clients/{clientId}/experiments/{id}/promote → Promote winner
```

### Legal Pages
```
GET    /api/clients/{clientId}/legal-pages
POST   /api/clients/{clientId}/legal-pages         → Create
PUT    /api/clients/{clientId}/legal-pages/{id}     → Update
```

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
3. Separate HTML (body content) from CSS (style blocks)
4. Generate a unique `scopeClass` (e.g., `fp-` + random 8 chars)
5. Create the homepage:
   ```json
   POST /api/clients/{clientId}/homepages
   {
     "title": "Page Title",
     "slug": "page-slug",
     "template": "freeform",
     "sections": [{
       "type": "raw_html",
       "config": {
         "html": "<extracted body content>",
         "css": "<extracted styles>",
         "scopeClass": "fp-Ab12Cd34"
       }
     }],
     "metaTitle": "SEO Title",
     "metaDescription": "SEO Description"
   }
   ```
6. Publish: `POST /api/clients/{clientId}/homepages/{id}/publish`
7. Confirm to user with **dashboard link** (NOT public URL):
   - `https://alarife.growth4u.io/dashboard` → navigate to client → homepages

**⚠️ Max 2 messages**: One "working on it" + one "done with result". No narration.

### 2. Sync Foundation → Alarife Client Profile
When Foundation is complete for a client:
1. Read `brand/{slug}/foundation/` files (company-context, ecps, brand-voice, positioning)
2. Map to Alarife settings schema (voice, audience, brand, products)
3. `PUT /api/clients/{clientId}/settings` with enriched data

### 3. Create Landing Page from Foundation
1. Read ECPs + brand voice from Foundation
2. Generate copy (headlines, CTAs, body) using copywriting skill
3. Use `template: "freeform"` with `sections: [{type: "raw_html", ...}]`
4. `POST /api/clients/{clientId}/homepages` or `/partner-lps`
5. `POST .../publish` when ready

### 4. pSEO at Scale
1. Identify competitors via competitor-intelligence skill
2. `POST /api/clients/{clientId}/pseo-entities` for each competitor/category
3. Alarife auto-generates comparison and category pages
4. Publish in bulk

## Error Handling
- `401` → API key invalid or expired. Check `brand/sanchocmo/.env`
- `403` → Missing scope. Verify API key has all scopes in Alarife dashboard
- `400` → Validation error. Check required fields.
- `404` → Client or resource not found. Verify clientId.
- `409` → Duplicate (e.g., slug already exists)
- `500` → Server error (known issue with blog-posts endpoint). Report to Cervantes.

## Known Clients (verified 2026-03-25)
| Name | ID | Slug |
|---|---|---|
| Growth4U | qx52hhSmnqLWi0UC_9cLc | growth4u |
| Paymatico | 7SRxn8rDeE3PWEi-oQjle | paymatico |
| Test API | QEJ7clelBh0CjIFuc4G40 | test-api-sancho |

## Notes
- Alarife URL: https://alarife.growth4u.io
- Admin dashboard: https://alarife.growth4u.io/dashboard
- Repo: github.com/Growth4U-systems/alarife (private)
- Hosting: Hetzner CX23, Helsinki, IP 37.27.22.139
- DB: Neon PostgreSQL (shared, needs search_path=public on URL)
- Public serving NOT IMPLEMENTED — do not promise `/s/{slug}/{page}` URLs
