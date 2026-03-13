---
name: strategic-plan
description: "Post-Foundation strategic plan: analyzes current state (web, tools, channels, content), defines objectives, detects gaps, selects channels and GTM strategies, and generates a prioritized action plan with campaigns. Runs AFTER Foundation is complete. Replaces gtm-orchestrator. Use when: Foundation approved and client needs 'what do we do now?', or when re-evaluating strategy quarterly. Triggers: strategic plan, qué hacemos ahora, plan de acción, post-foundation, next steps, plan estratégico, qué canales, cómo crecemos. NOT for: Foundation (use foundation-orchestrator), individual campaign execution (use execution skills directly), or initial onboarding (use sancho-start/phase-0-diagnostic)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Plan
  depends_on: foundation-orchestrator
  chains_to: channel-prioritization, execution-skills
  context_required:
    - brand/{slug}/foundation-state.json
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/go-to-market/ecps/current.md
    - brand/{slug}/go-to-market/positioning/*/current.md
    - brand/{slug}/market-and-us/competitors/current.md
    - brand/{slug}/market-and-us/self/current.md
    - brand/{slug}/brand-voice/current.md
  context_writes:
    - brand/{slug}/strategic-plan.md
    - brand/{slug}/current-state.md
    - brand/{slug}/go-to-market/channel-plan.md
---

# Strategic Plan — De Foundation a Acción

> Foundation = QUIÉN eres, A QUIÉN sirves, QUÉ dices. Este skill = QUÉ HACER, EN QUÉ ORDEN, CON QUÉ.

## Gate Check

```
if foundation-state.json NOT exists OR status != "approved":
    STOP → "Foundation incompleta. Completa Foundation primero."
```

Mínimo: company-brief + ECPs + positioning + competitors + self-intelligence + brand-voice.

---

## Pipeline: 8 Pasos

### Paso 1: Cargar Foundation (~2 min)

Leer TODOS los docs de Foundation. No preguntar nada. Extraer:

- company-brief → negocio, etapa, equipo, presupuesto, stack
- ecps → dolores, perfiles, dónde pasan tiempo, cómo descubren
- positioning → UVP, USPs, ángulos por ECP, objeciones
- competitors → battle cards, canales que usan, debilidades
- self-intelligence → fortalezas, debilidades, reviews, presencia digital
- brand-voice → tono, vocabulario
- budget/stack → recursos disponibles

Si `phase-0-diagnostic` se ejecutó → leer sus scores como contexto.

---

### Paso 2: Consolidar Estado Actual (~3 min)

Foundation ya investigó la mayoría: `self-intelligence` tiene presencia digital, canales, reviews. `company-brief` tiene stack y equipo. **NO re-scrapear lo que ya existe.**

Leer `self-intelligence` + `company-brief` + `stack.md` y extraer:
1. **Destino de conversión** — ¿dónde se envía al cliente? (web/app/formulario/agenda/no existe). Si no está claro en Foundation → preguntar en Paso 3.
2. **Canales activos** — de self-intelligence (ya analizados).
3. **Herramientas** — de company-brief/stack.md.
4. **Contenido existente** — de self-intelligence (blog, casos de éxito, assets).

**Solo scrapear con web_fetch si:**
- Foundation tiene >30 días y cosas pueden haber cambiado
- El destino de conversión no está documentado
- Hay canales nuevos no cubiertos en self-intelligence

Si `current-state.md` ya existe → leerlo y validar. Si no → generarlo con datos de Foundation + lo nuevo que falte. Ver template en [references/current-state-checklist.md](references/current-state-checklist.md).

---

### Paso 3: Preguntas al Usuario (~3 min)

**Máximo 3 preguntas.** Primero presentar resumen del paso 2 para validación.

Preguntas obligatorias:
1. **Objetivo principal**: Awareness / Lead Gen / Conversión / Autoridad / Retención / Expansión / Comunidad
2. **Horizonte temporal**: Corto (1-3m) / Medio (3-6m) / Largo (6-12m)
3. **¿Qué probaste que NO funcionó?**

**ESPERAR respuesta antes de continuar.**

---

### Paso 4: Detectar Gaps (~2 min)

Cruzar Foundation + estado actual + objetivo → listar qué FALTA:

- 🔴 **Crítico** (resolver ANTES de ejecutar): sin destino de conversión, sin analytics
- 🟡 **Alto** (resolver en paralelo): sin blog/CMS, sin email tool, sin casos de éxito
- 🟢 **Bajo** (resolver cuando convenga): sin social scheduling, sin CRM completo

Gaps 🔴 bloquean ejecución. Incluirlos como Fase 0 del plan.

---

### Paso 5: Priorizar Canales (~3 min)

- Si `channel-plan.md` existe → leerlo, validar vigencia con datos del paso 2.
- Si no existe → ejecutar `channel-prioritization` como sub-paso.

Cruzar canales con gaps: si un canal necesita algo que no existe → incluir setup como prerequisito en el plan.

---

### Paso 6: Seleccionar Estrategias (~5 min)

Cargar [references/gtm-strategies-catalog.md](references/gtm-strategies-catalog.md) — catálogo de 25 estrategias.

Ejecutar scoring del catálogo:

1. **Filtrar** por B2B/B2C + cuadrante Hormozi viable
2. **Puntuar**: `Score = (Dolor×0.25) + (Objetivo×0.25) + (Resource×0.25) + (Time×0.25) [+1 intelligence boost]`
3. **Recomendar top 2-3** con tabla de scoring

Para cada recomendada:
```
ESTRATEGIA: [Nombre] (#XX)
├── Cuadrante Hormozi + Score
├── Por qué (ligado a dolores + objetivos + gaps del cliente)
├── Tiempo al primer resultado
├── Prerequisites pendientes
├── Skills que activará
└── KPIs objetivo (del catálogo)
```

---

### Paso 7: Generar Plan de Acción (~5 min)

Plan temporal con 3 fases + revisión:

- **FASE 0** (Semana 1): Resolver gaps 🔴 críticos
- **FASE 1** (Mes 1): Ejecutar estrategias A y B — pasos concretos por semana + KPI target
- **FASE 2** (Mes 2-3): Medir Fase 1 → ajustar → activar estrategia C si procede
- **REVISIÓN TRIMESTRAL**: Re-evaluar con datos reales

Cada estrategia aprobada genera una carpeta de campaña:
```
campaigns/{YYYY-MM}-{strategy-slug}/
  brief.md | tasks/ | content/ | results.md
```

---

### Paso 8: Presentar y Aprobar (~2 min)

Presentar: estado actual → gaps → canales → estrategias con scoring → plan de acción.

```
¿Con qué quieres proceder?
 [1] Aprobar plan → genera campañas
 [2] Ajustar estrategias → re-puntuar
 [3] Cambiar objetivo/horizonte → recalcular
 [4] Resolver gaps primero → plan de setup
```

**Esperar aprobación antes de escribir archivos.**

---

## Output y modelo de datos

Ver [references/data-model.md](references/data-model.md) para schemas completos de `strategic-plan.md`, `project.json`, `tasks.json`, y `value-review.md`.

### Al aprobar el plan:

1. Escribir `brand/{slug}/strategic-plan/current.md` (documento vivo, versionable)
2. Crear `brand/{slug}/projects/registry.json` (si no existe)
3. Por cada estrategia aprobada → crear proyecto:
   - Carpeta `brand/{slug}/projects/P{XX}-{slug}/`
   - `project.json` con objetivo, métricas baseline/target, origin, review_date
   - `tasks.json` con tareas iniciales y canal temático asignado
4. Crear hilo en `#projects` del guild: `[P01] Nombre del proyecto`
5. Por cada tarea → crear hilo en el canal temático: `[P01-T01] Nombre tarea`

### Nomenclatura proyectos

Secuencial por cliente: P01, P02, P03... Tareas: P01-T01, P01-T02...

---

## Documento vivo

El strategic plan NO es one-shot. Es la **fuente de verdad de qué se está haciendo y por qué**.

### Versionado
- `current.md` = plan activo
- Cuando se completa un ciclo o cambian objetivos → copiar a `vX.md`, crear nuevo `current.md`
- Cada versión = un ciclo (mensual o trimestral)

### Validación de nuevos proyectos

Cuando surge un proyecto nuevo (de intelligence, usuario, o value review):

```
¿Alineado con strategic-plan/current.md?
├── SÍ → Crear proyecto, añadir al plan
├── PARCIAL → "Tiene sentido pero ¿no deberías terminar P01 primero?"
└── NO → "No está en el plan. Si quieres lo añadimos, pero implica desviar foco."
```

Siempre: informar al usuario, esperar decisión, actualizar plan si se acepta.

### Monitoreo de objetivos

Sancho vigila si los objetivos del plan se están cumpliendo:
- Si todas las tareas de todos los proyectos se completan → proponer value reviews
- Si métricas target se alcanzan → "Objetivos cumplidos. ¿Nuevos objetivos?"
- Si métricas no avanzan → "P01 lleva 30 días sin mover la métrica. ¿Ajustamos?"

### Value Review

Al completar un proyecto → generar `value-review.md`:
- Objetivo cumplido: sí/no/parcial
- Métricas antes/después
- Qué funcionó, qué no
- Learnings → alimentan futuros planes
- Siguiente acción recomendada

---

## Relación con otros skills

| Acción | Skill/Archivo |
|--------|---------------|
| **Llama** | `channel-prioritization` (si no existe channel-plan.md) |
| **Lee** | Foundation completa, phase-0-diagnostic (si existe), `references/gtm-strategies-catalog.md` |
| **Produce** | `strategic-plan/current.md`, `current-state.md`, `projects/*/project.json`, `projects/*/tasks.json` |
| **Encadena** | Execution skills por tarea. Value reviews al completar proyecto |
| **Valida** | Nuevos proyectos propuestos vs plan activo |

---

## ✅ Self-QA

1. ¿Se leyeron TODOS los docs de Foundation?
2. ¿Estado actual consolidado de Foundation (no re-scrapeado sin razón)?
3. ¿Gaps cruzados con stack.md + datos reales?
4. ¿Estrategias ejecutables con recursos del cliente?
5. ¿Proyectos con objetivo medible (métrica + baseline + target)?
6. ¿Tareas asignadas a canal temático correcto?
7. ¿Review date definida para cada proyecto?
8. ¿Aprobación del usuario antes de crear proyectos?
