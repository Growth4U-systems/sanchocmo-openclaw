# Data Model — Strategic Plan + Projects + Tasks

## Estructura de archivos por cliente

```
brand/{slug}/
  discord-channels.json     ← mapeo canal→ID Discord del guild
  strategic-plan/
    current.md              ← plan activo (documento vivo)
    v1.md                   ← archivo: plan de marzo 2026
    history.json            ← log de versiones
  projects/
    P01-optimizar-web/
      project.json          ← metadata del proyecto
      tasks.json            ← tareas del proyecto
      playbook.md           ← resumen del proyecto + links a tareas
      value-review.md       ← review al completar (si aplica)
      T01/
        playbook.md         ← detalle/instrucciones de la tarea
      T02/
        playbook.md
      ...
    P02-cold-outreach-ecp1/
      project.json
      tasks.json
      playbook.md
      T01/
        playbook.md
      ...
```

> ⚠️ **Cada tarea tiene su propia carpeta y playbook.** NUNCA meter todo el detalle en un solo fichero del proyecto.
> El playbook del proyecto es solo un resumen con links a los playbooks de tareas.
> En Discord, el hilo de cada tarea linka a su playbook individual en MC:
> `{MC_BASE}/docs/brand/{slug}/projects/P{XX}-{slug}/T{YY}/playbook.md`

---

## strategic-plan/current.md

Documento vivo. Se versiona cuando cambian los objetivos o se completa un ciclo.

```markdown
# Strategic Plan — [Company Name]

<!-- version: 1 | fecha: 2026-03-12 | cycle: marzo-2026 -->

## Ciclo actual: Marzo-Abril 2026

## Objetivos
1. [Objetivo 1]: [métrica actual → métrica target]
2. [Objetivo 2]: [métrica actual → métrica target]

## Canales priorizados
- [Canal 1]: [budget/horas] — [razón]
- [Canal 2]: [budget/horas] — [razón]

## Proyectos activos
| ID | Nombre | Objetivo | Estado | Review |
|----|--------|----------|--------|--------|
| P01 | Optimizar web | CR 0.5%→2% | active | 2026-04-12 |
| P02 | Cold outreach ECP1 | 10 meetings/mes | active | 2026-04-12 |

## Proyectos completados
| ID | Nombre | Resultado | Learning |
|----|--------|-----------|----------|

## Estrategias del catálogo en uso
- #17 SEO Content (P03)
- #01 ICP List B2B Outreach (P02)

## Próxima revisión: [fecha]
## Origen: Foundation approved [fecha]
```

### Versionado del plan

- `current.md` = plan activo
- Cuando se completa un ciclo o cambian objetivos → `current.md` se copia a `vX.md`
- Cada versión = un ciclo (típicamente mensual o trimestral)
- `history.json` registra cuándo y por qué se versionó

---

## Registro de proyectos

> **No existe `registry.json`.** El filesystem es el registro. Cada carpeta `projects/P{XX}-{slug}/` con su `project.json` define un proyecto. Para obtener el siguiente ID, escanear directorios `P*/` y usar max+1.

---

## project.json

Metadata de un proyecto individual.

```json
{
  "id": "P01",
  "name": "Optimizar web para conversión",
  "description": "La web no tiene tracking de conversiones ni página de servicios completa. Sin esto, no podemos medir resultados ni lanzar ads con ROI medible.",
  "approach": "Instalamos Meta Pixel + GA4 para medir conversiones, unificamos el booking en una sola URL, creamos el hub de servicios con copy persuasivo, y calentamos dominios para cold email.",
  "status": "active",
  "created": "2026-03-12",
  "review_date": "2026-04-12",
  "origin": {
    "type": "strategic-plan",
    "version": 1,
    "detail": "Gap crítico: web sin página de servicios ni CTA claro"
  },
  "objective": {
    "description": "Aumentar conversion rate de visita a lead",
    "metric": "conversion_rate",
    "baseline": 0.5,
    "target": 2.0,
    "unit": "%"
  },
  "strategy": {
    "catalog_id": null,
    "description": "Auditoría web + reescritura copy + nuevas páginas + CRO"
  },
  "channels": ["web"],
  "discord": {
    "project_thread_id": null,
    "project_channel": "projects"
  },
  "tasks_total": 4,
  "tasks_completed": 0,
  "value_review": null
}
```

### Campos project obligatorios

| Campo | Qué es | Ejemplo |
|-------|--------|---------|
| `name` | Nombre corto del proyecto | "Fontanería Web" |
| `description` | Por qué existe, contexto de negocio. 2-3 frases legibles por cualquiera. | "La web no tiene tracking..." |
| `approach` | Cómo lo vamos a hacer. Resumen del plan de ataque que refleja las tareas. | "Instalamos Pixel, unificamos booking..." |
| `objective` | Qué queremos conseguir. Métrica concreta con baseline → target. | { metric: "conversion_rate", baseline: 0.5, target: 2.0 } |
| `review_date` | Cuándo evaluamos si funcionó. | "2026-04-12" |

> ⚠️ **NUNCA** crear un proyecto sin `description` y `approach`. Son obligatorios.
```

### Campos `origin.type`

| type | Cuándo |
|------|--------|
| `strategic-plan` | Nace del plan estratégico inicial |
| `intelligence` | Signal-monitor, thief-marketers, daily-pulse detectó algo |
| `user-request` | El usuario pidió algo directamente |
| `value-review` | Sale de la review de un proyecto anterior |
| `metrics` | Los datos sugieren una acción |

### Campos `status`

| status | Significado |
|--------|------------|
| `proposed` | Propuesto, pendiente validación vs strategic plan |
| `active` | Aprobado y en ejecución |
| `paused` | Pausado temporalmente |
| `completed` | Todas las tareas hechas, pendiente value review |
| `reviewed` | Value review completada |
| `cancelled` | Cancelado |

---

## tasks.json

Tareas de un proyecto. Cada tarea se ejecuta en un canal temático.

```json
{
  "project_id": "P01",
  "tasks": [
    {
      "id": "T01",
      "name": "Reescribir página de servicios — copy Trust Engine",
      "description": "Redactar copy persuasivo para la página de servicios. Incluir headline, propuesta de valor, 3 bloques de servicio con beneficios, social proof y CTA de agendar llamada.",
      "deliverable": "Copy completo de la página de servicios listo para implementar en la web.",
      "done_criteria": "Copy revisado y aprobado. Publicado en growth4u.io/servicios/.",
      "depends_on": null,
      "status": "pending",
      "owner": "Sancho",
      "channel": "web",
      "discord_thread_id": null,
      "skill": "direct-response-copy",
      "created": "2026-03-12",
      "completed": null,
      "output_files": [],
      "notes": ""
    },
    {
      "id": "T02",
      "name": "Crear página Agenda una Call",
      "status": "pending",
      "channel": "web",
      "discord_thread_id": null,
      "skill": "funnel-architect",
      "created": "2026-03-12",
      "completed": null,
      "output_files": [],
      "notes": ""
    },
    {
      "id": "T03",
      "name": "Instalar schema markup en páginas servicio",
      "status": "pending",
      "channel": "web",
      "discord_thread_id": null,
      "skill": "schema-markup",
      "created": "2026-03-12",
      "completed": null,
      "output_files": [],
      "notes": ""
    },
    {
      "id": "T04",
      "name": "A/B test hero CTA homepage",
      "status": "pending",
      "channel": "web",
      "discord_thread_id": null,
      "skill": "ab-test-setup",
      "created": "2026-03-12",
      "completed": null,
      "output_files": [],
      "notes": ""
    }
  ]
}
```

### Campos task `owner`

| owner | Cuándo |
|-------|--------|
| `Sancho` | **DEFAULT.** Toda tarea que Sancho puede ejecutar (contenido, research, configuración, análisis, copy, diseño, scheduling) |
| `Equipo` | Requiere acción humana: grabar vídeos, llamadas, aprobaciones, acceso a cuentas, interacción personal |
| `[Nombre]` | Solo si una persona específica debe hacerlo (ej: "Alfonso" para aparecer en podcast) |

**Regla: Sancho es el owner por defecto.** Solo marcar a humanos cuando la tarea genuinamente requiere su intervención.

### Campos task obligatorios

| Campo | Qué es | Ejemplo |
|-------|--------|---------|
| `description` | Qué se va a hacer concretamente. Legible por cualquiera, no técnico. | "Instalar el pixel de Meta y configurar la API de conversiones para poder trackear eventos de ads en la web." |
| `deliverable` | Qué sale de esta tarea. Resultado tangible. | "Pixel instalado y disparando eventos PageView + Lead." |
| `done_criteria` | Cómo sabemos que está hecha. Criterio verificable. | "Meta Pixel Helper muestra PageView ✅ al visitar growth4u.io." |
| `depends_on` | Qué necesita estar hecho antes. null si no hay dependencias. | "P01-T01" o null |

> ⚠️ **NUNCA** crear una tarea sin `description` y `deliverable`. Son obligatorios.

### Campos task `status`

| status | Significado |
|--------|------------|
| `pending` | Creada, no empezada |
| `in-progress` | Hilo creado en canal, en ejecución |
| `blocked` | Bloqueada por dependencia |
| `completed` | Terminada |
| `cancelled` | Cancelada |

### Campos task `channel`

Canal Discord donde se ejecuta la tarea. Mapea a canales reales del guild del cliente:

| channel | Discord | Categoría |
|---------|---------|-----------|
| `web` | #web | CONTENT |
| `content` | #content | CONTENT |
| `paid-ads` | #paid-ads | CONTENT |
| `prospecting` | #prospecting | OUTREACH |
| `partners` | #partners | OUTREACH |
| `creatives` | #creatives | SOPORTE |
| `research` | #research | SOPORTE |
| `brand` | #brand | ESTRATEGIA |
| `intelligence` | #intelligence | SISTEMA |
| `learning` | #learning | SISTEMA |

### Campo task `discord_thread_id`

ID del hilo de Discord creado para esta tarea. Se rellena al ejecutar `_system/output/project-threads-protocol.md`.
MC usa este ID para generar links 💬 directos a Discord.

### Campo project `discord.project_thread_id`

ID del hilo de Discord creado en #projects para este proyecto.

---

## value-review.md

Se genera cuando un proyecto se marca como `completed`. Puede ser automático (si hay métricas) o por preguntas al usuario.

```markdown
# Value Review — P01: Optimizar web para conversión

Proyecto: P01
Período: 2026-03-12 → 2026-04-10
Duración: 29 días

## Objetivo
Aumentar conversion rate de 0.5% a 2.0%

## Resultado
- Conversion rate: 0.5% → 1.8% (90% del target)
- Evaluación: PARCIAL

## Métricas detalle
| Métrica | Antes | Después | Δ |
|---------|-------|---------|---|
| Conversion rate | 0.5% | 1.8% | +260% |
| Bounce rate | 65% | 48% | -26% |
| Leads/mes | 5 | 18 | +260% |

## Qué funcionó
- Reescritura copy servicios → bounce rate bajó 26%
- Página "Agenda call" → 40% de leads vienen de ahí

## Qué no funcionó
- A/B test hero CTA → sin diferencia significativa

## Learnings
- Copy directo con caso de uso > copy genérico
- CTA "Agenda call" convierte más que "Empezar ahora"

## Siguiente acción recomendada
→ Escalar a P04: "Crear landing por ECP con copy personalizado"
```

---

## Visibilidad en Mission Control

Los archivos en `brand/{slug}/strategic-plan/` y `brand/{slug}/projects/` son accesibles vía MC con token del cliente:

```
{MC_BASE_URL}/portal/{mcToken}/docs/strategic-plan/current.md
{MC_BASE_URL}/portal/{mcToken}/docs/projects/registry.json
{MC_BASE_URL}/portal/{mcToken}/docs/projects/P01-optimizar-web/project.json
```
