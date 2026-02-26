# SanchoCMO — Mapa Arquitectónico Completo

## Context

Alfonso pidió un mapa completo de la infraestructura de SanchoCMO mostrando:
1. Todas las skills y cómo se comunican entre sí
2. Cómo mapean al flujo: **Encuentra → Decide → Crea → Publica → Analiza**
3. Cómo mapean a la **Matriz Hormozi** (one-to-one/one-to-many × con/sin presupuesto)
4. Qué skills existen vs gaps (especialmente para "Encuentra")

Este mapa es crítico porque SanchoCMO debe convertirse en un CMO proactivo que:
- Conoce todo el contexto del cliente
- Ejecuta el flujo completo de marketing
- Apoya tanto estrategia (one-to-one, outreach) como contenido (one-to-many, content)

---

## 1. ARQUITECTURA DEL SISTEMA

### 1.1 Los 5 Pilares Arquitectónicos (Boring Marketer)

**ORDEN CORREGIDO:** El Shared Protocol es la BASE (como HTTP), no el último pilar.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA SANCHOCMO                            │
│                                                                 │
│  Pillar 1: SHARED PROTOCOL                                     │
│  └─ brand-memory.md (la "constitución" del sistema)            │
│     └─ Define cómo TODAS las skills se comunican              │
│     └─ Como HTTP para el web                                   │
│                                                                 │
│  Pillar 2: PERSISTENT MEMORY                                   │
│  └─ ./brand/ directory (Context Lake)                          │
│     ├─ Tier 1: Constitution (company, ICP, ECPs, positioning)  │
│     ├─ Tier 2: Strategic (competitors, market, pricing, SWOT)  │
│     └─ Tier 3: Transitory (meetings, daily pulse updates)      │
│                                                                 │
│  Pillar 3: SCORED CONTEXT LOADING                              │
│  └─ Context Matrix (cada skill lee SOLO lo que necesita)       │
│     ├─ Freshness TTLs (< 7d fresh, > 90d stale)                │
│     └─ NO dumping (selective passing)                          │
│                                                                 │
│  Pillar 4: SCHEMA CONTRACTS                                    │
│  └─ 7 JSON schemas (_system/schemas/)                          │
│     ├─ Complementa Persistent Memory (FORMATO de la data)      │
│     ├─ company-context.schema.json                             │
│     ├─ icp.schema.json                                         │
│     ├─ positioning.schema.json                                 │
│     ├─ competitors.schema.json                                 │
│     ├─ swot.schema.json                                        │
│     ├─ gtm-canvas.schema.json                                  │
│     └─ campaign.schema.json                                    │
│                                                                 │
│  Pillar 5: LEARNING LOOPS                                      │
│  └─ Feedback → learnings.md → adapt                            │
│     └─ Sistema mejora con el uso (compounding)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Las 4 Phases del Sistema

**ENTRY POINT CORREGIDO:** El sistema SIEMPRE empieza con `sancho-start` (CBO Maestro), no con phase-0-diagnostic.

```
ENTRY: sancho-start (CBO Maestro)
┌─────────────────────────┐
│ Universal Entry Point   │
│                         │
│ NEW CLIENT MODE:        │
│ • Infer-First           │
│ • Foundation Blitz      │
│ • Viability Check       │
│                         │
│ RETURNING MODE:         │
│ • Status Board          │
│ • Gap Analysis          │
│ • Proactive Suggestion  │
└────────┬────────────────┘
         │
         ↓
    ROUTER DECISION
         │
    ┌────┴────┬────────┬────────┐
    ↓         ↓        ↓        ↓
PHASE 0   PHASE 1   PHASE 1   SKIP TO
Diagnostic (Deep)    (Lite)    PHASE 2/3
    │         │        │
Meta:     Meta:    Meta:
ARREGLAR  LANZAR   LEADS/ESCALAR
    │         │        │
    ↓         ↓        ↓
┌─────────────────────────┐
│ PHASE 1: FOUNDATION     │
│                         │
│ ¿Quiénes somos, a       │
│ quién servimos, qué     │
│ decimos?                │
│                         │
│ Orchestrator:           │
│ • foundation-orchestr.  │
│                         │
│ 16 Pillars (5 Layers):  │
│ Layer 0: Always-First   │
│ Layer 1: Parallel       │
│ Layer 2: Synthesis      │
│ Layer 3: Discovery      │
│ Layer 4: Activation     │
│ Layer 5: Visual         │
└────────┬────────────────┘
         │
         ↓
    GATE CHECK
    (7/16 Lite, 16/16 Deep)
         │
         ↓
┌─────────────────────────┐
│ PHASE 2: FUNNEL         │
│                         │
│ ¿A dónde enviamos       │
│ personas y convierte?   │
│                         │
│ Components:             │
│ • Landing pages         │
│ • Email sequences       │
│ • Lead magnets          │
│ • Trust Engine          │
│ • Paywall/upgrade       │
└────────┬────────────────┘
         │
         ↓
    GATE CHECK
    ("Can answer: If I send
     1,000 people, how many
     convert?")
         │
         ↓
┌─────────────────────────┐
│ PHASE 3: SCALE          │
│                         │
│ ¿Cómo generamos         │
│ tráfico y crecemos?     │
│                         │
│ Core Four Channels:     │
│ • Contenido Orgánico    │
│ • Outreach Directo      │
│ • Partners & Afiliados  │
│ • Paid Ads              │
└─────────────────────────┘
```

---

## 2. PHASE 1: FOUNDATION (16 Pillars DAG)

```
┌──────────────────────────────────────────────────────────────┐
│              FOUNDATION-ORCHESTRATOR                         │
│                                                              │
│  Manages 16 pillars, resolves dependencies, suggests next   │
│                                                              │
│  LAYER 0 (Always-First) — Run immediately, in parallel:     │
│  ┌──────────────────┐  ┌────────────────────┐              │
│  │ company-context  │  │ budget-constraints │              │
│  │ (10 min)         │  │ (30 min)           │              │
│  └──────────────────┘  └────────────────────┘              │
│  ┌──────────────────────────────────────┐                   │
│  │ business-model-audit                 │                   │
│  │ (30 min)                             │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  LAYER 1 (Parallel) — Run after Layer 0:                    │
│  ┌──────────────────┐  ┌──────────────────────┐            │
│  │ self-intelligence│  │ competitor-intel     │            │
│  │ (Deep, 3 Lenses) │  │ (Deep, 3 Lenses)     │            │
│  │ + Asset Inventory│  │ + Battle Cards       │            │
│  └──────────────────┘  └──────────────────────┘            │
│  ┌──────────────────┐                                       │
│  │ market-intel     │                                       │
│  │ (TAM/SAM/SOM)    │                                       │
│  └──────────────────┘                                       │
│                                                              │
│  LAYER 2 (Synthesis) — Needs Layer 1:                       │
│  ┌──────────────────────────────────────┐                   │
│  │ swot-analysis (SWOT + TOWS)          │                   │
│  │ Depends: self + competitor + market  │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  🛑 CHECKPOINT 1: Validación SWOT con cliente               │
│     └─ Cliente revisa y aprueba continuar                   │
│                                                              │
│  LAYER 3 (Discovery) — Needs Layer 2:                       │
│  ┌──────────────────────────────────────┐                   │
│  │ niche-discovery-100x                 │                   │
│  │ (ICP + 100x niches → ECPs)           │                   │
│  │ Depends: swot + customer-data        │                   │
│  └──────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                   │
│  │ ecp-validation (OPTIONAL)            │                   │
│  │ (Maja Voje: Assumption Mapping+MVI)  │                   │
│  │ Skip if: timeline < 4 weeks          │                   │
│  └──────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                   │
│  │ existing-customer-data (OPTIONAL)    │                   │
│  │ (RFM, segmentation, churn)           │                   │
│  │ Skip if: pre-launch                  │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  🛑 CHECKPOINT 2: Cliente elige ECPs + aprueba continuar    │
│     └─ De 100x niches, cliente selecciona 1-3 ECPs          │
│                                                              │
│  LAYER 4 (Activation) — Needs Layer 3:                      │
│  ┌──────────────────────────────────────┐                   │
│  │ positioning-messaging                │                   │
│  │ (Positioning per ECP)                │                   │
│  │ Depends: ecps + competitor           │                   │
│  └──────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                   │
│  │ brand-voice                          │                   │
│  │ (Voice profile)                      │                   │
│  │ Depends: company + positioning       │                   │
│  └──────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                   │
│  │ visual-identity-lite (NUEVO)         │                   │
│  │ Logo + colores + tipografía básica   │                   │
│  │ Depends: brand-voice                 │                   │
│  │ Output: Activos visuales early       │                   │
│  └──────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                   │
│  │ pricing-strategy (Marketplace)       │                   │
│  │ (Value-based pricing, hooks)         │                   │
│  │ Depends: ecps + competitor pricing   │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  LAYER 5 (Visual Full) — Needs Layer 4:                     │
│  ┌──────────────────────────────────────┐                   │
│  │ visual-identity-full (Meta-skill)    │                   │
│  │ Sistema completo de diseño:          │                   │
│  │ • ui-system (componentes web)        │                   │
│  │ • visual-generator (imágenes)        │                   │
│  │ • deck-creator (presentaciones)      │                   │
│  │ Depends: visual-identity-lite        │                   │
│  └──────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

### Context Matrix (Selective Passing)

| Skill.          | Reads from Context Lake | WHY |
|-----------------|-------------------------|-----|
| company-context | (none - first skill) | Foundation pillar |
| self-intelligence | company-context only | Needs company basics for product analysis |
| competitor-intel | company-context, positioning (if exists) | Needs industry + differentiation context |
| market-intelligence | company-context, competitors | Needs basics + competitive landscape |
| swot-analysis | product-analysis, competitors, market | Synthesis of 3 inputs |
| niche-discovery-100x | swot, customer-data | Needs strategic fit + real customer insights |
| positioning-messaging | company-context, competitors, niche | Needs who we are, who we compete with, who we serve |
| brand-voice | company-context, positioning | Needs identity + angle for tone |
| pricing-strategy | ecps, competitor-pricing | Needs who we serve + competitive pricing |
| visual-identity | brand-voice, positioning | Needs tone + angle for visual system |
| channel-prioritization | budget, company-context, ecps, positioning, competitors, product-analysis, stack | Needs full picture to score channels |
| content-calendar-planner | channel-plan, positioning, keyword-plan, voice-profile, ecps | Needs channels + topics + audience |
| outreach-sequence-builder | channel-plan, positioning, ecps, voice-profile, contacts-enriched, signals-to-track | Needs channels + personas + contacts + signals |

---

## 3. MAPEO A FLUJOS: Encuentra → Decide → Crea → Publica → Analiza

### 3.1 ENCUENTRA (Research & Intelligence)

```
ENCUENTRA — Fase de inteligencia
│
├─ ONE-TO-MANY (Contenido Orgánico)
│  │
│  ├─ Competitor Analysis (DOS SKILLS DIFERENTES)
│  │  │
│  │  ├─ [✅ EXISTE] competitor-intelligence
│  │  │   └─ PROPÓSITO: Quiénes son, qué hacen
│  │  │   └─ Lens 1: Lo que dicen de sí mismos (web, social, ads)
│  │  │   └─ Lens 2: Lo que dicen influencers/medios
│  │  │   └─ Lens 3: Lo que dicen clientes (reviews)
│  │  │   └─ Output: Battle Cards, sus URLs/links
│  │  │
│  │  └─ [✅ CREADA Feb 20] thief-marketers
│  │      └─ PROPÓSITO: ROBAR IDEAS de competidores
│  │      └─ Input: Battle Cards (URLs de competitor-intel)
│  │      ├─ Facebook Ads Library → ideas de ads
│  │      ├─ Social content calendar → ideas de posts
│  │      ├─ Feature changelog → ideas de features
│  │      ├─ Landing page copy → ideas de estructura
│  │      └─ Output: Content Ideas DB
│  │
│  ├─ Keyword Research (SEO)
│  │  └─ [✅ EXISTE] keyword-research
│  │      └─ 6 Circles Method + SERP validation
│  │
│  ├─ Daily Pulse (Ideas de contenido + insights)
│  │   ├─ [✅ CREADA Feb 21] daily-pulse
│  │   │   ├─ Slack/Notion/transcripts scan (4 modes: FULL/PARTIAL/LIGHT/MANUAL)
│  │   │   └─ Output: Insights + Content Ideas JSON
│  │   └─ [✅ CREADA Feb 21] insight-to-content-mapper
│  │       └─ Convierte insights en SEO content briefs (batch mode)
│  │
│  └─ Intelligence Pipeline
│      ├─ [✅ CREADA Feb 21] meeting-intelligence
│      │   └─ Decisions, action items, quotes, risks (UNIVERSAL)
│      ├─ [✅ CREADA Feb 21] content-miner
│      │   └─ Classifies intelligence → content ideas (CONFIGURABLE)
│      └─ [✅ CREADA Feb 21] pattern-detector
│          └─ Recurring themes across 30 days (frequency ≥3)
│
├─ ONE-TO-ONE (Outreach Directo)
│  │
│  ├─ ICP/ECP Research
│  │  ├─ [✅ EXISTE] niche-discovery-100x
│  │  │   └─ ICP + 100x niches → ECPs
│  │  └─ [✅ CREADA Feb 21] company-finder (Apollo/Clay/Apify/WebSearch, ICP scoring)
│  │
│  ├─ Contact Discovery
│  │  ├─ [✅ CREADA Feb 21] decision-maker-finder (LinkedIn, Apollo, Apify, Manual)
│  │  └─ [✅ CREADA Feb 21] contact-enrichment (waterfall: Apollo→Hunter→SignalHire→Snov)
│  │
│  ├─ Signal Detection (WORKFLOW DE 2 PASOS)
│  │  │
│  │  ├─ [✅ CREADA Feb 20] signal-definition
│  │  │   └─ STEP 0: Definir qué señales importan
│  │  │   └─ Input: Cliente, ICP, sector
│  │  │   └─ Output: signals-to-track.json
│  │  │      ├─ Funding rounds
│  │  │      ├─ Job changes (hiring VP Sales)
│  │  │      ├─ Tech stack changes (Stripe)
│  │  │      ├─ Content signals (whitepaper)
│  │  │      └─ Intent signals (pricing page)
│  │  │
│  │  └─ [✅ CREADA Feb 20] signal-monitor
│  │      └─ STEP 1: Monitorear señales definidas
│  │      └─ Input: signals-to-track.json
│  │      └─ Output: Companies + Contacts HOT
│  │
│  └─ Partnership/Afiliados
│      ├─ [❌ GAP] media-outlet-finder (Google, YouTube, podcasts)
│      └─ [❌ GAP] influencer-contact-enrichment
│
└─ MARKET INTELLIGENCE (Ambos)
   ├─ [✅ EXISTE] market-intelligence
   │   └─ TAM/SAM/SOM + trends + regulatory
   └─ [✅ EXISTE] swot-analysis
       └─ SWOT + TOWS strategies
```

### 4.2 DECIDE (Estrategia & Priorización)

```
DECIDE — Fase de decisión estratégica
│
├─ Strategic Foundation
│  ├─ [✅ EXISTE] positioning-messaging
│  ├─ [✅ EXISTE] niche-discovery-100x
│  └─ [✅ EXISTE] pricing-strategy
│
├─ Channel Selection
│  ├─ [✅ NUEVA Sprint 1] channel-prioritization (Core Four + 5-dimension scoring + budget)
│  └─ [❌ GAP] experiment-designer (ICE scoring, hypotheses)
│
├─ Content Strategy
│  ├─ [✅ EXISTE] keyword-research
│  │   └─ Clusters into content pillars
│  └─ [✅ NUEVA Sprint 1] content-calendar-planner
│      └─ Pillar → topic → format → schedule → weekly/monthly view
│
└─ Outreach Strategy
   └─ [✅ NUEVA Sprint 1] outreach-sequence-builder
       └─ Cold multi-channel sequences per ECP (email + LinkedIn, GDPR)
```

### 4.3 CREA (Creación de Contenido & Assets)

```
CREA — Fase de creación
│
├─ ONE-TO-MANY (Contenido)
│  │
│  ├─ SEO & Blog
│  │  └─ [✅ EXISTE] seo-content
│  │      └─ Article + schema markup
│  │
│  ├─ Social Content
│  │  └─ [✅ EXISTE] content-atomizer
│  │      └─ LinkedIn, Twitter, Instagram, TikTok, YouTube,
│  │         Threads, Bluesky, Reddit
│  │
│  ├─ Lead Magnets
│  │  └─ [✅ EXISTE] lead-magnet
│  │      └─ Concepts + BUILD MODE (full content)
│  │
│  ├─ Email Marketing
│  │  └─ [✅ EXISTE] email-sequences
│  │      └─ 6 types (welcome, nurture, conversion, launch,
│  │         re-engagement, post-purchase)
│  │
│  ├─ Newsletter
│  │  └─ [✅ EXISTE] newsletter
│  │      └─ 5 formats (roundup, deep-dive, essay, curated, news)
│  │
│  └─ Copy & Landing Pages
│     └─ [✅ EXISTE] direct-response-copy
│         └─ Landing pages, sales copy + scoring
│
├─ ONE-TO-ONE (Outreach)
│  │
│  ├─ [✅ NUEVA Sprint 1] outreach-sequence-builder
│  │   └─ Cold multi-channel sequences per ECP (email + LinkedIn + video)
│  │   └─ Tool Detection: FULL/STANDARD/LIGHT + GDPR
│  │
│  └─ [❌ GAP] partnership-pitch-generator
│      └─ Media kit + pitch deck
│
└─ Visual Identity
   └─ [✅ EXISTE] visual-identity (Meta-skill)
       └─ Generates: ui-system, visual-generator, deck-creator
```

### 3.4 EJECUTA (Publicación & Distribución)

**TOOLS STACK ACTUALIZADO:**

```
EJECUTA — Fase de ejecución
│
├─ Content Publishing
│  ├─ [❌ GAP] content-scheduler
│  │   └─ Tools: Mixpost (self-hosted) + Metricool
│  └─ [❌ GAP] blog-publisher
│      └─ Tools: WordPress, Ghost, Webflow
│      └─ NUESTRO: Alarife (landing pages)
│         └─ Proyecto: ~/PROJECTS/alarife
│
├─ Email Automation
│  ├─ [❌ GAP] email-automation-setup (Mailchimp, ConvertKit)
│  └─ [✅ PARTIAL] email-sequences (crea secuencias, no las ejecuta)
│
├─ Outreach Execution
│  ├─ [❌ GAP] email-outreach-executor
│  │   └─ Tool: INSTANTLY (primary)
│  └─ [❌ GAP] linkedin-outreach-executor (Expandi, Dripify)
│
├─ Creative Generation (YA EXISTE)
│  ├─ [✅ EXISTE] Nanobanana (imágenes AI)
│  └─ [✅ EXISTE] Remotion (video)
│
└─ Paid Ads
   ├─ [❌ GAP] facebook-ads-creator
   ├─ [❌ GAP] google-ads-creator
   └─ [❌ GAP] linkedin-ads-creator
```

### 3.5 APRENDE (Analytics & Optimization)

**TOOLS STACK ACTUALIZADO:**

```
APRENDE — Fase de aprendizaje
│
├─ Content Performance
│  ├─ [❌ GAP] content-analytics
│  │   └─ Tools: PostHog o GA4 (funnel)
│  │   └─ Metricool API (social metrics)
│  └─ [❌ GAP] seo-rank-tracker
│      └─ Track keywords from keyword-plan.md
│
├─ Email Performance
│  └─ [❌ GAP] email-analytics
│      └─ Open rates, CTR, conversion
│      └─ Sources: Email platform APIs
│
├─ Outreach Performance
│  └─ [❌ GAP] outreach-analytics
│      └─ Reply rates, meetings booked
│      └─ Tool: INSTANTLY API (primary)
│
├─ Funnel Analytics
│  └─ [❌ GAP] funnel-analyzer
│      └─ AARRR metrics
│      └─ Tool: PostHog o GA4
│
└─ Learning Loops (PARTIAL)
   ├─ [✅ EXISTE] Feedback collection (en skills via brand-memory.md)
   ├─ [✅ EXISTE] learnings.md (append-only log)
   ├─ [✅ CREADA Feb 21] pattern-detector
   │   └─ Detect recurring themes (≥3 mentions across 30 days)
   │   └─ Sources: intelligence/*.json from meeting-intelligence
   └─ [❌ GAP] performance-consolidator
       └─ Unifica métricas de múltiples fuentes:
          ├─ Metricool (social)
          ├─ INSTANTLY (outreach)
          ├─ PostHog/GA4 (funnel)
          └─ Output: Unified performance dashboard
```

---

## 4. MAPEO A MATRIZ ORMOZI

```
┌────────────────────────┬──────────────────────┬──────────────────────┐
│                        │   ONE-TO-ONE         │   ONE-TO-MANY        │
│                        │   (Outreach)         │   (Contenido)        │
├────────────────────────┼──────────────────────┼──────────────────────┤
│  SIN PRESUPUESTO       │ OUTREACH DIRECTO     │ CONTENIDO ORGÁNICO   │
│  (Pagas con tiempo)    │                      │                      │
│                        │ [✅ EXISTE]:         │ [✅ EXISTE]:         │
│                        │ • company-finder     │ • keyword-research   │
│                        │ • decision-maker     │ • seo-content        │
│                        │ • contact-enrich     │ • content-atomizer   │
│                        │ • signal-monitor     │ • newsletter         │
│                        │ • signal-definition  │ • lead-magnet        │
│                        │                      │ • email-sequences    │
│                        │ [❌ GAPS]:           │ • direct-resp-copy   │
│                        │ • outreach-seq       │ • daily-pulse        │
│                        │ • email-executor     │ • insight-mapper     │
│                        │ • linkedin-executor  │ • meeting-intel      │
│                        │                      │                      │
│                        │ Data sources:        │ Data sources:        │
│                        │ • Contacts DB        │ • Content Ideas DB   │
│                        │ • ContactLists       │ • keyword-plan.md    │
│                        │ • Sequences          │ • campaigns/         │
├────────────────────────┼──────────────────────┼──────────────────────┤
│  CON PRESUPUESTO       │ PARTNERS & AFILIADOS │ PAID ADS             │
│  (Pagas con dinero)    │                      │                      │
│                        │ [❌ GAPS]:           │ [❌ GAPS]:           │
│                        │ • media-finder       │ • facebook-ads       │
│                        │ • influencer-finder  │ • google-ads         │
│                        │ • partnership-pitch  │ • linkedin-ads       │
│                        │                      │ • ad-creative-gen    │
│                        │                      │                      │
│                        │ Data sources:        │ Data sources:        │
│                        │ • Companies DB       │ • Creative assets    │
│                        │ • Articles DB        │ • Ad campaigns       │
└────────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 5. SKILLS IMPLEMENTADAS (35 total)

### Orchestrators (3)
1. ✅ **sancho-start** - CBO maestro, universal entry point
2. ✅ **foundation-orchestrator** - Phase 1 manager (16 pillars DAG)
3. ✅ **phase-0-diagnostic** - Entry diagnostic

### Foundation Skills - Sancho (11)
4. ✅ **company-context** - What/Want/Believe
5. ✅ **budget-constraints** - Budget + resources
6. ✅ **self-intelligence** - Product analysis (3 Lenses + Asset Inventory)
7. ✅ **competitor-intelligence** - Competitor analysis (3 Lenses)
8. ✅ **market-intelligence** - TAM/SAM/SOM + trends
9. ✅ **business-model-audit** - Revenue model analysis
10. ✅ **swot-analysis** - SWOT + TOWS strategies
11. ✅ **niche-discovery-100x** - ICP + 100x niches → ECPs
12. ✅ **positioning-messaging** - Positioning per ECP
13. ✅ **brand-voice** - Voice profile
14. ✅ **visual-identity** - Meta-skill (genera ui/visual/deck children)

### Execution Skills - vibe v2 (7)
15. ✅ **keyword-research** - 6 Circles Method + SERP validation
16. ✅ **seo-content** - SEO-optimized articles + schema markup
17. ✅ **content-atomizer** - 8 platforms (LinkedIn, Twitter, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit)
18. ✅ **email-sequences** - 6 types (welcome, nurture, conversion, launch, re-engagement, post-purchase)
19. ✅ **lead-magnet** - Concepts + BUILD MODE (full content)
20. ✅ **direct-response-copy** - Landing pages, sales copy + scoring
21. ✅ **newsletter** - 5 formats (roundup, deep-dive, essay, curated, news)

### Optional Skills (2)
22. ✅ **existing-customer-data** - RFM, segmentation, churn (skip if pre-launch)
23. ✅ **ecp-validation** - Maja Voje Assumption Mapping + MVI (skip if timeline < 4 weeks)

### Marketplace Skills (1)
24. ✅ **pricing-strategy** - Corey Haines #2 (value-based pricing, hooks)

### Intelligence Pipeline — NEW v3.0 (4)
25. ✅ **meeting-intelligence** - Extract decisions, action items, insights (UNIVERSAL)
26. ✅ **content-miner** - Classify intelligence → content ideas (CONFIGURABLE)
27. ✅ **pattern-detector** - Detect recurring themes ≥3 mentions (UNIVERSAL)
28. ✅ **daily-pulse** - Scan Slack/Notion/transcripts → content ideas (4 modes)

### Outreach & Content Bridge — NEW v3.0 (4)
29. ✅ **company-finder** - Find ICP-matching companies (Apollo/Clay/Apify/WebSearch)
30. ✅ **decision-maker-finder** - Find decision makers in target companies (15-pt scoring)
31. ✅ **contact-enrichment** - Waterfall email/phone enrichment (GDPR compliant)
32. ✅ **insight-to-content-mapper** - Convert insights → SEO content briefs (batch mode)

### Intelligence Skills v1 (3)
33. ✅ **thief-marketers** - Steal competitor ideas (ads, calendars, changelogs, LPs)
34. ✅ **signal-definition** - Define buy signals per ICP/ECP/sector
35. ✅ **signal-monitor** - Monitor defined signals via APIs

---

## 6. GAPS IDENTIFICADOS

### 6.1 ENCUENTRA (Mayormente Resuelto)

**One-to-One (Outreach) — ✅ Pipeline completo:**
- ✅ **signal-definition** - Definir qué señales importan por cliente (creada Feb 20)
- ✅ **signal-monitor** - Monitorear señales definidas (creada Feb 20)
- ✅ **company-finder** - Buscar empresas según ICP/ECP/sector (creada Feb 21)
- ✅ **decision-maker-finder** - Encontrar personas decisoras (creada Feb 21)
- ✅ **contact-enrichment** - Enriquecer contactos: email, phone, social (creada Feb 21)
- ❌ **media-outlet-finder** - Buscar medios/influencers (Google, YouTube, podcasts)
- ❌ **influencer-contact-enrichment** - Enriquecer contactos de medios

**One-to-Many (Contenido) — ✅ Pipeline completo:**
- ✅ **thief-marketers** - ROBAR IDEAS de competidores (creada Feb 20)
- ✅ **daily-pulse** - Slack/Notion/transcripts → Content ideas (creada Feb 21)
- ✅ **insight-to-content-mapper** - Insights → SEO content briefs (creada Feb 21)
- ✅ **meeting-intelligence** - Extract decisions, tasks, quotes (creada Feb 21)
- ✅ **content-miner** - Classify intelligence → content ideas (creada Feb 21)
- ✅ **pattern-detector** - Detect recurring themes over time (creada Feb 21)

### 7.2 DECIDE

- ❌ **channel-prioritization** - Decidir qué canales activar (Core Four + budget)
- ❌ **experiment-designer** - Diseñar experimentos (ICE scoring, hypotheses)
- ❌ **content-calendar-planner** - Planificar calendario (pillar → topic → format → schedule)

### 7.3 CREA

**One-to-One:**
- ❌ **outreach-sequence-builder** - Crear secuencias de outreach personalizadas por ECP
- ❌ **partnership-pitch-generator** - Media kit + pitch deck para partnerships

### 7.4 EJECUTA

- ❌ **content-scheduler** - Publicar (Buffer, Hootsuite integration)
- ❌ **blog-publisher** - Publicar blog (WordPress, Ghost, Webflow)
- ❌ **email-automation-setup** - Configurar (Mailchimp, ConvertKit, ActiveCampaign)
- ❌ **email-outreach-executor** - Ejecutar outreach (Instantly.ai, Lemlist)
- ❌ **linkedin-outreach-executor** - Ejecutar LinkedIn (Expandi, Dripify)
- ❌ **facebook-ads-creator** - Crear campañas Facebook Ads
- ❌ **google-ads-creator** - Crear campañas Google Ads
- ❌ **linkedin-ads-creator** - Crear campañas LinkedIn Ads

### 7.5 APRENDE

- ❌ **content-analytics** - Analizar performance (GA4, social insights)
- ❌ **seo-rank-tracker** - Trackear rankings SEO
- ❌ **email-analytics** - Analizar emails (open rates, CTR, conversion)
- ❌ **outreach-analytics** - Analizar outreach (reply rates, meetings booked)
- ❌ **funnel-analyzer** - Analizar funnel (AARRR metrics)
- ❌ **pattern-recognizer** - Auto-detectar winning patterns

---

## 7. FLUJO DE COMUNICACIÓN ENTRE SKILLS

```
                                    ┌─────────────────┐
                                    │  SANCHO-START   │
                                    │   (CBO Maestro) │
                                    └────────┬────────┘
                                             │
                      ┌──────────────────────┼──────────────────────┐
                      ↓                      ↓                      ↓
              ┌───────────────┐    ┌──────────────────┐   ┌──────────────┐
              │ phase-0       │    │ foundation-      │   │ trust-engine │
              │ -diagnostic   │    │ orchestrator     │   │ orchestrator │
              └───────────────┘    └────────┬─────────┘   └──────────────┘
                                            │
                   ┌────────────────────────┼────────────────────────┐
                   │                        │                        │
            LAYER 0 (Parallel)       LAYER 1 (Parallel)      LAYER 2 (Synthesis)
                   │                        │                        │
        ┌──────────┴──────────┐   ┌────────┴────────┐    ┌──────────────────┐
        │ company-context     │   │ self-intel      │    │ swot-analysis    │
        │ budget-constraints  │   │ competitor-intel│    │                  │
        └─────────────────────┘   │ market-intel    │    │ Depends:         │
                                  │ business-model  │    │ • self           │
                                  └─────────────────┘    │ • competitor     │
                                                         │ • market         │
                                                         └────────┬─────────┘
                                                                  │
                                                          LAYER 3 (Discovery)
                                                                  │
                                                    ┌─────────────┴─────────────┐
                                                    │ niche-discovery-100x      │
                                                    │ ecp-validation (OPTIONAL) │
                                                    │ customer-data (OPTIONAL)  │
                                                    │                           │
                                                    │ Depends:                  │
                                                    │ • swot                    │
                                                    │ • customer-data           │
                                                    └─────────────┬─────────────┘
                                                                  │
                                                          LAYER 4 (Activation)
                                                                  │
                                                    ┌─────────────┴─────────────┐
                                                    │ positioning-messaging     │
                                                    │ brand-voice               │
                                                    │ pricing-strategy          │
                                                    │                           │
                                                    │ Depends:                  │
                                                    │ • ecps + competitor       │
                                                    └─────────────┬─────────────┘
                                                                  │
                                                          LAYER 5 (Visual)
                                                                  │
                                                    ┌─────────────┴─────────────┐
                                                    │ visual-identity           │
                                                    │ (Meta-skill)              │
                                                    │                           │
                                                    │ Generates:                │
                                                    │ • ui-system               │
                                                    │ • visual-generator        │
                                                    │ • deck-creator            │
                                                    └───────────────────────────┘

PHASE 2 & 3 (Execution Skills) — Consume Context Lake:

    ┌─────────────────────────────────────────────────────────────┐
    │                   EXECUTION LAYER                           │
    │                                                             │
    │  READ from Context Lake (selective):                        │
    │  • voice-profile.md                                         │
    │  • positioning.md                                           │
    │  • keyword-plan.md                                          │
    │  • audience.md                                              │
    │  • competitors.md                                           │
    │  • learnings.md                                             │
    │                                                             │
    │  SKILLS:                                                    │
    │  ┌──────────────────┐  ┌──────────────────┐                │
    │  │ keyword-research │→ │ seo-content      │                │
    │  └──────────────────┘  └────────┬─────────┘                │
    │                                 ↓                           │
    │                        ┌──────────────────┐                │
    │                        │ content-atomizer │                │
    │                        └──────────────────┘                │
    │                                                             │
    │  ┌──────────────────┐  ┌──────────────────┐                │
    │  │ lead-magnet      │→ │ email-sequences  │                │
    │  └──────────────────┘  └──────────────────┘                │
    │                                                             │
    │  ┌──────────────────┐                                      │
    │  │ direct-response  │                                      │
    │  │ -copy            │                                      │
    │  └──────────────────┘                                      │
    │                                                             │
    │  ┌──────────────────┐                                      │
    │  │ newsletter       │                                      │
    │  └──────────────────┘                                      │
    │                                                             │
    │  WRITE to:                                                  │
    │  • ./campaigns/                                             │
    │  • ./brand/assets.md (append)                               │
    │  • ./brand/learnings.md (append)                            │
    └─────────────────────────────────────────────────────────────┘
```

---

## 8. DATA ARCHITECTURE (Context Lake)

```
./brand/ (Context Lake)
│
├── TIER 1: CONSTITUTION (Core Identity)
│   ├── company-context.json     [Owner: company-context]
│   ├── icp.json                 [Owner: niche-discovery-100x]
│   ├── ecps.json                [Owner: niche-discovery-100x]
│   ├── positioning.json         [Owner: positioning-messaging]
│   └── voice-profile.md         [Owner: brand-voice]
│
├── TIER 2: STRATEGIC (Market Context)
│   ├── product-analysis.json    [Owner: self-intelligence]
│   ├── competitors.json         [Owner: competitor-intelligence]
│   ├── market.json              [Owner: market-intelligence]
│   ├── swot.json                [Owner: swot-analysis]
│   ├── pricing.json             [Owner: pricing-strategy]
│   ├── business-model.json      [Owner: business-model-audit]
│   ├── budget.json              [Owner: budget-constraints]
│   ├── customer-data.json       [Owner: existing-customer-data]
│   ├── assets.md                [Append-only: all skills]
│   └── keyword-plan.md          [Owner: keyword-research]
│
├── TIER 3: TRANSITORY (Daily Pulse)
│   ├── meeting-notes/           [Daily updates]
│   ├── daily-pulse-updates/     [Insights from calls/Slack/Notion]
│   └── ecp-validation-results/  [ECP validation snapshots]
│
└── EXECUTION OUTPUTS
    ├── campaigns/
    │   ├── content/             [SEO articles]
    │   ├── content-plan/        [Content briefs]
    │   ├── email-sequences/     [Email campaigns]
    │   ├── lead-magnets/        [Lead magnet content]
    │   └── newsletters/         [Newsletter editions]
    └── learnings.md             [Append-only: all skills]
```

**File Ownership Rule:** ONE owner per profile file. Solo ese skill puede OVERWRITE. Otros skills pueden READ.

**Append-Only Files:** `assets.md`, `learnings.md` - ALL skills can append, none can overwrite.

**Promotion Rules:**
- Tier 3 data showing consistent patterns (3+ data points) → promoted to Tier 2
- Tier 2 insights confirmed as foundational truths → promoted to Tier 1

---

## 9. SCHEMA CONTRACTS (7 JSON)

Located at: `_system/schemas/`

1. **company-context.schema.json** - Company basics (name, industry, stage, beliefs)
2. **icp.schema.json** - Ideal Customer Profile
3. **positioning.schema.json** - Positioning per ECP
4. **competitors.schema.json** - Competitor battle cards
5. **swot.schema.json** - SWOT analysis + TOWS strategies
6. **gtm-canvas.schema.json** - Maja Voje GTM Canvas (6 steps)
7. **campaign.schema.json** - Campaign metadata + performance

**Why schemas?**
- Skills output structured data → Next skill reads as typed input
- No re-explaining between sessions
- System-wide coherence

---

## 10. PRÓXIMOS PASOS (Recommendations)

### 10.1 PRIORITIZAR GAPS (Por Impacto)

**Fase "Encuentra" - ONE-TO-ONE (Outreach):**
1. ❌ **signal-definition** (CRITICAL) - Definir qué señales importan
2. ❌ **company-finder** (CRITICAL) - Buscar empresas según ICP/ECP
3. ❌ **decision-maker-finder** (CRITICAL) - Encontrar personas decisoras
4. ❌ **contact-enrichment** (CRITICAL) - Enriquecer datos de contacto
5. ❌ **outreach-sequence-builder** (HIGH) - Crear secuencias de outreach
6. ❌ **email-outreach-executor** (HIGH) - Ejecutar outreach con INSTANTLY
7. ❌ **signal-monitor** (MEDIUM) - Monitorear señales definidas
8. ❌ **media-outlet-finder** (MEDIUM) - Buscar medios/influencers para partnerships

**Fase "Encuentra" - ONE-TO-MANY (Contenido):**
1. ❌ **thief-marketers** (CRITICAL) - ROBAR IDEAS de competidores
2. ❌ **daily-pulse** (HIGH) - Extraer insights de reuniones/Slack/Notion
3. ❌ **insight-to-content-mapper** (HIGH) - Convertir insights en content briefs

**Fase "Decide":**
1. ❌ **channel-prioritization** (HIGH) - Decidir qué canales activar
2. ❌ **experiment-designer** (MEDIUM) - Diseñar experimentos
3. ❌ **content-calendar-planner** (MEDIUM) - Planificar calendario

**Fase "Ejecuta":**
1. ❌ **content-scheduler** (HIGH) - Publicar contenido automáticamente
2. ❌ **email-automation-setup** (HIGH) - Configurar email automation

**Fase "Aprende":**
1. ❌ **funnel-analyzer** (CRITICAL) - Analizar funnel AARRR
2. ❌ **content-analytics** (HIGH) - Analizar performance de contenido
3. ❌ **pattern-recognizer** (MEDIUM) - Auto-detectar winning patterns

### 10.2 IMPLEMENTACIÓN SUGERIDA (Next Sprint)

**Sprint 1: Intelligence Core (1 semana)** ✅ COMPLETADO Feb 20
- ✅ **thief-marketers** - ROBAR IDEAS de competidores
- ✅ **signal-definition** - Definir qué señales importan
- ✅ **signal-monitor** - Monitorear señales
- ⏸ daily-pulse (después)

**Sprint 2: Outreach Core (1-2 semanas)**
- company-finder
- decision-maker-finder
- contact-enrichment
- outreach-sequence-builder

**Sprint 3: Execution Layer (1 semana)**
- content-scheduler (Mixpost + Metricool)
- email-automation-setup
- email-outreach-executor (INSTANTLY)

**Sprint 4: Analytics & Learning (1 semana)**
- funnel-analyzer (PostHog/GA4)
- content-analytics (Metricool API)
- outreach-analytics (INSTANTLY API)
- pattern-recognizer

---

## 11. CONCLUSIÓN

### Lo Que Existe (27 skills - actualizado Feb 20, 2026)

**✅ Foundation Completa (Phase 1):** 16 pillars implementados con DAG dependencies, selective context passing, y 3-Lenses methodology.

**✅ Content Creation Completa (Phase 2-3, one-to-many):** Keyword research → SEO content → Content atomizer → Email sequences → Lead magnets → Newsletter → Direct response copy.

**✅ Visual Identity:** Meta-skill que genera child skills.

**✅ 5 Architectural Pillars:** Persistent Memory, Scored Context Loading, Schema Contracts, Learning Loops, Shared Protocol.

### Lo Que Falta (30 gaps - actualizado Feb 20, 2026)

**❌ Outreach Pipeline (one-to-one):** 7 skills críticas (company finder, decision maker finder, contact enrichment, signal monitor, outreach sequence builder, email executor, LinkedIn executor).

**❌ Intelligence Amplification:** Meeting analyzer, insight-to-content mapper, competitor content tracker.

**❌ Execution Layer:** 5 skills (content scheduler, blog publisher, email automation, ad creators).

**❌ Analytics & Learning:** 6 skills (content analytics, SEO tracker, email analytics, outreach analytics, funnel analyzer, pattern recognizer).

### Arquitectura

El sistema SanchoCMO ya tiene una **arquitectura sólida**:
- sancho-start como entry point universal
- foundation-orchestrator como Phase 1 manager
- Context Lake con 3 tiers conceptuales (./brand/ flat structure)
- Selective context passing (Context Matrix)
- Schema contracts para typed interfaces
- Learning loops para compounding

Lo que falta son **skills de ejecución** — especialmente para el cuadrante **one-to-one sin presupuesto** (outreach directo) y el sistema de **analytics/learning** que cierra el loop.

---

**Este mapa es la base para construir las próximas 33+ skills.** Prioriza según impacto y recursos disponibles.

---

## 12. DISCORD DEPLOYMENT ARCHITECTURE

### 12.1 Por Qué Discord

Discord proporciona: canales con threads (aislamiento de workflows), mentions (@agente), reacciones (✅ para aprobar campañas), roles y permisos nativos, y un ecosistema masivo de bots. OpenClaw soporta Discord nativamente con SOUL.md personas, channel bindings, y multi-model routing.

### 12.2 Estructura de Canales (14 canales, 5 categorías)

```
📁 ESTRATEGIA
  #el-toboso         → Identidad de marca (El Oráculo, Opus)
  #campaigns         → Goals + propuestas de campaña + auto-dispatch (Sancho, Opus)
  #intelligence      → Radar automático: daily-pulse, signal-monitor (Sancho, Opus)

📁 OUTREACH (1:1)
  #partners          → Warm: alianzas, co-marketing, referrals (El Conector, Sonnet)
  #prospecting       → Cold: buscar empresas, enriquecer, secuencias (El Explorador, Sonnet)

📁 CONTENT (1:many)
  #organic-content   → SEO, artículos, blog (El Redactor, Sonnet)
  #social            → Social media, newsletter (El Comunicador, Sonnet)
  #paid-ads          → Campañas de pago (El Amplificador, Sonnet)
  #web               → Landing pages, CRO, lead magnets (El Arquitecto, Sonnet)

📁 SOPORTE
  #sales             → Materiales de venta: propuestas, pricing, decks (El Comercial, Sonnet)
  #design            → Creativos y assets visuales (El Creativo, Sonnet)
  #research          → Investigación on-demand: deep dives, mercados (El Investigador, Opus)

📁 SISTEMA
  #learning          → Feedback loop cross-canal semanal (Sancho, Opus)
  #admin             → Workshop: crear procesos, modificar skills, config (Sancho, Opus)
```

**Principio de diseño**: Los canales se organizan por **canal de marketing real** (como un equipo humano), NO por fases de skills. Core Four = OUTREACH (1:1) + CONTENT (1:many).

### 12.3 Gestión de Ruido

| Mecanismo | Dónde |
|-----------|-------|
| @mention requerido | Canales de ejecución y soporte |
| Auto-post sin mention | #intelligence (feed automático) |
| Threads para todo | Workflows en threads, canal limpio |
| Digest semanal | #campaigns (viernes 17:00, Sancho resume) |

---

## 13. AI AGENT TEAM (11 Agentes)

### 13.1 Modelo Híbrido: 3 Opus + 8 Sonnet

| Agente | Canal(es) | Rol | Modelo | SOUL.md |
|--------|-----------|-----|--------|---------|
| **Sancho** | #campaigns, #intelligence, #learning, #admin | CMO estratega. Ve todo. Propone campañas. Sintetiza. | Opus 4.6 | `agents/sancho.soul.md` |
| **El Oráculo** | #el-toboso | Guardián de identidad de marca. Context Lake. | Opus 4.6 | `agents/el-oraculo.soul.md` |
| **El Explorador** | #prospecting | Cold outreach: empresas → contactos → secuencias | Sonnet 4.5 | `agents/explorador.soul.md` |
| **El Redactor** | #organic-content | SEO content, artículos, blog | Sonnet 4.5 | `agents/redactor.soul.md` |
| **El Comunicador** | #social | Social media, newsletter, atomización | Sonnet 4.5 | `agents/comunicador.soul.md` |
| **El Creativo** | #design | Assets visuales, creativos de marca | Sonnet 4.5 | `agents/creativo.soul.md` |
| **El Amplificador** | #paid-ads | Paid media, retargeting, ROAS | Sonnet 4.5 | `agents/amplificador.soul.md` |
| **El Conector** | #partners | Alianzas, partnerships, co-marketing | Sonnet 4.5 | `agents/conector.soul.md` |
| **El Comercial** | #sales | Propuestas, pricing, battlecards | Sonnet 4.5 | `agents/comercial.soul.md` |
| **El Arquitecto** | #web | Landing pages, CRO, lead magnets | Sonnet 4.5 | `agents/arquitecto.soul.md` |
| **El Investigador** | #research | Deep dives, mercados, Last30Days | Opus 4.6 | `agents/investigador.soul.md` |

### 13.2 Asignación de Skills por Agente

```
Sancho (CMO):
  ALL skills ["*"] — acceso total

El Oráculo (Brand):
  company-context, self-intelligence, competitor-intelligence,
  market-intelligence, positioning-messaging, brand-voice,
  swot-analysis, business-model-audit, existing-customer-data,
  ecp-validation, signal-definition, niche-discovery-100x

El Explorador (Prospecting):
  company-finder, decision-maker-finder, contact-enrichment,
  outreach-sequence-builder, email-sequences, direct-response-copy

El Redactor (SEO):
  keyword-research, seo-content, content-calendar-planner

El Comunicador (Social):
  content-atomizer, newsletter, direct-response-copy

El Creativo (Visual):
  visual-identity, brand-voice

El Amplificador (Paid):
  direct-response-copy

El Conector (Partners):
  company-finder, decision-maker-finder, contact-enrichment,
  direct-response-copy

El Comercial (Sales):
  positioning-messaging, pricing-strategy, business-model-audit,
  direct-response-copy

El Arquitecto (Web):
  direct-response-copy, lead-magnet, positioning-messaging

El Investigador (Research):
  daily-pulse, meeting-intelligence, signal-monitor,
  thief-marketers, pattern-detector, competitor-intelligence,
  market-intelligence
```

### 13.3 Comunicación Inter-Agente

Los agentes se comunican vía threads de Discord:

```
El Explorador (#prospecting):
  "Necesito propuesta de pricing para [empresa].
   @ElComercial por favor preparar en #sales"
→ Thread en #sales: "Pricing fintech X — El Comercial"
→ El Comercial ejecuta
→ Link al resultado en thread original de El Explorador
```

### 13.4 Permisos de Equipo

Todos los humanos tienen acceso a todos los canales. La diferencia es solo el modelo.

| Persona | Modelo | Acceso |
|---------|--------|--------|
| Alfonso | Opus 4.6 (cuando habla directamente) | Todos los canales |
| Philippe | Sonnet 4.5 | Todos los canales |
| Martin | Sonnet 4.5 | Todos los canales |

---

## 14. DATA LAYER: Supabase PostgreSQL

### 14.1 Principio Dual: Brand = Files, Operaciones = Database

| Tipo de dato | Almacenamiento | Por qué |
|-------------|----------------|---------|
| **Brand Memory** (identidad, ICP, positioning, voice) | Markdown `./brand/` | Human-readable, git-trackable, OpenClaw-nativo |
| **Datos operacionales** (prospects, ideas, métricas) | **Supabase (PostgreSQL)** | Concurrencia nativa, queryable, relacional |
| **Búsqueda semántica sobre brand** | sqlite-vec (auto) | OpenClaw indexa `./brand/` automáticamente |
| **Búsqueda semántica sobre datos** | pgvector (Supabase) | Embeddings sobre competitors, ideas, insights |

**Por qué Supabase y NO SQLite**: Múltiples agentes escriben simultáneamente (auto-dispatch lanza 5+ agentes a la vez). SQLite = single writer → `"database is locked"`. PostgreSQL soporta escrituras concurrentes.

### 14.2 Las 9 Tablas

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                      │
│                                                               │
│  CRM (Outreach Pipeline):                                     │
│  ├─ companies        — ICP match scoring, signals (JSONB)    │
│  ├─ contacts         — Decision makers linked to companies   │
│  └─ outreach_sequences — 21-day multi-channel sequences      │
│                                                               │
│  Campaign Management:                                         │
│  ├─ campaigns        — Goals, channels, budget, KPIs         │
│  ├─ content_ideas    — Pipeline de ideas (daily-pulse, etc.) │
│  └─ editorial_calendar — Planned → published content         │
│                                                               │
│  Intelligence:                                                │
│  ├─ competitor_moves — Ads, launches, pricing changes        │
│  └─ content_performance — Views, clicks, conversions, cost   │
│                                                               │
│  Learning System:                                             │
│  └─ insights         — Append-only, promotion rule (3+→Tier2)│
└─────────────────────────────────────────────────────────────┘
```

### 14.3 Flujo Canal → Tabla

```
#intelligence ──writes──→ content_ideas, competitor_moves
       │
       ▼
#campaigns ──writes──→ campaigns ──dispatches──→ editorial_calendar
       │
       ├→ #prospecting ──writes──→ companies, contacts, outreach_sequences
       ├→ #organic-content ──reads──→ editorial_calendar, content_ideas
       ├→ #social ──reads──→ editorial_calendar ──writes──→ content_performance
       ├→ #paid-ads ──reads──→ editorial_calendar ──writes──→ content_performance
       └→ #web ──reads──→ editorial_calendar

#learning ──reads──→ content_performance, insights ──promotes──→ brand/*.md
#el-toboso ──reads──→ brand/*.md + insights (promoted)
```

### 14.4 Permisos por Agente (RLS)

| Agente | READ | WRITE |
|--------|------|-------|
| **Sancho** | TODO | campaigns, editorial_calendar, content_ideas, insights |
| **El Oráculo** | brand/*.md, insights (promoted) | — (read-only, actualiza markdown) |
| **El Explorador** | companies, contacts, campaigns | companies, contacts, outreach_sequences |
| **El Conector** | companies, contacts, campaigns | companies, contacts |
| **El Redactor** | editorial_calendar, content_ideas | content_performance |
| **El Comunicador** | editorial_calendar, content_ideas | content_performance |
| **El Amplificador** | editorial_calendar, campaigns | content_performance |
| **El Arquitecto** | editorial_calendar, campaigns | content_performance |
| **El Comercial** | companies, contacts, campaigns | — (output es markdown: propuestas) |
| **El Creativo** | campaigns, editorial_calendar | — (output son archivos de imagen) |
| **El Investigador** | TODO | competitor_moves, content_ideas |
| **Todos** (al cerrar thread) | — | insights (append-only) |

Enforcement: PostgreSQL Row-Level Security (RLS) con 68 policies + 12 roles. Ver `database/init-db.sql`.

### 14.5 Regla de Promoción (insights → brand)

```
Insight detectado (occurrences=1)
  ↓ (misma categoría aparece 3+ veces)
Promotion a Tier 2: Sancho actualiza brand/*.md correspondiente
  ↓ (validado como verdad fundacional tras 6+ meses)
Promotion a Tier 1: El Oráculo actualiza constitution files
```

Sancho ejecuta semanalmente en #learning:
```sql
SELECT text, category, COUNT(*) AS occurrences
FROM insights
WHERE promoted_to IS NULL
GROUP BY category, text
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC;
```

---

## 15. AUTO-DISPATCH: De Campaña a Ejecución

### 15.1 Mecanismo

Un **Discord bot listener** (Node.js, `discord/dispatch-bot.js`) separado de OpenClaw:

```
Usuario reacciona ✅ en #campaigns
  → Bot detecta reacción ✅
  → Bot lee mensaje de campaña, parsea canales
  → Bot crea thread en #organic-content: "KYC Express — Brief"
  → El Redactor (bound a #organic-content) responde al thread
  → Bot crea thread en #prospecting: "KYC Express — Brief"
  → El Explorador responde al thread
  → etc.
```

### 15.2 Ejemplo de Campaña Dispatch

```
#campaigns: "Campaña KYC Express aprobada ✅"
    │
    ├→ #organic-content: [Thread] "KYC Express — El Redactor"
    │   Brief: Artículo SEO "Abrir cuenta sin papeleos"
    │
    ├→ #social: [Thread] "KYC Express — El Comunicador"
    │   Brief: 5 posts LinkedIn/Twitter velocidad KYC
    │
    ├→ #prospecting: [Thread] "KYC Express — El Explorador"
    │   Brief: Secuencia a 50 fintechs
    │
    ├→ #paid-ads: [Thread] "KYC Express — El Amplificador"
    │   Brief: Retargeting "5 min setup", €500
    │
    └→ #design: [Thread] "KYC Express — El Creativo"
        Brief: Creativos social + banner retargeting
```

### 15.3 Stack Técnico

- `discord.js ^14.14.1` — Bot estándar
- `dotenv ^16.4.1` — Variables de entorno
- Parsing: regex sobre formato `→ #channel (Agent): Brief`
- PM2 recomendado para producción: `pm2 start dispatch-bot.js`

---

## 16. AISLAMIENTO MULTI-CLIENTE

### 16.1 Estructura

1 servidor Discord + 1 proyecto Supabase por cliente:

```
~/PROJECTS/
├── sanchocmo-monzo/
│   ├── openclaw.config.json    (mismos 11 agentes)
│   ├── .env                    (Supabase monzo + Discord monzo)
│   ├── brand/                  (datos Monzo)
│   └── campaigns/
├── sanchocmo-criptan/
│   ├── openclaw.config.json
│   ├── .env                    (Supabase criptan + Discord criptan)
│   ├── brand/                  (datos Criptan)
│   └── campaigns/
```

**Zero data leakage**: Cada servidor tiene su propio workspace + proyecto Supabase.

**Costes**: Supabase free tier = 2 proyectos. Después $25/mes. Alternativa: 1 proyecto con schemas PostgreSQL separados (`monzo.*`, `criptan.*`).

---

## 17. MCP SERVER STACK

| Server | Obligatorio | Para qué | Config |
|--------|-------------|----------|--------|
| **Supabase** | Sí | 9 tablas operacionales, RLS | `openclaw.config.json` |
| **Notion** | Recomendado | Workspace integration | `openclaw.config.json` |
| **Playwright** | Recomendado | Web scraping, Infer-First | `openclaw.config.json` |
| **Nanobanana** | Opcional | Generación de imágenes (El Creativo) | `openclaw.config.json` |

---

## 18. ROADMAP PROGRESIVO

| Fase | Semana | Qué | Agentes |
|------|--------|-----|---------|
| **MVP** | 1-2 | 7 canales + Supabase 4 tablas + El Oráculo | 2 (Sancho + El Oráculo) |
| **Especialistas** | 2-3 | +El Explorador, Redactor, Comunicador, Creativo + tablas CRM | 6 |
| **Soporte** | 3-4 | +#sales, #design, #research, #learning + El Comercial, Investigador | 9 |
| **Full** | 4-5 | +#partners, #paid-ads, #web + auto-dispatch bot + RLS completas | 11 |
| **Team** | 5-6 | Philippe + Martin con acceso completo | 11 |
| **Multi-client** | 6-8 | Servidores por cliente + Hub cross-client | 11 |

---

## 19. CONCLUSIÓN ACTUALIZADA

### Skills Layer (35 skills — Feb 22, 2026)
- ✅ Foundation completa (16 pillars)
- ✅ Content creation completa (7 execution skills)
- ✅ Intelligence pipeline (4 skills)
- ✅ Outreach pipeline (4 skills)
- ✅ 5 pilares arquitectónicos
- ❌ 20+ gaps en Ejecuta y Aprende

### Deployment Layer (11 agentes — Feb 23, 2026)
- ✅ 14 canales Discord en 5 categorías
- ✅ 11 agentes con SOUL.md (3 Opus + 8 Sonnet)
- ✅ 9 tablas Supabase con 68 RLS policies
- ✅ Auto-dispatch bot (discord.js)
- ✅ Multi-client isolation (1 servidor + 1 DB por cliente)
- ✅ MCP server stack (Supabase, Notion, Playwright, Nanobanana)

**El sistema tiene dos capas complementarias**: la capa de SKILLS (qué hacer) y la capa de DEPLOYMENT (cómo ejecutarlo en Discord con agentes especializados). Juntas, forman un CMO autónomo que puede escalar a múltiples clientes.
