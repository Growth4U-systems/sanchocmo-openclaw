# Competitor Intelligence — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

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

### Scraping (Step 2) — VERIFICACIÓN DE HERRAMIENTAS OBLIGATORIA
- [ ] **Apify web-scraper ejecutado** en homepage + pricing + about de cada competidor directo (pegar run ID o confirmar ejecución)
- [ ] **Apify instagram-scraper ejecutado** para cada competidor con cuenta IG (pegar run ID o confirmar)
- [ ] **Apify trustpilot-scraper ejecutado** para competidores con perfil Trustpilot (pegar run ID o confirmar)
- [ ] **DataForSEO SERP/backlinks ejecutado** para dominios de competidores directos (pegar endpoint usado)
- [ ] **Meta Ad Library consultada** via browser tool (captura de pantalla o datos extraídos)
- [ ] Si alguna herramienta NO se pudo usar → marcar ⚠️ con razón específica ("Apify actor X falló con error Y, usé web_fetch como fallback")
- [ ] **PROHIBIDO marcar ✅ si usaste web_search/web_fetch en lugar de Apify/DataForSEO** — eso es ⚠️ con justificación, NUNCA ✅
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
- [ ] **Guardado en** `brand/{{slug}}/competitors/current.md`
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
