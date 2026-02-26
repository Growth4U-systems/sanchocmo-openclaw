---
name: foundation-orchestrator
description: Manage Foundation pillars and progress.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
context_required:
- brand/company-context.md
- brand/voice-profile.md
- brand/positioning.md
- brand/icp.md
- brand/ecps.md
- brand/competitors.md
- brand/market.md
- brand/product-analysis.md
- brand/swot.md
- brand/business-model.md
- brand/budget.md
- brand/team.md
- brand/stack.md
context_writes:
- brand/learnings.md
---

# Foundation Orchestrator — Flujo Iterativo con Aprobación por Pilar

> Ejecuta la Foundation pilar a pilar, presentando cada uno para revisión y aprobación antes de avanzar al siguiente. Un CMO real no entrega 14 documentos de golpe — presenta, valida, ajusta, avanza.

---

## Principio Central

**Un pilar a la vez. Presentar → Validar → Aprobar → Siguiente.**

Este skill ORQUESTA el flujo: lee el estado, determina qué pilar toca, ejecuta el skill correspondiente, presenta el resumen ejecutivo, espera aprobación, persiste el resultado, y avanza.

---

## DAG de Dependencias

Los pilares se ejecutan en orden estricto por capas. Un pilar solo puede ejecutarse cuando TODOS sus dependencias están en estado `approved` o `skipped`.

```
LAYER 0 — Sin dependencias (ejecutar primero):
  company-context
  budget-constraints

LAYER 1 — Depende de Layer 0:
  business-model-audit
  self-intelligence

LAYER 2 — Depende de Layer 1:
  market-intelligence
  competitor-intelligence
  niche-discovery-100x
  positioning-messaging
  brand-voice
  visual-identity
  pricing-strategy
  swot-analysis

OPCIONALES — Ejecutar si aplican, skip si no:
  ecp-validation
  existing-customer-data
```

### Orden de Ejecución dentro de cada Layer

Dentro de la misma capa, ejecutar en el orden listado arriba (de arriba a abajo). No hay paralelismo — siempre secuencial para mantener el flujo de conversación.

---

## Estado: `memory/foundation-state.json`

Archivo de estado persistente. Source of truth para retomar sesiones.

### Estructura

```json
{
  "started_at": "2026-02-26T10:00:00Z",
  "updated_at": "2026-02-26T14:30:00Z",
  "pillars": {
    "company-context": {
      "status": "approved",
      "layer": 0,
      "approved_at": "2026-02-26T10:45:00Z",
      "output_file": "brand/company-context.md"
    },
    "budget-constraints": {
      "status": "pending-review",
      "layer": 0,
      "output_file": "brand/budget.md"
    },
    "business-model-audit": {
      "status": "not-started",
      "layer": 1
    },
    "ecp-validation": {
      "status": "skipped",
      "layer": "optional",
      "skip_reason": "Pre-launch, no hay ECPs definidos aún"
    }
  }
}
```

### Estados posibles por pilar

| Estado | Significado |
|--------|-------------|
| `not-started` | No se ha ejecutado aún |
| `in-progress` | Skill ejecutándose (solo durante la ejecución) |
| `pending-review` | Ejecutado, presentado al usuario, esperando feedback |
| `revision` | Usuario pidió cambios, ajustando |
| `approved` | Usuario aprobó — pilar completo |
| `skipped` | No aplica — con `skip_reason` |

---

## Flujo de Entrada (cada sesión)

### Paso 1: Leer Estado

```
1. Leer memory/foundation-state.json
2. Si no existe → crear con todos los pilares en "not-started"
3. Si existe → determinar dónde quedamos
```

### Paso 2: Mostrar Progreso

Siempre mostrar la barra de progreso al iniciar:

```
FOUNDATION — [Nombre del Cliente]

Progreso: 5/14 pilares ████████░░░░░░░░░░░░ 36%

  Layer 0:
  ✅ Company Context              approved
  ✅ Budget & Constraints          approved

  Layer 1:
  ✅ Business Model Audit          approved
  🔄 Self-Intelligence            pending-review  ← AQUÍ ESTAMOS
  
  Layer 2:
  🔒 Market Intelligence          not-started
  🔒 Competitor Intelligence      not-started
  🔒 Niche Discovery 100x         not-started
  🔒 Positioning & Messaging      not-started
  🔒 Brand Voice                  not-started
  🔒 Visual Identity              not-started
  🔒 Pricing Strategy             not-started
  🔒 SWOT Analysis                not-started

  Opcionales:
  ➖ ECP Validation               skipped (pre-launch)
  ⬜ Existing Customer Data       not-started
```

**Barra de progreso**: calcular como `(approved + skipped) / total_pilares`.

### Paso 3: Continuar donde quedamos

```
if hay pilar en "pending-review":
    → Re-presentar el resumen y preguntar de nuevo
elif hay pilar en "revision":
    → Aplicar correcciones y re-presentar
else:
    → Identificar siguiente pilar disponible y ejecutarlo
```

---

## Ciclo por Pilar

Para CADA pilar, seguir este ciclo exacto:

### 1. Verificar Dependencias

```
Para el pilar X en Layer N:
  - Verificar que TODOS los pilares de Layer N-1 estén en "approved" o "skipped"
  - Si no → error, no debería llegar aquí
```

### 2. Ejecutar el Skill

Invocar el skill correspondiente al pilar (e.g., `company-context`, `budget-constraints`, `business-model-audit`). El skill genera el documento completo y lo guarda en `brand/*.md`.

Marcar estado → `in-progress` durante la ejecución.

### 3. Presentar Resumen Ejecutivo

**NO presentar el documento entero.** Presentar un resumen ejecutivo de 5-10 bullets con los hallazgos clave:

```
───────────────────────────────────────
📋 COMPANY CONTEXT — Resumen Ejecutivo
───────────────────────────────────────

• Empresa: Hospital Capilar — clínica de transplante capilar premium
• Mercado: España + expansión LATAM (México, Colombia)
• Modelo: B2C, ticket medio €4.500, ciclo de venta 2-6 meses
• Diferenciador: tecnología FUE propia + equipo médico reconocido
• Presencia digital: web + IG (45K) + YouTube (12K)
• Principal reto: CAC creciente en paid, necesitan orgánico
• Equipo marketing: 2 personas internas + agencia external

📄 Documento completo: brand/company-context.md

───────────────────────────────────────
¿Esto está bien? ¿Quieres corregir algo?
───────────────────────────────────────
```

Marcar estado → `pending-review`.

### 4. Esperar Respuesta del Usuario

Tres caminos posibles:

#### A) Aprobación ("sí", "ok", "perfecto", "adelante")
```
→ Marcar estado → "approved" con timestamp
→ Guardar documento final en brand/*.md
→ Avanzar al siguiente pilar
→ "✅ Company Context aprobado. Siguiente: Budget & Constraints..."
```

#### B) Corrección ("no, el ticket medio es €6.000", "falta X")
```
→ Marcar estado → "revision"
→ Aplicar las correcciones al documento
→ Re-generar resumen ejecutivo con cambios
→ Presentar de nuevo
→ "He actualizado el documento. Revisa los cambios:"
→ Volver a paso 3
```

#### C) Skip ("este no aplica", "saltemos este")
```
→ Preguntar razón: "¿Por qué no aplica? (necesito la razón para el registro)"
→ Marcar estado → "skipped" con skip_reason
→ Avanzar al siguiente pilar
→ "⏭️ [Pilar] marcado como skipped: [razón]. Siguiente: ..."
```

### 5. Persistir

Al aprobar o skipear:

| Dato | Destino |
|------|---------|
| Documento completo | `./brand/[pilar].md` |
| Estado del pilar | `memory/foundation-state.json` |

Actualizar `foundation-state.json` después de cada cambio de estado.

---

## Mapping Pilar → Skill → Output File

| Pilar | Skill a invocar | Output file |
|-------|-----------------|-------------|
| company-context | `company-context` | `brand/company-context.md` |
| budget-constraints | `budget-constraints` | `brand/budget.md` |
| business-model-audit | `business-model-audit` | `brand/business-model.md` |
| self-intelligence | `self-intelligence` | `brand/product-analysis.md` |
| market-intelligence | `market-intelligence` | `brand/market.md` |
| competitor-intelligence | `competitor-intelligence` | `brand/competitors.md` |
| niche-discovery-100x | `niche-discovery-100x` | `brand/icp.md` |
| positioning-messaging | `positioning-messaging` | `brand/positioning.md` |
| brand-voice | `brand-voice` | `brand/voice-profile.md` |
| visual-identity | `visual-identity` | `brand/visual-identity.md` |
| pricing-strategy | `pricing-strategy` | `brand/pricing.md` |
| swot-analysis | `swot-analysis` | `brand/swot.md` |
| ecp-validation | `ecp-validation` | `brand/ecps.md` |
| existing-customer-data | `existing-customer-data` | `brand/customer-data.md` |

---

## Resumen Final (al completar todos los pilares)

Cuando todos los pilares estén en `approved` o `skipped`:

```
═══════════════════════════════════════════════
🏁 FOUNDATION COMPLETA — [Nombre del Cliente]
═══════════════════════════════════════════════

Progreso: 14/14 pilares ████████████████████ 100%

RESUMEN EJECUTIVO:

📌 Empresa: [nombre] — [descripción en 1 línea]
📌 Modelo: [B2B/B2C/B2B2C] | Ticket: [€X] | Ciclo: [X meses]
📌 Presupuesto: [€X/mes] | Equipo: [X personas]
📌 Mercado: [TAM] | Tendencia: [crecimiento/estable/declive]
📌 Competidores clave: [Top 3 con diferenciador]
📌 ICP principal: [perfil en 1 línea]
📌 Posicionamiento: "[statement]"
📌 Voz de marca: [3 atributos]
📌 Pricing: [estrategia en 1 línea]
📌 SWOT highlight: [fortaleza #1] vs [amenaza #1]

Pilares completados: [N approved] | Skipped: [N skipped]

📂 Documentos en: brand/
📊 Estado en: memory/foundation-state.json

═══════════════════════════════════════════════
Foundation lista. ¿Pasamos a Phase 2?
═══════════════════════════════════════════════
```

---

## Reglas Importantes

1. **Nunca ejecutar un pilar de Layer N sin que Layer N-1 esté completa** (todos approved/skipped).
2. **Nunca presentar el documento completo** — siempre resumen ejecutivo de 5-10 bullets.
3. **Siempre preguntar** — no asumir aprobación. Esperar respuesta explícita.
4. **Un pilar a la vez** — no presentar múltiples pilares en un solo mensaje.
5. **Estado siempre actualizado** — escribir `foundation-state.json` después de cada transición.
6. **Retomable** — si la sesión se corta, el siguiente mensaje retoma exactamente donde quedó.
7. **Cross-pilar**: si durante un pilar se descubre info relevante para otro, anotarla pero no desviar el flujo.
8. **Pilares opcionales**: presentarlos al final. Si no aplican, sugerir skip proactivamente.

---

## Viability Checkpoint

Después de aprobar `self-intelligence`, evaluar:

```
if señales de producto inviable (reviews <2.5, product-market fit dudoso):
    → Alertar al usuario con datos
    → Sugerir ruta Pre-Product (audience building, validación)
    → Es ADVISORY — el usuario decide si continuar
```

---

## Gate to Phase 2

Al completar la Foundation, verificar mínimos:

```
GATE CHECK — ¿Listo para Phase 2?

  Obligatorios (approved):
  ✅/❌ Company Context
  ✅/❌ Budget & Constraints
  ✅/❌ Business Model Audit
  ✅/❌ Positioning & Messaging
  ✅/❌ Al menos 1 ICP definido

  Recomendados:
  ⬜ Competitor Intelligence
  ⬜ Self-Intelligence

  Veredicto: READY / NOT READY (advisory)
```

El gate es advisory. Si el usuario quiere avanzar sin completar todo, documentar el riesgo y proceder.

---

## Persistence Protocol

Cada pilar tiene **dos destinos** de persistencia. Ambos se actualizan al aprobar:

| Dato | Destino | Por qué |
|------|---------|---------|
| Documentos de contexto (company-context, positioning, voice...) | `./brand/*.md` | Skills los leen como input; markdown es el formato nativo |
| Estado de pilares (status, timestamps, quién aprobó) | Supabase `foundation_pillars` | Datos estructurados, queryables, para MC dashboard |
| Insights extraídos durante Foundation | Supabase `insights` | Reutilizables cross-pilar, queryables |
| Historial de aprobaciones/correcciones | Supabase `foundation_approvals` | Audit trail |

**Regla**: `./brand/` = archivos markdown para consumo de skills. Supabase = datos estructurados para tracking y dashboards.

**Al aprobar un pilar:**
1. Escribir/actualizar el `.md` en `./brand/`
2. Upsert en Supabase `foundation_pillars`: `{ slug, status, approved_at, layer, output_file }`
3. Si se extrajeron insights → insert en Supabase `insights`: `{ pilar, tipo, contenido, fecha }`
4. Si hubo correcciones → insert en Supabase `foundation_approvals`: `{ pilar, action, feedback, timestamp }`

**Si Supabase no está disponible**: continuar solo con `./brand/` + `memory/foundation-state.json`. No bloquear.
