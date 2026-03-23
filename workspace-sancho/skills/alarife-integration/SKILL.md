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

## Configuration

### API Key
- Stored in: `brand/sanchocmo/.env` → `SANCHOCMO_ALARIFE_API_KEY`
- Also in Mission Control: `brand/sanchocmo/integrations.json` → `alarife`
- Format: `ak_...` (Bearer token)

### Base URL
- Production: `https://alarife.growth4u.io`

### Read credentials
```bash
# Read from brand .env
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
POST   /api/clients/{clientId}/homepages/{id}/publish → Publish
```

### Partner Landing Pages
```
GET    /api/clients/{clientId}/partner-lps
POST   /api/clients/{clientId}/partner-lps         → Create LP
PUT    /api/clients/{clientId}/partner-lps/{id}     → Update
POST   /api/clients/{clientId}/partner-lps/{id}/publish → Publish
```

### Blog Posts
```
GET    /api/clients/{clientId}/blog-posts
POST   /api/clients/{clientId}/blog-posts          → Create post (draft)
PUT    /api/clients/{clientId}/blog-posts/{id}      → Update
POST   /api/clients/{clientId}/blog-posts/{id}/publish → Publish
```

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

### 1. Sync Foundation → Alarife Client Profile
When Foundation is complete for a client:
1. Read `brand/{slug}/foundation/` files (company-context, ecps, brand-voice, positioning)
2. Map to Alarife settings schema (voice, audience, brand, products)
3. `PUT /api/clients/{clientId}/settings` with enriched data

### 2. Create Landing Page from Foundation
1. Read ECPs + brand voice from Foundation
2. Generate copy (headlines, CTAs, body) using copywriting skill
3. `POST /api/clients/{clientId}/homepages` or `/partner-lps`
4. `POST .../publish` when ready

### 3. Blog Content Pipeline
1. Content strategy skill generates topics
2. Copywriting skill generates article
3. `POST /api/clients/{clientId}/blog-posts` (creates draft)
4. Review/edit via Alarife dashboard or API
5. `POST .../publish`

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

## Notes
- Alarife URL: https://alarife.growth4u.io
- Admin dashboard: https://alarife.growth4u.io/dashboard
- Repo: github.com/Growth4U-systems/alarife (private)
- Hosting: Hetzner CX23, Helsinki, IP 37.27.22.139
- DB: Neon PostgreSQL (shared, needs search_path=public on URL)
