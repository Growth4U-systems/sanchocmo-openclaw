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
| Apify web-scraper | Homepage + /pricing + /about + /blog (últimos 10 posts) | `apify/web-scraper` |
| Apify instagram-scraper | Últimos 20 posts + bio + followers + engagement | `apify/instagram-scraper` |
| Apify facebook-ads-scraper | Ads activos en FB Ads Library | `apify/facebook-ads-scraper` |
| web_fetch | /pricing OBLIGATORIO (verificación directa) | Nativo |

### Lens 2 (Terceros) — Qué OTROS dicen

| Herramienta | Qué extraer | Endpoint |
|------------|-------------|----------|
| DataForSEO SERP | Rankings por keywords principales | `/v3/serp/google/organic/live` |
| DataForSEO Backlinks | DA, backlinks, referring domains | `/v3/backlinks/summary/live` |
| DataForSEO Keywords | Keywords por las que rankea | `/v3/keywords_data/google_ads/keywords_for_site/live` |
| Apify google-search-scraper | "[nombre] reviews", "[nombre] vs" | `apify/google-search-scraper` |
| web_search | Noticias, press releases, artículos recientes | Nativo |

### Lens 3 (Consumidores) — Qué CLIENTES dicen

| Herramienta | Qué extraer | Actor/Fuente |
|------------|-------------|--------------|
| Apify trustpilot-scraper | Últimas 50 reviews + rating | `apify/trustpilot-scraper` |
| web_search | "[nombre] opiniones", "[nombre] experiencia" | Nativo |
| web_search | Reddit, foros sobre el competidor | Nativo |
| web_fetch | Threads relevantes de Reddit/foros | Nativo (fallback) |

### DataForSEO API — Referencia rápida

```
Auth: Basic auth → $DATAFORSEO_LOGIN : $DATAFORSEO_PASSWORD
Base URL: https://api.dataforseo.com/v3

Endpoints clave:
  /serp/google/organic/live          → SERP results por keyword
  /backlinks/summary/live            → DA, backlinks, referring domains
  /keywords_data/google_ads/keywords_for_site/live  → keywords de un dominio
  /on_page/summary                   → análisis on-page

Parámetros siempre:
  location_code: 2724  (España)
  language_code: "es"

⚠️ Balance limitado (~$35) — usar con moderación: 1-3 queries por competidor
```

Lee el skill `apify` para la sintaxis exacta de cada actor.

---

## Fallbacks

Si un scraper falla:
1. Documentar: qué actor, qué error, qué competidor
2. Usar `web_fetch` como fallback para esa fuente específica
3. **NUNCA marcar ✅ en el checklist si usaste fallback** → marcar ⚠️ con justificación:
   "⚠️ Apify [actor] falló con error [X]. Datos obtenidos vía web_fetch como fallback."
