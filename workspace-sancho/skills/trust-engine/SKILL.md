---
name: trust-engine
description: "Trust Engine audit: analyzes client's SEO, GEO (AI visibility), and Own Media to find gaps and opportunities. Produces 3 lists: content ideas, media/blogs to appear in, and influencers/partners to contact. Lists go to Idea Bank for approval. Use when: Strategic Plan recommends Trust Engine, client asks 'where am I?', 'what should I do for SEO/GEO?', 'find me opportunities', 'run trust engine', 'analiza mi SEO', 'analiza mi GEO', 'dónde estoy', 'qué me falta'. NOT for: content creation (use content skills), Foundation (use foundation-orchestrator), recurring idea generation (use idea-generation system), bot engagement (separate system)."
metadata:
  author: Alfonso + Philippe + Cervantes
  version: '1.0'
  system: SanchoCMO
  phase: Execution
  depends_on: foundation-orchestrator, strategic-plan
  context_required:
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/go-to-market/ecps/current.md
    - brand/{slug}/go-to-market/positioning/current.md
    - brand/{slug}/market-and-us/competitors/current.md
    - brand/{slug}/market-and-us/self/current.md
  context_writes:
    - brand/{slug}/trust-engine/audit-{date}.json
    - brand/{slug}/trust-engine/lists-{date}.json
    - brand/{slug}/trust-engine/latest.json
---

# Trust Engine — SEO/GEO/Own Media Audit → 3 Listas

> Analiza el customer journey del cliente en buscadores (Google) e IAs (ChatGPT, Claude, Perplexity).
> Encuentra huecos y oportunidades. Genera 3 listas que van al Idea Bank.

## Gate Check

```
1. Foundation mínima:
   - company-brief/current.md EXISTS
   - ecps/current.md EXISTS
   - competitors/current.md EXISTS
   Si falta alguno → STOP: "Necesito Foundation completa para ejecutar Trust Engine."

2. Backend Escudero corriendo:
   - curl http://127.0.0.1:8000/health → {"status":"ok"}
   Si no responde → STOP: "El backend de Trust Engine no está corriendo. Ejecuta: cd /Users/ragi/ESCUDERO-Tu-escudero-en-SEO-GEO/backend && source .venv/bin/activate && uvicorn app.main:app --host 127.0.0.1 --port 8000"
```

## Inputs

Del usuario:
- `slug` — cliente (de clients.json o contexto del guild)
- `website` — URL principal del cliente

De Foundation:
- `company-brief` → nombre, mercado, idioma, servicios
- `ecps` → nichos/audiencias objetivo
- `positioning` → mensajes clave por ECP
- `competitors` → competidores identificados
- `self-intelligence` → dominios, aliases, fortalezas
- `brand-voice` → (opcional) tono para futuro contenido

## Proceso

### Paso 1: Setup — Crear/actualizar proyecto en backend

```
POST http://127.0.0.1:8000/api/v1/projects/auto-setup
Body: {
  "url": website,
  "market": language,  // "es", "en", etc.
  "language": language
}

→ Devuelve: project_id, niche_ids, competitor brand_ids
```

Si el proyecto ya existe, usar el project_id existente.

Enriquecer niches con datos de Foundation:
- ECPs → niche.brief (A=positioning, B=objetivos, C=audiencia, D=messaging)
- Competitors → verificar que están en brands

### Paso 2: Audit SEO

```
# Site audit (Lighthouse + health checks)
POST http://127.0.0.1:8000/api/v1/audit/run
Body: { "project_id": project_id }

# SERP fetch con keywords iniciales (del niche)
POST http://127.0.0.1:8000/api/v1/seo/queries/batch
Body: {
  "project_id": project_id,
  "keywords": [extraer 5-10 keywords de ECPs + positioning],
  "language": language,
  "location": market
}
```

### Paso 3: Audit GEO

```
# Crear prompts GEO desde ECPs
POST http://127.0.0.1:8000/api/v1/projects/{project_id}/prompts
Body: { prompts generados desde ECPs — "¿Cuáles son las mejores X en Y?" }

# Ejecutar GEO analysis
POST http://127.0.0.1:8000/api/v1/geo/runs
Body: {
  "project_id": project_id,
  "niche_id": niche_id,
  "providers": ["openai", "anthropic"]
}
```

### Paso 4: Audit Own Media

```
POST http://127.0.0.1:8000/api/v1/own-media/run
Body: { "project_id": project_id }
```

### Paso 5: Gap Analysis + Recommendations

```
POST http://127.0.0.1:8000/api/v1/analysis/gaps
Body: { "project_id": project_id }

POST http://127.0.0.1:8000/api/v1/recommendations/generate?project_id={project_id}
```

### Paso 6: Keyword Research

```
POST http://127.0.0.1:8000/api/v1/content/suggest-keywords
Body: { "project_id": project_id, "niche": niche_slug }
```

### Paso 7: Influencer Discovery

```
POST http://127.0.0.1:8000/api/v1/influencers/search
Body: { "project_id": project_id, "niche_id": niche_id }
```

### Paso 8: Generar 3 Listas

Recopilar todos los resultados y generar:

**Lista A — Ideas de contenido propio:**
- Keywords con oportunidad (del keyword research)
- Content gaps (donde competidores rankean y cliente no)
- GEO gaps (prompts donde no aparece el cliente)
- Recomendaciones de contenido (del recommendation engine)

**Lista B — Blogs/medios donde aparecer:**
- Dominios de alto DR que mencionan competidores (del gap analysis)
- Blogs del sector detectados en SERP
- Medios que citan competidores en GEO responses

**Lista C — Influencers/partners a contactar:**
- Influencers descubiertos (YouTube + Instagram)
- Con relevance score y brief sugerido

### Paso 9: Guardar resultados

```python
# Guardar audit completo
write("brand/{slug}/trust-engine/audit-{date}.json", {
  "date": date,
  "project_id": project_id,
  "seo_audit": { scores, issues },
  "geo_audit": { visibility, mentions, providers },
  "own_media": { scores, social_profiles, tech_stack },
  "gaps": { total, top_gaps },
  "recommendations": [ recs ]
})

# Guardar las 3 listas
write("brand/{slug}/trust-engine/lists-{date}.json", {
  "date": date,
  "content_ideas": [ lista A ],
  "media_placements": [ lista B ],
  "influencers_partners": [ lista C ]
})

# Symlink a latest
write("brand/{slug}/trust-engine/latest.json", { → audit + lists })
```

### Paso 10: Crear proyecto en Strategic Plan

```
Crear proyecto en projects/registry.json:
  [P{XX}] Trust Engine - {client_name} - {month} {year}
  status: active
  type: trust-engine
  audit_date: date
  lists_path: brand/{slug}/trust-engine/lists-{date}.json
```

## Output al usuario

Resumen en Discord (max 2000 chars):

```
🔍 Trust Engine — {client_name} ({date})

📊 Scores:
  SEO: {lighthouse_score}/100 | GEO: {visibility}% | Own Media: {own_media_score}/100

🔑 Top 3 oportunidades:
  1. {rec_1}
  2. {rec_2}
  3. {rec_3}

📋 Listas generadas:
  A) {n} ideas de contenido
  B) {n} blogs/medios donde aparecer
  C) {n} influencers/partners

→ Listas disponibles en Mission Control para revisar y aprobar.
→ Proyecto creado: [P{XX}] Trust Engine - {client_name} - {month}
```

## Self-QA Checklist

- [ ] Foundation gate check pasó
- [ ] Backend respondió a todos los endpoints
- [ ] SEO audit completó sin errores
- [ ] GEO analysis ejecutó con ≥2 providers
- [ ] Own Media audit detectó ≥1 social profile
- [ ] Gap analysis cruzó SEO × GEO
- [ ] Keyword research generó ≥10 keywords
- [ ] Influencer discovery encontró ≥5 resultados
- [ ] 3 listas generadas con ≥3 items cada una
- [ ] Resultados guardados en brand/{slug}/trust-engine/
- [ ] Proyecto creado en registry.json
