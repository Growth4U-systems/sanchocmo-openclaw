---
name: own-media-audit
description: "Audita los medios propios de una marca (blog, 6 plataformas sociales, schema JSON-LD, tech stack) y sintetiza gaps de presencia/densidad/tipo cruzando visibilidad GEO + SERP frente a competidores. Produce score de own-media + lista priorizada de oportunidades de medios. Use when: 'audita mi blog/redes', 'qué medios propios tengo', 'gap analysis de medios', 'dónde están mis competidores y yo no'. NOT for: SEO técnico de la web (use seo-audit), keyword research."
metadata:
  author: Alfonso + Cervantes
  version: '1.0'
  system: SanchoCMO
  status: parked
  extracted_from: trust-engine (own-media-audit + gap-analysis modules)
  deprecated_origin: SAN-186
---

# Own Media Audit + Gap Synthesis

> **⚠️ PARKED SKILL** — Extraída de los módulos `own-media-audit` y `gap-analysis` del Trust Engine
> (deprecado en SAN-186). NO está cableada a UI, dispatch-map, pillar-manifest ni `SKILL_OWNER_MAP`.
> Es metodología preservada, pendiente de re-homing (antena periódica o skill on-demand).
> La síntesis de gaps depende de outputs de [[geo-visibility]] y [[serp-tracking]] — al re-homing,
> definir cómo se encadenan. Rutas input/output son placeholders.

## Parte A — Own Media Audit

### A.1 Blog scanner
Probar `{website}/blog · /blog/ · /noticias · /articles · /recursos` hasta 200. Si existe: contar artículos,
últimos 3 títulos + fechas (freshness), word count de 1 post, frecuencia estimada. Si no: `blog_exists: false`.

### A.2 Social discovery (las 6 plataformas)
Para `[instagram, linkedin, youtube, tiktok, twitter/x, facebook]`: encontrar URL real del perfil
(homepage HTML → web_search), métricas reales (Apify si `$APIFY_TOKEN`; fallback web_fetch; mínimo web_search snippets).
Registrar url, followers reales, posts_count, posting_frequency, last_post_date, engagement_rate, verified.

### A.3 Schema scanner (vía browser, no adivinar)
```
browser evaluate: JSON.stringify([...document.querySelectorAll('script[type="application/ld+json"]')]...)
```
Listar tipos encontrados; notar schemas recomendados ausentes según tipo de negocio (Medical/E-commerce/Service/All).

### A.4 Tech detection
De headers (`curl -I`) y contenido: CMS (WordPress/Shopify/Wix), Analytics (GA4/Mixpanel/Hotjar/Clarity),
CDN (Cloudflare/AWS/Fastly), Tag Manager (GTM).

### A.5 Scoring
```
content (35%):   blog 20 · frecuencia≥2/mes 30 · word_count≥800 20 · categorías 15 · fresh<30d 15
social (30%):    found 40/6 · active 30/6 · optimized 30/6
technical (35%): SSL 15 · mobile 15 · CMS 15 · analytics 20 · CDN 15 · schemas 20
overall = content×0.35 + social×0.30 + technical×0.35
```

### QUALITY GATE — own media
- ✅ Blog comprobado · las 6 plataformas comprobadas (url o "not_found") · ≥4 con followers reales
- ✅ Schema vía browser (no adivinado) · tech stack (mínimo CMS + analytics) · score con breakdown
- ❌ FAIL si social solo dice "tiene perfil" sin métricas · si <4 plataformas comprobadas

---

## Parte B — Gap Synthesis (cruce GEO + SERP)

Lee outputs de [[geo-visibility]] (URLs/dominios citados + menciones) y [[serp-tracking]] (URLs/dominios SERP),
+ dominios de competidor (exclusión + comparación), + taxonomía `_system/domain-taxonomy.json` si existe.

```
TRES modos de detección de gap:
  A — Presencia: cliente AUSENTE y competidores PRESENTES → PRESENCE GAP
  B — Densidad:  cliente presente pero max_competitor_mentions > client_mentions × 3 → DENSITY GAP
  C — Tipo:      cliente solo en list_mentions y competidor en dedicated_articles → TYPE GAP

Cruce GEO+SERP:  geo+serp = ambos → HIGH PRIORITY · geo_only / serp_only → MEDIUM
Score compuesto: (GEO_citas×2) + (SERP_apariciones×1.5) + (num_IAs×3) + type_bonus
                 type_bonus: geo+serp=25 · geo_only=15 · serp_only=10

Clasificación de dominio (→ acción sugerida):
  editorial → artículo/entrevista/nota de prensa · portal_sectorial → guest post/publirreportaje
  directorio_software → perfil + reseñas · comparador → inclusión en ranking · asociacion → membresía/eventos
  EXCLUIR siempre: competitor, empresa_consultora, red_social, medio fuera de mercado/idioma

Cada gap: domain + specific_urls + url_title + gap_type + gap_source + domain_classification
          + competitors_present (con counts) + opportunity_score + suggested_action + suggested_collaboration_type
```

### QUALITY GATE — gaps
- ✅ GEO + SERP leídos · los 3 modos ejecutados · ≥5 gaps (o explicar con datos)
- ✅ Cada gap con URLs específicas + clasificación + suggested_action · competidores excluidos · dominios fuera de mercado excluidos · ordenados por score
- ❌ FAIL si devuelve 0 sin comprobar modo densidad · si los gaps solo tienen dominios sin URL · si aparecen competidores en recomendaciones de medios

## Learnings heredados (Paymatico, Mar 2026)
- **#3 Modo densidad** · **#4 Taxonomía compartida de dominios** · **#5 URLs > dominios** · **#6 Score compuesto GEO+SERP**.
