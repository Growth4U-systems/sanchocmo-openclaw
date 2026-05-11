---
name: niche-discovery-100x
description: "Descubrimiento end-to-end de ECPs con metodología 100x. Cluster por NECESIDAD (no por persona). Reachability como proceso de descubrimiento (Trust Map → Search Map → Channel Map). Auto-detecta B2C/SMB vs B2B Enterprise. Usar cuando: identificar ECPs, validar nichos, ICP, o 'a quién le vendo'. Triggers: find niches, discover market, ICP, target audience, customer segments, niche discovery, ECP. NO usar para: análisis de mercado amplio (market-intelligence), posicionamiento (positioning-messaging), segmentación solo datos existentes (existing-customer-data). Requiere: company-context, self-intelligence, competitor-intelligence, swot-analysis."
metadata:
  context_required:
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/market-and-us/self/current.md
    - brand/{slug}/market-and-us/competitor-*/current.md
    - brand/{slug}/market-and-us/swot/current.md
    - brand/{slug}/market-and-us/market/current.md
    - brand/{slug}/market-and-us/summary/current.md
  context_writes:
    - brand/{slug}/go-to-market/ecps/ecps.md
    - brand/{slug}/go-to-market/ecps/problems.md
---

# ICP & 100x Niche Discovery v4.0

> Minar conversaciones reales y señales enterprise para problems, filtrar por capacidad de solución, clusterizar por NECESIDAD (no persona), descubrir reachability (Trust Map → Search Map → Channel Map), puntuar con evidencia.

**Depende de**: company-context, self-intelligence, competitor-intelligence, swot-analysis
**Opcional**: market-intelligence, existing-customer-data (mejoran harvest si existen)
**Produce**: `brand/{slug}/go-to-market/ecps/ecps.md` + `brand/{slug}/go-to-market/ecps/problems.md`

## Pipeline

```
STEP 1: INTAKE + DETECTION + HARVEST
STEP 2: STRATEGY + DISCOVERY + EXTRACTION
STEP 3: SOLUTION FILTER (filtrar por capacidad, no por persona)
STEP 4: ECP CLUSTERING + REACHABILITY DISCOVERY (cluster por necesidad, no por persona)
STEP 5: SCORING + PRIORITIZATION (evidence-based)
OUTPUT: problems.md (audit trail) + ecps.md (acción)
```

## Terminología

- **ECP** (no "Beach Head Segment", no "nicho", no "persona")
- **Problem** (no "need", no "pain", no "pain point")
- **Trust Map / Search Map / Channel Map** (no "reachability score" genérico)

## Referencias

| Archivo | Cuándo leer |
|---------|-------------|
| [market-detection.md](references/market-detection.md) | Step 1 — tabla de señales y lógica de detección |
| [harvest-protocol.md](references/harvest-protocol.md) | Step 1 — protocolo de extracción de Foundation |
| [enterprise-sources.md](references/enterprise-sources.md) | Step 2 cuando mercado = B2B Enterprise |
| [thematic-forums.md](references/thematic-forums.md) | Step 2 cuando mercado = B2C/SMB |
| [commands.md](references/commands.md) | Step 2 B2C — comandos de scripts |
| [prompts-phase6a.md](references/prompts-phase6a.md) | Step 2 — extracción de problems (referencia de formato) |
| [methodology.md](references/methodology.md) | Reglas scoring, edge cases |
| [schema.md](references/schema.md) | Schema de output + tipos de fuente válidos |
| [examples.md](references/examples.md) | Ejemplos de config.json, problems.md |

## API Keys requeridas (env vars) — Solo modo B2C

`SERPER_API_KEY`, `FIRECRAWL_API_KEY`, `OPENROUTER_API_KEY`

Modo B2B Enterprise usa herramientas del agente (web_search, web_fetch) — no necesita API keys externas.

---

## Step 1: Intake + Detection + Harvest

### 1a. Intake (Contexto Foundation)

Auto-leer de Foundation — NO preguntar lo que ya tenemos.

1. Identificar slug del cliente desde systemPrompt
2. Leer: `brand/{slug}/company-context/current.md`, `self-intelligence/current.md`, `competitor-intelligence/current.md`, `swot-analysis/current.md`, `existing-customer-data/current.md` (si existe)
3. Extraer: company_name, product, industry, target, country, context_type (B2B/B2C/Both)
4. Si falta pilar crítico → informar al usuario, sugerir completar Foundation primero

### 1b. Verificación de Cobertura de Foros

Si el país del cliente NO es España, comprobar si hay foros mapeados en [thematic-forums.md](references/thematic-forums.md). Si no los hay, ofrecer descubrirlos.

### 1c. Detección Tipo de Mercado

Leer [market-detection.md](references/market-detection.md). Evaluar 5 señales desde contexto de empresa e ICP. Declarar resultado.

### 1d. Harvest de Datos Existentes (OBLIGATORIO)

Leer [harvest-protocol.md](references/harvest-protocol.md). Extraer problems de Foundation ANTES de cualquier investigación nueva. Si >= 50 problems con >= 3 tipos de fuente → saltar a Step 3.

---

## Step 2: Strategy + Discovery + Extraction

### 2a. Generación de Estrategia

Generar estrategia de búsqueda usando contexto Foundation + tipo de mercado:

- **Modo B2C/SMB**: 10-15 life context words + 8-12 product domain words + fuentes de [thematic-forums.md](references/thematic-forums.md)
- **Modo B2B Enterprise**: ICP role keywords + pain domain words + fuentes de [enterprise-sources.md](references/enterprise-sources.md)
- Presentar estrategia al usuario. Solo proceder tras aprobación explícita. Guardar como `config.json`.

### 2b. Discovery + Extraction (BIFURCADA POR MODO)

**Modo B2C/SMB (Pipeline Automatizado):**
Ejecutar scripts — ver [commands.md](references/commands.md). Si scripts fallan (SIGTERM, timeout) → activar Fallback Manual (ver abajo).

**Modo B2B Enterprise (Investigación por Agente):**
Leer [enterprise-sources.md](references/enterprise-sources.md). Trabajar fuentes con web_search + web_fetch. Stop: >= 50 problems con >= 3 tipos de fuente.

**Modo Híbrido:** Ejecutar ambos stacks. Deduplicar en Step 3.

### Fallback Manual (cuando scripts fallan)

Usar herramientas del agente:
1. `web_search` SOLO para encontrar URLs de threads/posts/reviews
2. `web_fetch` OBLIGATORIO para leer contenido real de cada URL
3. Mínimo 10 URLs scrapeadas con contenido real
4. Cada problem extraído DEBE incluir cita textual del usuario original

**PROHIBIDO**: Usar `web_search` como sustituto de scraping. `web_search` = descubrimiento de URLs. `web_fetch` = lectura de contenido real.

**Output de Step 2**: `problems-raw.md` con todos los problems extraídos + JTBD.

---

## Step 3: Solution Filter

> Filtrar por CAPACIDAD DE RESOLUCIÓN, no por tipo de persona.

Para cada problem extraído en Step 2, aplicar 3 filtros:

### Filtro 1: SWOT (sin cambio)
- ¿Este problem se alinea con al menos 1 Strength del SWOT?
- ¿Explota al menos 1 Weakness del competidor o Opportunity del mercado?
- Score: PASS / PARTIAL / FAIL

### Filtro 2: Solution Filter (reemplaza ICP Filter)

**Pregunta central:** "¿Podemos resolver ESTE problem específico mejor que las alternativas que ya usan?"

Evaluar:
- ¿Tenemos capacidad REAL de resolverlo hoy (o con esfuerzo menor)?
- ¿Las alternativas actuales dejan un gap que nosotros cubrimos?
- ¿Podemos LLEGAR a las personas con este problem? (pre-check de reachability — no necesita ser exhaustivo, solo "¿es posible?")

Score: PASS / PARTIAL / FAIL

**IMPORTANTE**: NO filtrar por tipo de persona. Un problem válido puede venir de cualquier persona — lo que importa es si PODEMOS RESOLVERLO, no QUIÉN lo tiene.

### Filtro 3: Product Filter (sin cambio)
- ¿Puede nuestro producto RESOLVER este problem HOY?
- Score 1-5: 1=no resuelve, 3=parcialmente, 5=totalmente
- Si < 3 → PARTIAL con flag "needs product work"

### Regla de decisión
Los 3 deben ser PASS o PARTIAL para proceder. Si CUALQUIERA es FAIL → fuera.

### Output de Step 3
Guardar en **`problems.md`** (audit trail):
- Todos los problems filtrados con JTBD completo
- Cada problem tiene: statement, why, persona, alternatives, source, source_url, engagement, jtbd_statement
- Filtros aplicados (PASS/PARTIAL/FAIL por filtro)
- Este archivo es REFERENCIA — "¿de dónde salió este ECP?"

---

## Step 4: ECP Clustering + Reachability Discovery

> Cluster por NECESIDAD (qué problema tienen), no por PERSONA (quién son).

### 4a. Criterios de Agrupación (por orden de importancia)

**1. SAME CORE NEED (el "I want to" del JTBD)**
- ¿Comparten la misma motivación central?
- "Quiero un sistema de growth repetible" agrupa a founders, CMOs, y heads of growth — no importa su título
- **QA**: Si el "I want to" puede decirlo 50 personas diferentes sin cambiar una palabra y sigue siendo específico → buen cluster

**2. SAME TRIGGER (qué les hace buscar solución AHORA)**
- ¿Comparten el mismo momento de "ya no puedo más"?
- Ejemplo: "Acabo de cerrar ronda y el board pide resultados en 90 días"
- Ejemplo: "Tercera agencia que falla, ya no confío en nadie"

**Regla de splitting/merging:**
- Si dos clusters comparten core need pero tienen trust sources y search behavior DIFERENTES → son ECPs distintos (diferentes canales = diferente ejecución)
- Si dos clusters tienen core needs ligeramente diferentes pero trust sources y search behavior IGUALES → considerar fusionar (mismo canal = misma ejecución)

### 4b. Reachability Discovery (OBLIGATORIO por cada cluster candidato)

**Parte 1: Trust Map — ¿En quién confían?**
Para cada cluster, investigar con web_search + web_fetch:
- Influencers/creadores específicos (NOMBRES, no categorías)
- Publicaciones/newsletters que leen
- Comunidades donde preguntan (Slack, Discord, foros, Reddit subs específicos)
- Eventos/conferencias donde van
- Podcasts que escuchan

**Parte 2: Search Map — ¿Qué buscan activamente?**
- Keywords de awareness ("cómo crecer mi startup sin equipo de marketing")
- Keywords de consideración ("fractional CMO vs agencia growth")
- Keywords de decisión ("mejor consultora growth startups España")

**Parte 3: Channel Map — La convergencia Trust × Search**
Cruzar Trust Map × Search Map:
- **Canal PRIMARIO**: Donde un medio de confianza TAMBIÉN aparece en resultados de búsqueda (trust + search convergen). Máxima eficiencia.
  - Ejemplo: "Product Hackers Go! es canal primario porque founders confían en esa comunidad Y buscan soluciones growth allí"
- **Canal SECUNDARIO**: Donde solo hay confianza O búsqueda, pero no ambos.
- Para cada canal primario, definir **ACCIÓN ESPECÍFICA**:
  - ❌ MAL: "publicar en LinkedIn"
  - ✅ BIEN: "Responder en hilos de Product Hackers Go! sobre problemas de growth sin sistema, compartir frameworks, DM a founders que expresan frustración"

**QA de canales**: Un canal genérico ("LinkedIn") NO es válido. Debe incluir: plataforma específica + contexto + acción concreta.

### 4c. Output de Step 4: Cada ECP captura

```
- Name: descriptivo, basado en la NECESIDAD (no en la persona)
  ❌ MAL: "Solo Technical Founder" / "SaaS B2B Post-PMF"
  ✅ BIEN: "Necesita growth system repetible" / "Canal principal muerto, necesita diversificar"

- JTBD Synthesis (OBLIGATORIO — síntesis de los problems del cluster):
  - Unified Problem: Voz RAW del founder — como un post de Reddit o un desahogo en un café. Desordenado, emocional, con datos específicos inventados pero realistas (cifras, plazos, situaciones concretas). Mezcla de los problems del cluster. NO es un resumen ejecutivo ni una paráfrasis del JTBD. Debe sonar a QUEJA REAL, no a síntesis.
    ❌ MAL: "Mi canal principal se está muriendo y no tengo plan B" (esto es un JTBD disfrazado)
    ✅ BIEN: "En enero teníamos 400 visitas orgánicas al día. Google sacó AI Overviews y ahora tenemos 290. Le dije a mi socio 'metamos más en Google Ads' y el CPC ha subido un 40%..."
  - Why: Por qué este problema les importa — consecuencias económicas, emocionales, operativas
  - Situation: "Cuando [contexto concreto que desencadena la búsqueda]"
  - Motivation: "Quiero [lo que necesitan — el core need]"
  - Expected Outcome: "Para poder [resultado medible que esperan]"
  - JTBD Statement: "Cuando [Situation], quiero [Motivation], para poder [Expected Outcome]"
  - Hypothesis: "Creemos que [quienes tienen esta necesidad] se sienten frustrados por [problema], lo que les obliga a [workaround]. Para ellos, nuestra solución es la única que combina [F1] con [F2], permitiéndoles [resultado] sin [negativo competencia]."
  - Alternatives: Qué hacen HOY para resolver — incluyendo "no hacer nada", soluciones manuales, competidores específicos

- Core Need: el "I want to" del JTBD en sus palabras
- Trigger: qué les hace buscar solución ahora
- Problems included: IDs de los problems del cluster (ref a problems.md)
- Trust Map: influencers, publicaciones, comunidades, eventos, podcasts (NOMBRES)
- Search Map: keywords awareness / consideración / decisión
- Channel Map: primary (trust+search convergen) + secondary, con acciones concretas
- Why we win: nuestra ventaja específica para esta necesidad
- Founder Moat: badge (🏆 ALTO / ⭐ MEDIO / —) con justificación si aplica
```

**Target**: Sin límite rígido. Los ECPs que salgan con necesidad concreta + reachability descubierta. Puede ser 5, puede ser 12, puede ser 20.

### Checkpoint: Presentar ECPs al usuario antes de scoring. Solo proceder tras aprobación.

---

## Step 5: Scoring + Prioritization

### Fórmula

```
ECP Score = Pain × 0.35 + Reachability × 0.40 + SAM_norm × 0.25
```

Cada score es **2-99** (no 1-10). Cada score DEBE ir acompañado de una **explicación de 200-400 chars** justificando la nota.

- **Pain (2-99)**: frecuencia de quejas, willingness to pay, intensidad emocional
  - 2-20: Nice-to-have, no urgente
  - 21-50: Dolor real pero manejable con alternativas
  - 51-75: Dolor significativo, buscan activamente solución
  - 76-99: Hair-on-fire, pagarían casi cualquier precio
  - **Explicación obligatoria**: "Pain 82 — [por qué esta nota: frecuencia en foros, WTP declarado, consecuencias económicas, etc.]"

- **Reachability (2-99)**: BASADO EN EVIDENCIA de Reachability Discovery (Step 4):
  - 76-99: 2+ canales primarios descubiertos con acciones concretas
  - 51-75: 1 canal primario + 2+ secundarios
  - 21-50: Solo canales secundarios o canales genéricos
  - 2-20: No se encontraron canales específicos
  - **Explicación obligatoria**: "Reach 78 — [canales descubiertos, por qué convergen trust+search, tamaño de las comunidades, etc.]"

- **SAM (2-99)**: tamaño del mercado alcanzable (normalizado al país target)
  - **Explicación obligatoria**: "SAM 65 — [cifra absoluta, fuentes, método de estimación, tendencia]"

**Reachability tiene peso 0.40 (el mayor)** porque si no puedes llegar, el ECP no existe. Y ahora es un score basado en canales descubiertos, no subjetivo.

### Founder Moat como qualifier (NO en la fórmula)

Después del scoring, añadir badge por ECP:

- **🏆 Founder Moat: ALTO** — Track record demostrable. Ejemplo: "Bnext 0→400K, Criptan x10". Ventaja competitiva difícil de replicar.
- **⭐ Founder Moat: MEDIO** — Experiencia relevante pero sin caso de éxito específico. Credibilidad pero sin prueba irrefutable.
- **(sin badge)** — Sin track record diferencial. El ECP es válido, sin bonus de credibilidad.

Founder Moat **NO resta puntos**. Solo bonifica. Una empresa sin founder con moat simplemente no tiene badges — todos sus ECPs compiten por Pain + Reachability + SAM.

### Priorización

Ordenar ECPs por score. Incluir recomendación: por cuáles empezar y por qué.

---

## Output

### Output 1: `problems.md` (audit trail)

```markdown
# Problems — [Empresa]
> Generado: [fecha] | Total: [N] problems filtrados de [M] extraídos

## Problem #[ID]
- **Statement:** [problema en sus palabras]
- **Why:** [por qué les importa]
- **Persona:** [quién lo tiene — descripción, no arquetipo]
- **Alternatives:** [qué hacen hoy]
- **Source:** [tipo] | **URL:** [url] | **Engagement:** [score/votes]
- **JTBD:** "Cuando [situación], quiero [motivación], para poder [resultado]"
- **Filtros:** SWOT: [PASS/PARTIAL] | Solution: [PASS/PARTIAL] | Product: [score/5]
```

### Output 2: `ecps.md` (acción — consumen skills downstream)

```markdown
# ECPs — [Empresa]
> Generado: [fecha] | Total: [N] ECPs | Method: [resumen]

## ECP: [Nombre basado en necesidad]
**Core Need:** "[I want to del JTBD]"
**Trigger:** [qué les hace buscar solución ahora]
**Problems:** #[IDs] (ver problems.md)

### JTBD Synthesis
- **Unified Problem:** [Resumen del problema unificado — mezcla de los problems del cluster, en sus palabras]
- **Why:** [Por qué les importa — consecuencias económicas, emocionales, operativas]
- **JTBD:** "Cuando [situación concreta], quiero [motivación específica], para poder [resultado medible]."
- **Hypothesis:** "Creemos que [quienes tienen esta necesidad] se sienten frustrados por [problema], lo que les obliga a [workaround]. Para ellos, nuestra solución es la única que combina [F1] con [F2], permitiéndoles [resultado] sin [negativo competencia]."
- **Alternatives:** [Qué hacen HOY — incluyendo "no hacer nada", soluciones manuales, competidores]

### Trust Map
- **Influencers:** [nombres específicos]
- **Newsletters:** [nombres]
- **Comunidades:** [nombres + plataforma]
- **Eventos:** [nombres]
- **Podcasts:** [nombres]

### Search Map
- **Awareness:** [keywords]
- **Consideración:** [keywords]
- **Decisión:** [keywords]

### Channel Map
| Tipo | Canal | Acción específica |
|------|-------|-------------------|
| 🎯 Primario | [canal concreto] | [acción concreta con contexto] |
| 📡 Secundario | [canal concreto] | [acción concreta] |

### Scoring
| Pain | Reachability | SAM | **Score** |
|------|-------------|-----|-----------|
| [2-99] | [2-99] | [2-99] | **[total]** |

**Pain [score]** — [explicación 200-400 chars: frecuencia, WTP, intensidad, consecuencias]
**Reachability [score]** — [explicación 200-400 chars: canales descubiertos, convergencia trust×search, tamaño comunidades]
**SAM [score]** — [explicación 200-400 chars: cifra absoluta, fuentes, método, tendencia]

### Context
- **Why we win:** [ventaja específica para esta necesidad]
- **Founder Moat:** [🏆 ALTO / ⭐ MEDIO / —] — [justificación]

---
[Repetir por ECP]

## Priorización

| # | ECP | Pain | Reach | SAM | Score | Moat | Recomendación |
|---|-----|------|-------|-----|-------|------|---------------|
[Tabla ordenada por score]

## Recomendación Estratégica
[Por cuáles empezar y por qué]
```

### Versionado

Estándar: `ecps.md` = current + `ecps-v{N}.md` + `history.json`. Misma estructura para `problems.md`.

---

## Runs Parciales

| Situación | Empezar En |
|-----------|------------|
| Tengo datos de foros | Step 2 (extraction) — poner docs en `docs/` |
| Tengo problems extraídos | Step 3 — formatear como problems-raw.md |
| Tengo problems filtrados | Step 4 — ya tienes problems.md |
| Puntuar estos ECPs | Step 5 — necesitas ECPs con reachability |

## Edge Cases

- **B2B sin datos públicos** → Enterprise Source Stack + micro-entrevistas como fallback
- **Señales mixtas B2B/B2C** → Modo Híbrido (ambos stacks)
- **Foundation contradice scraping** → Foundation GANA para patrones de clientes existentes
- **< 30 problems tras Step 3** → Ampliar búsqueda o informar gap al usuario
- **Reachability Discovery no encuentra canales** → El ECP baja a score 1-4 en Reachability. Si NINGÚN ECP tiene canales → replantear estrategia.

## Lite vs Deep

- **Lite**: 50+ problems, Solution Filter, 3+ ECPs con reachability descubierta, Self-QA mínimo NEEDS WORK
- **Deep**: 100+ problems, 5+ tipos de fuente, Trust+Search+Channel Map completo por ECP, Founder Moat evaluado. Self-QA: PASS.

## Después de Entregar

Ofrecer: *"¿Quieres profundizar en algún ECP? → deep-research [nombre]"*

---

## Self-QA Checklist (MANDATORY antes de entregar)

### Step 3 Quality
- [ ] ¿El Solution Filter evalúa capacidad de resolución, no tipo de persona?
- [ ] ¿Los problems filtrados se guardaron en problems.md?
- [ ] ¿Cada problem tiene JTBD completo + source + filtros aplicados?

### Step 4 Quality
- [ ] ¿Cada ECP está nombrado por NECESIDAD, no por arquetipo de persona?
  - ❌ MAL: "Solo Technical Founder" / "SaaS B2B Post-PMF"
  - ✅ BIEN: "Necesita growth system repetible" / "Canal principal muerto"
- [ ] ¿El Unified Problem suena a voz RAW de founder (queja real, emocional, con datos concretos) y NO a resumen ejecutivo ni paráfrasis del JTBD Statement?
  - ❌ MAL: "Mi canal principal se está muriendo y no tengo plan B" (esto es un JTBD disfrazado)
  - ✅ BIEN: "En enero teníamos 400 visitas orgánicas al día. Google sacó AI Overviews y ahora tenemos 290..."
- [ ] ¿Cada ECP tiene Reachability Discovery completa? (trust_map + search_map + channel_map)
- [ ] ¿TODOS los canales primarios son específicos con acción concreta?
  - ❌ MAL: "LinkedIn"
  - ✅ BIEN: "LinkedIn: posts sobre growth system vs growth hacks en respuesta a founders que comparten frustración"
- [ ] ¿Cada ECP tiene al menos 1 canal primario (trust + search convergen)?
- [ ] ¿El Channel Map muestra dónde convergen Trust y Search?
- [ ] QA del "I want to": ¿Lo pueden decir 50 personas diferentes sin cambiar una palabra y sigue siendo específico?

### Step 5 Quality
- [ ] ¿Reachability score está basado en evidencia de Step 4 (canales descubiertos)?
- [ ] ¿Founder Moat se aplica como qualifier (badge), no como filtro que descarte?
- [ ] ¿La priorización incluye recomendación de por cuáles empezar?

### Output Quality
- [ ] ¿Se generaron 2 archivos: problems.md + ecps.md?
- [ ] ¿ecps.md tiene toda la info que necesitan skills downstream (positioning-messaging, channel-prioritization)?
- [ ] ¿Ningún ECP tiene nombre de arquetipo de persona?
- [ ] ¿Ningún canal es genérico sin acción concreta?

### Red Flags (auto-detectar y reportar)
- > 40% de problems sin cita textual real → "⚠️ BAJA EVIDENCIA"
- > 80% de problems de una sola fuente → "Baja diversidad de fuentes"
- Algún ECP sin NINGÚN canal primario → "⚠️ Reachability no descubierta"
- Algún ECP nombrado por persona en vez de necesidad → "⚠️ Arquetipo, no necesidad"

### Veredicto
- **PASS** (todos chequeados, 0 red flags): Output listo
- **NEEDS WORK** (1+ sin chequear o 1 red flag): Arreglar y re-ejecutar
- **INSUFFICIENT** (3+ sin chequear o 2+ red flags): Volver atrás

---

## Regla Anti-Atajo (HARD RULE)

**web_search ≠ scraping.** Los resúmenes de Google/Gemini son deducciones top-down. El scraping de foros es bottom-up con lenguaje real. NUNCA son equivalentes.

## Almacenamiento

Versionado estándar en `brand/{slug}/go-to-market/ecps/`: `ecps.md` + `problems.md` + `ecps-v{N}.md` + `history.json`.
