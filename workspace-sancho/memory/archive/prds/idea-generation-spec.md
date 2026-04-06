# PDR — Idea Generation System (Spec Final)

**ID:** T-051
**Versión:** 2.0 (modelo consolidado post-stress-test)
**Fecha:** 2026-03-27
**Autor:** Cervantes + Alfonso
**Estado:** Aprobado
**Hilo:** Discord #infra › Idea Generation System

---

## 1. Concepto

Las ideas son **briefs ricos** con todo el contexto necesario para ejecutar. No son tareas — son paquetes de información. Las acciones que sacas de ellas son genéricas (escribir, publicar, contactar), pero el VALOR está en el brief.

**Los proyectos nacen DE ideas aprobadas, no al revés.**

---

## 2. Schema

### 2.1 Idea de Contenido

```json
{
  "id": "uuid",
  "type": "content",
  "title": "Trasplante capilar FUE vs FUT",
  "description": "Brief completo del contenido",
  "action": "Escribir artículo SEO para rankear en 'fue vs fut trasplante' (vol: 1.8K/mes, KD: 28). Ningún competidor en top 10 cubre diferencias de recuperación.",
  "list": "keywords",
  "channels": ["blog", "instagram", "linkedin"],
  "source": "seo_geo",
  "status": "new",
  "priority_score": 82,
  "source_data": {
    "keywords": ["fue vs fut", "mejor técnica trasplante"],
    "serp_gap": "Ningún resultado en top 10 compara tiempos de recuperación",
    "competitor_coverage": ["clinica-x.com covers FUE only"]
  },
  "task_id": null,
  "approved_at": null,
  "approved_by": null,
  "created_at": "2026-03-27T00:00:00Z"
}
```

### 2.2 Idea de Contacto

```json
{
  "id": "uuid",
  "type": "contact",
  "title": "El Referente — Revista líder startups ES",
  "description": "DA 55, publican sobre innovación y salud",
  "action": "Conseguir guest post. Contacto: editor@elreferente.es. Artículo sobre innovación en trasplante capilar.",
  "list": "medios",
  "target_channel": "medios",
  "source": "trust_engine",
  "status": "new",
  "priority_score": 95,
  "source_data": {
    "url": "https://elreferente.es",
    "contact": "editor@elreferente.es",
    "da": 55
  },
  "task_id": null,
  "approved_at": null,
  "approved_by": null,
  "created_at": "2026-03-27T00:00:00Z"
}
```

### 2.3 Listas (agrupación)

| List | Icon | Label | Tipo |
|------|------|-------|------|
| `keywords` | 🔍 | Keywords para rankear | content |
| `trending` | 🔥 | Contenido trending | content |
| `gaps` | 🏆 | Gaps vs competencia | content |
| `repurpose` | ♻️ | Contenido para reutilizar | content |
| `medios` | 📢 | Medios donde aparecer | contact |
| `partners` | 🤝 | Partners para colaborar | contact |
| `influencers` | 🎯 | Influencers para contactar | contact |
| `outreach` | 📨 | Prospects para contactar | contact |

### 2.4 Status lifecycle

```
new → approved → executed
new → rejected (delete, no snooze)
```

---

## 3. Flujo Completo

```
Intelligence (Trust Engine, PAA, SERP, signals...)
  │
  ▼
Idea Pool (briefs ricos con contexto)
  │
  ▼
Aprobar (por GRUPO o individual, bulk approve)
  │
  ├── Check dedup semántica (avisa si hay idea similar)
  ├── Check vs strategic plan (avisa si no encaja)
  │
  ▼
Ejecutar (según tipo)
  ├── Contenido keywords/gaps → Blog primero → Atomizar a canales
  ├── Contenido trending → Social directo (canal seleccionado)
  ├── Contacto → Enriquecer (Apollo) → Secuencia outreach → Ejecutar
  │
  ▼
Opcionalmente agrupar en Proyecto
  (batch de ideas similares → Sancho propone proyecto)
```

### 3.1 Flujo de ejecución por tipo de contenido

El campo `list` determina el flujo:

| List | Flujo |
|------|-------|
| `keywords` | Blog (seo-content) → Atomizar a canales seleccionados (content-atomizer) |
| `gaps` | Blog (seo-content) → Atomizar a canales seleccionados |
| `trending` | Social directo al canal elegido (social-content / instagram-content / etc.) |
| `repurpose` | Atomizar contenido existente (content-atomizer) |

El usuario puede overridear: si una idea de keywords quiere ir directo a IG sin blog, puede.

### 3.2 Flujo de ejecución contactos

| List | Flujo |
|------|-------|
| `medios` | Enriquecer (contact-enrichment) → Crear secuencia (outreach-sequence-builder) → Ejecutar |
| `partners` | Enriquecer → Secuencia personalizada → Ejecutar |
| `influencers` | Enriquecer → Secuencia → Ejecutar |
| `outreach` | Enriquecer → Cold outreach sequence → Ejecutar |

---

## 4. Decisiones del Stress Test

| # | Tema | Decisión |
|---|------|----------|
| D1 | Aprobación granularidad | **Por GRUPO** (bulk approve de la agrupación/lista). Individual también posible. |
| D2 | Ideas obsoletas | **Descartar manual.** Sin TTL ni auto-archive. |
| D3 | Contactos cross-cliente | **Ignorar.** Si se repite, reutilizar datos de Apollo. |
| D4 | Orden canales contenido | **Depende de la lista.** Keywords/gaps → blog primero. Trending → social directo. Override manual posible. |
| D5 | Ideas estancadas | **Futuro.** No implementar ahora. |
| D6 | Dedup semántica | **Sí.** Check al aprobar, avisa si hay idea similar. |
| D7 | Gate check vs plan | **Sí.** Al crear proyecto desde ideas, validar contra strategic-plan.md. |
| D8 | Ideas rechazadas | **Delete.** Sin snooze ni re-evaluación. |

---

## 5. Creación de Proyectos desde Ideas

Cuando hay un batch de ideas aprobadas similares:

1. Sancho detecta N ideas aprobadas del mismo tipo/lista
2. Propone: "Tienes 5 keywords aprobadas. ¿Creo el proyecto P0X — Batch contenido SEO (5 artículos)?"
3. Gate check: valida contra strategic-plan.md
   - Si encaja → crear proyecto con ideas como tareas
   - Si no encaja → "Estas ideas no están en tu plan actual. ¿Ajustar plan o archivar?"
4. Usuario confirma → se crea proyecto con tareas

Las ideas sueltas se pueden ejecutar DIRECTAMENTE sin proyecto (via chat al aprobar).

---

## 6. Mission Control UI

### 6.1 Idea Bank (página existente)

- **Tabs**: 📝 Contenido | 👥 Contactos
- **Agrupación**: por `list` (collapsible tables)
- **Aprobación**: por grupo (select all del grupo) o individual
- **Al aprobar**: abre chat lateral con mensaje de ejecución pre-rellenado
- **Check dedup**: al aprobar, si hay idea similar → aviso inline
- **Selector de cliente**: usa el del sidebar de navegación (NO duplicado)
- **Botón 💬 Chat**: abre sidebar para interactuar con Sancho sobre ideas

### 6.2 Columnas tabla contenido
```
☐ | Título + Acción | Score | Canales | Fuente | Fecha | Acciones
```

### 6.3 Columnas tabla contactos
```
☐ | Título + Acción | Score | Fuente | Fecha | Acciones
```

### 6.4 Acciones por idea
- ✅ Aprobar (solo status=new)
- ❌ Rechazar/Eliminar (solo status=new)
- ✏️ Editar
- 💬 Chat (abrir conversación sobre esta idea)
- 🗑️ Eliminar

---

## 7. Tareas Recurrentes

**Fuente de verdad**: crons de OpenClaw (`openclaw cron list --json`).

MC muestra los crons como "Tareas Recurrentes" con:
- Categorización automática (intelligence, metrics, outreach, content, system)
- Estado en tiempo real (último run, próximo, errores)
- Dependencias (avisa si falta integración)
- Toggle activo/pausado (admin only)

---

## 8. Skill `idea-generation`

Runner que ejecuta las fuentes y deposita ideas en el pool.

**Fuentes MVP (todas):**
- PAA (People Also Ask)
- SERP Gap Analysis
- Competitor Content Monitoring
- Trending Topics
- Trust Engine Output
- Meeting Notes
- Partner/Media Discovery
- Influencer Discovery

**Output**: `brand/{slug}/idea-generation/ideas.json`

**Notificación**: Discord #intelligence con resumen + link MC

---

## 9. Integración con Strategic Plan

Skill `strategic-plan` paso 8.5:
- Propone recurring tasks por cada estrategia aprobada
- Al aprobar → crea crons de OpenClaw
- Las tareas recurrentes generan ideas → ideas alimentan proyectos

---

## 10. Archivos

| Archivo | Contenido |
|---------|-----------|
| `brand/{slug}/idea-generation/ideas.json` | Pool de ideas |
| `brand/{slug}/idea-generation/notifications.json` | Cola de notificaciones Discord |
| `skills/idea-generation/SKILL.md` | Skill runner |
| `scripts/sync-recurring-tasks-cron.js` | Sync crons ↔ recurring tasks |

---

*Spec aprobada 2026-03-27. Fuente: hilo Discord #infra.*
