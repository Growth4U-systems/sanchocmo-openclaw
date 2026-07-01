---
name: discovery-search-runner
description: "Ejecuta el plan de una búsqueda de creators (Partnerships · SAN-79): scrapea candidatos con las tools MCP de ScrapeCreators según el plan (sectores/redes/tiers), comprueba el repeat de competidores vía ad-library, normaliza candidatos (handle, red, followers, ER, señales) y los ingesta en Yalc, donde entran como Leads scoreados (quality score real con calc-creator-core) según el qualification_mode de la campaign. Usar cuando: hay búsquedas con runner 'queued' (job/cron de discovery), 'ejecuta la búsqueda X', 'corre el runner de discovery'. Modo fixture disponible (sin ScrapeCreators) para tests y demos. NO usar para: planificar la búsqueda (discovery-plan-builder) ni outreach B2B (apollo/company-finder)."
metadata:
  author: Growth4U
  version: '0.1'
  system: SanchoCMO
  issue: SAN-79
  owner_agent: rocinante
  depends_on: discovery-plan-builder
context_required:
  - brand/{slug}/outreach/searches/
context_writes:
  - brand/{slug}/outreach/searches/
---

# Discovery Search Runner (Partnerships · SAN-79)

> Tú scrapeas y construyes candidatos; el endpoint de ingestión hace el resto
> (qualify-enrich con calc-creator-core + inserción en Yalc con las reglas de
> entrada). NO calcules tú el quality score: tu trabajo es producir SEÑALES.

## Arquitectura (quién hace qué)

```
runner agentic (tú)                      endpoint /run (determinista)
───────────────────────                  ─────────────────────────────
GET búsquedas queued                     normaliza candidatos
scrape ScrapeCreators (MCP)       →      qualify-enrich (calc-creator-core)
ad-library de competidores               POST Yalc /leads/assign
candidatos JSON                          resolveEntryStatus (hybrid: <40 → Disqualified)
                                         actualiza búsqueda + tarea (stats)
```

## Workflow

### Regla obligatoria: real no se sustituye por fixture

Si la búsqueda fue lanzada en modo real/agentic, **NO uses fixtures** ni seeds
demo para completar el runner. Fixtures solo se permiten si el humano, el plan
o el payload lo piden explícitamente (`fixtures: true`, `run: "fixtures"` o
nota equivalente).

Si ScrapeCreators devuelve 402/sin créditos, timeout o error de proveedor,
repórtalo al hilo y deja la búsqueda sin ingesta fake. No marques como `done`
una búsqueda real usando datos demo.

### 1. Encuentra trabajo encolado

```bash
curl -s "http://localhost:3000/api/partnerships/searches?slug={slug}&status=queued" \
  -H "x-admin-token: $MC_ADMIN_TOKEN"
```

Cada búsqueda trae su `plan` (sectores, redes, tiers, audiencia, volumen,
señales con `competitorBrands`, notas) y su `campaignId` de Yalc.

### 2. Scrapea candidatos por red (tools mcp__scrapecreators__*)

Objetivo: `plan.targetVolume` candidatos (default ~40) repartidos entre
`plan.networks`, dentro de los `plan.tiers` (followers según config: Nano <25K
· Micro 25–100K · Mid 100–250K · Macro >250K).

Por red, el patrón es: BUSCAR perfiles por keywords de `plan.sectors` → traer
MÉTRICAS del perfil → derivar señales de los últimos posts.

- **instagram**: `v1_instagram_search_profiles` (keywords del sector) →
  `v1_instagram_profile` (followers) → `v2_instagram_user_posts` (últimos
  10-12 posts: likes+comments medios / followers = ER %, cadencia, idioma de
  captions/comentarios).
- **tiktok**: `v1_tiktok_search_users` / `v1_tiktok_search_keyword` →
  `v1_tiktok_profile` → `v3_tiktok_profile_videos` (ER = interacciones medias
  / followers, cadencia).
- **youtube**: `v1_youtube_search` (canales del sector) → `v1_youtube_channel`
  (subs) → `v1_youtube_channel_videos` (views/likes medios → ER proxy, cadencia).

### 3. Señales por candidato (alimentan los 5 componentes del score)

| Señal | Cómo estimarla |
|---|---|
| `fakeFollowersPct` | proxy ratio comentarios/likes anómalo + followers vs interacción |
| `suspiciousGrowthSpikes` | saltos de followers sin contenido viral que lo explique |
| `verticalMatchShare` | cuota 0-1 de los últimos posts que cae en `plan.sectors` |
| `adLibraryChecked` + `competitorPromos` | `v1_facebook_adLibrary_company_ads` / `v1_google_company_ads` por cada marca de `plan.signals.competitorBrands`, cruzado con menciones/captions del creator → `[{ brand, count, windowMonths }]` (≥2 promos misma marca = repeat) |
| `activeConflict` | colaboración/exclusividad VIGENTE con un competidor (promo activa este mes) |
| `spanishAudiencePct` | % de comentarios en español en los últimos posts |
| `cetAlignmentPct` | % de posts publicados en horario CET razonable |
| `postsPerWeek`, `longGapsLast6Months` | cadencia de publicación |

**Ad-library es señal OPCIONAL**: si no puedes consultarla, omite
`adLibraryChecked` (o ponlo `false`) — el motor puntúa neutro y lo marca en
`missingSignals`. NUNCA inventes promos.

### 4. Construye el JSON de candidatos (contrato `RawDiscoveryCandidate`)

```json
{
  "candidates": [
    {
      "handle": "@finanzasconlucia",
      "network": "instagram",
      "name": "Lucía · Finanzas con Lucía",
      "followers": 142000,
      "engagementRatePct": 4.8,
      "signals": {
        "fakeFollowersPct": 6,
        "verticalMatchShare": 1,
        "adLibraryChecked": true,
        "competitorPromos": [{ "brand": "Revolut", "count": 2, "windowMonths": 6 }],
        "spanishAudiencePct": 91,
        "cetAlignmentPct": 68,
        "postsPerWeek": 3.5,
        "longGapsLast6Months": 2
      }
    }
  ]
}
```

Solo `handle` y `network` son obligatorios; señal que no tengas, NO la pongas
(ausente → neutro 50 + flag, mejor que un invento). El normalizador tolera
alias (`er`, `net`, snake_case) y deduplica por red+handle.

### 5. Ingesta (el endpoint hace qualify-enrich + Yalc)

```bash
curl -s -X POST "http://localhost:3000/api/partnerships/searches/{searchId}/run" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $MC_ADMIN_TOKEN" \
  -d '{ "slug": "{slug}", "candidates": [ ... ] }'
```

El endpoint: normaliza → calcula el quality score REAL (calc-creator-core,
desglose de 5 componentes: ER vs tier · autenticidad · sector fit & track
record · audiencia ES · consistencia) → inserta en la campaign de Yalc donde
`resolveEntryStatus` aplica el `qualification_mode`:
- **hybrid** (default): score < umbral → `Disqualified` con nota
  `auto · hybrid: score < N` (consultable y reversible); resto → `Sourced`.
- **auto**: ≥ umbral → `Qualified`; bajo umbral no se inserta.
- **manual**: todo entra `Sourced`.

Respuesta: `{ ok, search, stats, leads, dropped }` con
`stats = { candidates, inserted, sourced, disqualified, dropped, avgQuality }`.
La búsqueda queda `runner.status=done` y la tarea Outreach anotada.

### 6. Reporta

Resume al thread/tarea: nº candidatos, insertados, Sourced vs Disqualified,
quality medio, top 3 por score y señales de repeat encontradas. Recuerda que
el triaje humano ocurre en **Contactos** (kanban/lista).

## Modo fixture (tests / demo / verificador)

Sin ScrapeCreators — usa los 9 creators fake del mockup (seeds calibrados:
quality 91/88/87/82/79/74/58/52/31):

```bash
# vía endpoint
curl -s -X POST "http://localhost:3000/api/partnerships/searches/{searchId}/run" \
  -H "Content-Type: application/json" -H "x-admin-token: $MC_ADMIN_TOKEN" \
  -d '{ "slug": "{slug}", "fixtures": true }'

# vía CLI (end-to-end: crea búsqueda + campaign + runner en un paso)
npx tsx scripts/run-discovery-search.mts --slug {slug} --plan plan.json --fixtures

# vía env (cualquier camino)
DISCOVERY_FIXTURES=1
```

## Errores

- `400 No candidates provided` → llegaste al endpoint sin candidatos ni
  fixtures: scrapea primero o usa `fixtures: true`.
- Búsqueda en `runner.status=error` → el detalle queda en `runner.error` del
  JSON de la búsqueda; re-lanza tras corregir (el runner es re-ejecutable).
- ScrapeCreators sin crédito/timeout → reporta el error en el thread y no
  ingestes fixtures/datos demo. Si una red falla pero otras redes reales sí
  devuelven candidatos, reduce volumen y continúa solo con candidatos reales.
