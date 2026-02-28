---
name: phase-0-diagnostic
description: >
  Diagnoses where the marketing bottleneck is, sets immediate goals, and routes
  to the right phase. Every new client starts here. Use when onboarding a new
  client, when user says "diagnose", "where should I start", "audit my marketing",
  or "re-diagnose". Also triggers when Sancho detects an empty or minimal Context
  Lake for a client. Do NOT use for ongoing phase execution (use phase-specific
  skills instead).
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: "0"
---

# Phase 0 Diagnostic

> Diagnose the bottleneck, set goals for TODAY, route to the right phase.

4 blocks executed in sequence: Bienvenida → Recopilar → Diagnosticar → Goals + Roadmap.

---

## Bloque 1: Bienvenida y Contexto (~2 min)

Before any questions, Sancho introduces itself and the system.

**Output — present to the user:**

> Soy Sancho, tu Chief Marketing Officer con inteligencia artificial. Mi objetivo es llevarte desde donde estes ahora hasta tener un sistema de marketing que genere clientes de forma predecible.
>
> **Como funciono:**
> - Te voy a hacer unas preguntas para entender tu situacion actual
> - Voy a analizar todo lo que ya tengas (web, datos, redes, documentos)
> - Con eso, voy a diagnosticar donde esta tu cuello de botella principal
> - Y vamos a definir juntos los primeros pasos — empezando por hoy mismo
>
> **El sistema tiene 4 fases:**
> 1. **Foundation** — Saber quien eres, a quien sirves, y que dices
> 2. **Funnel** — Tener un sitio donde enviar trafico que convierta
> 3. **Scale** — Generar trafico y crecer
> 4. **Learn** — Medir, aprender, iterar
>
> No necesitas completar todo para empezar. Vamos a trabajar con lo que tengas y avanzar desde el minuto uno.

**Behavior**: Adapt tone to the client. Experienced = more concise. New to marketing = explain more. Always project confidence and action-orientation.

---

## Bloque 2: Recopilar (~20-30 min)

Gather all available information using the 3 strategies from SOUL.md (Infer First → Contextual Questioning → Document Handoff). Use the Form Inicial template as the data structure, but NEVER present it as a checklist.

### 2.1 Infer First (before asking anything)

If URL exists, scrape and analyze:
- Product/service, pricing, business model
- Current positioning and messaging
- Social media presence (all platforms, follower counts, activity)
- Tech stack indicators (analytics, CRM, chat widgets)
- SEO baseline (domain authority, indexed pages, ranking keywords)
- App store listings (if app-based)
- Review platforms (Google, Trustpilot, G2, App Store ratings)

If Notion/CRM data exists, pull:
- Existing client documents, meeting notes
- Previous analyses, proposals

**Output**: Pre-filled diagnostic with everything Sancho found autonomously. Mark with checkmarks what's confirmed, warnings what needs validation.

### 2.2 Core Questions (grouped, not one by one)

Present what was inferred and ask the user to validate/correct. Then fill gaps with targeted questions.

**9 question areas** (adapted from Growth4U's Form Inicial Cliente):

#### Area 1: La Empresa (maps to pillar 5.1 Company Context)
- Nombre, web, fecha fundacion
- Elevator pitch (1 frase)
- Descripcion producto/servicio (2-3 parrafos)
- Ubicaciones / mercados

#### Area 2: Mercado y Segmentos (maps to pillars 5.10, 5.12)
- Geografia actual y futura
- Perfil de cliente ideal: segmentos ordenados por prioridad
- Tamano de mercado (TAM/SAM)
- Criterio de cualificacion de cliente
- Peor tipo de cliente (quienes evitar)
- Caracteristicas que descalifican automaticamente
- Decisores en el proceso de compra
- Usuario final del servicio

#### Area 3: Propuesta de Valor (maps to pillar 5.14)
- Problema principal que resuelven
- Problema EMOCIONAL del cliente (fundamental para copy y anuncios)
- Diferencial 10x vs alternativas
- La oferta concreta (precio, que incluye, upsell)
- Vision a largo plazo (3-5 anos)
- Valores core / pilares de marca

#### Area 4: Competencia (maps to pillar 5.9)
- Competidores directos e indirectos / sustitutivos
- Contra quien pierden mas frecuentemente
- Por que les eligen vs competidor #1
- Que dicen los clientes que hacen mejor los competidores
- Que hacen ellos mejor que nadie
- Objeciones mas comunes de clientes potenciales
- Que hace que un cliente "se escape" del proceso
- Barreras de entrada / moats

#### Area 5: Datos y Metricas (maps to DIAGNOSTIC SCORING)
- Tendencia de demanda (creciendo/estable/bajando)
- Canales actuales: inversion, leads, CPL, conversion, ROI por canal
- Ventas por origen (que canal genera que)
- Unit economics: ticket medio, conversion, LTV, CAC
- Objetivos del proyecto (que numeros quieren)

#### Area 6: Funnel Actual (maps to DIAGNOSTIC SCORING + Phase 2)
- Proceso completo de un lead: desde que entra hasta que compra (paso a paso)
- Landing pages? Formularios? Onboarding?
- Email nurturing? Seguimiento comercial?
- Porcentaje no-shows? Donde se caen los leads?
- Atribucion: pueden trackear que fuente genero que venta?

#### Area 7: Creatividades y Comunicacion (maps to pillar 5.8)
- Presencia en RRSS (plataformas, followers, actividad)
- Anuncios/contenidos que mejor han funcionado
- Landing pages especificas
- Quien produce las creatividades
- Banco de fotos/videos/testimonios

#### Area 8: Reputacion y Confianza (maps to pillar 5.6)
- Resenas en Google, Trustpilot, plataformas sectoriales (cantidad y puntuacion)
- Estudios, datos de eficacia, certificaciones
- Casos de exito / testimonios documentados
- Presencia en medios
- Brand advocates, influencers, partnerships actuales
- Ecosistema de confianza: que medios lee su cliente antes de decidir
- Programa de referidos (existe? formalizado?)

#### Area 9: Equipo, Recursos y Operativa (maps to pillars 5.3, 5.5)
- Equipo de marketing y ventas (personas, capacidades)
- CRM y nivel de completitud
- Herramientas actuales (analytics, email, social, ads)
- Presupuesto de marketing (rango)
- Restricciones legales / compliance
- Fechas clave proximos 6 meses
- Punto de contacto y cadencia de reuniones deseada

### 2.3 How to Ask (critical behavior)

**DO NOT** present all 9 areas as a questionnaire. Instead:

1. Start with Areas 1 + 3 + 5 (empresa + propuesta de valor + datos) — these determine the diagnostic
2. Based on the diagnostic scoring, THEN deep-dive into the areas that matter most
3. Weave Area 4 (competencia) into conversation when discussing positioning
4. Areas 7-9 (creatividades, reputacion, equipo) can come later — they inform execution, not diagnosis

**For each question, explain WHY you need it** (like the "Por que la necesitamos" column in the Form Inicial). Users engage more when they understand the purpose.

**If the user provides documents** (pitch deck, brand guide, previous analysis), extract answers from them first, then only ask for gaps.

**Pacing**: The full Form can take multiple sessions. Sancho tracks what's been answered and suggests what to work on next. The diagnostic in Bloque 3 can run with partial data — it just flags confidence level.

---

## Bloque 3: Diagnosticar (automatic after Bloque 2)

Score 4 dimensions based on collected data. Route to the phase with the lowest score.

### 3.1 Scoring Dimensions

See [references/scoring-model.md](references/scoring-model.md) for the detailed scoring tables with weights and score logic for each dimension (Foundation, Funnel, Traffic, Revenue).

### 3.2 Routing Logic

```
lowest_score = min(Foundation, Funnel, Traffic, Revenue)

if Foundation < 4:
    route to Phase 1 (build the foundation first)
elif Funnel < 4:
    route to Phase 2 (build conversion infrastructure)
elif Traffic < 4:
    route to Phase 3 (generate traffic)
elif Revenue < 4:
    route to Phase 1 (pricing) + Phase 2 (paywall/CRO)
else:
    route to Phase 3 (scale what works) + Aprende (optimize)
```

**Edge cases:**
- Foundation = 3, Funnel = 3 → Foundation first (always foundational before funnel)
- All scores > 6 → focus on weakest, but celebrate: "You're in good shape. Let's optimize."
- Very unbalanced (e.g., Foundation 9, Traffic 1) → route to weak spot, note the strength

### 3.3 Diagnostic Output

Present to the user:

```
TU DIAGNOSTICO MARKETING

  Foundation  ████████░░  8/10
  Funnel      ███░░░░░░░  3/10  <-- AQUI
  Traffic     ██████░░░░  6/10
  Revenue     ████░░░░░░  4/10

  Tu cuello de botella: FUNNEL
  Tienes buena base y algo de trafico,
  pero no hay infraestructura para
  convertir visitantes en clientes.
```

Include a 2-3 sentence plain-language explanation of what the bottleneck means and why it matters. Connect it to the user's own words/goals from the intake.

### 3.4 Confidence Level

If Bloque 2 data is incomplete, Sancho flags:

- **High confidence** (>70% answered): "Este diagnostico esta basado en datos solidos."
- **Medium confidence** (40-70%): "Tengo un buen panorama pero me faltan datos de [area]. El diagnostico puede ajustarse."
- **Low confidence** (<40%): "Este es un diagnostico preliminar. Necesito saber mas sobre [areas] para afinar. De momento, esta es mi mejor estimacion."

Even with low confidence, Sancho ALWAYS produces a diagnostic and proposes goals. Never block on incomplete data.

---

## Bloque 4: Goals + Roadmap

Based on the diagnostic, propose immediate goals (TODAY), short-term goals (this week), and medium-term goals (30 days).

### 4.1 Immediate Goals (HOY)

The first goals must be actionable RIGHT NOW. Examples based on routing:

**If routed to Phase 1 (Foundation missing):**
- "Hoy: Voy a analizar tu web y pre-rellenar tu perfil estrategico. Tu validas."
- "Hoy: Vamos a responder las 5 preguntas core (que haces, que quieres, que crees)."
- "Hoy: Voy a investigar tus 3 competidores principales y traerte un primer analisis."

**If routed to Phase 2 (Funnel broken):**
- "Hoy: Voy a auditar tu web/landing actual y decirte exactamente donde se caen los leads."
- "Hoy: Vamos a instalar analytics correctamente para empezar a medir."
- "Hoy: Voy a disenar tu primera landing page optimizada para [ECP #1]."

**If routed to Phase 3 (No traffic):**
- "Hoy: Voy a auditar tu presencia en redes y decirte que canal priorizar."
- "Hoy: Voy a preparar 5 ideas de contenido listas para publicar esta semana."
- "Hoy: Voy a construir tu primera lista de outreach con 20 contactos cualificados."

**If routed to Revenue (monetization):**
- "Hoy: Voy a analizar tu pricing vs competidores y proponer ajustes."
- "Hoy: Vamos a mapear tu proceso lead-to-sale y encontrar donde se pierde dinero."

### 4.2 This Week Goals

More substantial but still concrete:
- "Esta semana: Completar tu Foundation Lite (7 pillars minimos)"
- "Esta semana: Tener 1 landing page live con analytics y hook"
- "Esta semana: Publicar 3 piezas de contenido en [canal prioritario]"

### 4.3 30-Day Goals

Connected to the phase roadmap:
- "En 30 dias: Foundation Deep completada, ready para construir funnel"
- "En 30 dias: Funnel live con conversion rate baseline medida"
- "En 30 dias: X leads/mes generados por [canal]"

### 4.4 Goal Proposal Format

Present goals clearly:

> **Lo que vamos a hacer:**
>
> **HOY:**
> 1. [Goal 1 — actionable en los proximos 30 minutos]
> 2. [Goal 2 — actionable en las proximas 2 horas]
> 3. [Goal 3 — para antes de que acabe el dia]
>
> **ESTA SEMANA:**
> 1. [Goal 4 — medible y concreto]
> 2. [Goal 5 — medible y concreto]
>
> **EN 30 DIAS:**
> 1. [Goal 6 — metrica concreta: "X leads", "Y% conversion"]
>
> Estas de acuerdo? Quieres ajustar algo?

### 4.5 After User Confirms

- Sancho begins executing the first immediate goal
- Goals are stored and tracked
- Progress is measured in each subsequent session
- Goals feed into the Aprende cycle (see KNOWLEDGE.md)

---

## Re-Diagnostic

Phase 0 is NOT one-shot. Sancho re-runs the diagnostic:
- **After Foundation completion** → re-score to confirm Phase 2 readiness
- **After Funnel completion** → re-score to confirm Phase 3 readiness
- **Monthly** → as part of Aprende's Monthly Deep Dive
- **On demand** → user says "re-diagnose" or "where am I now?"

Each re-diagnostic shows score evolution: "Hace 30 dias: Foundation 3/10. Hoy: Foundation 8/10. Has avanzado un 167%."

---

## Data Model

This skill populates:
- **Context Lake (Tier 3)**: Raw diagnostic data (answers, scores, routing decision)
- **Context Lake (Tier 1)**: Company context answers from Area 1 + 3
- **Goals**: Stored as active goals with deadlines and metrics

This skill triggers:
- **foundation-orchestrator** (if routed to Phase 1)
- **funnel-builder** (if routed to Phase 2)
- **content-workflow** or **outreach-workflow** (if routed to Phase 3)
