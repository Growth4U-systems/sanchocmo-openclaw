# GTM Strategies — Documento para Sancho v3.0

> Este documento contiene TODO lo que Sancho necesita para convertirse en un orquestador de estrategias GTM. Contiene: la lógica del skill, el workflow de 7 pasos, y el catálogo completo de 25 estrategias con aplicabilidad B2B/B2C y sectores ideales.

---

## Qué es este skill

**gtm-strategies** es el orquestador de campañas de Phase 3: Scale de SanchoCMO.

Cuando el cliente ya tiene Foundation (sabe quién es, a quién sirve, qué dice) y Funnel (landing pages, emails, trust engine), la pregunta es: **¿cómo generamos tráfico y crecemos?**

Este skill:
1. Lee el contexto del cliente (dolores, presupuesto, negocio)
2. Lee la inteligencia disponible (pattern-detector, signal-monitor, daily-pulse, content-miner)
3. Pregunta explícitamente por objetivos
4. Filtra y puntúa las 25 estrategias del catálogo
5. Recomienda las 2-3 mejores
6. Espera aprobación antes de ejecutar
7. Activa los skills de ejecución en secuencia

**Relación con otros skills:**
- **channel-prioritization** (Phase 1.5) = DÓNDE jugar: scoring de canales, budget 70/20/10
- **gtm-strategies** (Phase 3) = CÓMO ejecutar end-to-end la campaña dentro de ese canal
- Pueden usarse secuencialmente o independientemente

---

## Prerequisites

**Requeridos:**
- `./brand/ecps.md` — dolores del ICP + perfil de personas
- `./brand/budget.md` — recursos disponibles
- `./brand/company-context.md` — contexto de negocio

**Opcionales (mejoran la recomendación):**
- `./brand/channel-plan.md` — canales ya priorizados
- `./brand/positioning.md` — ángulos de mensajería
- `./brand/intelligence/patterns.json` — temas recurrentes (pattern-detector)
- `./brand/intelligence/content-ideas.json` — ideas clasificadas (content-miner)
- `./brand/daily-pulse-updates/latest.json` — tendencias recientes
- `./brand/intelligence/hot-companies.json` — empresas con señales activas (signal-monitor)
- `./brand/learnings.md` — aprendizajes previos

---

## Workflow: 7 Pasos

### Paso 1: Load Context Lake (~2 min)

Leer archivos requeridos. Extraer:

```
De ecps.md:        → dolores top 3 del ICP, cómo descubren soluciones, dónde pasan el tiempo
De budget.md:      → presupuesto mensual (EUR), equipo (horas/semana), capacidades de contenido
De company-context.md: → industria, etapa, modelo de negocio, canales actuales
De channel-plan.md (si existe): → canales ya seleccionados (no repetir análisis)
```

Si faltan archivos críticos, informar al usuario qué se necesita y ofrecer ejecutar el skill previo.

### Paso 2: Load Intelligence (~2 min)

Leer inteligencia disponible del pipeline. **Presentar al usuario un resumen de lo que se cargó** (transparencia).

```
Si existe ./brand/intelligence/patterns.json:
  → Extraer top 3 temas recurrentes (frecuencia ≥ 3 menciones)
  → Nota: "Estos temas se repiten → estrategias que los aborden tienen urgencia extra"

Si existe ./brand/intelligence/content-ideas.json:
  → Contar ideas pendientes
  → Nota: "Hay X ideas de contenido pendientes → estrategias de contenido tienen base"

Si existe ./brand/daily-pulse-updates/ (archivos recientes < 7 días):
  → Extraer tendencias detectadas
  → Nota: "Tendencia: [X] → puede influir en timing o ángulo"

Si existe ./brand/intelligence/hot-companies.json (signal-monitor output):
  → Contar empresas HOT
  → Si > 5 empresas HOT → Cold Outreach B2B sube automáticamente en scoring
```

### Paso 3: Elicitar Objetivos (siempre explícito)

**Siempre preguntar, aunque haya datos.** Los objetivos determinan qué estrategias son óptimas.

```
¿Cuál es tu objetivo principal AHORA MISMO?
  A) Awareness — que nos conozcan en el mercado objetivo
  B) Lead Generation — generar pipeline calificado
  C) Conversión — cerrar más clientes
  D) Autoridad — posicionarnos como referentes del sector
  E) Retención — reducir churn / aumentar LTV
  F) Expansión — upsell/cross-sell a base existente
  G) Comunidad — activar boca a boca / construir ecosistema

¿Horizonte temporal para primeros resultados?
  Corto (1-3 meses) / Medio (3-6 meses) / Largo (6-12 meses)

¿Tu negocio es principalmente B2B, B2C, o ambos?
```

### Paso 4: Mapear Hormozi Core Four

Determinar qué cuadrantes son viables según modelo de negocio y recursos:

```
                    ORGANIC (tiempo)              PAID (dinero)
               ┌───────────────────────────┬────────────────────────┐
ONE-TO-ONE     │ #01 ICP List B2B Outreach │ #14 ABM                │
               │ #02 Trust Engine Media *  │                        │
               │ #04 Adjacent Ecosystem    │                        │
               │ #05 Customer Advocacy     │                        │
               │ #07 Warm Outreach         │                        │
               │ #09 Community & Reddit    │                        │
               │ #35 Customer Expansion    │                        │
               ├───────────────────────────┼────────────────────────┤
ONE-TO-MANY    │ #17 SEO Content           │ #27 Paid Ads           │
               │ #18 Community Building    │ #28 Compra Visibilidad │
               │ #20 Product Hunt Launch   │     + Paid PR          │
               │ #21 Free Tool Strategy    │ #29 Retargeting        │
               │ #22 Webinars / Eventos    │                        │
               │ #23 Free Media & Dirs     │                        │
               │ #25 Referral Program      │                        │
               │ #26 PLG                   │                        │
               │ #30 Founder-Led GTM       │                        │
               │ #31 AIO/GEO              │                        │
               │ #32 Social SEO            │                        │
               │ #34 Email List Owned Ch.  │                        │
               └───────────────────────────┴────────────────────────┘

TRANSVERSAL: #33 GTM Engineering | #36 Content Ideation Engine

* #02 Trust Engine puede ser Organic (pitching) o Paid (sponsorship) — el outcome
  se negocia caso a caso.
```

**Reglas de viabilidad:**
- 1:1 Organic → requiere ACV suficiente para justificar esfuerzo por contacto
- 1:1 Paid → mínimo €1K/mes + funnel listo
- ABM → <500 cuentas objetivo + €5K/mes + persona dedicada
- PLG → requiere producto con momento viral natural
- Community Building → requiere 6-12 meses y community manager
- GTM Engineering → requiere capacidad técnica
- **Intelligence boost**: Si signal-monitor tiene ≥5 empresas HOT → Cold Outreach B2B sube en scoring automáticamente

**Filtro B2B/B2C:** Usar la sección "Aplicabilidad" de cada estrategia para filtrar las que no aplican al tipo de negocio del cliente. Estrategias marcadas ❌ para su tipo se eliminan. Estrategias marcadas ⚠️ se incluyen pero con nota de adaptación.

### Paso 5: Filtrar + Puntuar Catálogo

Filtrar por cuadrante viable + objective-fit + prerequisites + B2B/B2C fit. Puntuar las que pasan el filtro:

| Dimensión | Peso | Descripción |
|-----------|------|-------------|
| Dolor-fit | 0.25 | ¿cuánto resuelve los dolores identificados? |
| Objetivo-fit | 0.25 | ¿cuánto sirve al objetivo declarado? |
| Resource-fit | 0.25 | ¿ejecutable con los recursos disponibles? |
| Time-to-result | 0.25 | ¿qué tan rápido da señal? |
| **Intelligence boost** | +1 bonus | ¿la inteligencia cargada apoya esta estrategia? |

**Formula**: `Score = (Dolor×0.25) + (Objetivo×0.25) + (Resource×0.25) + (Time×0.25) [+ 1 si intelligence boost]`

Presentar scoring como tabla:

```
Estrategia              Dolor  Obj    Res    Time   SCORE  [+Intel]
──────────────────────  ─────  ─────  ─────  ─────  ─────  ────────
Cold Outreach B2B        8      9      7      8      8.00   +1 🔥
LinkedIn Founder-Led     7      8      8      7      7.50
SEO Content              6      7      7      4      6.00
```

### Paso 6: Recomendar Top 2-3 Estrategias

Para cada estrategia recomendada, presentar:

```
ESTRATEGIA: [Nombre]
├── Cuadrante: [Hormozi]
├── Aplicabilidad: [B2B ✅ / B2C ✅/⚠️/❌]
├── Score: [X.XX] [+ intelligence boost si aplica]
├── Por qué: [razón ligada a dolores + objetivos + inteligencia disponible]
├── Flujo end-to-end: [pasos narrativos — cómo funciona la estrategia]
├── Tiempo al primer resultado: [X semanas/meses]
├── Prerequisitos: [qué necesita estar listo]
├── Sectores ideales: [de la ficha de Aplicabilidad]
└── Skills de Sancho que activará: [lista en orden]

INTELLIGENCE NOTES (si aplica):
"[X tema recurrente detectado] → refuerza esta estrategia porque..."
```

### Paso 7: Esperar Aprobación → Ejecutar

```
¿Con qué estrategia quieres proceder?
  [1] [Estrategia A]
  [2] [Estrategia B]
  [3] [Estrategia C]
  [4] Combinar [A] + [B]
  [5] Muéstrame más opciones del catálogo
  [6] Re-puntuar con diferentes pesos
```

**Esperar input antes de escribir ningún archivo.**

Al aprobar → crear `./campaigns/[strategy-slug]/strategy-plan.md` → activar skills en secuencia.

---

## Output: Strategy Plan

### File: `./campaigns/[strategy-slug]/strategy-plan.md`

```markdown
# Strategy Plan — [Company Name] / [Strategy Name]

Generated: [date]
Objective: [objetivo declarado]
Horizon: [corto/medio/largo]
Budget: EUR [amount]/month
Team: [size] dedicando [hours]h/week
B2B/B2C: [tipo de negocio]

## Strategy Overview
[Descripción de la estrategia y por qué se eligió]

## Aplicabilidad
[B2B/B2C fit y adaptaciones necesarias para este cliente]

## Intelligence Used
- Pattern-detector: [temas recurrentes si los hay]
- Signal-monitor: [empresas HOT si las hay]
- Daily-pulse: [tendencias si las hay]

## Flujo End-to-End
[Pasos detallados de la estrategia elegida]

## Skills de Sancho Activados (en orden)
1. [Skill 1] — [propósito]
2. [Skill 2] — [propósito]

## KPIs
- [KPI 1]: [target]
- [KPI 2]: [target]

## First 30-Day Actions
[Lista concreta de primeros pasos]

## Prerequisitos Pendientes
[Si hay algo que preparar antes de empezar]
```

---

## Índices de Referencia Rápida

### Índice por Objetivo

| Objetivo | Estrategias |
|----------|------------|
| Awareness | #02, #04, #09, #17, #20, #23, #27, #28, #31, #32, #34 |
| Lead Gen | #01, #04, #05, #07, #14, #17, #20, #21, #22, #25, #27, #29, #30, #32, #34 |
| Conversión | #01, #05, #07, #14, #22, #26, #27, #29, #30, #35 |
| Autoridad | #02, #09, #17, #18, #21, #22, #23, #28, #30, #31, #34 |
| Retención | #18, #26, #35 |
| Expansión | #25, #26, #35 |
| Comunidad | #09, #18, #25, #34 |

*Transversales (#33 GTM Engineering, #36 Content Ideation Engine) potencian cualquier objetivo.*

### Índice por Velocidad

| Rápido (< 4 semanas) | Medio (1-3 meses) | Lento (3+ meses) |
|---------------------|------------------|-----------------|
| #01, #05, #07, #20, #22, #23, #27, #28, #29, #33, #35, #36 | #02, #04, #14, #21, #30, #32 | #09, #17, #18, #25, #26, #31, #34 |

### Índice por B2B/B2C

| Tipo | ✅ Core | ⚠️ Con adaptación | ❌ No aplica |
|------|---------|-------------------|-------------|
| **Solo B2B** | #01, #07, #14, #30 | — | B2C |
| **Solo B2C** | #32 | — | B2B |
| **Ambos ✅** | #02, #05, #09, #17, #21, #23, #26, #27, #28, #29, #31, #34, #36 | — | — |
| **B2B ✅ + B2C ⚠️** | #04, #20, #22, #33, #35 | B2C con adaptación | — |
| **B2B ⚠️ + B2C ✅** | #18, #25 | B2B con adaptación | — |

---

## Nota sobre Lead Magnets / Email Sequences

No son estrategias de este catálogo — son **infraestructura de funnel** (Phase 2, MOFU/BOFU). Muchas estrategias envían tráfico a esta infraestructura. Si el cliente no tiene funnel listo, avisar antes de activar estrategias de adquisición paid.

---

# CATÁLOGO DE ESTRATEGIAS (25 estrategias)

Cada estrategia sigue esta estructura:
- 0) OBJETIVO — A qué objetivo de empresa ayuda y por qué es la mejor opción
- 1) IDEACIÓN — Cómo obtener las ideas y planificar qué vas a hacer
- 2) CREACIÓN — Cómo construir los assets, materiales, contenido
- 3) EJECUCIÓN — Cómo publicar, distribuir, lanzar
- 4) MEDICIÓN — Cómo medir performance con métricas y benchmarks

---

## 1:1 ORGANIC (7 estrategias)

---

### 01. ICP List B2B Outreach

**Cuadrante**: 1:1 Organic
**Objetivo medible**: Generar ≥10 meetings cualificados/mes con pipeline de €50K+
**Prerequisitos**: ACV >€1K/deal, ICP definido con precisión, sequencer (Instantly, Lemlist)
**Tiempo al primer resultado**: 2-4 semanas (primeras respuestas), 4-8 semanas (primeras reuniones)

**Aplicabilidad**:
- **B2B**: ✅ Core use case
- **B2C**: ❌ No aplica (volumen demasiado alto para 1:1)
- **Sectores ideales**: SaaS, Consultoría, Servicios profesionales, Tech, Industrial

#### 0) Objetivo y por qué esta estrategia
Lead generation + pipeline de ventas B2B. Cuando tienes ACV suficiente para justificar el esfuerzo 1:1, sabes exactamente quién es tu ICP, y necesitas resultados rápidos sin depender de inbound. Construyes una lista basada en criterios de ICP, enriqueces contactos, y lanzas secuencia de outreach. Sin magia — ejecución pura.

#### 1) Ideación
- Definir criterios de empresa objetivo: industria, tamaño (empleados/revenue), geografía, tecnología
- Revisar `ecps.md` → extraer dolores específicos del ICP para personalización de mensajes
- Definir segmentos dentro del ICP (si hay sub-nichos): cada segmento puede tener un ángulo distinto
- Volumen de lista: 200-500 empresas por campaña

#### 2) Creación
- **List building**: `company-finder` → lista de 200-500 empresas
- **Decision makers**: `decision-maker-finder` → persona correcta por empresa
- **Enriquecimiento**: `contact-enrichment` → email verificado, LinkedIn, contexto
- **Secuencia de outreach**: `outreach-sequence-builder` → 3-5 touchpoints:
  - Email 1: contexto específico + dolor ICP + CTA suave
  - LinkedIn connection + mensaje personalizado (día 2-3)
  - Email 2: case study o dato relevante (día 5)
  - Llamada si ACV >€10K (día 7)
  - Email 3: breakup email con valor (día 10)

#### 3) Ejecución
- Warm-up de dominios de envío (2 semanas antes si dominio nuevo)
- 30-50 emails/día por buzón (no más)
- Gestionar respuestas en <4h
- No-response → nurture list (recontactar en 90 días)

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Open rate | >50% |
| Reply rate | >15% |
| Positive reply rate | >5% |
| Meeting booked rate | >3% |
| Pipeline generado | >€50K/mes |
| Cost per meeting | <€100 |

**Skills de Sancho**: `company-finder` → `decision-maker-finder` → `contact-enrichment` → `outreach-sequence-builder`

**Cuándo usar**: ✅ B2B con ACV >€1K | ✅ ICP definido y listable | ✅ Necesitas pipeline rápido
**Cuándo NO usar**: ❌ B2C | ❌ Sin sequencer | ❌ ACV <€200

---

### 02. Trust Engine Media Placements

**Cuadrante**: 1:1 (Organic o Paid — depende de la negociación)
**Objetivo medible**: ≥4 apariciones/mes en medios del nicho, >1K visitas atribuidas/mes, >10 leads/mes
**Prerequisitos**: Founder/experto con experiencia demostrable, 1-2 temas de expertise claros
**Tiempo al primer resultado**: 2-8 semanas

**Aplicabilidad**:
- **B2B**: ✅ Podcasts B2B, newsletters de nicho, publicaciones sectoriales
- **B2C**: ✅ Influencers, YouTubers, podcasts lifestyle
- **Sectores ideales**: Cualquiera con ecosistema de medios/creadores en su vertical

*Para guest posts gratuitos, HARO, directorios y review platforms → ver Free Media (#23). Esta estrategia cubre placements donde hay negociación directa con el medio.*

#### 0) Objetivo y por qué esta estrategia
Autoridad + awareness + lead gen accediendo a audiencias que ya confían en otro. La clave es el **trust transfer**: cuando un host de podcast te recomienda, su audiencia te recibe con confianza heredada. La diferencia entre orgánico y pagado NO es una estrategia distinta — es el outcome de la negociación.

#### 1) Ideación — Descubrimiento de medios
- **Podcasts**: ListenNotes.com, Apple Podcasts/Spotify, "[competidor] podcast" en Google
- **Blogs/Publicaciones**: "[industria] + guest post / write for us", backlinks de competidores
- **Newsletters**: SparkLoop marketplace, "[industria] newsletter"
- **Influencers/Creadores**: LinkedIn/Twitter/YouTube creators del nicho
- **Criterios**: Audiencia relevante > tamaño. Engagement real. Fit temático.
- **Output**: Lista maestra de 30-50 medios target

#### 2) Creación — Pitch + Materiales
- Consumir su contenido → interactuar genuinamente (2 semanas warm-up)
- Preparar 3 talking points únicos: dato propio, experiencia contraintuitiva, framework accionable
- Pitch universal adaptable + one-pager de speaker/empresa + materials de soporte

#### 3) Ejecución — Negociación + Aparición
La negociación determina si es orgánico o pagado:

| Outcome | Cuándo suele pasar |
|---------|-------------------|
| **Orgánico** | Aportas valor único, audiencia pequeña-media |
| **Pagado fijo** | Medio profesionalizado con media kit |
| **Revenue share / Afiliado** | Relación a largo plazo, confianza mutua |
| **Híbrido** | Mezcla de valor + compensación |

Post-aparición: reutilizar en clips (content-atomizer), compartir en LinkedIn, añadir "as seen in"

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Tasa de respuesta pitches | >20% |
| Apariciones totales/mes | ≥4 |
| Tráfico atribuido (UTM) | >1K visitas/mes |
| Leads desde placements | >10/mes |
| ROI placements pagados | >3x |

**Skills de Sancho**: `company-finder` → `direct-response-copy` → `seo-content` → `outreach-sequence-builder` → `content-atomizer`

**Cuándo usar**: ✅ Experto con perspectiva de valor | ✅ ICP consume podcasts/blogs/newsletters
**Cuándo NO usar**: ❌ Sin expertise demostrable | ❌ Sin product-market fit

---

### 04. Adjacent Ecosystem Partnerships

**Cuadrante**: 1:1 Organic
**Objetivo medible**: ≥3 socios activos, >50 leads/trimestre desde partnerships
**Prerequisitos**: Oferta complementaria, audiencias solapadas, disposición a dar antes de pedir
**Tiempo al primer resultado**: 6-12 semanas

**Aplicabilidad**:
- **B2B**: ✅ Partnerships con herramientas complementarias, consultoras, integradores
- **B2C**: ⚠️ Funciona en retail, hostelería, wellness (negocios locales complementarios)
- **Sectores ideales**: SaaS (integraciones), Fintech (gestorías), Services, E-commerce, Salud

*Diferente de Trust Engine (#02): Trust Engine = apareces en el medio de otro y te vas. Partnerships = relación bidireccional continua para hacer cosas JUNTOS y referiros clientes.*

#### 0) Objetivo y por qué esta estrategia
Lead generation + awareness a través de relaciones recíprocas con el ecosistema adyacente. Los adyacentes sirven al MISMO cliente con un producto/servicio diferente. Cuando un consultor recomienda tu herramienta, la conversión es brutal porque viene con endorsement implícito.

#### 1) Ideación — Ecosystem Mapping
Mapear TODOS los adyacentes:

| Tipo de adyacente | Ejemplo (SaaS marketing) | Activación |
|-------------------|--------------------------|------------|
| Tools complementarias | CRM, analytics, email | Integración + co-marketing |
| Consultores/freelancers | Growth consultants, SEO | Referral mutuo |
| Agencias | Marketing, diseño, dev | Incluirte en su stack |
| Asociaciones/comunidades | Cámaras de comercio | Eventos, contenido conjunto |
| Formadores/educadores | Bootcamps, cursos | Guest teaching, bundle |

#### 2) Creación
- Relationship building primero (2-4 semanas antes de proponer nada)
- Formatos de co-activación: referral mutuo informal, email cross-promo, webinar conjunto, guía co-creada, bundle, integración técnica

#### 3) Ejecución
- Negociar términos → pilot → si funciona, repetir mensualmente → relación permanente
- Los mejores partners se convierten en canal permanente de referral

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Socios activos | ≥3 |
| Leads/trimestre desde partners | >50 |
| Conversion rate leads partnership | >10% |
| CAC via partnerships vs. otros | <50% del CAC normal |

**Skills de Sancho**: `company-finder` + `direct-response-copy`

**Cuándo usar**: ✅ Ecosistema de adyacentes existe | ✅ Producto complementario claro
**Cuándo NO usar**: ❌ No hay adyacentes claros | ❌ Quieres resultados en <30 días

---

### 05. Customer Advocacy (Reviews + Referrals)

**Cuadrante**: 1:1 Organic (B2B) / 1:Many Organic (B2C)
**Objetivo medible**: ≥3 reviews nuevos/mes (rating >4.5) + ≥5 referidos/mes (conversión >40%)
**Prerequisitos**: Base de clientes satisfechos, plataformas de review identificadas
**Tiempo al primer resultado**: 2-4 semanas

**Aplicabilidad**:
- **B2B**: ✅ Track 1:1 — pedir reviews/referrals personalmente post-éxito
- **B2C**: ✅ Track automatizado — triggers por NPS, compra recurrente, milestone
- **Sectores ideales**: SaaS, E-commerce, Fintech, Salud, Educación, Hospitality

#### 0) Objetivo y por qué esta estrategia
Social proof (92% de compradores B2B leen reviews) + lead gen de alta calidad (referidos convierten 3-5x más que cold). Ambos salen del mismo lugar: un cliente satisfecho.

#### 1) Ideación
- Identificar promotores: NPS 9-10, resultados demostrables
- Timing triggers: post-win, renovación, post-NPS alto
- Plataformas: G2/Capterra (SaaS), Clutch (services), Trustpilot (fintech), Google Business (local)

#### 2) Creación

**Track B2B (1:1, personal):**
- Ask combinado en la misma conversación: review + referral
- "Triángulo de referral" — 3 ángulos para que piense
- Pedir en llamada (más efectivo que email)

**Track B2C (automatizado):**

| Trigger | Acción | Timing |
|---------|--------|--------|
| Post-compra satisfactoria | Email: "Deja un review" | 24-48h |
| NPS 9-10 | Redirect a plataforma review | Inmediato |
| 3ª compra / milestone | "Comparte con amigo → [incentivo]" | Automatizado |
| Review dejado | "Gracias — código de referral: [X]" | Post-review |

#### 3) Ejecución
- B2B: link directo al formulario, follow-up a 5 días, contactar referido en <48h
- B2C: triggers automatizados, A/B test timing, monitorear reviews
- Ambos: compartir reviews en LinkedIn, incorporar en decks/landing/emails

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Reviews nuevos/mes | ≥3 (B2B) / ≥20 (B2C) |
| Rating promedio | >4.5 |
| Referidos/mes | ≥5 |
| Conversión referidos | >40% |
| CAC referidos vs. otros | <25% del CAC normal |

**Skills de Sancho**: `direct-response-copy` + `email-sequences` (B2C)

**Cuándo usar**: ✅ Clientes satisfechos | ✅ Producto con resultados demostrables
**Cuándo NO usar**: ❌ Pre-PMF | ❌ Churn alto | ❌ Sin base de clientes

---

### 07. Warm Outreach

**Cuadrante**: 1:1 Organic
**Objetivo medible**: Activar ≥15 contactos/semana, tasa respuesta >40%, ≥3 meetings/semana
**Prerequisitos**: Base de contactos existente (LinkedIn, CRM, email)
**Tiempo al primer resultado**: 1-2 semanas

**Aplicabilidad**:
- **B2B**: ✅ Core use case — red profesional, ex-clientes, eventos
- **B2C**: ❌ No aplica (no escalable)
- **Sectores ideales**: Consultoría, Services, SaaS enterprise, Formación B2B

#### 0) Objetivo y por qué esta estrategia
La estrategia MÁS rápida. Ya tienes contactos que te conocen. Cada contacto warm tiene 5-10x más probabilidad de responder que cold.

#### 1) Ideación
- Exportar contactos → categorizar: ex-clientes, leads no cerrados, networking, ex-colegas, seguidores activos
- Para cada uno, buscar "trigger de reconexión" reciente

#### 2) Creación
- Templates por categoría: ex-cliente, lead no cerrado, networking
- NUNCA pitch directo en primer mensaje — CTA suave

#### 3) Ejecución
- 15-25 contactos/semana (personalizado)
- Canal donde la relación es más fuerte (LinkedIn, email, WhatsApp)
- Máximo 2 follow-ups

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Contactos activados/semana | 15-25 |
| Tasa de respuesta | >40% |
| Meetings/semana | ≥3 |
| Conversión a cliente | >15% |

**Skills de Sancho**: `outreach-sequence-builder` (modo warm)

**Cuándo usar**: ✅ Red de contactos existente | ✅ Ex-clientes o leads fríos
**Cuándo NO usar**: ❌ Sin red previa | ❌ Red <50 contactos relevantes

---

### 09. Community & Reddit Participation

**Cuadrante**: 1:1 Organic + 1:Many Organic (Reddit)
**Objetivo medible**: Presencia activa en 3-5 comunidades, ≥15 interacciones/semana, ≥3 leads de Reddit/mes
**Prerequisitos**: 5-8h/semana, comunidades del ICP identificadas, cuenta Reddit con historial
**Tiempo al primer resultado**: 4-8 semanas (reputación), 2-4 meses (leads)

**Aplicabilidad**:
- **B2B**: ✅ Slack/Discord profesionales, LinkedIn Groups, Reddit r/SaaS r/startup
- **B2C**: ✅ Reddit communities de nicho, Discord gaming/hobby, foros
- **Sectores ideales**: Tech, SaaS, Gaming, Crypto/Fintech, Developer tools, Fitness, Educación

#### 0) Objetivo y por qué esta estrategia
Awareness + autoridad + AIO/GEO. Reddit tiene triple impacto: (1) trust directo, (2) rankea en Google, (3) LLMs citan Reddit como fuente primaria.

#### 1) Ideación
- Descubrir comunidades: slofile.com (Slack), disboard.org (Discord), Gummy Search (Reddit)
- Seleccionar 3-5 total. Lurk 1-2 semanas → entender tono, normas
- Cross-reference con SEO → queries donde Reddit ya rankea en Google

#### 2) Creación
**Regla 10-3-1**: 10 interacciones de valor → 3 contenido propio → 1 mención producto.

| Plataforma | Tono | Mención producto |
|-----------|------|-----------------|
| Slack/Discord | Profesional-casual | OK después de 30 días si natural |
| Reddit | Directo, sin jerga | SOLO si preguntan + disclosure |
| LinkedIn Groups | Profesional | Más tolerado pero sin spam |

#### 3) Ejecución
- Reddit: ≥10 contribuciones de valor/semana, 1-2 posts propios/semana, AMA cuando karma >1K
- Slack/Discord: presentarte → regla 10-3-1 → identificar power users

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Comunidades activas | 3-5 |
| Interacciones de valor/semana | ≥15 |
| DMs inbound/mes | ≥5 |
| Leads atribuidos | ≥3/mes |
| Reddit karma/mes | ≥500 upvotes |

**Skills de Sancho**: `daily-pulse` + `keyword-research` (Reddit SEO) + playbook

**Cuándo usar**: ✅ ICP en comunidades online | ✅ Expertise real | ✅ Quieres AIO/GEO (Reddit)
**Cuándo NO usar**: ❌ ICP no está en comunidades | ❌ Sin 5h/semana | ❌ Sin PMF

---

### 35. Customer Expansion / Account-Led Growth

**Cuadrante**: 1:1 Organic
**Objetivo medible**: NRR >110%, Expansion MRR >15% del total
**Prerequisitos**: Base de clientes existente, CS/AM function, producto con tiers/módulos
**Tiempo al primer resultado**: 2-4 semanas

**Aplicabilidad**:
- **B2B**: ✅ Core use case — upsell módulos, tiers, asientos
- **B2C**: ⚠️ Funciona en suscripciones (upgrade de plan, add-ons)
- **Sectores ideales**: SaaS, Enterprise software, Consultoría, Telecom, Insurance, Banking

#### 0) Objetivo y por qué esta estrategia
Revenue expansion sin coste de adquisición. Expandir un cliente existente cuesta 5-7x menos que adquirir nuevo. NRR >120% = empresa premium.

#### 1-3) Ideación → Creación → Ejecución
- Mapear clientes por ACV actual vs. potencial
- QBR template: resultados → ROI demostrado → "next level"
- Upsell framing: "genera más" (no "cuesta más")
- CS/AM inicia conversación estratégica (NO pitch directo)
- QBRs como pipeline de expansión continua

#### 4) Medición

| Métrica | Target |
|---------|--------|
| NRR | >110% |
| Expansion MRR / Total | >15% |
| Upsell conversion rate | >30% |
| ACV growth/año | >20% |

**Skills de Sancho**: `outreach-sequence-builder` (expansion) → `direct-response-copy` (upsell)

**Cuándo usar**: ✅ Base >6 meses | ✅ Producto con módulos/tiers
**Cuándo NO usar**: ❌ Sin CS/AM | ❌ Producto de uso único

---

## 1:1 PAID (1 estrategia)

---

### 14. ABM (Account-Based Marketing)

**Cuadrante**: 1:1 Paid
**Objetivo medible**: ≥30% target accounts alcanzadas, ≥5 meetings/trimestre enterprise
**Prerequisitos**: <500 cuentas objetivo, €5K+/mes, persona dedicada, ads configurado
**Tiempo al primer resultado**: 6-12 semanas

**Aplicabilidad**:
- **B2B**: ✅ Core use case — enterprise deals alto ACV
- **B2C**: ❌ No aplica
- **Sectores ideales**: Enterprise SaaS, Cybersecurity, HR Tech, Fintech B2B, Industrial

#### 0) Objetivo y por qué esta estrategia
Pipeline enterprise con deals >€10K ACV. Pescas con arpón, no con red. Cada cuenta recibe tratamiento personalizado multi-canal imposible de ignorar.

#### 1-3) Ideación → Creación → Ejecución
- Lista <500 empresas específicas + mapa decisores (2-5 personas/empresa)
- Ads dirigidas (LinkedIn company targeting) + contenido personalizado + outreach coordinado
- Multi-touch orchestration: ad → email → LinkedIn → contenido → llamada

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Cuentas alcanzadas (%) | ≥30% |
| Meeting rate por cuenta | >10% |
| Pipeline por cuenta | >€10K |
| Meetings/trimestre | ≥5 |

**Skills de Sancho**: `company-finder` → `decision-maker-finder` → `outreach-sequence-builder` + `paid-ads`

**Cuándo usar**: ✅ ACV >€10K | ✅ <500 cuentas | ✅ Enterprise con ciclo largo
**Cuándo NO usar**: ❌ ACV <€5K | ❌ >1000 cuentas | ❌ Sin budget ads €5K+/mes

---

## 1:MANY ORGANIC (12 estrategias)

---

### 17. SEO Content

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥5K visitas orgánicas/mes a 6 meses, ≥10 keywords en top 10
**Prerequisitos**: CMS + herramienta SEO, capacidad de escritura, 3-6 meses compromiso
**Tiempo al primer resultado**: 3-6 meses

**Aplicabilidad**:
- **B2B**: ✅ Contenido educativo, comparativas, guías técnicas
- **B2C**: ✅ Tutoriales, reviews, "mejores X para Y"
- **Sectores ideales**: Cualquiera con demanda de búsqueda

*Extensión AIO/GEO: SEO maduro → extender con estructura AIO para ChatGPT/Perplexity.*

#### 1-4) Resumen
- Keyword research por pilares temáticos del ICP → mapear a intención (TOFU/MOFU/BOFU)
- Artículos optimizados para ranking + lectura humana + párrafos auto-contenidos (bonus AIO)
- 2-4 artículos/mes, distribución social, actualizar cada 6-12 meses
- KPIs: tráfico orgánico, keywords top 10, leads orgánicos, Domain Rating

**Skills de Sancho**: `keyword-research` → `seo-content` → `content-atomizer`

**Cuándo usar**: ✅ ICP busca en Google | ✅ Horizonte 3-6 meses
**Cuándo NO usar**: ❌ ICP no busca en Google | ❌ Sin CMS | ❌ Necesitas resultados <3 meses

---

### 18. Community Building

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥100 miembros activos (>20% participación), ≥5 leads/trimestre
**Prerequisitos**: Community manager o founder 5h/semana, 6-12 meses horizonte
**Tiempo al primer resultado**: 3-6 meses

**Aplicabilidad**:
- **B2B**: ✅ Comunidades de usuarios, advisory boards, Slack privados
- **B2C**: ✅ Comunidades de marca, clubs de fidelidad
- **Sectores ideales**: SaaS, Gaming, Educación, Fitness, Crypto, Developer tools

#### 1-4) Resumen
- Plataforma: Slack (B2B), Discord (tech), Circle (premium), Skool (educativa)
- Propósito claro (no "vender"), rituales semanales/mensuales
- Primeros 50 miembros curados manualmente → founder participa activamente → 80/20 contenido
- KPIs: miembros activos, retention 3 meses, pipeline atribuido

**Skills de Sancho**: playbook community + `content-calendar-planner`

**Cuándo usar**: ✅ ICP con interés en comunidad | ✅ Horizonte 6-12 meses
**Cuándo NO usar**: ❌ Sin community manager | ❌ Producto sin base usuarios

---

### 20. Product Hunt Launch

**Cuadrante**: 1:Many Organic
**Objetivo medible**: Top 5 del día, ≥200 upvotes, ≥500 signups
**Prerequisitos**: Producto digital funcional, comunidad para votos día 1
**Tiempo al primer resultado**: Inmediato

**Aplicabilidad**:
- **B2B**: ✅ SaaS, herramientas productividad, dev tools
- **B2C**: ⚠️ Solo si audiencia tech-savvy
- **Sectores ideales**: SaaS, AI tools, Developer tools, Productivity, Design

#### 1-4) Resumen
- Preparación 4 semanas antes: tagline, gallery, video demo, hunter, supporters
- Launch: martes-jueves, founder responde CADA comentario, follow-up PH-exclusive
- KPIs: posición ranking, upvotes, signups, conversión visitors → usuarios

**Skills de Sancho**: playbook PH + `direct-response-copy`

**Cuándo usar**: ✅ Producto tech listo | ✅ Primera vez | ✅ Audiencia early adopter
**Cuándo NO usar**: ❌ B2B enterprise | ❌ Sin producto funcional

---

### 21. Free Tool Strategy

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥1K users/mes, ≥100 email captures/mes, ranking top 3 keyword
**Prerequisitos**: Capacidad técnica, funnel de captura
**Tiempo al primer resultado**: 4-8 semanas

**Aplicabilidad**:
- **B2B**: ✅ Calculadoras ROI, auditorías gratis, templates
- **B2C**: ✅ Herramientas gratuitas virales, calculadoras, generadores
- **Sectores ideales**: SaaS, Fintech, Marketing, HR Tech, Legal, Salud

#### 1-4) Resumen
- Problema ICP resoluble con tool simple + keyword de alto volumen
- Elemento viral: OG image dinámica + "promoting the tool IS promoting themselves"
- Landing SEO + email capture + follow-up sequence
- KPIs: users/mes, email captures, ranking keyword, conversión tool → pago

**Skills de Sancho**: `free-tool-strategy` → `landing-pages` → `email-sequences`

**Cuándo usar**: ✅ Funcionalidad freemium natural | ✅ ICP busca herramientas gratis
**Cuándo NO usar**: ❌ Sin dev | ❌ Herramienta sin relación con producto | ❌ Mercado saturado

---

### 22. Webinars / Eventos Online

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥100 registrados, >40% show-up, ≥15 leads cualificados
**Prerequisitos**: Experto, plataforma (Zoom/StreamYard), lista >500
**Tiempo al primer resultado**: 3-4 semanas

**Aplicabilidad**:
- **B2B**: ✅ Core use case — educación, demos, thought leadership
- **B2C**: ⚠️ Funciona en educación, fitness, cocina, desarrollo personal
- **Sectores ideales**: SaaS, Consultoría, Educación, Fintech, Salud, Legal

#### 1-4) Resumen
- Tema de pattern-detector (qué pregunta el ICP), formatos: educational/panel/workshop/AMA
- Estructura 60 min: 80% valor, 20% pitch. Landing de registro (máx 4 campos)
- Promoción -3 semanas, live, follow-up +1-7 días, replay como lead magnet
- KPIs: registrados, show-up rate, leads cualificados, replay views

**Skills de Sancho**: `content-calendar-planner` → `direct-response-copy` → `content-atomizer`

**Cuándo usar**: ✅ ICP asiste a webinars (B2B) | ✅ Expertise para presentar
**Cuándo NO usar**: ❌ Sin audiencia | ❌ ICP no consume webinars | ❌ Sin follow-up

---

### 23. Free Media & Directory Listings

**Cuadrante**: 1:Many Organic
**Objetivo medible**: Presencia en ≥20 directorios, ≥2 guest posts/mes, ≥5 backlinks DR >40/trimestre
**Prerequisitos**: Experto disponible, producto lanzado, 3-5h/semana
**Tiempo al primer resultado**: 1-4 semanas

**Aplicabilidad**:
- **B2B**: ✅ Directorios SaaS (G2, Capterra), guest posts B2B, HARO
- **B2C**: ✅ Google Business, Trustpilot, directorios locales
- **Sectores ideales**: Cualquiera — universal

*Si requiere pago → Trust Engine (#02) o Compra de Visibilidad (#28).*

#### 1) Ideación — 4 pilares

**A. Directorios** (submit y olvidar):
- SaaS: G2, Capterra, GetApp, TrustRadius, Clutch, GoodFirms, SaaSHub, AlternativeTo
- AI: There's An AI For That, Futurepedia, Toolify.ai, TopAI.tools
- Startups: Product Hunt, Crunchbase, AngelList, BetaList, F6S, Indie Hackers
- General: Google Business, Bing Places, Apple Maps, LinkedIn Company Page
- Servicios de submit: ListingBott ($499), LaunchDirectories (~$249)

**B. Guest posting**: "[industria] + write for us", backlinks competidores, DR >40, pitch con ángulo único

**C. PR gratuita**: HARO, Source of Sources, Featured.com, SourceBottle, MentionMatch, Qwoted
- Proactive pitching: lista de periodistas del sector, news hijacking con daily-pulse

**D. Review platforms**: G2/Capterra (SaaS), Clutch (services), Google Business (local), Trustpilot (fintech)

#### 2-4) Creación → Ejecución → Medición
- Semana 1-2: blitz directorios. Ongoing: 5 pitches guest post + 5 respuestas HARO/semana
- KPIs: directorios activos ≥20, guest posts ≥2/mes, backlinks ≥5/trimestre DR >40

**Skills de Sancho**: `company-finder` → `direct-response-copy` → `seo-content` → playbook

**Cuándo usar**: ✅ Producto lanzado | ✅ Quieres backlinks gratis | ✅ Expertise para compartir
**Cuándo NO usar**: ❌ Pre-lanzamiento | ❌ Sin tiempo para mantener

---

### 25. Referral Program

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥10% clientes en programa, ≥15 referidos/mes, CPL <€20
**Prerequisitos**: Tracking, incentivo definido, producto con usuarios satisfechos
**Tiempo al primer resultado**: 4-6 semanas

**Aplicabilidad**:
- **B2B**: ⚠️ Ciclos más largos — referral fees, partner programs
- **B2C**: ✅ Core use case — viral loops, descuentos por invitación
- **Sectores ideales**: Fintech, E-commerce, SaaS, Apps móviles, Suscripciones, Marketplaces

#### 1-4) Resumen
- Incentivo double-sided (referidor + referido), gamification, plataforma (Viral Loops, Rewardful)
- In-app prompts en momentos de satisfacción, milestone PR
- KPIs: % clientes en programa, referidos/mes, CPL, viral coefficient

**Skills de Sancho**: `referral-program` + `direct-response-copy`

**Cuándo usar**: ✅ Advocacy natural | ✅ Momento viral | ✅ Incentivo justo
**Cuándo NO usar**: ❌ Churn alto | ❌ Sin tracking

---

### 26. PLG (Product-Led Growth)

**Cuadrante**: 1:Many Organic
**Objetivo medible**: Activation >25%, free-to-paid >5%, viral coefficient >0.3
**Prerequisitos**: Producto con momento viral, freemium/trial viable
**Tiempo al primer resultado**: 3-6 meses

**Aplicabilidad**:
- **B2B**: ✅ Freemium SaaS, trials self-service, usage-based
- **B2C**: ✅ Apps con momento viral, freemium natural
- **Sectores ideales**: SaaS, Productivity, Developer tools, Design, Communication

#### 1-4) Resumen
- Diseñar freemium con acceso real al valor, identificar "aha moment"
- Activation onboarding, upsell triggers por uso, PQL scoring
- Optimizar activation → virality (1 click invitations, resultado compartible)
- KPIs: activation rate, free-to-paid, time to value, viral coefficient, NRR

**Skills de Sancho**: playbook PLG + `onboarding-cro` + `paywall-upgrade-cro`

**Cuándo usar**: ✅ Uso frecuente | ✅ Bajo costo onboarding | ✅ Virality natural
**Cuándo NO usar**: ❌ Producto complejo | ❌ ACV muy alto (sales-led)

---

### 30. Founder-Led GTM (LinkedIn Flywheel)

**Cuadrante**: 1:Many Organic + 1:1 Organic (híbrido)
**Objetivo medible**: ≥3 qualified calls/week en semana 6-8, reply rate DMs warm >30%
**Prerequisitos**: Founder publicando 3-5x/semana en LinkedIn, ICP en LinkedIn
**Tiempo al primer resultado**: 4-8 semanas

**Aplicabilidad**:
- **B2B**: ✅ Core use case — LinkedIn como canal de pipeline
- **B2C**: ❌ No aplica
- **Sectores ideales**: SaaS, Consultoría, Services, Tech, Startups, Venture/PE

#### 0) Objetivo y por qué esta estrategia
Sistema LinkedIn-específico con output medible: contenido → warm prospects → DMs → calls. Estrategia #1 para B2B early-stage.

#### 1) Ideación — Mix de contenido

| Tipo | % | Ejemplos |
|------|---|----------|
| Dolores ICP | 40% | Opinión propia, objeciones resueltas |
| Frameworks accionables | 20% | Templates, procesos, checklists |
| Building in Public | 20% | Revenue updates, failures, decisiones |
| Case studies mini | 20% | Antes/después con datos |

#### 2-3) Creación → Ejecución
- Cada post: 1 dolor × 1 perspectiva única. Formato nativo (sin links externos)
- Pre-engagement: seguir, comentar prospects antes del DM
- Trackear quién interactúa → DM: "Vi que comentaste en mi post sobre [X]..."
- Compounding: más contenido → más warm prospects → cierre más fácil

#### 4) Medición

| Métrica | Target |
|---------|--------|
| Qualified calls/week | ≥3 |
| Reply rate DMs warm | >30% |
| Connection accept rate | >40% |
| Pipeline atribuido LinkedIn | tracking CRM |

**Skills de Sancho**: `brand-voice` → `content-calendar-planner` → `content-atomizer` + `outreach-sequence-builder` (warm)

**Cuándo usar**: ✅ Founder B2B con perspectiva | ✅ ICP en LinkedIn | ✅ 3-5 posts/semana
**Cuándo NO usar**: ❌ Sin tiempo para contenido | ❌ ICP no en LinkedIn | ❌ B2C puro

---

### 31. AIO / GEO (AI Search Optimization)

**Cuadrante**: 1:Many Organic
**Objetivo medible**: Citado en ≥20% queries target en ChatGPT/Perplexity a 6 meses
**Prerequisitos**: Contenido existente, dominio con autoridad
**Tiempo al primer resultado**: 3-6 meses

**Aplicabilidad**:
- **B2B**: ✅ Contenido técnico citado para queries profesionales
- **B2C**: ✅ Reviews y comparativas citadas en AI consumer
- **Sectores ideales**: Cualquiera con contenido indexable

#### 1-4) Resumen
- Queries del ICP que responden ChatGPT/Perplexity (no Google clásico)
- "Self-contained paragraphs" + E-E-A-T + schema markup
- Menciones en fuentes que LLMs priorizan (Reddit, G2, Trustpilot, Wikipedia)
- Monitorear con Otterly.ai
- KPIs: % queries con citación, brand mentions en AI, inbound atribuido

**Skills de Sancho**: `keyword-research` → `seo-content` (estructura AIO) → `schema-markup`

**Cuándo usar**: ✅ ICP usa ChatGPT/Perplexity | ✅ SEO maduro | ✅ Expertise real
**Cuándo NO usar**: ❌ Sin contenido | ❌ ICP no usa AI search

---

### 32. Social SEO ("Search Everywhere Optimization")

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥30% views from search, ranking top 5 para ≥5 keywords sociales
**Prerequisitos**: Capacidad de video, keywords del ICP por plataforma
**Tiempo al primer resultado**: 2-4 meses

**Aplicabilidad**:
- **B2B**: ⚠️ YouTube funciona bien; TikTok/Instagram limitado
- **B2C**: ✅ Core use case — TikTok, Instagram, YouTube como buscadores
- **Sectores ideales**: E-commerce, Moda, Belleza, Fitness, Gastronomía, Travel, Educación

#### 1-4) Resumen
- Keywords son DIFERENTES por plataforma (Google formal, TikTok coloquial, YouTube comparativo)
- Optimizar: títulos, captions, texto en pantalla, subtítulos, hashtags por plataforma
- Medir views from search vs. from feed
- KPIs: % views from search, ranking keywords, follows from search, tráfico web

**Skills de Sancho**: `keyword-research` (modo social) → `content-calendar-planner` → `content-atomizer`

**Cuándo usar**: ✅ ICP busca en TikTok/YouTube/Instagram | ✅ Capacidad video
**Cuándo NO usar**: ❌ ICP no busca en social | ❌ Sin producción audiovisual | ❌ B2B enterprise puro

---

### 34. Email List as Owned Channel

**Cuadrante**: 1:Many Organic
**Objetivo medible**: ≥1K suscriptores a 6 meses, open rate >40%, ≥5 leads/mes
**Prerequisitos**: ESP configurado (Beehiiv/ConvertKit/Substack), POV claro
**Tiempo al primer resultado**: 3-6 meses

**Aplicabilidad**:
- **B2B**: ✅ Newsletter de nicho, curated insights, industry reports
- **B2C**: ✅ Newsletter de producto, ofertas, contenido editorial
- **Sectores ideales**: Cualquiera — universal

*Diferente de Email Sequences (MOFU): sequences convierten a quien ya está. Esta construye la lista como canal de ADQUISICIÓN.*

#### 1-4) Resumen
- POV claro + formato (curated/deep dive/hybrid) + cadencia sostenible
- Lead magnet para primeros 200, crecimiento via LinkedIn/cross-promo/podcast/SEO
- Consistencia absoluta. Mes 6: evaluar monetización
- KPIs: suscriptores, growth rate, open rate >40%, CTR >5%, leads atribuidos

**Skills de Sancho**: `newsletter` + `lead-magnet` + `email-sequences` + `content-atomizer`

**Cuándo usar**: ✅ Perspectiva para escribir | ✅ ICP lee emails
**Cuándo NO usar**: ❌ Sin cadencia sostenible

---

## 1:MANY PAID (3 estrategias)

---

### 27. Paid Ads

**Cuadrante**: 1:Many Paid
**Objetivo medible**: CPL <€50 (B2B), ROAS >3x, ≥50 leads/mes
**Prerequisitos**: €1K+/mes, landing page/funnel listo, pixel instalado
**Tiempo al primer resultado**: 2-4 semanas

**Aplicabilidad**:
- **B2B**: ✅ Google Ads (intent), LinkedIn Ads (targeting profesional)
- **B2C**: ✅ Meta Ads, Google Ads, TikTok Ads
- **Sectores ideales**: Cualquiera con unit economics claros

#### 1) Ideación — Espionaje de competidores primero
1. **Spy**: Meta Ads Library, LinkedIn Ad Library, Google Transparency Center, SEMrush/SpyFu
2. **Analizar ganadores**: ads activos >30 días = validados con dinero real. Extraer: hook, dolor, CTA, formato
3. **Adaptar**: usar ángulo/dolor validado, crear TU versión

#### 2-4) Creación → Ejecución → Medición
- 3-5 variantes creative basadas en ángulos ganadores de competidores
- Budget mínimo → testear → escalar ganadores → nueva creative cada 2-4 semanas
- Re-espiar cada 2 semanas
- KPIs: CPC, CTR >2%, CPL <€50, ROAS >3x, conversion rate landing >15%

**Skills de Sancho**: `paid-ads` → `direct-response-copy` → `landing-pages`

**Cuándo usar**: ✅ Landing optimizada | ✅ Budget ≥€1K/mes | ✅ CAC < LTV/3
**Cuándo NO usar**: ❌ Sin landing | ❌ Budget <€500 | ❌ Sin tracking

---

### 28. Compra de Visibilidad + Paid PR

**Cuadrante**: 1:Many Paid
**Objetivo medible**: CPL <€40, ≥1 backlink DR >40/mes, ≥1 pieza PR/mes DR >50
**Prerequisitos**: Budget €500-€10K/acción, medios del sector identificados
**Tiempo al primer resultado**: Inmediato / 2-4 semanas (PR)

**Aplicabilidad**:
- **B2B**: ✅ Artículos patrocinados, awards, directories premium
- **B2C**: ✅ Publireportajes, "as seen in", sponsored reviews
- **Sectores ideales**: SaaS, Fintech, Salud, Belleza, Tech, Alimentación, Moda

*Para GRATUITOS → Free Media (#23).*

#### 1-4) Resumen
- 11 tipos de compra: artículo patrocinado (€1K-5K), publireportaje (€3K-15K), directory premium (€200-2K/mes), awards (€2K-10K), sponsored research (€5K-20K), conference (€2K-20K), etc.
- **Si parece anuncio, pierde todo el valor**
- Post-publicación: "as seen in" en web, compartir en redes, incluir en materiales ventas
- KPIs: CPL <€40, leads/placement ≥10, backlinks DR >40, ROI >2x

**Skills de Sancho**: `direct-response-copy` + playbook

**Cuándo usar**: ✅ Budget para posiciones | ✅ Backlinks rápidos | ✅ "As seen in"
**Cuándo NO usar**: ❌ Budget <€500 | ❌ Sin UTM tracking

---

### 29. Retargeting

**Cuadrante**: 1:Many Paid
**Objetivo medible**: Conversion rate >5%, CPL <50% del prospecting
**Prerequisitos**: Tráfico >1K visitas/mes, pixel instalado, oferta de conversión
**Tiempo al primer resultado**: 1-2 semanas

**Aplicabilidad**:
- **B2B**: ✅ Case studies, demos, webinars para visitors
- **B2C**: ✅ Ofertas, carrito abandonado, social proof
- **Sectores ideales**: Cualquiera con tráfico web

#### 1-4) Resumen
- Segmentar por comportamiento (pricing, carrito, lead magnet)
- Mensaje diferente por segmento, offer escalation, cap frecuencia 3-5/semana
- Refresh creative cada 2 semanas
- KPIs: conversion rate >5%, CPL <50% prospecting, ROAS >5x

**Skills de Sancho**: `paid-ads` → `direct-response-copy`

**Cuándo usar**: ✅ Tráfico >1K/mes | ✅ Pixel instalado | ✅ Oferta clara
**Cuándo NO usar**: ❌ Tráfico <500 | ❌ Sin pixel | ❌ Sin oferta

---

## TRANSVERSAL (2 estrategias)

---

### 33. GTM Engineering (AI Automation Layer)

**Cuadrante**: Transversal — potencia todos los cuadrantes
**Objetivo medible**: ≥3x output/hora vs. manual, CPL automatizado <50% del manual
**Prerequisitos**: Capacidad técnica (Claude Code CLI), herramientas de automatización
**Tiempo al primer resultado**: 1-2 semanas setup → inmediato

**Aplicabilidad**:
- **B2B**: ✅ Core — automatización outreach, enrichment, research
- **B2C**: ⚠️ Automatización ads y contenido, menos outreach
- **Sectores ideales**: SaaS, Tech, Startups técnicos, Agencias, Consultoría

#### 1-4) Resumen
- Capa que POTENCIA las otras 24 estrategias
- Variantes: outreach automation, content automation, research automation
- Herramientas: Claude Code CLI, Firecrawl, Apollo, Clay, Instantly, Phantom Buster
- KPIs: output/hora ≥3x, leads/hora >10, CPL <50% manual, time saved >10h/semana

**Skills de Sancho activos**: TODOS

**Cuándo usar**: ✅ Capacidad técnica | ✅ Alto volumen | ✅ Signal-monitor HOT
**Cuándo NO usar**: ❌ Sin ops técnicos | ❌ Ultra-high-touch

---

### 36. Content Ideation Engine (Question Mining + Competitor Gap + Trends)

**Cuadrante**: Transversal — alimenta todas las estrategias de contenido
**Objetivo medible**: ≥50 ideas validadas/mes, ≥80% contenido basado en datos
**Prerequisitos**: Herramientas SEO (Ahrefs/SEMrush), AlsoAsked, seed keywords
**Tiempo al primer resultado**: 1-2 semanas

**Aplicabilidad**:
- **B2B**: ✅ Question mining dolores profesionales, competitor gap B2B
- **B2C**: ✅ PAA consumer, trending topics, Social SEO ideas
- **Sectores ideales**: Cualquiera con estrategia de contenido — universal

#### 1) Ideación — 3 fuentes

**Fuente A: Question Mining (PAA / Autocomplete)**
- Seed keywords de `ecps.md` → AlsoAsked (profundidad PAA) → AnswerThePublic (amplitud)
- YouTube/TikTok autocomplete para ideas video/Social SEO
- Herramientas: AlsoAsked, AnswerThePublic, Answer Socrates, Keywords Everywhere, Google Trends

**Fuente B: Competitor SEO Gap Analysis**
- Content gap: keywords donde rankean competidores pero TÚ no
- Debilidad: posiciones 5-20 de competidores = contenido mediocre superable
- Backlink gap: ¿qué contenido atrae backlinks? → Skyscraper technique
- Herramientas: Ahrefs Content Gap, SEMrush Keyword Gap, SpyFu

**Fuente C: Trending Topics + Internal Signals**
- pattern-detector → temas recurrentes en conversaciones con clientes
- daily-pulse → tendencias del mercado
- Reddit/X/LinkedIn → qué preguntan AHORA

#### 2-4) Creación → Ejecución → Medición
- Clustering por intent → priorización por score → formato sugerido por idea
- Feed directo a `content-calendar-planner`
- KPIs: preguntas extraídas ≥50/mes, contenido desde PAA ≥5/mes, rankings PAA boxes ≥3

**Skills de Sancho**: `keyword-research` → Question Mining → `content-calendar-planner` → `seo-content` / `content-atomizer`

**Cuándo usar**: ✅ ICP busca en Google | ✅ Blog sin dirección | ✅ AIO activa
**Cuándo NO usar**: ❌ ICP no busca en Google | ❌ Sin capacidad de contenido

---

## Frecuencia de uso

- **Inicial**: Cuando Foundation + Funnel están completos
- **Trimestral**: Revisar estrategia activa con nuevos datos de intelligence
- **Ad-hoc**: Cuando cambia el objetivo, el presupuesto, o signal-monitor detecta nueva oportunidad

---

*Versión 3.0 — 2026-03-11 — 25 estrategias con aplicabilidad B2B/B2C y sectores ideales*
