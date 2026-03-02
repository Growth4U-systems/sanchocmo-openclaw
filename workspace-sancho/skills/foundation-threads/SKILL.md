---
name: foundation-threads
description: "Create Discord threads for Foundation onboarding flow. Called by foundation-orchestrator when threads don't exist yet. Creates numbered threads per layer in #onboarding with skill reference and objective. NOT user-invocable — triggered automatically."
user-invocable: false
---

# Foundation Threads — Discord Thread Creation

> Creates numbered threads in #onboarding for each Foundation pillar. One thread = one pillar.

## Thread Definitions (15 pilares, 5 bloques)

### 🏢 LA EMPRESA (Layer 0 — sin dependencias)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 1 | `01 📋 Contexto de empresa` | company-context | Perfilar la empresa: identidad, producto, modelo de negocio, objetivos, estado actual, cultura y equipo. |
| 2 | `02 🏢 Modelo de negocio` | business-model-audit | Clasificar el modelo de negocio y mapear la mecánica de adquisición y monetización de clientes. |
| 3 | `03 💰 Presupuesto y recursos` | budget-constraints | Mapear presupuesto, timeline, capacidad del equipo y stack de herramientas disponible. |
| 4 | `04 🔍 Autoanálisis` | self-intelligence | Analizar la percepción propia de la marca con el framework de 3 lentes: Autopercepción, Terceros y Consumidores. |

### 🎯 OPE CANVAS (Layer 1 — depende de La Empresa)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 5 | `05 🎯 OPE Canvas` | ope-canvas | Síntesis estratégica en 1 página: Obvious Choice, ICP, Core Problem, Core Product y las 14 secciones del canvas. |

### 📊 EL MERCADO (Layer 2 — depende de OPE Canvas)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 6 | `06 📊 Inteligencia de mercado` | market-intelligence | Analizar TAM, tendencias, segmentos, landscape competitivo y entorno regulatorio. |
| 7 | `07 🏆 Análisis de competidores` | competitor-intelligence | Análisis competitivo 3 lentes: Autopercepción, Terceros y Consumidores. Battle cards y gaps. |
| 8 | `08 ⚖️ Análisis SWOT` | swot-analysis | SWOT + estrategias TOWS + priorización ICE a partir de la inteligencia recopilada. |

### 👥 LOS CLIENTES (Layer 3 — depende de El Mercado)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 9 | `09 🎯 Descubrimiento de nichos` | niche-discovery-100x | Descubrir nichos rentables minando conversaciones reales de foros, validar con Triple Filter y scoring. |
| 10 | `10 ✅ Validación ECP` *(opcional)* | ecp-validation | Testear hipótesis de los ECPs antes de ejecutar. Solo si hay +4 semanas y múltiples ECPs. |
| 11 | `11 📈 Datos de clientes existentes` *(opcional)* | existing-customer-data | Analizar CRM/datos existentes: segmentación RFM, clustering, churn, LTV. Solo si hay datos. |

### 🎯 LA MARCA (Layer 4 — depende de El Mercado)

| # | Thread Name | Skill | Objective |
|---|------------|-------|-----------|
| 12 | `12 💎 Positioning & Messaging` | positioning-messaging | Crear playbook de posicionamiento y messaging por nicho/ECP. |
| 13 | `13 💲 Estrategia de pricing` | pricing-strategy | Recomendar modelos de pricing, tiers y estrategia de monetización. |
| 14 | `14 🎙️ Voz de marca` | brand-voice | Definir voz, tono, vocabulario, reglas Do/Don't y AI Brand Kit. |
| 15 | `15 🎨 Identidad visual` | visual-identity | Establecer cómo se VE la marca: paleta, tipografía, estilo visual, assets. |

## Thread Creation Flow

### Create by Layer

Only create threads for the current layer + already completed layers. Do NOT create all 15 at once.

```
When foundation-orchestrator calls this skill:
  1. Read foundation-state.json → determine current layer
  2. Create threads for current layer (if not created yet)
  3. Store threadId per pillar in foundation-state.json
```

### Opening Message per Thread

When creating a thread, post this opening message inside it:

```
🏗️ **Foundation — Pilar {N}/15: {Pillar Name}**

📌 **Skill**: `{skill-name}`
🎯 **Objetivo**: {objective text from table above}

{layer context — brief summary of what was learned in previous pillars}

---

Empezamos cuando estés listo. ¿Alguna pregunta antes de arrancar?
```

### Thread Creation Command

For each thread, use message tool:

```
1. message(action=send, channel=discord, target={onboarding_channel_id},
   message="🏗️ Foundation — Pilar {N}/15: {name}")
2. Capture messageId from result
3. message(action=thread-create, channel=discord, target={onboarding_channel_id},
   messageId={messageId}, threadName="{NN} {emoji} {name}")
4. Capture threadId
5. message(action=send, channel=discord, target={threadId},
   message={opening message with skill + objective + context})
6. Store threadId in foundation-state.json under pillars.{slug}.threadId
```

## State Integration

Update `foundation-state.json` with thread IDs:

```json
{
  "pillars": {
    "company-context": {
      "status": "not-started",
      "layer": 0,
      "threadId": "1234567890",
      "threadName": "01 📋 Contexto de empresa"
    }
  }
}
```

## Rules

1. **Numbered threads** — always prefix with 2-digit number (01-15) for visual ordering
2. **Layer by layer** — only create current layer's threads, not future layers
3. **Context carry-forward** — each new thread's opening message includes relevant context from completed pillars
4. **Optional pillars** — create threads 10 and 11 only if user hasn't explicitly skipped them
5. **Idempotent** — if thread already exists (threadId in state), skip creation
