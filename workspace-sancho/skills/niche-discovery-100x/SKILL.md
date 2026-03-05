---
name: niche-discovery-100x
description: "Descubrimiento end-to-end de nichos con metodología 100x. Auto-detecta B2C/SMB vs B2B Enterprise: foros+pipeline automatizado (Serper/Firecrawl/LLM) para B2C, case studies+earnings calls+job postings+LinkedIn+trade pubs para B2B. Harvesta Foundation existente antes de investigar. Valida con Triple Filter (SWOT+ICP+Producto) y puntúa con Deep Research. Usar cuando: identificar nichos, validar nichos, segmentos de cliente, ICP, o 'a quién le vendo'. Triggers: find niches, discover market, ICP, target audience, customer segments, niche discovery, buscador de nichos, validate this niche, B2B problem discovery, 100x niches, ECP. NO usar para: análisis de mercado amplio (market-intelligence), posicionamiento (positioning-messaging), segmentación solo datos existentes (existing-customer-data). Requiere: company-context, self-intelligence, competitor-intelligence, swot-analysis."
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/self-analysis/current.md
- brand/{slug}/market-and-us/competitor-*/current.md
- brand/{slug}/market-and-us/swot/current.md
- brand/{slug}/market-and-us/market-analysis/current.md
- brand/{slug}/market-and-us/summary.md
context_writes:
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/niche-discovery/final-table.csv
- brand/{slug}/go-to-market/niche-discovery/problems.md
---

# ICP & 100x Niche Discovery v3.3

> Minar conversaciones reales y señales enterprise para pain points, validar contra datos Foundation, puntuar cada nicho con Deep Research.

**Depende de**: company-context, self-intelligence, competitor-intelligence, swot-analysis
**Opcional**: market-intelligence, existing-customer-data (mejoran harvest si existen)
**Produce**: `brand/{slug}/go-to-market/ecps.md` + `final-table.csv`

## Pipeline

```
INTAKE → DETECTAR MERCADO → HARVEST FOUNDATION → ESTRATEGIA → DESCUBRIR → EXTRAER → AGRUPAR → FILTRO CALIDAD → TRIPLE FILTER → REVIEW → SCORING → CONSOLIDAR
```

| Fase | Qué | Coste B2C | Coste B2B |
|------|-----|-----------|-----------|
| 1. Intake | Leer contexto Foundation | $0 | $0 |
| 1b. Detectar | Detección tipo de mercado | $0 | $0 |
| 1c. Harvest | Extraer problemas de Foundation existente | $0 | $0 |
| 2. Estrategia | Generar grid de búsqueda + aprobación usuario | ~$0.50 | ~$0.50 |
| 3. Descubrir | SERP foros (B2C) O Fuentes enterprise (B2B) | ~$0.50 | $0 (agente) |
| 4. Scrape | Firecrawl + Reddit (B2C) O web_fetch (B2B) | ~$0.50 | $0 (agente) |
| 5. Extraer | Extracción LLM (B2C) O extracción agente (B2B) | ~$8 | $0 (agente) |
| 6. Agrupar | Chunk (Sonnet) + merge (Opus) | ~$1.50 | ~$1.50 |
| 7/7b. Filtrar | Filtro Calidad + Triple Filter | ~$0.50 | ~$0.50 |
| 8. Review | Usuario confirma nichos | $0 | $0 |
| 9. Scoring | Deep Research por nicho (5-7 nichos) | ~$5-10 | ~$5-10 |
| 10. Consolidar | Tabla final scored + CSV | ~$0.50 | ~$0.50 |
| **Total** | | **~$17-22** | **~$8-13** |

## Referencias

| Archivo | Cuándo leer |
|---------|-------------|
| [market-detection.md](references/market-detection.md) | Phase 1b — tabla de señales y lógica de detección |
| [harvest-protocol.md](references/harvest-protocol.md) | Phase 1c — protocolo de extracción de Foundation |
| [enterprise-sources.md](references/enterprise-sources.md) | Phase 3-5 cuando mercado = B2B Enterprise |
| [thematic-forums.md](references/thematic-forums.md) | Phase 2-3 cuando mercado = B2C/SMB |
| [commands.md](references/commands.md) | Phase 3-5 B2C — comandos de scripts |
| [prompts-phase6a.md](references/prompts-phase6a.md) | Phase 6a — agrupación en chunks (script) |
| [prompts-phase6b.md](references/prompts-phase6b.md) | Phase 6b — merge y deduplicación (script) |
| [prompts-phase6c.md](references/prompts-phase6c.md) | Phase 6c — JTBD clustering "Social Payments" (agente) |
| [prompts-phase7a.md](references/prompts-phase7a.md) | Phase 7 — filtro de calidad (script) |
| [prompts-phase7b.md](references/prompts-phase7b.md) | Phase 7b — triple filter Foundation (agente) |
| [prompts-phase9.md](references/prompts-phase9.md) | Phase 9 — scoring deep research (agente) |
| [prompts-phase10.md](references/prompts-phase10.md) | Phase 10 — consolidación final (script) |
| [checklist.md](references/checklist.md) | Antes de entregar — self-QA obligatorio |
| [methodology.md](references/methodology.md) | Reglas Triple Filter, metodología scoring, edge cases |
| [schema.md](references/schema.md) | Schema de output + tipos de fuente válidos |
| [examples.md](references/examples.md) | Ejemplos de config.json, problems.md, y cómo splitear chunks |

## API Keys requeridas (env vars) — Solo modo B2C

`SERPER_API_KEY`, `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`

Modo B2B Enterprise usa herramientas del agente (web_search, web_fetch) — no necesita API keys externas.

## Reglas Globales

1. **Guardar cada output como archivo** — ver [schema.md](references/schema.md) para estructura
2. **Checkpoint antes de cada fase (3-10)**: mostrar parámetros, pedir aprobación, solo ejecutar tras "ok" explícito

---

## Phase 1: Intake (Contexto Foundation)

Auto-leer de Foundation — NO preguntar lo que ya tenemos.

1. Identificar slug del cliente desde systemPrompt
2. Leer: `brand/{slug}/company-context/current.md`, `self-intelligence/current.md`, `competitor-intelligence/current.md`, `swot-analysis/current.md`, `existing-customer-data/current.md` (si existe)
3. Extraer: company_name, product, industry, target, country, context_type (B2B/B2C/Both)
4. Si falta pilar crítico → informar al usuario, sugerir completar Foundation primero

## Phase 1a: Verificación de Cobertura de Foros

Si el país del cliente NO es España, comprobar si hay foros mapeados para ese mercado en [thematic-forums.md](references/thematic-forums.md). Si no los hay, ofrecer proactivamente descubrirlos siguiendo el procedimiento de "Descubrimiento de foros para otros países" en thematic-forums.md. Esto se hace ANTES de detectar el mercado porque afecta a la estrategia.

## Phase 1b: Detección Tipo de Mercado

Leer [market-detection.md](references/market-detection.md). Evaluar 5 señales desde contexto de empresa e ICP. Declarar resultado antes de continuar.

## Phase 1c: Harvest de Datos Existentes (OBLIGATORIO)

Leer [harvest-protocol.md](references/harvest-protocol.md). Extraer problemas de Foundation ANTES de cualquier investigación nueva. Si >= 50 problemas con >= 3 tipos de fuente → saltar a Phase 6.

## Phase 2: Generación de Estrategia

Generar estrategia de búsqueda usando contexto Foundation + tipo de mercado detectado:

- **Modo B2C/SMB**: 10-15 life context words + 8-12 product domain words + fuentes de [thematic-forums.md](references/thematic-forums.md)
- **Modo B2B Enterprise**: ICP role keywords + pain domain words + fuentes de [enterprise-sources.md](references/enterprise-sources.md) (seleccionar top 4-5)
- **Phase 2b**: Presentar estrategia al usuario. Solo proceder tras aprobación explícita. Guardar como `config.json`.

## Phases 3-5: Discovery + Extracción (BIFURCADAS POR MODO)

### Modo B2C/SMB (Pipeline Automatizado)
Ejecutar scripts — ver [commands.md](references/commands.md):
- **Phase 3**: `serp_search.py` → `urls.json`
- **Phase 4**: `scrape_urls.py` → `docs/`
- **Phase 5**: `extract_problems.py` → `problems.md`

**Si los scripts fallan** (SIGTERM, timeout, 0 output) → activar Fallback Manual (ver abajo). NO sustituir por `web_search`.

### Modo B2B Enterprise (Investigación por Agente)
Leer [enterprise-sources.md](references/enterprise-sources.md). Trabajar fuentes seleccionadas con web_search + web_fetch. Stop: >= 50 problemas con >= 3 tipos de fuente.

### Modo Híbrido
Ejecutar ambos stacks. Deduplicar en Phase 6.

### ⚠️ Fallback Manual (cuando scripts fallan)

Si los scripts B2C no funcionan, usar herramientas del agente con estas reglas estrictas:

**Paso 1 — Descubrir URLs** (web_search está permitido SOLO aquí):
- Usar `web_search` para encontrar URLs específicas de threads/posts/reviews (NOT para extraer problemas)
- Buscar: `site:reddit.com "[keyword]"`, `site:indiehackers.com "[keyword]"`, reviews en G2/Capterra

**Paso 2 — Scraping real** (web_fetch OBLIGATORIO):
- Cada URL encontrada DEBE ser scrapeada con `web_fetch` para leer el contenido real
- Para Reddit: usar URL + `.json` para obtener comments (ej: `reddit.com/r/SaaS/comments/xxx/.json`)
- Mínimo **10 URLs scrapeadas** con contenido real de usuarios
- Registrar cada URL en `scraping-log.md` con: URL, método, # comments leídos, estado

**Paso 3 — Extraer con citas reales**:
- Cada problema extraído DEBE incluir al menos 1 cita textual del usuario original
- Formato: `"cita textual" — u/usuario, r/subreddit (score: X)`
- Si no hay cita → el problema no cuenta como "scrapeado" → marcar como "inferido"

**PROHIBIDO**: Usar `web_search` como sustituto de scraping y tratar los resúmenes sintetizados como datos de foros reales. `web_search` = descubrimiento de URLs. `web_fetch` = lectura de contenido real. Son pasos distintos, nunca intercambiables.

### Regla de calidad: Ratio scrapeado vs inferido
- **Mínimo 60% de problemas** deben tener cita textual de fuente scrapeada
- Si < 60%: marcar documento como "⚠️ BAJA EVIDENCIA — mayoría inferida, no scrapeada"
- Los ECPs finales DEBEN incluir sección "Voces reales" con 3-5 citas por ECP

**Output idéntico en todos los modos**: `problems.md` con problemas JTBD estructurados + `scraping-log.md`.

### Fallback si 0 problemas
Si después de ejecutar el stack completo tienes < 10 problemas:
1. Ampliar keywords (sinónimos, otros idiomas, terminología alternativa)
2. Probar fuentes secundarias (Reddit genérico, Quora, app store reviews)
3. Si sigue < 10: informar al usuario y recomendar micro-entrevistas (5-10 personas ICP)
4. **Nunca inventar problemas** — documentar el gap y proceder con lo que hay

## Phase 6: Agrupar en Personas + JTBD Clusters

6a: Leer [prompts-phase6a.md](references/prompts-phase6a.md). Chunk → Sonnet 4. Extraer PERSONAS específicas (≥3 dimensiones cada una).
6b: Leer [prompts-phase6b.md](references/prompts-phase6b.md). Merge → Opus. Deduplicar personas. Output: `niches-raw/merged.md`
6c: Leer [prompts-phase6c.md](references/prompts-phase6c.md). Clustering JTBD ("Social Payments"). Agrupar personas en 5-10 grupos por dolor compartido. Cada grupo = nombre memorable + "Social Payments" statement + personas miembro con nombres descriptivos ("The X"). Output: `niches-raw/clusters.md`

## Phase 7: Filtro de Calidad

Leer [prompts-phase7a.md](references/prompts-phase7a.md). 5 criterios: TOO GENERIC, TOO SMALL, NOT PRODUCT-RELEVANT, CONSUMER PROBLEM, DUPLICATE SEGMENT. **Nicho = QUIÉN, no QUÉ.** Output: `niches-filtered.md`.

## Phase 7b: Triple Filter (Validación Foundation)

Leer [prompts-phase7b.md](references/prompts-phase7b.md). Validar contra SWOT + ICP + Producto. Los 3 deben ser PASS o PARTIAL. Output: `niches-triple.md`.

## Phase 8: Review de Usuario (OBLIGATORIO)

Presentar tabla. Usuario puede modificar. Guardar como `niches-confirmed.md`.

## Phase 9: Scoring (Deep Research)

Leer [prompts-phase9.md](references/prompts-phase9.md). Por nicho: Pain (2-99), Market Size (SAM), Reachability (2-99). Output: `scored.md`.

## Phase 10: Consolidar

Leer [prompts-phase10.md](references/prompts-phase10.md). Tabla final + CSV. Output: `current.md` + `final-table.csv`. Ver [schema.md](references/schema.md).

---

## Runs Parciales

| Situación | Empezar En |
|-----------|------------|
| Tengo datos de foros | Phase 5 — poner docs en `docs/` |
| Tengo pain points | Phase 6 — formatear como `problems.md` |
| Tengo nichos agrupados | Phase 7 — formatear como `niches-raw/merged.md` |
| Puntuar estos nichos | Phase 8 → 9 |
| Validar un nicho | Phase 9 — nicho individual |

## Edge Cases

Ver [methodology.md](references/methodology.md) para reglas detalladas. Resumen:

- **B2B nicho sin datos públicos** → Enterprise Source Stack + micro-entrevistas como fallback
- **Señales mixtas B2B/B2C** → Modo Híbrido (ambos stacks)
- **Foundation contradice scraping** → Foundation GANA para patrones de clientes existentes

## Lite vs Deep

- **Lite**: 50+ problemas, Triple Filter, 3-7 ECPs scored, Self-QA mínimo NEEDS WORK
- **Deep**: 100+ problemas, 5+ tipos de fuente, TAM/SAM por ECP, datos de clientes integrados. Enterprise: >= 4 tipos de fuente B2B. Self-QA: PASS con 0 red flags.

## Después de Entregar

Ofrecer: *"¿Quieres profundizar en algún nicho? → deep-research [nombre]"*

## Self-QA (OBLIGATORIO)

Leer [checklist.md](references/checklist.md). Verificar cada item. No entregar con RED pendiente. Añadir: `<!-- Self-QA: PASS | fecha | items: X pass Y warn 0 red -->`

## Cost Tracking

Al finalizar la run, generar un resumen de coste real en `brand/{slug}/niche-discovery/cost-log.md`:

```
# Cost Log — [fecha]
| Fase | Searches/Docs | Modelo | Tokens In | Tokens Out | Coste Est. |
|------|--------------|--------|-----------|------------|------------|
| 3. SERP | 450 searches | Serper | — | — | $0.45 |
| 4. Scrape | 320 URLs | Firecrawl | — | — | $0.32 |
| 5. Extract | 280 docs | Gemini 3.1 Pro | 560K | 280K | $4.48 |
| 6. Group | 5 chunks + merge | Sonnet+Opus | 80K | 40K | $1.24 |
| 7. Filter | 1 call | Opus | 20K | 16K | $0.50 |
| 10. Consolidate | 1 call | Opus | 25K | 10K | $0.37 |
| **Total** | | | | | **$7.36** |
```

Los scripts imprimen tokens usados en stdout. Capturar esos números para el log.

## Almacenamiento

Versionado estándar en `brand/{slug}/niche-discovery/`: `current.md` + `v{N}.md` + `history.json` + `qa-log.md`.

## Regla Anti-Atajo (HARD RULE)

**web_search ≠ scraping.** Los resúmenes de Google/Gemini son deducciones top-down. El scraping de foros es bottom-up con lenguaje real de usuarios. NUNCA son equivalentes.

Si el agente no puede scrapear URLs reales (scripts rotos, APIs bloqueadas, rate limits):
1. **Informar al usuario** del bloqueo y lo que se ha intentado
2. **Mostrar qué se tiene** (harvest + lo que sí se scrapeó)
3. **Pedir decisión**: continuar con evidencia parcial o esperar a resolver el bloqueo
4. **NUNCA** presentar resúmenes de web_search como si fueran datos de foros scrapeados
