# Content Engine Setup — Growth4U

_Ultima actualizacion: 2026-04-27 por content-engine-setup_

## Por que hicimos esto

El Content Engine necesita configs separados por pillar para que los crons puedan ejecutarse de forma automatica: monitorear noticias relevantes, extraer preguntas reales de Google (PAA), investigar keywords BOFU, vigilar competidores y founders, y orquestar la cadencia editorial. Sin configs, los crons no tienen input para trabajar.

---

## Decisiones por pillar

### P1 — Sistemas de Growth Repetibles

- **Por que este pillar**: El 73% de startups no logran ventas recurrentes. El problema no es falta de esfuerzo — es falta de sistema. Trust Engine es literalmente un sistema repetible que se queda cuando Growth4U se va.
- **News prompt**: Noticias sobre growth systems, repeatable growth frameworks, startup scaling methodologies, unit economics, growth team operations, CAC/LTV optimization para B2B SaaS. Se priorizan fuentes underground (operator newsletters, founder podcasts, Reddit con specifics) sobre big tech press.
- **PAA**: Preguntas que founders, growth managers y CMOs estan haciendo AHORA sobre construir sistemas de growth repetibles, escalar de founder-led a team-operated, y diagnosticar cuellos de botella.
- **Keywords**: `sistema growth startup`, `growth hacking framework`, `como crecer startup post PMF`, `unit economics SaaS`, `CAC LTV startup`, `growth manager que hace`, `playbook growth B2B`
- **Profiles vigilados para este pillar**: Snowball, Product Hackers, TheGrowtHacker, Glissmarket, Elena Verna, Lenny Rachitsky, Maja Voje, Rob Walling, Alex Hormozi, Katelyn Bourgoin + 4 founders

### P2 — Adquisicion Multi-Canal y Confianza

- **Por que este pillar**: El 47% de marcas no tiene estrategia GEO (Generative Engine Optimization). Growth4U es #1-2 en Gemini para queries de fintech en Espana. Defendible y diferenciador.
- **News prompt**: Noticias sobre GEO (Generative Engine Optimization para ChatGPT, Gemini, Perplexity), diversificacion de canales, trust-based acquisition, personal branding LinkedIn para founders B2B, atribucion multi-touch, y cold email warm outbound en 2026.
- **PAA**: Preguntas reales sobre como aparecer en ChatGPT/Gemini para empresas, como diversificar canales de adquisicion sin multiplicar equipo, y como construir trust marketing B2B.
- **Keywords**: `GEO optimizacion IA`, `aparecer en ChatGPT empresa`, `diversificar canales adquisicion`, `LinkedIn alcance organico`, `trust marketing B2B`, `social proof SaaS`, `atribucion multi canal`
- **Profiles vigilados para este pillar**: iSocialWeb, Flat101, TEAM LEWIS, Elena Verna, Maja Voje, Ross Simmonds, Amanda Natividad, Joe Pulizzi + 3 founders

### P3 — Growth en Sectores Regulados

- **Por que este pillar**: Pain score 90 (el mas alto de todos los clusters). Zero competencia — NINGUN competidor tiene expertise CNMV/BdE/MiCA. Nicho premium que justifica newsletter gated.
- **News prompt**: Noticias sobre marketing fintech bajo CNMV, MiCA 2025-2026, como lanzar marketing pre-autorizacion regulatoria, casos reales de growth bajo regulacion (Bnext, Bit2Me, Criptan), compliance como ventaja competitiva.
- **PAA**: Preguntas sobre que se puede y no se puede hacer en marketing fintech bajo CNMV, deadlines MiCA 2026, y como hacer growth cuando la regulacion te frena.
- **Keywords**: `marketing fintech CNMV`, `MiCA crypto espana`, `compliance marketing fintech`, `que puede hacer publicidad fintech espana`, `CNMV reglamento publicidad`
- **Profiles vigilados para este pillar**: Alfonso de la Nuez (own brand, todos los pillars)

### P4 — El Modelo Agencia Esta Roto

- **Por que este pillar**: Gartner reporta que el 39% de CMOs estan recortando agencias. El mercado de fractional CMO crecio +245% en 2026. Los founders burned buscan alternativas — y las buscan en Google. Pillar perfecto para SEO bottom-funnel con lead magnets.
- **News prompt**: Noticias sobre el fracaso del modelo agencia tradicional (bait-and-switch, metricas de vanidad, retainer infinito), fractional CMO como alternativa, como evaluar si tu agencia funciona, build vs buy, y metricas reales de revenue.
- **PAA**: Preguntas sobre por que falla el modelo agencia, que preguntar antes de contratar una agencia de growth, como saber si tu agencia te esta timando, y cuando internalizar vs externalizar.
- **Keywords**: `fracaso modelo agencia marketing`, `fractional CMO espana`, `como evaluar agencia growth`, `agencia marketing retainer vs fijo`, `kpis marketing revenue`
- **Profiles vigilados para este pillar**: Snowball, TEAM LEWIS, Joe Pulizzi, Katelyn Bourgoin + 3 founders

### P5 — Growth con IA: Ejecucion, No Hype

- **Por que este pillar**: El 88% de empresas usan IA pero solo el 6% la tienen implementada en operaciones reales. La brecha del 82% es EXACTAMENTE lo que SanchoCMO resuelve — un sistema multi-agente que EJECUTA growth, no una demo.
- **News prompt**: Noticias sobre agentes de marketing en produccion, IA como sistema de ejecucion (no como generador de ideas), como montar un content engine con IA, GEO + IA para optimizar para LLMs, y el CMO de 1 persona con stack IA.
- **PAA**: Preguntas sobre que pueden hacer hoy los agentes de marketing IA vs que no pueden, como implementar IA en operaciones de growth, y herramientas IA para B2B.
- **Keywords**: `agentes IA marketing B2B`, `content engine IA`, `implementar IA marketing`, `IA cold outreach`, `CMO IA herramientas`, `GEO para ChatGPT`
- **Profiles vigilados para este pillar**: Product Hackers (Luis Diaz del Dedo, Jose Carlos Cortizo), Elena Verna, Rob Walling, Alex Hormozi, Amanda Natividad + 1 founder

---

## Profiles a monitorizar

- **7 empresas competidoras**: Snowball, Product Hackers, TheGrowtHacker, iSocialWeb, Flat101, Glissmarket, TEAM LEWIS
- **16 founders y voces del sector**: con `parent_company_id` para founders, sin parent para voces del sector
- **1 own brand**: Alfonso de la Nuez (Growth4U) — monitorizar propia presencia
- **Asignacion a pillars**: cada profile tiene `pillars_relevant` (1-3 pillars)
- Total: **24 profiles** en schema v2 unificado

Ver lista completa en MC UI → Inputs → 🕵️ Perfiles a monitorizar.

---

## Cadencia editorial

| Canal | Frecuencia | Mejores dias | Perfiles | Gating |
|-------|-----------|-------------|---------|--------|
| **LinkedIn** | 3-5x/semana | L, M, X, J | Alfonso (3/sem) + Martin (2/sem) | Ungated |
| **Twitter** | 3-5x/semana | L-V | Alfonso (1/sem) | Ungated |
| **Blog** | 2x/mes | — | — | Gated (bottom funnel, lead magnets) |
| **Newsletter** | 1x/semana | Viernes | — | Gated (email capture) |

**Batch workflow**: Lunes 2h — revisar ideas aprobadas, pasar Clarify por todas, batch-generar drafts de la semana.

Ver y editar en MC UI → Inputs → ⏰ Cadencia.

---

## Crones conectados

| Cron | Cuando | Lee | Escribe |
|------|---------|-----|---------|
| 📰 **News Monitor** | 7am L-V | `news-prompts/P*.yml` | `research-signals/{date}-news.json` |
| 🕵️ **Competitor Monitor** | 7am L-V | `sources.json` (profiles) | `research-signals/{date}-creators.json` |
| 🔑 **Keyword Research** | Semanal (lunes 6am) | `keywords-seed/P*.yml` | `research-signals/{date}-keywords.json` |
| ❓ **PAA Monitor** | Semanal (lunes 6am) | `paa-queries/P*.yml` | `research-signals/{date}-paa.json` |
| 🧠 **Classify + Ideas** | 7:30am L-V | `research-signals/*.json` + **POV Bank en Neon** + `content-pillars.md` + `cadence-config.yml` | `idea-queue.json` (con angle_draft = 1 parrafo POV) |
| 📬 **Editorial Dispatch** | 8:30am L-V | `idea-queue.json` + `cadence-config.yml` | Discord/Slack del cliente |
| 🎯 **POV Bank Refresh** | 1er dia mes 9am | Tablas Neon (`pov_*`) | Propuestas revisables en Neon |

Todos los links apuntan al dashboard del cliente en Mission Control.

---

## POV Bank

El POV Bank vive en Neon. El antiguo `pov-bank.json` solo sirve como import explícito/backfill manual. Growth4U parte de esta postura por cada pillar:

| Pillar | Core belief resumido |
|--------|---------------------|
| P1 | Growth es un sistema, no tacticas. Si depende de una persona o canal, es respiracion asistida. |
| P2 | Alquilar atencion (paid) es fragil. Un motor real diversifica y construye activos de confianza. |
| P3 | La regulacion es un filtro que elimina a los que no saben jugar. Quien domina compliance tiene ventaja in-copyable. |
| P4 | El modelo agencia retainer genera deliverables sin responsabilidad por resultados. |
| P5 | El 88% usa IA pero solo el 6% la tiene implementada. La diferencia es ejecutar, no discutir prompts. |

Ver y editar en MC UI → Inputs → 🎯 POV Bank.

---

## Como iterar

- **Regenerar TODOS los configs**: pide a Sancho en este chat ("regenera el setup completo del Content Engine")
- **Editar un config concreto sin regenerar**: MC UI → Inputs → seccion que toque (News Prompts, PAA, Keywords, Profiles, Cadencia, POV Bank)
- **POV Bank**: MC UI → Inputs → 🎯 POV Bank (o chat de la task P14-T04)
- **Añadir/quitar profiles**: MC UI → Inputs → 🕵️ Perfiles a monitorizar

<!-- Self-QA: PASS | 2026-04-27 -->
