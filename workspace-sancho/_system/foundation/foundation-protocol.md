# Foundation Protocol v2.0 — SanchoCMO

> 4 secciones de output. 6 layers. Gate checks con requires/enriches_with.

---

## Secciones de Output

La Foundation genera documentos organizados en 4 secciones + operacional:

```
brand/{slug}/
├── company-brief/
│   ├── company-brief.current.md        ← Company Brief inicial (escrito por Kickoff, un archivo, secciones H2)
│   ├── v1.md, v2.md...
│   └── history.json
├── market-and-us/
│   ├── market/market.current.md           ← TAM, segmentos, tendencias, regulación
│   ├── competitors/{nombre}/{nombre}.current.md  ← Battle card por competidor
│   ├── self/self.current.md             ← 3 lentes de autopercepción
│   ├── summary/summary.current.md          ← Síntesis: mercado + competidores + nosotros
│   ├── swot/swot.current.md             ← SWOT + TOWS estratégico
│   ├── ope-canvas/ope-canvas.current.md       ← One-Page Endgame (foto completa en 1 página)
│   └── sources/                    ← Datos raw de scrapers
├── go-to-market/
│   ├── ecps/ecps.current.md                     ← Perfiles ECP con JTBD integrado
│   ├── positioning/{ecp-slug}/{ecp-slug}.current.md   ← Messaging playbook por ECP
│   ├── positioning/shared/                 ← Tier 2: value-criteria, assets, messaging-summary
│   ├── pricing/pricing.current.md                  ← Framework de pricing + hooks
│   ├── existing-customer-data/existing-customer-data.current.md   ← Datos clientes existentes (opcional)
│   └── metrics-plan.md                     ← Sistema de métricas por arquetipo + Excel template
├── brand-identity/
│   ├── voice-profile/voice-profile.current.md    ← Brand voice
│   └── visual-identity/visual-identity.current.md  ← Sistema visual
└── operational/
    ├── budget.md               ← Presupuesto detallado (viene de company-brief)
    ├── assets.md
    ├── learnings.md
    └── stack.md
```

---

## DAG — 6 Layers

```
LAYER 0 — KICKOFF (sin dependencias)
  company-brief ← kickoff skill (1 skill → company-brief/company-brief.current.md)
  → 1 sola aprobación del doc completo

LAYER 1 — RESEARCH (sin dependencias; Kickoff enriquece si está completed)
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
Si un pilar tiene `requires: [X, Y]`, X e Y deben estar `completed` antes de ejecutar.
Si no están completed → **BLOQUEAR. NO ejecutar.**

### enriches_with (NO BLOQUEA)
Si un pilar tiene `enriches_with: [X]`, usa X como input adicional si está `completed`.
Si X no está completed → **funcionar sin él**. Notificar: "Nota: [X] no está disponible, el resultado será más básico."

### Mapa de dependencias

| Pilar | requires | enriches_with |
|-------|----------|---------------|
| company-brief (kickoff) | — | — |
| market-analysis | — | company-brief, competitor-analysis, self-analysis |
| competitor-analysis | — | company-brief, market-analysis, self-analysis |
| self-analysis | — | company-brief, market-analysis, competitor-analysis |
| summary (síntesis) | market-analysis, competitor-analysis, self-analysis | — |
| swot | market-analysis, competitor-analysis, self-analysis | — |
| ope-canvas (síntesis) | market-analysis, competitor-analysis, self-analysis | — |
| niche-discovery | swot | existing-customer-data |
| existing-customer-data | — | — |
| positioning | niche-discovery | — |
| pricing | niche-discovery | positioning |
| metrics-plan | niche-discovery | positioning, pricing |
| ecp-validation | niche-discovery | — |
| messaging-summary (síntesis) | positioning | pricing |
| brand-voice | positioning | — |
| visual-identity | brand-voice | — |

---

## Company Brief — Arquitectura Kickoff

El **Company Brief** es el documento de intake del cliente. Lo produce directamente el skill `kickoff` en una sesión única de ~30 min.

- **Output**: `brand/{slug}/company-brief/company-brief.current.md` (un archivo, secciones H2: Company, Market, Brand Voice, ECPs).
- **Quién lo escribe**: el skill `kickoff` (thread `{slug}:kickoff`). No hay skills separadas de company-context / business-model / budget-constraints, ni script de merge.
- **Rol downstream**: las skills full (market-intelligence, self-intelligence, brand-voice, competitor-intelligence, niche-discovery-100x) leen su sección de `company-brief/company-brief.current.md` como **grounding opcional**. Si el archivo no existe, arrancan standalone. El Kickoff NO es prerequisito de ningún pilar de Layer 1+.
- **No hay merge view**: el Company Brief es el documento directo; no se regenera desde standalones.
- **Versionado**: versiones anteriores se guardan como `v1.md`, `v2.md`… en la misma carpeta.

---

## Competitors — Lista Dinámica

Los competidores no son una lista fija. Se descubren y añaden en múltiples momentos:

1. **Kickoff** (Layer 0): preguntar al usuario "¿quiénes son tus competidores principales?"
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

Vocabulario canónico de task (el status vive en la task 1:1 del pilar, proyectos P00):

| Estado | Significado |
|--------|-------------|
| `todo` | No se ha ejecutado |
| `in-progress` | Skill ejecutándose (o aplicando correcciones pedidas) |
| `pending-review` | Presentado, esperando feedback |
| `completed` | Aprobado — pilar completo |
| `blocked` | Error o bloqueado por dependencia/externo |
| `cancelled` | No aplica (skip, con razón) |

---

## Flujo por Pilar

1. **Gate check**: verificar requires + cargar enriches_with disponibles
2. **Ejecutar skill**: invocar el skill correspondiente
3. **Presentar resumen ejecutivo**: 5-10 bullets, NO el doc entero
4. **Esperar respuesta**: aprobar → celebración + siguiente | corregir → revisión | skip → razón + siguiente
5. **Persistir**: actualizar status del pilar vía `POST {MC_BASE}/api/brand-brain/pillar-status` `{"slug", "section", "pillar", "status"}` (vocabulario canónico de task) + regenerar MC
6. **Upstream enrichment** (OBLIGATORIO): al completar una layer, revisar docs upstream que dependen de los datos nuevos y actualizarlos:
   - **OPE Canvas**: enriquecer con ECPs, UVPs, pricing hooks, channel data
   - **Company Brief**: resolver Discovery Tasks pendientes (ej: "Pricing visible") — editar `company-brief/company-brief.current.md` directamente
   - **Summary/Syntheses**: actualizar con datos de la layer completada
   - Sugerir proactivamente al usuario — no esperar a que pregunte

**Flujo automático**: al aprobar, el siguiente pilar arranca automáticamente. El usuario nunca tiene que escribir un comando para continuar.

**Kickoff**: es una sesión única de intake. Solo al aprobar el Company Brief completo se desbloquea el resto.

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
| Estado | Task 1:1 del pilar (proyectos P00) — escribir vía `POST /api/brand-brain/pillar-status`, leer vía `GET /api/brand-brain/state?slug={slug}` |
| MC | `python3 scripts/regenerate.py` (legacy mc-data; no toca status) |

### Brand Snapshot

El Brand Snapshot del dashboard (company_name, sector, ICPs, competidores, positioning, URL) se deriva automáticamente del company-brief — no hay que mantener `brand_summary` a mano. `file_index` está retirado: nada lo lee, no mantenerlo.
