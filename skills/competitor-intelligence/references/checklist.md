# Competitor Intelligence — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## STORYTELLING (OBLIGATORIO)

- [ ] **Executive Narrative** existe al principio del documento (antes de todo)
  - ✅ 1 página máximo, narrativa pura, CERO tablas
  - ✅ Estructura: ¿Quiénes son los jugadores? → ¿Cómo compiten? → ¿Dónde están las oportunidades?
  - ✅ Quien lea solo esto entiende el 80% del panorama competitivo

- [ ] **Cada Battle Card tiene apertura narrativa** (2-3 párrafos antes de la ficha)
  - ✅ "¿Quién es [Competidor] en el contexto del mercado?"
  - ✅ "¿Por qué son relevantes como competidor?"
  - ✅ "¿Qué rol juegan en el panorama?"

- [ ] **Cada Battle Card tiene cierre interpretativo**
  - ✅ Párrafo "So what?" después de la ficha estructurada
  - ✅ ¿Qué significa su estrategia? ¿Qué hacen bien/mal?

- [ ] **How to Beat Them tiene rationale**
  - ✅ Cada táctica incluye "Por qué esto es explotable"
  - ✅ No solo qué hacer, sino por qué funcionará

- [ ] **Competitive Landscape tiene storytelling completo**
  - ✅ Apertura narrativa del landscape ("Cuando vemos el campo completo...")
  - ✅ Cada componente (table, map, heatmap) tiene contexto antes + interpretación después
  - ✅ Feature heatmap con análisis de white space
  - ✅ Growth model con "¿qué modelos están infrautilizados?"
  - ✅ Pricing landscape con implicaciones estratégicas
  - ✅ Cross-Competitor Opportunities (síntesis narrativa final)

- [ ] **Cierre final** del documento
  - ✅ Párrafo conclusivo: "En este panorama competitivo, nuestra mejor jugada es..."
  - ✅ Explica por qué esa estrategia aprovecha los gaps identificados

- [ ] **Tono de presentación**
  - ✅ Escrito para CEO/equipo de producto, no para analista
  - ✅ "Esto significa que podemos...", "El gap más claro es...", "La amenaza principal es..."
  - ✅ Evita lenguaje de análisis competitivo genérico

---

## Step 0: Competitor Discovery

- [ ] **3-5 competidores directos** identificados con URLs
- [ ] **2-3 competidores indirectos** identificados
- [ ] **1-2 competidores emergentes** identificados (o marcados "ninguno detectado")
- [ ] **Categorización completa** (Direct/Indirect/Emerging por cada uno)
- [ ] **Tiers asignados** (A weekly / B monthly / C quarterly)

## Steps 1-4: Per-Competitor Deep Dive (por cada competidor directo)

### Profile Discovery (Step 1)
- [ ] **Todas las plataformas checkeadas** (Social, Reviews, App Stores, Website, Paid Ads)
- [ ] **URLs documentadas** con status (active/dormant/not found)

### Primary Source Verification (Step 1.5) — OBLIGATORIO
- [ ] **web_fetch(homepage)** ejecutado para cada competidor directo → posicionamiento REAL capturado
- [ ] **web_fetch(/pricing)** ejecutado para cada competidor directo → pricing REAL capturado (o ⚠️ "no público")
  - Si /pricing no existe, se probó: /#Pricing, /plans, /prices, /precios
- [ ] **web_fetch(/features o /product o /services)** ejecutado → features REALES capturados
- [ ] **Cada precio citado viene de fuente primaria** (web del competidor, NO de artículos de terceros)
- [ ] **Ningún dato de pricing/features viene SOLO de una fuente secundaria** (artículo, blog de terceros)
  - Si un dato viene de fuente secundaria → marcado como "⚠️ Fuente secundaria — pendiente verificar en web del competidor"
- [ ] **Regla verificada:** Fuente primaria > fuente secundaria SIEMPRE

### Scraping (Step 2) — VERIFICACIÓN DE PROVIDER OBLIGATORIA (vía preflight)
- [ ] **Preflight ejecutado** (`scraping-preflight.md`) → capability report mostrado (qué provider cubre cada necesidad)
- [ ] **Web del competidor scrapeada** (homepage + pricing + about) con el provider del preflight (smart-scrape/WebFetch) — anotar provider + URL/evidencia
- [ ] **Social scrapeado** (IG/TikTok/LinkedIn) con el provider conectado (scrapecreators MCP / Apify) — anotar tool + dataset/respuesta
- [ ] **Reviews recopiladas** (Trustpilot/G2/foros) — anotar provider (smart-scrape/Apify) + evidencia
- [ ] **SERP/keywords/backlinks** vía DataForSEO MCP (o fallback) para dominios directos — anotar tool/endpoint
- [ ] **Ads Library consultada** (scrapecreators `facebook_adLibrary_*`/`google_company_ads` o browser) — datos extraídos
- [ ] Si un provider preferido falló → marcar ⚠️ con razón ("scrapecreators IG devolvió vacío, usé WebFetch como fallback")
- [ ] **PROHIBIDO marcar ✅ con un provider de fallback** cuando el preferido estaba disponible — eso es ⚠️ con justificación, NUNCA ✅
- [ ] **Lens 1 data recopilada** (homepage, producto, pricing, social posts, ads)
- [ ] **Lens 2 data recopilada** (influencers, artículos, backlinks, SEO)
- [ ] **Lens 3 data recopilada** (reviews, comentarios, foros, Reddit)

### Deep Research (Step 3)
- [ ] **Background investigado** (fundación, funding, equipo, trayectoria)
- [ ] **Growth model inferido** (cómo adquieren clientes)
- [ ] **Datos financieros** documentados (o marcados "no disponibles públicamente")

### Lens Analysis (Step 4)
- [ ] **Lens 1 Autopercepción** analizada (value prop, positioning, pricing, features, contenido, ads)
- [ ] **Lens 2 Terceros** analizada (SEO, media, narrative externa)
- [ ] **Lens 3 Consumidor** analizada (sentiment, pros, cons, migración, unmet needs)
- [ ] **Conflictos entre lenses** identificados y resueltos (Lens 3 > Lens 2 > Lens 1)

## Step 5: Battle Cards

- [ ] **Battle Card generada** por cada competidor directo
- [ ] **Quick Profile** completo (fundación, HQ, equipo, funding, growth model)
- [ ] **Positioning** documentado (claim, target, features, pricing)
- [ ] **External Perception** documentada (media, SEO, reconocimiento)
- [ ] **Customer Reality** documentada (rating, love, hate, unmet needs)
- [ ] **Lens Conflicts** identificados (vulnerabilidades)
- [ ] **How to Beat Them** articulado (weakness/strength, positioning angle, talking points)
- [ ] **Monitoring Triggers** definidos

## Step 6: Competitive Landscape Map

- [ ] **Competitor Overview Table** generada (todos en una página)
- [ ] **Positioning Map 2x2** generado (ejes relevantes para el mercado)
- [ ] **Feature Heatmap** generado (features × competidores)
- [ ] **Growth Model Analysis** comparativo
- [ ] **Pricing Landscape** documentado
- [ ] **Opportunity Summary** sintetizado (gaps universales, unmet needs, ángulos sin usar, canales sin explotar)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Roll-up guardado en** `brand/{{slug}}/market-and-us/competitors/competitors-current.md`
- [ ] **Deep-dives por competidor en** `brand/{{slug}}/market-and-us/competitors/{{nombre}}/{{nombre}}-current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada claim tiene fuente inline** (URL, review platform, ad library)
- [ ] **Claims no verificables** marcados con ⚠️ y razón
- [ ] **0 datos inventados** — todo rastreable
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check aleatorio)
- [ ] **Conflictos de lenses** resueltos con jerarquía correcta (Lens 3 > 2 > 1)
- [ ] **Coherencia con brand files** (company-context, positioning)
- [ ] **Confianza documentada** por competidor (High/Medium/Low basada en data disponible)

## ENTREGA (obligatorio)

- [ ] **Oferta de deep-research presentada** — Al entregar, SIEMPRE incluir la oferta de profundización con deep-research. Sin esta oferta, la entrega está INCOMPLETA.

---

## Flujo de uso

```
1. Agente ejecuta Steps 0-6
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado con datos y fuente
   - ⚠️ = investigado pero no disponible (con razón)
   - ❌ = falta — volver a investigar
4. Si hay ❌ → investigar más (búsquedas adicionales enfocadas)
5. Repetir hasta 0 ❌
6. Spot-check: verificar 5-10 URLs con web_fetch
7. Cruzar datos contra brand files
8. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
