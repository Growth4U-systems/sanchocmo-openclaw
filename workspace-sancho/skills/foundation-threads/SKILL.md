---
name: foundation-threads
description: "Create Discord threads for Foundation v2.0 onboarding flow. Called by foundation-orchestrator when threads don't exist yet. Creates numbered threads per section/layer in #onboarding with skill reference and objective. NOT user-invocable — triggered automatically."
user-invocable: false
context_required:
- brand/{slug}/foundation-state.json
context_writes: []
---

# Foundation Threads — Discord Thread Creation v2.0

> Creates numbered threads in #onboarding for each Foundation section. One thread = one pillar (or one section for Company Brief).

## Thread Definitions (4 secciones, 6 layers)

### 📋 COMPANY BRIEF (Layer 0 — sin dependencias)

| # | Thread Name | Skills | Objective |
|---|------------|--------|-----------|
| 1 | `01 📋 Company Brief` | company-context → business-model → budget | Flujo continuo: identidad, modelo de negocio, presupuesto. 1 sola aprobación al final. |

### 📊 MARKET & US (Layer 1 — requires: Company Brief)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 2 | `02 📊 Market Analysis` | market-intelligence | TAM, segmentos, tendencias, regulación del mercado. |
| 3 | `03 ⚔️ Competitor Analysis` | competitor-intelligence | Battle cards por competidor: 3 lentes (qué dicen, qué dicen otros, qué dicen clientes). |
| 4 | `04 🔍 Self Analysis` | self-intelligence | Radiografía propia: 3 lentes de autopercepción (web, redes, reviews). |

### 📊 SYNTHESIS (Layer 2 — requires: Layer 1 completo)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 5 | `05 🔄 SWOT & Síntesis` | swot-analysis + orchestrator | SWOT+TOWS + generación de summary.md y ope-canvas.md. |

### 🎯 GO-TO-MARKET (Layer 3-4)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 6 | `06 👥 Niche Discovery` | niche-discovery-100x | Descubrir nichos, validar con Triple Filter, puntuar ECPs con JTBD. |
| 7 | `07 💬 Positioning & Pricing` | positioning-messaging + pricing-strategy | Messaging playbook por ECP + framework de pricing. |
| 8 | `08 📏 Metrics Plan` | acquisition-metrics-plan | Sistema de métricas: arquetipo, activation event, KPIs, funnel, benchmarks, Excel template. |

### 🎨 BRAND IDENTITY (Layer 5)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 9 | `09 🎨 Brand Identity` | brand-voice + visual-identity | Voice profile + sistema visual. |

## Creación de Threads

### Cuándo crear
- **Layer 0**: al iniciar Foundation (o primera vez que el orchestrator detecta que no hay threads)
- **Layers 1-5**: al completar la layer anterior (el orchestrator invoca este skill)

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
- Company Brief usa 1 solo hilo para las 3 skills internas (flujo continuo)
- SWOT & Síntesis comparte hilo (el orchestrator genera las síntesis tras el SWOT)
- Positioning & Pricing comparten hilo (flujo natural)
- Brand Identity comparte hilo (voice → visual es secuencial)
- Total: **9 hilos**
- Si el orchestrator detecta hilos existentes con los nombres correctos, NO crea nuevos
