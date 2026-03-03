# Self-Intelligence — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Step 0: Profile Discovery

- [ ] **Todas las plataformas checkeadas** (Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X)
- [ ] **Review platforms checkeadas** (Trustpilot, G2, Capterra)
- [ ] **App Stores checkeados** (Apple App Store, Google Play Store)
- [ ] **Website analizado** (dominio principal, subdominios, blog)
- [ ] **Status documentado** por plataforma (active/dormant/not found)

## Step 1: Scraping (4 grupos)

- [ ] **Group 1 Autopercepción** (8 scrapers): website, Instagram, Facebook, YouTube, TikTok, LinkedIn posts + insights
- [ ] **Group 2 Terceros** (2 scrapers): SEO/SERP data, News corpus
- [ ] **Group 3 RRSS Comments** (5 scrapers): comentarios por plataforma
- [ ] **Group 4 Reviews** (5 scrapers): Trustpilot, G2, Capterra, Play Store, App Store
- [ ] **Status por scraper** documentado (Configurado/Pendiente)

## Step 2: Deep Research

- [ ] **Deep Research Market** completado (industria, landscape, segmentos, tendencias)
- [ ] **Deep Research Company** completado (huella digital, productos, imagen, tono, value prop, ICPs)

## Step 3: Lens Analysis (5 prompts secuenciales)

### Lens 1: Autopercepción
- [ ] **Mensaje analizado** (core message, tono, positioning, consistencia cross-channel, temas)
- [ ] **Asset Inventory completo**:
  - [ ] Content Assets (blog, social posts, videos, podcast, lead magnets)
  - [ ] Audience Assets (followers, engagement por plataforma, email list, tráfico)
  - [ ] Technical Assets (analytics, ESP, CRM, social scheduler, SEO tools)
  - [ ] SEO Authority (DA, indexed pages, top keywords, backlinks)
  - [ ] Existing Funnels (landing pages, lead magnets, email sequences, conversion paths)

### Lens 2: Percepción de Terceros
- [ ] **SEO visibility** analizada (authority, keywords, ranking)
- [ ] **Media coverage** documentada (artículos, press mentions)
- [ ] **Industry recognition** registrada (premios, rankings)
- [ ] **External narrative vs self-perception** comparada

### Lens 3a: Percepción Consumidor — RRSS
- [ ] **Sentiment analizado** por canal
- [ ] **Temas recurrentes** identificados
- [ ] **Pain points** documentados
- [ ] **Menciones de competidores** registradas

### Lens 3b: Percepción Consumidor — Reviews
- [ ] **Ratings por plataforma** documentados
- [ ] **Top 3-5 pros** identificados (lo que clientes aman)
- [ ] **Top 3-5 cons** identificados (lo que clientes odian)
- [ ] **Patrones de migración** documentados (from/to competitors)

### Synthesis
- [ ] **Triangulation table** generada (Aspecto | Autopercepción | Terceros | Consumidores | Realidad)
- [ ] **Fortalezas confirmadas** listadas (consistentes entre fuentes)
- [ ] **Debilidades confirmadas** listadas (consistentes entre fuentes)
- [ ] **Perception vs reality gaps** identificados
- [ ] **Priority fixes** listados

## Viability Checkpoint

- [ ] **Checkpoint ejecutado** automáticamente
- [ ] **Rating promedio calculado** (¿< 2.5/5?)
- [ ] **Product gaps evaluados** (¿confirmados por múltiples fuentes?)
- [ ] **Promise-reality gaps evaluados** (¿severos?)
- [ ] **Status**: PASS o WARNING (con recomendación si WARNING)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/self-intelligence/current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada claim tiene fuente inline** (URL, review, post, artículo)
- [ ] **Claims no verificables** marcados con ⚠️ y razón
- [ ] **0 datos inventados** — todo rastreable
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check aleatorio)
- [ ] **Conflictos de lenses** resueltos con jerarquía (3b > 3a > 2 > 1)
- [ ] **Coherencia con brand files** (company-context) verificada
- [ ] **Ausencia de datos** marcada explícitamente ("unknown" o "none detected", NO asumida)

## ENTREGA (obligatorio)

- [ ] **Oferta de deep-research presentada** — Al entregar, SIEMPRE incluir la oferta de profundización con deep-research. Sin esta oferta, la entrega está INCOMPLETA.

---

## Flujo de uso

```
1. Agente ejecuta Steps 0-4 + Viability Checkpoint
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado con datos y fuente
   - ⚠️ = investigado pero no disponible (con razón)
   - ❌ = falta — volver a investigar
4. Si hay ❌ → investigar más
5. Spot-check: verificar 5-10 URLs con web_fetch
6. Cruzar contra brand files
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
