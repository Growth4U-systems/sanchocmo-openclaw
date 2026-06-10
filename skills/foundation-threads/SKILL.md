---
name: foundation-threads
description: "Create Discord threads for Foundation v3.0 flow. Called by foundation-orchestrator when threads don't exist yet. Creates numbered threads per pillar in #onboarding with skill reference and objective. Aligned with Mission Control threads. NOT user-invocable — triggered automatically."
user-invocable: false
context_required:
- brand/{slug}/foundation-state.json
context_writes: []
---

# Foundation Threads — Discord Thread Creation v3.0

> Creates numbered threads in #onboarding for each Foundation pillar. One thread = one skill = one document. Aligned 1:1 with Mission Control chat threads.

## Thread Definitions (4 proyectos, 11 threads obligatorios)

> **Agent** = agente dueño que ejecuta el thread. Fuente de verdad alineada con
> `config/chat-config.default.json`, `SKILL_OWNER_MAP`/`FOUNDATION_PILLAR_SKILL`
> (`src/lib/skill-resolver.ts`) y `workspace-sancho/dispatch-map.json`. Si cambias el
> dueño de un pilar, actualízalo en las cuatro capas.

### 📋 FAST FOUNDATION (Layer 0 — sin dependencias)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 1 | `01 📋 Fast Foundation` | fast-foundation | sancho (SAN-13) | Intake rápido (~30 min): URL → Company Brief + Self L1 + Market L1 + Brand Voice Snapshot + Niche básico. |

### 📊 FULL FOUNDATION — RESEARCH (Layer 1 — sin dependencias; Fast Foundation enriquece si está approved)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 2 | `02 📊 Market Analysis` | market-intelligence | hamete | TAM, segmentos, tendencias, regulación del mercado. Deep dive completo. |
| 3 | `03 ⚔️ Competitor Analysis` | competitor-intelligence | hamete | Battle cards por competidor: 3 lentes (qué dicen, qué dicen otros, qué dicen clientes). |
| 4 | `04 🔍 Self Analysis` | self-intelligence | hamete | Radiografía propia: 3 lentes completas de autopercepción (web, redes, reviews). |

### 📊 FULL FOUNDATION — SYNTHESIS (Layer 2 — requires: Layer 1 completo)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 5 | `05 🔄 Market Synthesis` | market-synthesis | hamete | SWOT+TOWS+ICE + Market Summary + OPE Canvas + Presentación HTML. |

### 🎯 FULL FOUNDATION — GO-TO-MARKET (Layer 3-4)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 6 | `06 👥 Niche Discovery` | niche-discovery-100x | hamete | Descubrir nichos, validar con Triple Filter, puntuar ECPs con JTBD. |
| 7 | `07 💬 Positioning` | positioning-messaging | dulcinea | Messaging playbook por ECP: value criteria, assets, messaging framework. |
| 8 | `08 💰 Pricing` | pricing-strategy | sancho | Modelo de pricing, tiers, value metrics, hooks psicológicos. |

### 🎨 FULL FOUNDATION — BRAND IDENTITY (Layer 5)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 9 | `09 🎨 Brand Voice` | brand-voice | dulcinea | Full Voice Guide + AI Brand Kit + Per-ECP/Channel adaptation. |
| 10 | `10 🎨 Visual Identity` | visual-identity | maese-pedro | Sistema visual: paleta, tipografía, guidelines, assets. |

### 📏 MÉTRICAS Y CONEXIONES (Post-Foundation)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 11 | `11 📏 Métricas y Conexiones` | metrics-setup | merlin | Plan de métricas + conectar integraciones (GA4, Ads, CRM) + generar dashboard. |

### 🗺️ STRATEGIC PLAN (Post-Métricas)

| # | Thread Name | Skill | Agent | Objective |
|---|------------|-------|-------|-----------|
| 12 | `12 🗺️ Strategic Plan` | strategic-plan | sancho | Roadmap estratégico: selección de estrategias GTM, proyectos, fases. |

## Threads opcionales (solo si se activan)

| Thread Name | Skill | Agent | Cuándo crear |
|------------|-------|-------|--------------|
| `Existing Customer Data` | existing-customer-data | hamete | Si el cliente tiene datos de clientes existentes |
| `ECP Validation` | ecp-validation | sanson | Si se decide validar ECPs con datos reales |

## Creación de Threads

### Cuándo crear
- **Thread 1 (Fast Foundation)**: al crear el cliente desde Mission Control
- **Threads 2-10 (Full Foundation)**: al completar Fast Foundation
- **Thread 11 (Métricas)**: al completar Full Foundation
- **Thread 12 (Strategic Plan)**: al completar Métricas

### Cómo crear
1. Usar `message(action=thread-create)` en el canal #onboarding del cliente
2. Incluir `messageId` del mensaje del usuario para vincular el hilo
3. Guardar `threadId` en `foundation-state.json` para cada pilar

### Opening Message (dentro de cada hilo)

```
🏗️ **[Thread Name]**

**Skill**: [skill-name]
**Objetivo**: [objective]
**Dependencias**: [requires listado o "ninguna"]

¿Listo para empezar?
```

## Notas
- **1 thread = 1 skill = 1 documento** (alineado con MC)
- Positioning y Pricing son threads **separados** (antes compartían hilo)
- Brand Voice y Visual Identity son threads **separados** (antes compartían hilo)
- Market Synthesis = SWOT + Summary + OPE Canvas + Presentación en 1 hilo
- Fast Foundation = intake completo en 1 hilo (un archivo de grounding: fastcontext.current.md)
- Total: **12 hilos obligatorios** + 2 opcionales
- Si el orchestrator detecta hilos existentes con los nombres correctos, NO crea nuevos
- **foundation-state.json es la fuente de verdad**: leer `file_index` para resolver paths a archivos del cliente. Al crear threads, guardar `thread_id` en el pilar correspondiente de `sections`. Al completar un pilar que genera archivos nuevos, actualizar `file_index`.
