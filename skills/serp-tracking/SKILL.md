---
name: serp-tracking
description: "Rastrea posiciones SERP de Google para keywords de la marca y sus competidores (vía Serper.dev + enriquecimiento de volumen DataForSEO), por nicho y subnicho. Identifica posición del cliente, top3/top10/invisible, y keywords de alto volumen donde no aparece. Use when: 'dónde rankeo', 'mis posiciones en Google', 'rank tracking', 'SERP de mis keywords'. NOT for: keyword research estratégico (use keyword-research), GEO/IA, auditoría técnica."
metadata:
  author: Alfonso + Cervantes
  version: '1.0'
  system: SanchoCMO
  status: parked
  extracted_from: trust-engine (serp-analysis module)
  deprecated_origin: SAN-186
---

# SERP Rank Tracking

> **⚠️ PARKED SKILL** — Extraída del módulo `serp-analysis` del Trust Engine (deprecado en SAN-186).
> NO está cableada a UI, dispatch-map, pillar-manifest ni `SKILL_OWNER_MAP`. Es metodología
> preservada, pendiente de re-homing (antena periódica de channel-loop o skill on-demand).
> Complementa, no sustituye, las métricas GSC (que dan clicks/impresiones, no tracking de posición).

Rastrea posiciones reales en Google para keywords de marca + competidores. **Requiere `$SERPER_API_KEY`.**

## 1. Generación de keywords

```
FOR EACH niche:
  FOR EACH subnicho:
    6-8 keywords cruzando subnicho con categorías:
      ranking:    "mejor {subnicho_service} {location}" (2 variantes)
      solution:   "{subnicho_problem} solución" (2 variantes)
      comparison: "{subnicho_service} precio/opiniones" (1-2 variantes)
      discovery:  "{subnicho_service} {city}" (1 variante)
      guide:      "cómo {subnicho_action}" (1 variante)

  FOR EACH competidor:
      "{client} vs {competitor}"      (threat high/medium)
      "alternativas a {competitor}"    (threat high/medium)
      "{competitor} opiniones"         (threat high)

TOTAL MÍNIMO: 30 keywords. Objetivo: 50+.
```

## 2. SERP fetching

```bash
FOR keyword IN keywords:
  curl -s -X POST "https://google.serper.dev/search" \
    -H "X-API-KEY: $SERPER_API_KEY" -H "Content-Type: application/json" \
    -d '{"q":"{keyword}","gl":"{country_code}","hl":"{language}","num":10}'
  # Parse organic[].{position,title,link,snippet}; dominio del link
  # Posición del cliente + posiciones de competidores
  sleep 1   # rate limit 1s
```

## 3. Clasificación
content_type: guide|comparison|review|directory|service|news|forum|video
domain_type: competitor|media|directory|forum|own|medical_authority|other (heurísticas primero, LLM para ambiguos)

## 4. Enriquecimiento de volumen (MANDATORY si DataForSEO existe)

```bash
IF $DATAFORSEO_LOGIN:
  AUTH=$(echo -n "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" | base64)
  curl -s -X POST "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live" \
    -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
    -d '[{"keywords":[...],"location_code":{location_code},"language_code":"{lang}"}]'
  # Parse search_volume, cpc, competition — OBLIGATORIO si hay credenciales
```

## 5. Output (URLs > dominios)
Cada resultado: **URL completa** (no solo dominio), **título del artículo** (contexto outreach), **clasificación de dominio**.

## QUALITY GATE
- ✅ ≥30 keywords buscadas · todos los subnichos con ≥3 keywords
- ✅ Todas las keywords con resultados (top 10 con URLs) · posición del cliente identificada
- ✅ ≥3 posiciones de competidor · keywords auto de competidor (vs, alternativas)
- ✅ Si DataForSEO existe → todas enriquecidas con volumen/CPC
- ✅ URLs completas con títulos · resumen (total, client_in_top3, client_in_top10, client_invisible) · top invisibles de alto volumen · breakdown por subnicho
- ❌ FAIL si <15 keywords · si DataForSEO existe y no se usa · si no hay estadísticas · si algún subnicho tiene 0 keywords

## Learnings heredados (Example, Mar 2026)
- **#5 URLs > dominios** · **#11 Auto-keywords de competidor** (no excluir por bajo volumen, tienen alta intención) · **#12 Filtro mercado/idioma**.
