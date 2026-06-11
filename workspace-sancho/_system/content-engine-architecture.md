# Content Engine — Architecture (Final)

> Aprobado: 2026-04-25 tras 2 QA passes + revision de Alfonso.
> Refs: plan_contenido_SanchoCMO.md, Content Creation thread, QA reports.
> Agent: Escudero Content ejecuta. Sancho orquesta.

---

## 4 Procesos Independientes

Los 4 procesos comparten datos (`brand/{slug}/content/`) pero se disparan
de forma independiente.

```
                ┌──────────────┐
                │    DATOS     │
                │  COMPARTIDOS │
                │              │
                │ brand/{slug} │
                │   /content/  │
                └──────┬───────┘
                       │
      ┌────────────────┼────────────────┐────────────────┐
      │                │                │                │
 ┌────┴────┐    ┌──────┴──────┐   ┌────┴────┐    ┌──────┴──────┐
 │PROCESO 1│    │  PROCESO 2  │   │PROCESO 3│    │  PROCESO 4  │
 │  Setup  │    │ Produccion  │   │ Ad-hoc  │    │ Performance │
 │ (1 vez) │    │ (continuo)  │   │(demanda)│    │ (periodico) │
 └─────────┘    └─────────────┘   └─────────┘    └─────────────┘
```

---

## Proceso 1 — Setup (1 proyecto, 1 vez)

**Proyecto**: `P-Content-Engine-Setup`

| Tarea | Tipo | Skill | Deliverable_file |
|-------|------|-------|------------------|
| T01: Content Strategy (14 decisiones) | `foundation` | `content-strategy` | `brand/{slug}/content/strategy-decisions.md` |
| T02: Content Pillars | `foundation` | `content-pillars` (NEW) | `brand/{slug}/content/content-pillars.md` |
| T03: Setup configs por pillar | `execution` | `sancho-manager` | `brand/{slug}/content/configs/cadence-config.yml` |

Se ejecuta 1 vez al onboardear un cliente. Si luego cambian pillars, se
re-abren T02+T03 (no un proyecto nuevo).

---

## Proceso 2 — Produccion continua (proyecto semanal + tarea diaria)

### Capa A: Inputs (recurring task SIN proyecto)

```
Recurring task: "Content Inputs" (diaria/semanal)
├── Corre crons: news-monitor, paa-monitor, thief-marketers, daily-pulse
├── Clasifica signals: insight-classifier
├── Genera ideas con angles: insight-to-content-mapper
└── Actualiza: brand/{slug}/content/idea-queue.json
```

Tipo: `execution`. Background automatico. Escudero Content lo opera.

### Capa B: Redaccion (proyecto semanal auto-creado)

**Proyecto**: `P-Content-Semana-{NN}` (auto-creado lunes 6am por Escudero Content)

| Tarea | Tipo | Deliverable_file |
|-------|------|------------------|
| Contenido {fecha lunes} | `content` | `brand/{slug}/content/published/{fecha}.json` |
| Contenido {fecha martes} | `content` | `brand/{slug}/content/published/{fecha}.json` |
| Contenido {fecha miercoles} | `content` | `brand/{slug}/content/published/{fecha}.json` |
| Contenido {fecha jueves} | `content` | `brand/{slug}/content/published/{fecha}.json` |
| Contenido {fecha viernes} | `content` | `brand/{slug}/content/published/{fecha}.json` |

Cada dia = 1 tarea, 1 thread. TODAS las piezas del dia (LinkedIn + X + lo
que toque) conviven en el mismo thread.

**Flujo de cada tarea diaria**:
1. Escudero Content selecciona ideas del dia de idea-queue.json (recency-aware)
2. Dispatcha N candidatos al Idea Approval Loop (Discord): Si/No/Mas tarde
3. Ideas aprobadas → Clarify (SIEMPRE, no se salta)
4. Writer genera drafts (social-writer / seo-content / newsletter)
5. Drafts aparecen en el thread como attachments
6. Humano edita / aprueba (draft.status = approved, NO se publica)
7. Aprobado → genera media (hero/header image + atomizations sociales si aplica)
8. Aprobado + media listos → Metricool publica

**Gate explicito**: el paso 7 NO es opcional. Una pieza nunca pasa de
"approved" a "published" sin haber generado (o explicitamente "skip media")
los assets visuales que el canal requiera. El estado `Media` en
`ContentTask` (ver `src/lib/data/content-tasks.ts`) modela este gate.

### Como persistir media en el draft (obligatorio)

Las imagenes/PDFs viven en `frontmatter.media[]` del draft markdown
(`brand/{slug}/content/drafts/{ideaId}/{channel}.md`). El MediaPanel de
MC lee de ahi. Hay UNA sola forma correcta de añadirlas y es **siempre
via endpoint**:

| Caso | Endpoint | Lo que hace |
|---|---|---|
| Generar imagen desde prompt | `POST /api/content-engine/generate-image` | Llama al provider configurado, sube a R2, anade a `media[]` |
| Subir binario propio (Sancho lo genero local con nano-banana-pro / usuario adjunto) | `POST /api/content-engine/upload-media` (multipart) | Sube a R2, anade a `media[]` |
| Renderizar carrusel HTML→PNG/PDF | `POST /api/content-engine/render-carousel` | Renderiza con Playwright, sube a R2, anade a `media[]` |

Body comun: `{ slug, ideaId, channel, ... }`. Response incluye `url` y
el `draft` actualizado.

PROHIBIDO al agente:
- Editar `frontmatter.media` con `Edit`/`Write`. Rompe el contrato de
  `attachMediaToDraft` y deja R2 desincronizado.
- Decir "imagen generada" sin tener URL real devuelta por uno de los
  endpoints anteriores.
- Tocar `frontmatter.status`. Solo el dispatcher escribe `published`.

Detalle completo y rationale: `_system/media-persistence-protocol.md`.

### POV Bank en Neon (extraccion automatica)

El POV Bank no vive en `pov-bank.json`. La fuente de verdad esta en Neon:
`pov_banks`, `pov_pillars`, `pov_evidence_items`,
`pov_clarify_patterns` y `pov_update_proposals`.

Dos flujos alimentan el banco automaticamente:
- **Clarify**: al guardar `clarify.md` via `PATCH /api/content-engine/drafts`, las respuestas humanas pasan a `pov_evidence_items` y `pov_clarify_patterns` con `source_type=clarify`.
- **Meetings**: al terminar `runMeetingIntelligenceSync`, los impactos `documentName=POV Bank` se convierten en evidence candidates y proposals revisables.

Endpoint operativo:
`POST /api/content-engine/pov-bank` con `{ "slug": "{slug}", "sources": ["clarify", "meetings"] }`.

### Skill puente: `content-image`

Para que el agente del chat pueda invocar estos endpoints sin recordar
HTTP/payloads, existe la skill `content-image` (en
`workspace-sancho/skills/content-image/`). Envuelve `generate-image` y
`upload-media`, lee `slug/ideaId/channel` del thread context, y devuelve
la URL de R2. Es la unica via legitima que el agente debe usar para
producir media.

### Productor / Consumidor — separacion de responsabilidades

La identidad visual del cliente es "infraestructura": vive en un solo
sitio (`brand/{slug}/brand-book/visual-identity/`) y multiples
consumidores la leen. Tres actores, sin solapes:

```
visual-identity (meta-skill, sistema)
   │  Thread: Foundation L5 → pillar visual-identity
   │  Vida del thread: SOLO onboarding. Cierra al generar el child.
   │
   ├──→ design-tokens.json
   ├──→ visual-identity-current.md
   ├──→ logo-light.{png,webp,svg}
   │
   └──→ genera el child skill:
        [brand]-visual-generator (skill per-brand)
              │  Thread: P14-Content-Engine → T07
              │  Vida del thread: PERMANENTE. Bootstrap +
              │  refrescos + extensiones + ediciones.
              │
              ├──→ templates/{carousels, newsletter-header, ad, ...}/
              ├──→ style-references/*.webp
              └──→ manifest.json
                          │  readonly
                          ↓
                content-image (skill puente, sistema)
                          │  Thread: el del writer que la invoca
                          │  (ej. content task chat de la pieza)
                          │
                          ↓
                frontmatter.media[] del draft
                          ↑
                writer skills (newsletter, social-writer, seo-content,
                instagram-content, content-atomizer)
                  └──→ llaman a content-image, NUNCA al brand skill
```

Reglas duras:

- **Las writer skills NO conocen `[brand]-visual-generator`.** Solo
  conocen `content-image`. El brand skill es invisible desde el flujo
  de produccion de contenido.
- **`content-image` SIEMPRE lee `manifest.json` antes de cualquier
  operacion.** Si no existe el manifest o falta una plantilla, redirige
  al **thread de T07** (`[brand]-visual-generator`), no al thread del
  pillar visual-identity.
- **`[brand]-visual-generator` solo se invoca para extender o refrescar
  el catalogo visual.** No participa en la creacion per-pieza. Su thread
  permanente vive en T07 de P14-Content-Engine.
- **`visual-identity` (meta-skill) solo se invoca al onboarding o
  cuando la marca cambia su DNA.** Su thread (Foundation L5 pillar) se
  cierra cuando el child existe. No se ejecuta como parte del Content
  Engine en operacion continua.

Patron de referencia: design tokens W3C 2026 / Wyndo Claude Design Brand
System (ver investigacion 2026-05-06). Ver tambien
`_system/media-persistence-protocol.md`.

---

## Proceso 3 — Ad-hoc (bajo demanda)

Cuando el usuario dice "quiero un contenido sobre X":
- Se crea 1 tarea tipo `content` dentro del `P-Content-Semana-{NN}` activo
- Thread propio para clarify + redaccion
- NO pasa por crons ni approval loop — va directo a Clarify → Writer

---

## Proceso 4 — Performance review (periodico)

| Tarea | Tipo | Frecuencia | Deliverable_file |
|-------|------|------------|------------------|
| Performance review semanal | `execution` | Semanal | `brand/{slug}/content/performance/weekly-{fecha}.md` |
| Performance review mensual | `execution` | Mensual | `brand/{slug}/content/performance/monthly-{mes}.md` |
| Pillars review trimestral | `foundation` | Trimestral | `brand/{slug}/content/content-pillars.md` (re-abre T02 de Setup) |

**Feedback al sistema**: top-quartile angles → replicate flag. Bottom-quartile
→ bajar confianza. Hooks que funcionan → actualizar hooks library. Brand
Voice refresh mensual con clarify-history.

---

## Folder Structure (TODO bajo brand/{slug}/content/)

```
brand/{slug}/content/
├── strategy-decisions.md                    # Proceso 1: las 14 decisiones
├── content-pillars.md                       # Proceso 1: pillars definidos
├── configs/                                 # Proceso 1: setup
│   ├── cadence-config.yml
│   ├── news-prompts/{pillar_id}.yml
│   ├── paa-queries/{pillar_id}.yml
│   ├── keywords-seed/{pillar_id}.yml
│   ├── competitors/{pillar_id}.yml
│   └── reference-creators/{pillar_id}.yml
├── research-signals/                        # Proceso 2: inputs de crons
│   └── YYYY-MM-DD-{type}.json
├── idea-queue.json                          # Proceso 2: ideas con angles
├── published/                               # Proceso 2: piezas publicadas
│   └── YYYY-MM-DD.json
├── performance/                             # Proceso 4: reviews
│   ├── weekly-{fecha}.md
│   ├── monthly-{mes}.md
│   └── hooks-performance.json
└── clarify-history.json                     # legacy export only; POV Bank source of truth is Neon
```

---

## Task Types (vocabulario canonico, solo existentes)

```
foundation | content | execution | outreach | research | ops | integration
```

7 tipos. Sin inventar. Cada tarea del Content Engine usa uno de estos.

---

## Skills

### Existentes (reuso/extend)

| Skill | Rol en Content Engine | Cambio |
|-------|----------------------|--------|
| `content-strategy` | Proceso 1: 14 decisiones globales | Mantener |
| `content-calendar-planner` | Proceso 2: seleccion recency-aware | Extender |
| `keyword-research` | Blog SEO targeting | Mantener |
| `insight-to-content-mapper` | Genera ideas con angle_draft | Extender |
| `seo-content` | Writer: Blog SEO long-form | Extender (+clarify) |
| `newsletter` | Writer: Newsletter | Extender (+clarify) |
| `daily-pulse` | Input: inteligencia interna | Fix cron |
| `meeting-intelligence` | Input: transcripts (opcional) | Probar |

### Nuevas (crear en workspace-sancho/skills/)

| Skill | Rol |
|-------|-----|
| `content-pillars` | Proceso 1: define pillars (temas, no POV) |
| `news-monitor` | Input: noticias por pillar (Brave/Perplexity) |
| `paa-monitor` | Input: People Also Ask por pillar |
| `social-writer` | Writer: LinkedIn + X con Clarify embebido |
| `insight-classifier` | Clasifica signals en 7 tipos |

### Refactorizar

| Skill | Cambio |
|-------|--------|
| `thief-marketers` | Refactor: competitors + reference creators monitoring |

---

## Protocolos (crear en _system/)

| Protocolo | Que define |
|-----------|-----------|
| `clarify-protocol.md` | Flujo Clarify-en-redaccion: predicciones + confianza, nunca se salta |
| `idea-approval-protocol.md` | Flujo aprobacion en Discord: Si/Mas tarde/No + link a MC UI |

---

## Rollout (3 fases)

**Fase 1 — Foundation + Setup (semanas 1-2)**
- Crear `content-pillars` skill
- Ejecutar Proceso 1 completo para Growth4U (SanchoCMO)
- Fix daily-pulse cron
- Probar meeting-intelligence
- Refactor thief-marketers
- Crear protocolos (clarify + idea-approval)

**Fase 2 — LinkedIn MVP (semanas 3-4)**
- Crear: news-monitor, paa-monitor, social-writer, insight-classifier
- Extender: insight-to-content-mapper, content-calendar-planner
- Integrar Idea Approval Loop en Discord
- Primer proyecto semanal P-Content-Semana-01
- Target: 1 LinkedIn/dia con < 10 min friccion × 5 dias

**Fase 3 — Expansion (semanas 5-8)**
- Extender social-writer con X
- Activar seo-content (Blog) + newsletter con Clarify
- Performance dashboard
- Target: 4 canales × 2 semanas + KPIs norte tracking

---

## Migration plan (Growth4U)

**Datos existentes que migran a brand/{slug}/content/**:
- `content-creation/system-seekers/content-strategy.md` → referencia (no se mueve, se usa como input)
- `content-playbook/*` → se reemplazara cuando Fase 2 genere los archivos nuevos
- `go-to-market/content-calendar.md` → referencia legacy, el calendario nuevo vive en MC UI

**Datos existentes que NO se tocan**:
- Foundation docs (ecps, positioning, brand-voice) → siguen donde estan, son inputs
- P01-P13 proyectos → sin cambio
- ideas.json legacy → convive con idea-queue.json nuevo

**P14-Content-Engine** → se renombra/reestructura a `P-Content-Engine-Setup` con las 3 tareas del Proceso 1.
