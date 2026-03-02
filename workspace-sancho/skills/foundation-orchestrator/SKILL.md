---
name: foundation-orchestrator
description: Manage Foundation pillars and progress.
user-invocable: false
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
🏢 LA EMPRESA (ejecutar primero, sin dependencias):
  1. company-context
  2. business-model
  3. budget
  4. self-intelligence

🎯 OPE CANVAS (depende de La Empresa):
  5. ope-canvas — Síntesis estratégica en 1 página (Power Hour prep)

📊 EL MERCADO (depende de La Empresa + OPE Canvas):
  6. market
  7. competitors
  8. swot-analysis

👥 LOS CLIENTES (depende de El Mercado):
  9. niche-discovery-100x
  10. ecp-validation (opcional)
  11. existing-customer-data (opcional)

🎯 LA MARCA (depende de El Mercado):
  12. positioning
  13. pricing
  14. brand-voice
  15. visual-identity
```

### Orden de Ejecución dentro de cada Layer

Dentro de la misma capa, ejecutar en el orden listado arriba (de arriba a abajo). No hay paralelismo — siempre secuencial para mantener el flujo de conversación.

---

## Estado: `brand/{slug}/foundation-state.json`

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
      "output_file": "brand/{slug}/company-context/current.md"
    },
    "budget-constraints": {
      "status": "pending-review",
      "layer": 0,
      "output_file": "brand/{slug}/budget/current.md"
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

### Paso 1: Leer Estado + Crear Hilos

```
1. Leer brand/{slug}/foundation-state.json
2. Si no existe → crear con todos los pilares en "not-started"
3. Si existe → determinar dónde quedamos
4. Verificar hilos Discord:
   - Si estamos en Discord Y el pilar actual NO tiene threadId en el state:
     → Invocar foundation-threads para crear hilos de la layer actual
     → foundation-threads guarda los threadId en foundation-state.json
   - Si ya tienen threadId → usar el hilo existente para trabajar
   - Si NO estamos en Discord → trabajar sin hilos (webchat, etc.)
```

### Paso 2: Mostrar Progreso

Siempre mostrar el progreso agrupado por categorías:

```
🏗️ FOUNDATION — [Nombre del Cliente]

Progreso: 7/15 pilares

🏢 La Empresa
  ✅ Company Context · ✅ Business Model · ✅ Budget · ✅ Self-Intelligence
🎯 OPE Canvas
  ✅ OPE Canvas
📊 El Mercado
  ✅ Market · ⚠️ Competitors · ⬜ SWOT Analysis
👥 Los Clientes
  ⬜ Niche Discovery · ⬜ ECP Validation · ⬜ Customer Data
🎯 La Marca
  ⬜ Positioning · ⬜ Pricing · ⬜ Brand Voice · ⬜ Visual Identity
```

Iconos: ✅ = validado | ⚠️ = pendiente de validar | ⬜ = no existe | ➖ = saltado

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

### 1b. Verificar Hilo Discord

```
Si estamos en Discord:
  - Si es el primer pilar de una nueva layer → invocar foundation-threads para crear hilos de esta layer
  - Leer threadId del pilar actual desde foundation-state.json
  - Si threadId existe → trabajar DENTRO de ese hilo (enviar mensajes al threadId)
  - Si no existe → crear hilo individual para este pilar
Si NO estamos en Discord:
  - Trabajar en el canal/sesión actual sin hilos
```

### 2. Ejecutar el Skill

Invocar el skill correspondiente al pilar (e.g., `company-context`, `budget-constraints`, `business-model-audit`). El skill genera el documento completo y lo guarda en `brand/*.md`.

Si hay threadId → toda la interacción del skill ocurre DENTRO del hilo Discord.

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

#### A) Aprobación ("sí", "ok", "perfecto", "adelante", "validamos", "avancemos", "aprobado", "correcto", "dale", "vamos", "next", "siguiente", "avanza", o cualquier confirmación positiva)
```
→ Marcar estado → "approved" con timestamp en brand/{slug}/foundation-state.json
→ Ejecutar: python3 scripts/regenerate.py (actualizar MC)
→ Publicar MENSAJE DE CELEBRACIÓN + PROGRESO + SIGUIENTE PASO:
```

**Formato obligatorio del mensaje post-aprobación:**

```
🎉 ¡Excelente! **[Nombre del Pilar]** completado y validado.

**Progreso Foundation ([N]/15):**
🏢 La Empresa: ✅ Company Context · ✅ Business Model · ✅ Budget · ✅ Self-Intelligence
🎯 OPE Canvas: ✅ OPE Canvas
📊 El Mercado: ✅ Market · ✅ Competitors · ✅ SWOT
👥 Los Clientes: ⬜ Niche Discovery · ⬜ ECP · ⬜ Customer Data
🎯 La Marca: ✅ Positioning · ⬜ Pricing · ⬜ Brand Voice · ⬜ Visual Identity

⏳ Arrancando siguiente paso: **[Nombre del siguiente pilar]**...
```

**FLUJO AUTOMÁTICO POST-APROBACIÓN (OBLIGATORIO):**
1. Actualizar `foundation-state.json` → `"approved"`
2. Ejecutar `python3 scripts/regenerate.py`
3. Publicar mensaje de celebración con progreso
4. **EJECUTAR AUTOMÁTICAMENTE el siguiente pilar** — NO pedir al usuario que escriba un comando. El flujo es continuo.
5. Si el siguiente pilar necesita confirmación de inputs (Regla 0f), pregunta. Si no, ejecuta directamente.

**EL USUARIO NUNCA DEBERÍA TENER QUE ESCRIBIR UN COMANDO PARA CONTINUAR.** La Foundation es un flujo continuo: aprueba → siguiente → aprueba → siguiente. Solo se detiene para confirmar inputs o al final.

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
| Estado del pilar | `brand/{slug}/foundation-state.json` |

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
📊 Estado en: brand/{slug}/foundation-state.json

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

**Si Supabase no está disponible**: continuar solo con `./brand/` + `brand/{slug}/foundation-state.json`. No bloquear.
