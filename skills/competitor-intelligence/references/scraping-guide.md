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

> ⚠️ NO hardcodear proveedores. El provider concreto lo decide `_system/skills/scraping-preflight.md`
> (Step 0): detecta lo conectado y enruta cada necesidad por su matriz. Las columnas "Provider"
> de abajo indican la **necesidad de dato** y el provider preferido **si está conectado**; si no,
> el preflight usa el fallback o pide conectar. Marca siempre provider real + evidencia.

### Lens 1 (Autopercepción) — Qué ELLOS dicen

| Necesidad de dato | Qué extraer | Provider preferido (vía matriz) |
|------------|-------------|----------------|
| Web del competidor | Homepage + /pricing + /about + /blog (últimos 10 posts) | `smart-scrape` (cascada web) |
| Instagram / TikTok / LinkedIn | Últimos ~20 posts + bio + followers + engagement | scrapecreators MCP (`v1_instagram_*`, `v1_tiktok_*`, `v1_linkedin_*`) |
| Facebook / Google Ads Library | Ads activos | scrapecreators (`v1_facebook_adLibrary_*`, `v1_google_company_ads`) |
| Pricing (verificación directa) | /pricing OBLIGATORIO | WebFetch nativo (fuente primaria) |

### Lens 2 (Terceros) — Qué OTROS dicen

| Necesidad de dato | Qué extraer | Provider preferido (vía matriz) |
|------------|-------------|--------|
| SERP / rankings | Resultados orgánicos + PAA por keywords principales | DataForSEO MCP (`serp_*`) → fallback Serper (si key) / web_search |
| Keywords del dominio | Keywords por las que rankea el competidor | DataForSEO MCP (`dataforseo_labs_*`) |
| Backlinks | DA/DR, backlinks, referring domains | DataForSEO MCP (`backlinks_*`) si el plan lo cubre; si no, fallback |
| Noticias / menciones | Press releases, artículos recientes | web_search nativo |

**Para visibilidad en LLMs / GEO:** No se cubre en esta skill. Usar skill `ai-seo` (queries directas a GPT, Claude, Gemini, Perplexity) o DataForSEO `ai_optimization_*`.

### Lens 3 (Consumidores) — Qué CLIENTES dicen

| Necesidad de dato | Qué extraer | Provider preferido (vía matriz) |
|------------|-------------|--------------|
| Reviews (Trustpilot/G2/Capterra) | Últimas ~50 reviews + rating | `smart-scrape`/WebFetch (Trustpilot/G2 no están en scrapecreators); Apify trustpilot actor si hay key |
| Reddit / foros | Opiniones, experiencia, threads relevantes | scrapecreators (`v1_reddit_*`) + web_search |
| Opiniones generales | "[nombre] opiniones", "[nombre] experiencia" | web_search → WebFetch (fallback) |

---

## APIs disponibles — Referencia rápida

> La selección de provider la gobierna `_system/skills/scraping-preflight.md`. **Preferido: DataForSEO
> MCP** (`mcp__dataforseo__*`) cuando esté conectado — más simple y sin gestionar auth REST. Lo de
> abajo son los detalles REST/keys de los tiers opcionales, para cuando el preflight caiga a ellos.

### DataForSEO (preferido vía MCP)
```
Preferido: tools mcp__dataforseo__serp_organic_live_advanced / dataforseo_labs_* / backlinks_* / on_page_*
Fallback REST (solo si no hay MCP): Basic auth $DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD, base https://api.dataforseo.com/v3
  /serp/google/organic/live · /keywords_data/google_ads/keywords_for_site/live · /on_page/summary
Parámetros: location_code 2724 (España), language_code "es"
```

### Serper (SERP alternativo — solo si $SERPER_API_KEY presente)
```
Auth: Header X-API-KEY → $SERPER_API_KEY · Base: https://google.serper.dev
POST /search { "q": "keyword", "gl": "es", "hl": "es", "num": 10 }   (type: news → noticias)
```

### Apify (opcional — solo si $APIFY_TOKEN presente)
```
Usar skill `apify` para la sintaxis. Útil para: actor Trustpilot, backlinks (Ahrefs/Moz free checkers),
o plataformas con login duro que el preflight no pueda cubrir con scrapecreators/smart-scrape.
```

---

## Fallbacks

Si un scraper falla:
1. Documentar: qué actor, qué error, qué competidor
2. Usar `web_fetch` como fallback para esa fuente específica
3. **NUNCA marcar ✅ en el checklist si usaste fallback** → marcar ⚠️ con justificación:
   "⚠️ Apify [actor] falló con error [X]. Datos obtenidos vía web_fetch como fallback."
