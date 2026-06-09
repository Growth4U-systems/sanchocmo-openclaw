# Scraping & Research Preflight Protocol

> Antes de scrapear, detecta lo conectado. Antes de declarar una herramienta, comprueba que existe. Si falta y es material, pide conectarla. Anuncia siempre la cobertura real.

**Version:** 1.0 (Jun 9, 2026)
**For:** Toda skill que scrapee web/social o haga research externo (self-intelligence, competitor-intelligence, market-intelligence, thief-marketers, signal-monitor, daily-pulse, …)
**Apply:** Como parte del Step 0, DESPUÉS de `context-hydration-protocol.md` y ANTES del primer scraper o búsqueda.

---

## Principio

Las skills NO deben declarar de forma rígida "usa Apify actor X". Deben **detectar qué providers están realmente conectados** y enrutar cada necesidad de dato al mejor disponible. Si una capability material no tiene ningún provider, **pídele al usuario que lo conecte** (con recomendación), permite que elija otro, y **sé honesto sobre la cobertura** en el output. Una skill que finge scrapear con un actor inexistente produce datos falsos: eso es peor que decir "esto lo hice en modo fallback".

Regla de oro: **preferir SIEMPRE lo que ya está conectado.** Los tiers de pago (Apify/Firecrawl/Serper) solo entran si su key está presente o el usuario lo pide.

---

## Step P1 — Detectar providers disponibles

Comprueba, sin asumir:

| Provider | Cómo detectar | Cubre |
|----------|---------------|-------|
| **scrapecreators MCP** | ¿hay tools `mcp__scrapecreators__*` disponibles? | Social, ads, reviews-via-social, SERP social |
| **DataForSEO MCP** | ¿hay tools `mcp__dataforseo__*` disponibles? | SERP, keywords, rankings, backlinks, on-page, visibilidad LLM |
| **smart-scrape** | siempre disponible (skill) | Páginas web genéricas (cascada web_fetch→Jina→CF→Firecrawl→Apify) |
| **WebSearch / WebFetch** | nativos, siempre ON | Búsqueda y fetch de páginas |
| **/deep-research** | siempre disponible (skill) | Investigación multi-fuente verificada (qa-bot) |
| **Apify** (opcional) | `echo $APIFY_TOKEN` no vacío | Plataformas con login duro, actor Trustpilot |
| **Firecrawl** (opcional) | `echo $FIRECRAWL_API_KEY` no vacío | Scraping stealth de webs que bloquean bots |
| **Serper** (opcional) | `echo $SERPER_API_KEY` no vacío | SERP alternativo (PAA, related) |
| **Cloudflare BR** (opcional) | `echo $CLOUDFLARE_API_TOKEN` no vacío | Browser rendering / crawl multipágina |

Para las keys opcionales puedes escanear `.env` (patrón de `start-here`). Para los MCP, basta con verificar si sus tools aparecen en tu toolset.

---

## Step P2 — Capability report (mostrar al usuario)

Antes de scrapear, presenta un resumen honesto de qué vas a poder hacer y con qué:

```
🔌 Preflight de fuentes
├─ Web (páginas)        ✅ smart-scrape
├─ Social (IG/TikTok/LI) ✅ scrapecreators MCP
├─ Ads (FB/Google)      ✅ scrapecreators MCP
├─ SEO/SERP/keywords    ✅ DataForSEO MCP
├─ Reviews (Trustpilot) ⚠️ fallback web (sin Apify actor)
└─ Deep research        ✅ /deep-research

Cobertura: ALTA. Reviews en modo degradado (lectura de página, no scraper dedicado).
```

Leyenda: ✅ provider conectado · ⚠️ solo fallback degradado · ❌ sin provider (capability bloqueada).

---

## Step P3 — Auto-routing: matriz necesidad → provider

Enruta cada necesidad al **primer provider conectado** de su fila. Si ninguno conecta → Step P4.

| Necesidad de dato | Preferido (conectado) | Fallback | Si nada → ofrecer conectar |
|---|---|---|---|
| Página web (home/pricing/about/blog) | `smart-scrape` | WebFetch nativo | Firecrawl (stealth) |
| Instagram / TikTok / Threads | scrapecreators (`v1_instagram_*`, `v1_tiktok_*`, `v1_threads_*`) | Apify (si key) | scrapecreators (recom.) |
| LinkedIn company / posts | scrapecreators (`v1_linkedin_company`, `v1_linkedin_company_posts`) | Apify | scrapecreators |
| YouTube canal / videos | scrapecreators (`v1_youtube_channel*`, `v1_youtube_video*`) | — | scrapecreators |
| Facebook / Google Ads Library | scrapecreators (`v1_facebook_adLibrary_*`, `v1_google_company_ads`) | Apify fb-ads | scrapecreators |
| Reddit / foros / sentiment | scrapecreators (`v1_reddit_*`) + skill `last30days` | WebSearch | scrapecreators |
| Reviews (Trustpilot/G2/Capterra/stores) | `smart-scrape` + WebFetch | Apify trustpilot actor (si key) | Apify (opcional) |
| SERP / keywords / rankings / backlinks | DataForSEO MCP (`serp_*`, `dataforseo_labs_*`, `backlinks_*`) | Serper (si key) → WebSearch | DataForSEO MCP (recom.) |
| Visibilidad LLM / GEO | DataForSEO `ai_optimization_*` / skill `ai-seo` | pruebas manuales | — |
| Deep research (Market + Company) | skill `/deep-research` | WebSearch + qa-bot inline | — |

> ⚠️ Trustpilot/G2/Capterra **no** están en scrapecreators → van por smart-scrape/WebFetch (o Apify actor si hay key).
> No asumas nombres de tools: usa los `mcp__scrapecreators__*` que realmente tengas disponibles (el catálogo es amplio: TikTok, IG, LinkedIn, YouTube, Reddit, Twitter/X, Threads, Pinterest, Facebook Ad Library, Google Ads).

---

## Step P4 — Pedir conectar (solo si falta una capability material)

Si una necesidad **relevante para esta skill** no tiene ningún provider (ni preferido ni fallback útil), NO la finjas. Pregunta:

```
⚠️ Para [capability X] (ej: scrapear Instagram/TikTok) no tengo ningún provider conectado.
   Recomiendo conectar **scrapecreators** (MCP, cubre social/ads/reviews-social).
   Opciones:
   (a) Conecto scrapecreators  → te guío con /find-mcp
   (b) Uso Apify en su lugar    → necesito $APIFY_TOKEN
   (c) Uso Firecrawl            → necesito $FIRECRAWL_API_KEY
   (d) Sigo SIN esta fuente     → el análisis quedará con gap marcado ⚠️
```

Reglas:
- **Nunca conectes nada tú solo.** Lo pide el usuario; tú ofreces la ruta (`/find-mcp` o link).
- **Permite override**: si el usuario prefiere Firecrawl/Apify a lo recomendado, úsalo.
- **No bloquees todo el análisis** por una sola capability faltante: marca el gap y continúa con el resto.

---

## Step P5 — Anunciar cobertura y marcar evidencia

- Antes de scrapear: anuncia el modo (Step P2).
- En el output: por cada dato, registra **provider + evidencia** (tool call, URL, dataset id), no "se hizo".
- Si un provider preferido falla y caes a fallback → márcalo ⚠️ con la razón. **Nunca marques ✅ si usaste fallback.**

---

## Para el paso de Deep Research (importante)

El research profundo es competencia de **Hamete** (agente Research & Market Intel), cuyo skill núcleo es `/deep-research`. NO existe ninguna herramienta "Gemini Deep Research" en este runtime.

- Cuando una skill pida "Deep Research" → **invoca el skill `/deep-research`** pasando el prompt/brief correspondiente (Market y/o Company). Devuelve documento con fuentes citadas + verificación qa-bot.
- Si la skill ya la ejecuta Hamete, el research es una llamada inline a `/deep-research`. Si la ejecuta otro agente (Sancho), el research se despacha a Hamete (ver `dispatch-protocol.md`).
- Para un pulso social rápido (recencia/comunidad) → skill `last30days` (usa scrapecreators).

---

## Anti-patterns

```
❌ "Ejecuto Apify instagram-scraper" sin comprobar que Apify está conectado.
❌ Llamar a "Gemini Deep Research" (no existe) → usar /deep-research.
❌ Marcar ✅ scraping cuando en realidad caíste a web_fetch.
❌ Bloquear todo el análisis porque falta UN provider.
❌ Asumir nombres de tools de scrapecreators sin verificar el catálogo disponible.

✅ Detectar → reportar cobertura → enrutar a lo conectado → pedir conectar lo que falte → marcar evidencia.
✅ Preferir scrapecreators MCP + DataForSEO MCP + smart-scrape (lo conectado) sobre Apify/Firecrawl (opcionales).
✅ Ser honesto: "social ✅ vía scrapecreators, reviews ⚠️ en fallback".
```
