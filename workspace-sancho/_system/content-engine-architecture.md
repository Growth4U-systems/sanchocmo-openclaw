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
6. Humano edita / aprueba
7. Aprobado → Metricool publica

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
└── clarify-history.json                     # POV Bank
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
