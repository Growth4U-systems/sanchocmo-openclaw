---
name: media-discovery
description: "Descubre medios, creators e influencers relevantes para partnerships/outreach por nicho: YouTube, Instagram, blogs, revistas digitales, directorios y asociaciones. Clasifica (editorial/portal/directorio/comparador/asociación/influencer) y propone tipo de colaboración. Use when: 'busca influencers', 'descubre medios para X', 'a qué medios puedo ir', 'lista de creators para partnerships'. NOT for: encontrar decision-makers B2B (use decision-maker-finder), SERP, contenido."
metadata:
  author: Alfonso + Cervantes
  version: '1.0'
  system: SanchoCMO
  status: parked
  extracted_from: trust-engine (influencers module)
  deprecated_origin: SAN-186
  future_home: módulo Partnerships / Outreach
---

# Media & Influencer Discovery

> **⚠️ PARKED SKILL** — Extraída del módulo `influencers` del Trust Engine (deprecado en SAN-186).
> NO está cableada a UI, dispatch-map, pillar-manifest ni `SKILL_OWNER_MAP`. Es metodología
> preservada, pendiente de re-homing dentro del módulo **Partnerships/Outreach** (sustituiría el
> "Import desde Trust Engine media list"). Rutas input/output son placeholders a confirmar al re-homing.

Descubre medios/creators/influencers nuevos para alimentar partnerships y outreach.

## 1. Métodos de discovery

```
FOR EACH niche:

  YouTube:
    IF $YOUTUBE_API_KEY → curl youtube/v3/search?type=channel&q={niche}+{market}
    ELSE → web_search "site:youtube.com {niche} {market} canal español" (3/niche)
           web_fetch cada canal → subscriber count

  Instagram:
    IF $APIFY_TOKEN → Instagram search actor
    ELSE → web_search "{niche} {market} instagram influencer" (2/niche)
           web_search "{niche} instagram españa seguidores" (1/niche)

  Medios/Blog:
    web_search "{niche} blog españa" (1/niche)
    web_search "{niche} revista digital españa" (1/niche)

  Directorios/Autoridad:
    web_search "directorio {service} {market}" (1/niche)

MÍNIMO: 8 web_search de discovery por nicho
```

## 2. Enriquecimiento de perfil

```
FOR EACH perfil/sitio descubierto:
  - Métricas reales (subscribers, followers, DA si es posible)
  - Tipo: influencer | media | directorio | community | review_platform
  - relevance_score (0-100): niche_match 40% · audience_size 20% · engagement 20% · content_quality 20%
  - brief: por qué es relevante + tipo de colaboración sugerido
```

## 3. Clasificación y filtrado (3 tiers)

```
TIER 1 — Raw: todos los perfiles/sitios descubiertos
TIER 2 — Filtrada: quitar competidores, redes sociales, fuera de mercado, consultoras
TIER 3 — Accionable: con contacto, tipo de colaboración, enfoque de outreach

Clasificación de dominio:
  editorial | portal_sectorial | directorio | comparador | asociacion | influencer_individual | community
  SIEMPRE EXCLUIR: dominios de competidor, empresa/consultora, red_social (como target), medios fuera de mercado
```

## QUALITY GATE
- ✅ ≥10 influencers/partners descubiertos (Tier 3, tras filtrado)
- ✅ Mezcla de tipos (editorial + portal + directorio + individual mínimo)
- ✅ ≥3 con métricas reales (subscribers/followers/DA)
- ✅ Cada uno con relevance_score + brief + tipo de colaboración
- ✅ Cada uno con URLs específicas (artículos publicados sobre el tema)
- ✅ ≥8 búsquedas de discovery por nicho · sin competidores · sin medios fuera de mercado/idioma
- ✅ Output 3-tier (count raw + count filtrada + lista accionable)
- ❌ FAIL si solo se listan dominios de resultados SERP (eso son gaps, no discovery) · si <5 entradas Tier 3 · si aparecen competidores

## Learnings heredados (Example, Mar 2026)
- **#4 Taxonomía de dominios**: clasificación compartida cross-client (`_system/domain-taxonomy.json`).
- **#5 URLs > dominios**: incluir URLs de artículo, no solo el dominio.
- **#9 Filtrado 3 pasos**: Raw → Filtrada → Accionable con tipo de colaboración.
- **#12 Filtro mercado/idioma**: excluir dominios fuera del mercado/idioma objetivo.
