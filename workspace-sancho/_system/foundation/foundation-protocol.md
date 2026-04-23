# Foundation Protocol v2.0 — SanchoCMO

> 4 secciones de output. 6 layers. Gate checks con requires/enriches_with.

---

## Secciones de Output

La Foundation genera documentos organizados en 4 secciones + operacional:

```
brand/{slug}/
├── company-context/
│   ├── current.md        ← STANDALONE (fuente de verdad): Identity
│   ├── v1.md, v2.md...
│   └── history.json
├── business-model/
│   ├── current.md        ← STANDALONE (fuente de verdad): Model
│   ├── v1.md, v2.md...
│   └── history.json
├── budget/
│   ├── current.md        ← STANDALONE (fuente de verdad): Resources
│   ├── v1.md, v2.md...
│   └── history.json
├── company-brief/
│   ├── current.md        ← MERGE VIEW (auto-generated): Identity + Model + Resources
│   ├── v1.md, v2.md...   ← snapshots del merge view
│   └── history.json
├── market-and-us/
│   ├── market/current.md           ← TAM, segmentos, tendencias, regulación
│   ├── competitors/{nombre}/current.md  ← Battle card por competidor
│   ├── self/current.md             ← 3 lentes de autopercepción
│   ├── summary/current.md          ← Síntesis: mercado + competidores + nosotros
│   ├── swot/current.md             ← SWOT + TOWS estratégico
│   ├── ope-canvas/current.md       ← One-Page Endgame (foto completa en 1 página)
│   └── sources/                    ← Datos raw de scrapers
├── go-to-market/
│   ├── ecps/current.md                     ← Perfiles ECP con JTBD integrado
│   ├── positioning/{ecp-slug}/current.md   ← Messaging playbook por ECP
│   ├── positioning/shared/                 ← Tier 2: value-criteria, assets, messaging-summary
│   ├── pricing/current.md                  ← Framework de pricing + hooks
│   ├── existing-customer-data/current.md   ← Datos clientes existentes (opcional)
│   └── metrics-plan.md                     ← Sistema de métricas por arquetipo + Excel template
├── brand-identity/
│   ├── voice-profile/current.md    ← Brand voice
│   └── visual-identity/current.md  ← Sistema visual
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

## Company Brief — Arquitectura "standalone + merge view"

**Cada skill escribe su propio standalone (fuente de verdad).** El `company-brief/current.md` es un **merge view auto-generado** de los 3 standalones — no se edita a mano.

1. **company-context** → escribe `brand/{slug}/company-context/current.md` (standalone). Regenera el merge view.
2. **business-model-audit** → escribe `brand/{slug}/business-model/current.md` (standalone). Regenera el merge view.
3. **budget-constraints** → escribe `brand/{slug}/budget/current.md` (standalone). Regenera el merge view.

**Beneficios del diseño:**
- Cada skill se puede re-correr standalone con versionado granular propio (puedo tener business-model v5 sin que afecte a company-context v2).
- El merge view siempre refleja el estado consolidado.
- Consumers que necesitan info parcial leen el standalone directamente; los que necesitan la foto leen el merge view.

**Warning header obligatorio en el merge view:**
```
<!-- auto-generated from: company-context/, business-model/, budget/ -->
<!-- DO NOT EDIT HERE — edits will be overwritten on next regeneration -->
```

**Flujo Fast-Foundation:**
El orchestrator lanza las 3 skills en secuencia sin aprobación intermedia. Al final, regenera el merge view y presenta el Company Brief consolidado para una sola aprobación.

**Detalles operativos del merge** (formato, placeholders, quién lo dispara): ver [fast-foundation/SKILL.md](../../skills/fast-foundation/SKILL.md) — sección "Company Brief — Arquitectura standalone + merge view".

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
| brand_summary | `brand/{slug}/foundation-state.json` → `brand_summary` |
| file_index | `brand/{slug}/foundation-state.json` → `file_index` |
| MC | `python3 scripts/regenerate.py` |

### file_index (obligatorio)

`foundation-state.json` incluye un bloque `file_index` que indexa todos los archivos no-pilar del cliente (integrations, metrics, brand assets, competitors sources, etc.). Ver schema completo en `_system/schemas/foundation-state-v2.md`.

**Regla para skills:** cuando un skill crea un archivo nuevo (ej: nuevo competidor, nueva presentación), debe añadir su entry al `file_index` correspondiente en `foundation-state.json`.

### brand_summary (obligatorio)

Debe existir para todo cliente con al menos Fast Foundation completado. Contiene: company_name, sector, description, north_star, icps, competitors, positioning, url.
