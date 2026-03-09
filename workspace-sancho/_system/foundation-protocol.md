# Foundation Protocol v2.0 — SanchoCMO

> 4 secciones de output. 6 layers. Gate checks con requires/enriches_with.

---

## Secciones de Output

La Foundation genera documentos organizados en 4 secciones + operacional:

```
brand/{slug}/
├── company-brief/
│   ├── current.md        ← Doc único con 3 secciones (Identity, Business Model, Budget)
│   ├── v1.md, v2.md...   ← Versiones históricas
│   └── history.json
├── market-and-us/
│   ├── market-analysis.md      ← TAM, segmentos, tendencias, regulación
│   ├── competitor-{nombre}.md  ← Battle card por competidor
│   ├── self-analysis.md        ← 3 lentes de autopercepción
│   ├── summary.md              ← Síntesis: mercado + competidores + nosotros
│   ├── swot.md                 ← SWOT + TOWS estratégico
│   ├── ope-canvas.md           ← One-Page Endgame (foto completa en 1 página)
│   └── sources/                ← Datos raw de scrapers
├── go-to-market/
│   ├── ecps.md                 ← Perfiles ECP con JTBD integrado
│   ├── positioning-{ecp-slug}.md ← Messaging playbook por ECP
│   ├── pricing.md              ← Framework de pricing + hooks
│   ├── metrics-plan.md         ← Sistema de métricas por arquetipo + Excel template
│   └── messaging-summary.md    ← Síntesis GTM
├── brand-identity/
│   ├── voice-profile.md        ← Brand voice
│   └── visual-identity.md      ← Sistema visual
└── operational/
    ├── budget.md               ← Presupuesto detallado (viene de company-brief)
    ├── assets.md
    ├── learnings.md
    └── stack.md
```

---

## DAG — 6 Layers

```
LAYER 0 — INTAKE (sin dependencias)
  company-brief ← 3 skills en flujo continuo: company-context → business-model → budget
  → 1 sola aprobación del doc completo

LAYER 1 — RESEARCH (requires: company-brief)
  market-analysis ← market-intelligence skill
  competitor-analysis ← competitor-intelligence skill
  self-analysis ← self-intelligence skill
  ↔ enriches_with entre ellos (si uno está hecho, los otros lo usan)

LAYER 2 — SYNTHESIS (requires: market-analysis + competitor-analysis + self-analysis)
  summary.md ← orchestrator genera inline
  swot.md ← swot-analysis skill
  ope-canvas.md ← orchestrator genera inline
  → Estos 3 se generan/regeneran juntos al completar Layer 1

LAYER 3 — CUSTOMER DISCOVERY (requires: swot)
  niche-discovery ← niche-discovery-100x skill → ecps.md
  existing-customer-data ← OPCIONAL, enriches_with niche-discovery

LAYER 4 — ACTIVATION (requires: niche-discovery)
  positioning ← positioning-messaging → positioning-{ecp}.md
  pricing ← pricing-hooks → pricing.md
  ecp-validation ← OPCIONAL
  metrics-plan ← acquisition-metrics-plan → metrics-plan.md (after positioning+pricing)
  messaging-summary.md ← orchestrator genera inline

LAYER 5 — BRAND IDENTITY (requires: positioning)
  brand-voice ← brand-voice skill → voice-profile.md
  visual-identity ← visual-identity skill → visual-identity.md
```

---

## Gate Check — requires vs enriches_with

### requires (BLOQUEA)
Si un pilar tiene `requires: [X, Y]`, X e Y deben estar `approved` antes de ejecutar.
Si no están approved → **BLOQUEAR. NO ejecutar.**

### enriches_with (NO BLOQUEA)
Si un pilar tiene `enriches_with: [X]`, usa X como input adicional si está `approved`.
Si X no está approved → **funcionar sin él**. Notificar: "Nota: [X] no está disponible, el resultado será más básico."

### Mapa de dependencias

| Pilar | requires | enriches_with |
|-------|----------|---------------|
| company-brief | — | — |
| market-analysis | company-brief | competitor-analysis, self-analysis |
| competitor-analysis | company-brief | market-analysis, self-analysis |
| self-analysis | company-brief | market-analysis, competitor-analysis |
| summary (síntesis) | market-analysis, competitor-analysis, self-analysis | — |
| swot | market-analysis, competitor-analysis, self-analysis | — |
| ope-canvas (síntesis) | market-analysis, competitor-analysis, self-analysis | — |
| niche-discovery | swot | existing-customer-data |
| existing-customer-data | company-brief | — |
| positioning | niche-discovery | — |
| pricing | niche-discovery | positioning |
| metrics-plan | niche-discovery | positioning, pricing |
| ecp-validation | niche-discovery | — |
| messaging-summary (síntesis) | positioning | pricing |
| brand-voice | positioning | — |
| visual-identity | brand-voice | — |

---

## Company Brief — Flujo Continuo

Las 3 skills (company-context, business-model, budget) se ejecutan en secuencia como un solo flujo conversacional:

1. **company-context** → escribe sección `## Company Identity` en company-brief/current.md
2. **business-model** → escribe sección `## Business Model` en company-brief/current.md
3. **budget** → escribe sección `## Budget & Resources` en company-brief/current.md

El orchestrator las lanza una tras otra SIN pedir aprobación intermedia.
Al final, presenta el Company Brief completo para **una sola aprobación**.

Las skills internas siguen siendo modulares (diferentes prompts, hydration maps), pero el usuario ve un solo momento: "esto es tu empresa, ¿correcto?"

---

## Competitors — Lista Dinámica

Los competidores no son una lista fija. Se descubren y añaden en múltiples momentos:

1. **Company Brief** (Layer 0): preguntar al usuario "¿quiénes son tus competidores principales?"
2. **Market Analysis** (Layer 1): descubrir competidores adicionales durante research
3. **Niche Discovery** (Layer 3): descubrir competidores por nicho específico
4. En cualquier momento: el orchestrator puede preguntar "¿hay otros competidores que deberíamos analizar?"

Cada competidor genera `market-and-us/competitor-{slug}.md` (battle card completo).
No hay límite de competidores. La lista crece orgánicamente.

---

## Documentos de Síntesis (generados por orchestrator)

El orchestrator genera directamente (sin skill dedicado):

### summary.md
Sintetiza market-analysis + all competitors + self-analysis en 1-2 páginas.
Referencia cada documento fuente. Se regenera si se actualiza cualquier input.

### ope-canvas.md
One-Page Endgame: la foto completa del negocio en 1 página.
Se genera al completar Layer 1 (SYNTHESIS). Se regenera al actualizar inputs.

### messaging-summary.md
Síntesis GTM: "estos segmentos, este mensaje, estos canales".
Se genera al completar positioning. Se regenera si cambian positioning o pricing.

---

## Estados de Pilar

| Estado | Significado |
|--------|-------------|
| `not-started` | No se ha ejecutado |
| `in-progress` | Skill ejecutándose |
| `pending-review` | Presentado, esperando feedback |
| `revision` | Usuario pidió cambios |
| `approved` | Aprobado — pilar completo |
| `skipped` | No aplica (con skip_reason) |

---

## Flujo por Pilar

1. **Gate check**: verificar requires + cargar enriches_with disponibles
2. **Ejecutar skill**: invocar el skill correspondiente
3. **Presentar resumen ejecutivo**: 5-10 bullets, NO el doc entero
4. **Esperar respuesta**: aprobar → celebración + siguiente | corregir → revisión | skip → razón + siguiente
5. **Persistir**: actualizar foundation-state.json + regenerar MC
6. **Upstream enrichment** (OBLIGATORIO): al completar una layer, revisar docs upstream que dependen de los datos nuevos y actualizarlos:
   - **OPE Canvas**: enriquecer con ECPs, UVPs, pricing hooks, channel data
   - **Company Brief**: resolver Discovery Tasks pendientes (ej: "Pricing visible")
   - **Summary/Syntheses**: actualizar con datos de la layer completada
   - **foundation-state.json**: actualizar status de sección padre si todos los pilares están completos
   - Sugerir proactivamente al usuario — no esperar a que pregunte

**Flujo automático**: al aprobar, el siguiente pilar arranca automáticamente. El usuario nunca tiene que escribir un comando para continuar.

**Excepción Company Brief**: los 3 skills internos fluyen sin aprobación intermedia. Solo al final del Brief completo se pide aprobación.

---

## Viability Checkpoint

Después de aprobar self-analysis, evaluar señales de viabilidad.
Si hay señales negativas → alertar (advisory, no bloqueante).

---

## Resumen Final

Al completar toda la Foundation, presentar resumen ejecutivo consolidado con highlights de cada sección.

---

## Persistencia

| Dato | Destino |
|------|---------|
| Documentos | `brand/{slug}/{seccion}/` (markdown) |
| Estado | `brand/{slug}/foundation-state.json` |
| MC | `python3 scripts/regenerate.py` |
