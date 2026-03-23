# PDR: Sistema Outbound Multicanal — Instantly + HeyReach
> Autor: Cervantes | Fecha: 2026-03-22 | Estado: DRAFT
> Contexto: Integración ColdIQ GTM Skills + herramientas de ejecución

## 1. Visión

Sistema completo de outbound B2B que va de señal → contacto → secuencia → envío → respuesta → booking, orquestado por Sancho, ejecutado via Instantly (email) y HeyReach (LinkedIn).

## 2. Stack Confirmado

| Capa | Herramienta | API |
|------|-------------|-----|
| Email sending | Instantly (Hypergrowth plan) | V2 REST — `developer.instantly.ai` |
| LinkedIn outreach | HeyReach (Starter+) | REST — Postman docs + webhooks |
| Orquestación | Sancho (OpenClaw crons + skills) | — |
| Enrichment | Apollo/Apify/DataForSEO (existentes) | — |

## 3. API Capabilities Mapping

### Instantly V2
- **Auth:** Bearer token, API scopes, multiple keys
- **Rate limit:** No documentado públicamente (prudente: 60 req/min)
- **Campaigns:** CRUD, activate/pause, duplicate, share, variables, analytics, steps analytics, sending status
- **Leads:** CRUD, bulk add to campaign, merge, interest status, subsequence assignment, move between campaigns
- **Accounts:** CRUD, warmup enable/disable, vitals test, daily analytics, custom tracking domain
- **Analytics:** Campaign steps analytics, daily account analytics, warmup analytics
- **Webhooks:** Reply events, deliverability checks
- **Block lists:** CRUD, bulk, CSV export
- **Background jobs:** Async operations monitoring

### HeyReach
- **Auth:** X-API-KEY header (no expiration, revocable)
- **Rate limit:** 300 req/min
- **Campaigns:** List, filter, pause, resume, get by lead
- **Leads:** Add to campaign (100/batch, with personalization), get by campaign, get by LinkedIn URL, stop outreach
- **Webhooks:** Real-time events (replies, connections, etc.), 5 retry attempts over 24h
- **MCP:** Dedicated endpoints for AI integrations (Claude, Clay)
- **Integrations nativas:** Instantly, Trigify, RB2B, HubSpot, Salesforce

## 4. Skills a Crear/Modificar

### NUEVOS (Ejecución)

#### 4.1 `instantly-executor` (P0)
**Propósito:** Integración directa con Instantly V2 API
**Funciones:**
- `create_campaign(name, sequence, accounts, schedule)` → Campaign ID
- `add_leads(campaign_id, leads[])` → Bulk upload con variables de personalización
- `activate_campaign(campaign_id)` / `pause_campaign(campaign_id)`
- `get_analytics(campaign_id)` → Opens, replies, bounces, meetings
- `get_sending_status(campaign_id)` → Diagnóstico de envío
- `manage_warmup(account_ids, enable/disable)`
- `manage_blocklist(entries[])` → Unsubscribe management
**Integraciones MC:**
- Endpoint en Mission Control para que cliente configure API key Instantly
- Dashboard de campaign analytics

#### 4.2 `heyreach-executor` (P0)
**Propósito:** Integración directa con HeyReach API
**Funciones:**
- `add_leads_to_campaign(campaign_id, leads[], personalization{})` → Max 100/batch
- `get_campaign_leads(campaign_id, status="pending")` → Monitor progreso
- `get_lead_info(linkedin_url)` → Estado del lead
- `stop_lead(campaign_id, linkedin_url)` → Parar outreach a un lead
- `setup_webhooks(url, campaigns[], events[])` → Configurar notificaciones
**Integraciones MC:**
- Endpoint en Mission Control para API key HeyReach
- Webhook receiver para eventos de reply/connection

#### 4.3 `multichannel-orchestrator` — ⏸️ PAUSADO
**Decisión (2026-03-22):** Canales independientes primero. Email (Instantly) y LinkedIn (HeyReach) operan como pipelines separados sin state compartido. Se retomará cuando ambos canales estén validados independientemente.
**Ahorro:** ~10h de implementación (state model, cross-channel stop logic, timing coordination)

#### 4.4 `reply-classifier` (P1)
**Propósito:** LLM clasifica respuestas de email/LinkedIn
**Categorías:**
- `positive_interested` → Notificar + sugerir booking
- `positive_referral` → "Habla con X" → crear nuevo lead
- `negative_not_interested` → Stop + tag reason
- `negative_bad_timing` → Reschedule +30/60/90 días
- `out_of_office` → Reschedule basado en fecha retorno
- `wrong_person` → Stop + buscar contacto correcto
- `unsubscribe` → Stop + add to blocklist
- `question` → Notificar para respuesta manual
**Input:** Webhook payload de Instantly/HeyReach
**Output:** Acción automatizada + notificación Discord si needed

#### 4.5 `outbound-analytics` (P2)
**Propósito:** Dashboard de métricas outbound
**Métricas:**
- Por campaña: sent, opens, replies, positive replies, meetings booked
- Por signal/play: qué triggers convierten más
- Por ECP: qué persona responde más
- Por template: qué copy funciona
- Benchmarks: comparar vs ColdIQ (18-22% single signal, 35-40% multi)
**Reporting:** Semanal automático al cliente (Discord thread o MC)

### ENRIQUECER (Existentes + ColdIQ Knowledge)

#### 4.6 `signal-definition` + `signal-monitor` (P0) — Enriquecer
**Estado actual:** Básicos. `signal-definition` tiene 1 reference (signal-types.md). `signal-monitor` tiene 2 (apify-actors, monitoring-tools).
**Fuente ColdIQ:** Signal Sourcer master skill (9 sub-skills) — el mejor skill del repo.
**Qué importar:**
- `signal-taxonomy.md` — 137 buying triggers organizados por categoría (job changes, funding, hiring, website visitors, company events, tech changes, competitor signals, content engagement, multi-signal). Cada trigger con: detection method, timing window, relevance score.
- `signal-scoring.md` — Framework de scoring 0-150+ con weights por tipo de señal, heat levels (Red Hot/Hot/Warm/Cool/Cold), y SLAs de acción (Red Hot <1h, Hot <24h, etc).
- `signal-detection-tools.md` — 30 triggers con: herramienta de detección, timing window, coste en Clay credits, signal freshness rules, reliability tiers, signal sources por data party (1st/2nd/3rd).
- `tool-setup-guides.md` — Guías de setup para RB2B, Trigify, Common Room, Bombora, Koala, Warmly, 6sense.
**Acción en SKILL.md:** Añadir routing a las 9 categorías de señales del Signal Sourcer. Actualizar trigger phrases.
**Esfuerzo:** ~4h | **Impacto:** ALTO

#### 4.7 `signal-scorer` (P0) — NUEVO
**Propósito:** Motor de scoring multi-signal que pondera señales de diferentes fuentes.
**Fuente ColdIQ:** `multi-signal` sub-skill + `signal-scoring.md` resource.
**Lógica:**
- Input: lista de señales detectadas por `signal-monitor` para un lead/account
- Scoring: peso por tipo (job change 40pts, funding 35pts, hiring 25pts, website visit 30pts, etc.)
- Compound: señales múltiples se suman con bonus multiplicador (3+ signals = 1.5x)
- Output: score 0-150+ → heat level → acción recomendada → SLA
- Benchmarks ColdIQ: cold outreach 6-8% reply, single signal 18-22%, multi-signal 35-40%
**Esfuerzo:** ~6h | **Impacto:** ALTO

#### 4.8 `outreach-sequence-builder` (P0) — Enriquecer
**Estado actual:** v1.0 con 2 references (personalization-variables.md, sequence-templates.md).
**Fuente ColdIQ:** Cold Email master skill (7 sub-skills) + 7 standalone skills.
**Qué importar:**
- `cold-email-templates-34.md` — 34 cold email templates probados, categorizados por use case (first touch, follow-up, re-engagement, breakup). Con subject lines, body copy, CTAs.
- `copywriting-frameworks.md` — 13 named frameworks: Do the Math, Short Trigger, Pattern Interrupt, Referral Ceiling, Lead Magnet 2-touch, Pain Quantification, etc. Cada uno con: estructura, ejemplo, cuándo usar.
- `copywriting-principles.md` — Filosofía core de copy: 250K+ email principles, 5 Josh Braun writing principles, component rules (subject, opener, body, CTA).
- `copywriting-sequences.md` — Estructura de secuencias: 4-email standard framework, 7-touch Referral Ceiling, variations por email position.
- `deliverability-guide.md` — Reglas: 30 emails max/inbox/día, 3-5 outreach domains, warmup 4-8 semanas, bounce <2%, reply rate >5% mínimo, plain text only.
- `atl-messaging.md` — Templates específicos para VP/C-Level/Director: tono ejecutivo, métricas de negocio, brevedad extrema.
- `btl-messaging.md` — Templates para Managers/ICs: tono práctico, herramienta-foco, day-in-the-life.
- `email-1-variations-7.md` — 7 variaciones de Email 1 probadas con A/B data.
**Acción en SKILL.md:** Añadir routing ATL vs BTL basado en seniority del target. Añadir framework selector basado en signal type.
**Esfuerzo:** ~3h | **Impacto:** ALTO

#### 4.9 `email-sequence` (P1) — Enriquecer
**Estado actual:** 3 references (copy-guidelines, email-types, sequence-templates). Orientado a inbound/lifecycle.
**Fuente ColdIQ:** Re-engagement sub-skill + subject-lines sub-skill.
**Qué importar:**
- `re-engagement-patterns.md` — Frameworks para revivir leads fríos/perdidos: closed-lost reactivation, ghost follow-up, timing-based re-engagement.
- `subject-lines.md` — Subject line frameworks con A/B testing guidance, benchmarks de open rate por tipo, personalization tokens.
**Esfuerzo:** ~2h | **Impacto:** MEDIO

#### 4.10 `linkedin-content` (P1) — Reescritura completa
**Estado actual:** Skill básico sin frontmatter estándar, sin references/, sin benchmarks.
**Fuente ColdIQ:** LinkedIn Content master skill (7 sub-skills) + resources ricos.
**Qué importar:**
- `engagement-data-analysis.md` — 86+ posts analizados por tier (S/A/B/C/D), hook patterns ranked, character sweet spots por tier.
- `post-structure-templates.md` — 5 production-ready post templates (A-E) con character counts exactos.
- `content-strategy.md` — 8 hook formulas, storytelling frameworks (AIDA, PAS, BAB), profile optimization para conversión.
- `linkedin-algorithm.md` — Algorithm mechanics 2025: format performance multipliers, engagement weights (saves 5x, comments >15 words 4x, likes 1x), reach penalties (external links -40-60%).
- `linkedin-campaigns.md` — Platform limits, DM sequences, campaign targeting, Golden Hour routine.
- `coldiq-writing-guide.md` — Voice, tone, formatting rules, content pillars con weights (Tech Stack 30%, Growth Playbooks 25%, Lessons 20%, Results 15%, BTS 10%).
**Acción en SKILL.md:** Reescribir completo con frontmatter Sancho, routing a sub-topics, benchmarks inline.
**Esfuerzo:** ~4h | **Impacto:** ALTO

#### 4.11 `company-finder` (P1) — Enriquecer
**Estado actual:** 2 references (icp-to-filters.md, tool-comparison.md).
**Fuente ColdIQ:** List Building master skill — source-companies sub-skill + advanced resources.
**Qué importar:**
- `list-building-data-sources.md` — 62+ data sources no convencionales organizados por categoría (tech data, job data, financial, review sites, community, government).
- `list-building-directories.md` — 100+ industry-specific directories para scraping (SaaS, healthcare, finance, real estate, etc.).
- `list-building-framework.md` — 8-phase quality list building framework.
**Esfuerzo:** ~2h | **Impacto:** MEDIO

#### 4.12 `decision-maker-finder` (P1) — Enriquecer
**Estado actual:** 2 references (role-mapping.md, validation-criteria.md).
**Fuente ColdIQ:** List Building — find-contacts + qualify-accounts + persona-mapping sub-skills.
**Qué importar:**
- `qualification-workflow.md` — ColdIQ tier system (Tier 1/2/3), weighted scoring, Clay AI prompts para calificación, real examples.
- `persona-mapping-framework.md` — Buying committee mapping: Champion, Economic Buyer, Technical Evaluator, Blocker. JTBD por persona. Messaging matrix.
- `account-selection-framework.md` — Revenue reverse-engineering: from revenue target → accounts needed → contacts per account → emails needed. ABM staging.
**Esfuerzo:** ~2h | **Impacto:** MEDIO

#### 4.13 `contact-enrichment` (P1) — Enriquecer
**Estado actual:** 2 references (email-verification.md, waterfall-providers.md).
**Fuente ColdIQ:** List Building — clean-validate + deduplicate sub-skills + Clay email-waterfall.
**Qué importar:**
- `data-validation.md` — Email/phone verification best practices, bounce rate management (<1% target), data decay handling (22-30% annual), list hygiene schedules.
- `email-waterfall-enrichment.md` — Waterfall pattern para 85%+ email coverage: Apollo → Hunter → Dropcontact → FindThatEmail. Conditional logic para minimizar créditos.
- `deduplication.md` — Dedup strategies para multi-source data, merge rules, data quality scoring.
**Esfuerzo:** ~1h | **Impacto:** MEDIO

#### 4.14 `social-content` (P2) — Enriquecer parcial
**Estado actual:** 3 references (platforms.md, post-templates.md, reverse-engineering.md).
**Fuente ColdIQ:** LinkedIn Content benchmarks (cross-platform relevantes).
**Qué importar:**
- Mergear engagement benchmarks por formato en `references/platforms.md` existente
**Esfuerzo:** ~1h | **Impacto:** BAJO

#### 4.15 `gtm-plays` (P1) — NUEVO
**Propósito:** 11 GTM plays ejecutables con templates, cada uno como mini-playbook.
**Fuente ColdIQ:** `gtm-plays-11` + `buying-signals-6` standalone skills.
**Plays:**
1. New Team Members — reference new hire, show attention to growth
2. Skills-Targeting — target LinkedIn skills (not just titles)
3. Role-Targeting — uncommon titles signal budget/priority
4. Industry Research — survey ICP experts, value-first conversations
5. Resources for ICs — automated campaign to new ICs, brand building
6. Leaving Employees — coverage gap after departure
7. No Dedicated Role — missing title + revenue = gap opportunity
8. Bad Reviews — scrape negative reviews, offer alternatives
9. AI-Generated Ideas — 2 relevant ideas + offer as #3
10. Website Visitors — visitor identification → real-time outreach
11. Inbound Followers — LinkedIn follower → ICP filter → outreach 24-48h
**Adaptación Sancho:** Cada play orquesta: signal-monitor → company-finder → outreach-sequence-builder. Con Foundation data del cliente (ECP, positioning).
**Esfuerzo:** ~5h | **Impacto:** ALTO

#### 4.16 `email-infra` (P1) — NUEVO
**Propósito:** Setup y troubleshooting de infraestructura de email para cold outreach.
**Fuente ColdIQ:** email-infra sub-skill del Cold Email master.
**Contenido:**
- Domain setup: cuántos dominios (3-5), naming conventions, redirect a primary
- DNS: SPF, DKIM, DMARC paso a paso
- Warmup: 4-8 semanas, 30 emails max/inbox/día, ramp-up schedule
- Troubleshooting: blacklist recovery, bounce spike diagnosis, sender reputation repair
- Scaling: cuándo añadir dominios, rotation strategy, multi-workspace
**Esfuerzo:** ~3h | **Impacto:** MEDIO

#### 4.17 `personalization-engine` (P1) — NUEVO
**Propósito:** Estrategias y prompts de personalización a escala.
**Fuente ColdIQ:** personalization sub-skill + 4 standalone skills (personalization-6-buckets, personalization-hooks, personalization-playbooks, ai-personalization-prompts).
**Contenido:**
- 6 Buckets Framework: company, role, industry, trigger, mutual, tech stack
- Strong vs Lite hooks: cuándo usar cada tipo
- Camp vs No-Camp playbooks: alta vs baja personalización
- 6 AI prompts estilo lemlist para personalización automatizada
- Integration con contact-enrichment data (qué campos usar para personalizar)
**Esfuerzo:** ~4h | **Impacto:** MEDIO

## 5. Integraciones por Cliente (Mission Control)

### Obligatorias para outbound
| Integración | Tipo | Quién configura |
|-------------|------|-----------------|
| Instantly API key | Secret via MC | Cliente |
| HeyReach API key | Secret via MC | Cliente |
| Email accounts en Instantly | Manual en Instantly | Cliente |
| LinkedIn accounts en HeyReach | Manual en HeyReach | Cliente |

### Opcionales
| Integración | Para qué |
|-------------|----------|
| HubSpot/Salesforce CRM | Sync leads + deals |
| Calendly/Cal.com | Booking link en CTAs |
| Slack | Notificaciones de replies positivas |

### Sancho de base (sin config cliente)
| Capability | Cómo |
|------------|------|
| Signal detection | web_search + Apify |
| Company enrichment | Apollo API |
| Contact enrichment | Apollo + email waterfall |
| Sequence generation | LLM con ColdIQ frameworks |
| Reply classification | LLM |
| Analytics aggregation | Instantly + HeyReach APIs |

## 6. Flujo End-to-End

```
┌──────────────────── FOUNDATION DATA ─────────────────────┐
│ ECPs, Positioning, Brand Voice, ICP, Channels            │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │    signal-definition     │ Define qué señales monitorear
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │     signal-monitor       │ Detecta señales (cron diario)
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │     signal-scorer        │ Pondera y prioriza
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                  │
    ┌────▼────┐    ┌──────▼──────┐    ┌─────▼─────┐
    │ company │    │  decision   │    │  contact  │
    │ finder  │    │  maker      │    │ enrichment│
    └────┬────┘    │  finder     │    └─────┬─────┘
         │         └──────┬──────┘          │
         └────────────────┼─────────────────┘
                          │
              ┌───────────▼───────────┐
              │  outreach-sequence-   │ Genera copy personalizado
              │  builder              │ (ATL/BTL × signal × ECP)
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                 │
    ┌────▼────┐    ┌─────▼──────┐    ┌────▼─────┐
    │Instantly│    │multichannel│    │HeyReach  │
    │executor │◄───│orchestrator│───►│executor  │
    │(email)  │    │(coordination)│  │(LinkedIn)│
    └────┬────┘    └─────┬──────┘    └────┬─────┘
         │               │                │
         └───────────────┼────────────────┘
                         │
              ┌──────────▼──────────┐
              │  reply-classifier    │ LLM classifica responses
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐   ┌─────▼─────┐   ┌────▼────┐
    │Positive │   │Reschedule │   │  Stop   │
    │→ Book   │   │→ Queue    │   │→ Learn  │
    └─────────┘   └───────────┘   └─────────┘
                         │
              ┌──────────▼──────────┐
              │ outbound-analytics   │ Métricas + learning loop
              └─────────────────────┘
```

## 7. Timeline

### Fase 1: ColdIQ Import + Enrichment (Semana 1-2)
**Día 1:**
- Clonar repo ColdIQ → `_references/coldiq-gtm/`
- Script de importación: extrae .md relevantes con header de atribución
- Actualizar `_system/skill-routing.md` con nuevas rutas

**Día 2-3: Signals (P0)**
- Enriquecer `signal-definition` + `signal-monitor` (4.6) — importar 137 triggers, scoring, detection tools
- Crear `signal-scorer` (4.7) — motor de scoring multi-signal

**Día 4-5: Outreach Copy (P0)**
- Enriquecer `outreach-sequence-builder` (4.8) — +34 templates, +13 frameworks, ATL/BTL routing
- Enriquecer `email-sequence` (4.9) — re-engagement + subject lines

**Día 6-7: LinkedIn + List Building (P1)**
- Reescribir `linkedin-content` (4.10) — 86+ posts analyzed, 8 hooks, algorithm data
- Enriquecer `company-finder` (4.11) — 62+ sources, 100+ directories

**Día 8-9: Enrichment + New Skills (P1)**
- Enriquecer `decision-maker-finder` (4.12) — qualification, persona mapping, ABM
- Enriquecer `contact-enrichment` (4.13) — waterfall 85%+, dedup, validation
- Crear `gtm-plays` (4.15) — 11 plays ejecutables

**Día 10: Infra + Personalization (P1)**
- Crear `email-infra` (4.16) — DNS, warmup, troubleshooting
- Crear `personalization-engine` (4.17) — 6 buckets, AI prompts
- Enriquecer `social-content` (4.14) — benchmarks parciales
- Añadir Instantly + HeyReach al catálogo de APIs en MC

### Fase 2: Executors (Semana 3-4)
- `instantly-executor` (4.1) — integración API V2 completa
- `heyreach-executor` (4.2) — integración API + webhooks
- Webhook receivers para replies
- Test con 1 cliente real (Hospital Capilar o Paymatico)

### Fase 3: Orquestación (Semana 5-6)
- `multichannel-orchestrator` (4.3) — lógica cross-canal
- `reply-classifier` (4.4) — clasificación de respuestas LLM
- Crons de monitoreo (diario)
- Test end-to-end: signal → enrich → sequence → send → reply → classify

### Fase 4: Analytics + Hardening (Semana 7-8)
- `outbound-analytics` (4.5) — dashboard + reporting
- Learning loop (qué templates/signals funcionan → feedback a skills)
- Multi-client rollout
- Documentación + onboarding playbook

### Resumen de Esfuerzo Total

| Categoría | Skills | Horas Est. |
|-----------|--------|-----------|
| Enriquecer existentes (ColdIQ) | 7 skills | ~16h |
| Skills nuevos (estrategia) | 4 skills (signal-scorer, gtm-plays, email-infra, personalization-engine) | ~18h |
| Skills nuevos (ejecución) | 5 skills (instantly-executor, heyreach-executor, multichannel-orchestrator, reply-classifier, outbound-analytics) | ~30h |
| Infra (clone, scripts, routing, MC) | — | ~5h |
| **Total** | **16 skills** | **~69h** |

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| LinkedIn ban | Media | Alto | HeyReach residential proxies + warm-up + rate limits |
| Email deliverability | Media | Alto | Instantly warmup + verificación previa + bounce monitoring |
| API rate limits | Baja | Medio | Queue + retry + backoff en executors |
| Coste por cliente ($156/mo) | — | — | Incluir en pricing de servicio Growth4U |
| Complejidad multi-canal | Media | Medio | MVP email-only primero, añadir LinkedIn después |

## 9. MVP Recomendado

**Semana 1-4: Email-only con Instantly**
- Signal → enrich → sequence → Instantly → reply classification
- Sin LinkedIn, sin multi-canal
- Validar el pipeline completo antes de añadir complejidad

**Semana 5+: Añadir LinkedIn con HeyReach**
- Multi-canal orchestrator
- Full pipeline
