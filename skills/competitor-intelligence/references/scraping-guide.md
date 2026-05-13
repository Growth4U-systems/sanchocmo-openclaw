# Competitor Intelligence — Scraping Guide

> Fuente de verdad para herramientas, plataformas, y sintaxis de scraping.
> Leer en Steps 1, 1.5, y 2.

---

## Step 1: Profile Discovery — Plataformas a buscar

Para cada competidor, buscar presencia en TODAS estas plataformas:

| Plataforma | Qué buscar | Prioridad |
|-----------|-----------|-----------|
| Website | Homepage, /pricing, /about, /blog, /features | 🔴 Obligatorio |
| Instagram | Perfil, bio, posts | 🔴 Obligatorio |
| Facebook | Page, reviews, ads library | 🟡 Recomendado |
| LinkedIn | Company page, employees, posts | 🟡 Recomendado |
| YouTube | Canal, videos, subscribers | 🟡 Recomendado |
| Twitter/X | Perfil, tweets | 🟡 Recomendado |
| TikTok | Perfil, videos | 🟢 Si relevante |
| Trustpilot | Reviews, rating | 🔴 Obligatorio |
| Google Maps | Reviews, rating | 🔴 Si negocio local |
| G2 / Capterra | Reviews, rating | 🔴 Si SaaS |
| App Store / Play Store | Reviews, rating | 🔴 Si tiene app |
| FB Ads Library | Ads activos | 🟡 Recomendado |
| Google Ads Library | Ads activos | 🟡 Recomendado |

Documentar cada URL con status: `active` / `dormant` / `not found`

---

## Step 1.5: Primary Source Verification

**Para CADA competidor directo**, ejecutar estos `web_fetch` ANTES de cualquier scraping:

```
1. web_fetch(homepage_url) 
   → Capturar: tagline, value prop, target audience
   
2. web_fetch(pricing_url)
   → Probar en orden: /pricing, /#Pricing, /plans, /prices, /precios
   → Capturar: tiers, precios, features por tier
   → Si no existe: marcar "⚠️ Pricing no público — verificar manualmente"

3. web_fetch(features_url)
   → Probar: /features, /product, /services, /solutions
   → Capturar: lista de features principales
```

**Reglas inquebrantables:**
- Fuente primaria (web del competidor) > fuente secundaria (artículos, blogs) **SIEMPRE**
- NUNCA usar datos de artículos de terceros como fuente primaria de pricing o features
- Datos de terceros = solo para contrastar o enriquecer, NUNCA como fuente única
- Si un dato viene SOLO de fuente secundaria → marcar: "⚠️ Fuente secundaria — pendiente verificar"

**Output esperado por competidor:**
```
✅ Homepage: [URL] — Posicionamiento: "[tagline/claim]"
✅ Pricing: [URL] — [resumen de tiers/precios]  (o ⚠️ no público)
✅ Features: [URL] — [lista de features principales]
```

---

## Step 2: Scraping con herramientas — Por Lente

### Lens 1 (Autopercepción) — Qué ELLOS dicen

| Herramienta | Qué extraer | Actor/Endpoint |
|------------|-------------|----------------|
| Apify web-scraper | Homepage + /pricing + /about + /blog (últimos 10 posts) | `apify/web-scraper` o `apify/cheerio-scraper` |
| Apify instagram-scraper | Últimos 20 posts + bio + followers + engagement | `apify/instagram-scraper` o `apify/instagram-profile-scraper` |
| Apify facebook-ads-scraper | Ads activos en FB Ads Library | `apify/facebook-ads-scraper` |
| web_fetch | /pricing OBLIGATORIO (verificación directa) | Nativo |

### Lens 2 (Terceros) — Qué OTROS dicen

| Herramienta | Qué extraer | Fuente |
|------------|-------------|--------|
| Serper | SERP results por keywords principales | `$SERPER_API_KEY` — PAA, Related Searches, rankings |
| DataForSEO Keywords | Keywords por las que rankea el competidor | `/v3/keywords_data/google_ads/keywords_for_site/live` |
| DataForSEO SERP | Rankings orgánicos complementarios | `/v3/serp/google/organic/live` |
| Apify backlinks scraper | DA/DR, backlinks, referring domains | Apify actors que scrapean free tools (Ahrefs free checker, Moz free) |
| Apify google-search-scraper | "[nombre] reviews", "[nombre] vs" | `apify/google-search-scraper` |
| web_search | Noticias, press releases, artículos recientes | Nativo |

**Para visibilidad en LLMs / GEO:** No se cubre en esta skill. Usar skill `ai-seo` que hace queries directas a múltiples LLMs (GPT, Claude, Gemini, Perplexity) y trackea menciones de marca, citations y sentiment.

### Lens 3 (Consumidores) — Qué CLIENTES dicen

| Herramienta | Qué extraer | Actor/Fuente |
|------------|-------------|--------------|
| Apify trustpilot-scraper | Últimas 50 reviews + rating | `apify/trustpilot-scraper` |
| web_search | "[nombre] opiniones", "[nombre] experiencia" | Nativo |
| web_search | Reddit, foros sobre el competidor | Nativo |
| web_fetch | Threads relevantes de Reddit/foros | Nativo (fallback) |

---

## APIs disponibles — Referencia rápida

### Serper (SERP + PAA)
```
Auth: Header X-API-KEY → $SERPER_API_KEY
Base URL: https://google.serper.dev

Endpoints:
  POST /search          → SERP orgánico
  POST /search (type: news)  → noticias

Body ejemplo:
  { "q": "keyword", "gl": "es", "hl": "es", "num": 10 }
```

### DataForSEO (Keywords + SERP complementario)
```
Auth: Basic auth → $DATAFORSEO_LOGIN : $DATAFORSEO_PASSWORD
Base URL: https://api.dataforseo.com/v3

Endpoints disponibles (sin mínimo mensual):
  /serp/google/organic/live          → SERP results por keyword
  /keywords_data/google_ads/keywords_for_site/live  → keywords de un dominio
  /on_page/summary                   → análisis on-page

⚠️ Endpoints NO disponibles (requieren $100/mes mínimo):
  /backlinks/*           → Usar Apify actors como alternativa
  
Parámetros siempre:
  location_code: 2724  (España)
  language_code: "es"

Balance: pay-as-you-go, ~$0.01-0.05 por query
```

### Apify — Backlinks (alternativa a DataForSEO Backlinks)
```
Buscar actors en Apify Store para:
  - Ahrefs free backlink checker scraper → DR, backlinks, referring domains
  - Moz free DA checker scraper → DA, PA
  
Usar skill `apify` para la sintaxis exacta de cada actor.
Datos menos completos que API directa pero suficientes para análisis competitivo.
```

---

## Fallbacks

Si un scraper falla:
1. Documentar: qué actor, qué error, qué competidor
2. Usar `web_fetch` como fallback para esa fuente específica
3. **NUNCA marcar ✅ en el checklist si usaste fallback** → marcar ⚠️ con justificación:
   "⚠️ Apify [actor] falló con error [X]. Datos obtenidos vía web_fetch como fallback."
