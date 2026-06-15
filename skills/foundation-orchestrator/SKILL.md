---
name: foundation-orchestrator
description: "Orquesta la Foundation v3.0: 7 secciones, 8 layers, gate checks con requires/enriches_with. Flujo: Kickoff (1 skill, company-brief.current.md) → Trust Score (opcional, auto-arranca tras Company Brief) → Full Foundation (9 skills individuales) → Metrics Setup → Strategic Plan. Al aprobar un pilar, ejecuta automáticamente el siguiente. Leer pillar-registry.md para detalle de cada pilar."
user-invocable: false
context_required:
- _system/foundation-protocol.md
---

# Foundation Orchestrator v3.0

> Orquesta el flujo de Foundation pilar a pilar. Presenta → Valida → Aprueba → Siguiente.

**Protocolo**: `_system/foundation-protocol.md`
**Registry**: `references/pillar-registry.md`
**Estado**: el status de cada pilar vive en su task 1:1 (proyectos P00). Se lee vía `GET {MC_BASE}/api/brand-brain/state?slug={slug}` (mismo shape de siempre: sections→pillars→status, vocabulario canónico de task: `todo | in-progress | pending-review | completed | blocked | cancelled`) y se escribe vía `POST {MC_BASE}/api/brand-brain/pillar-status` con body `{"slug", "section", "pillar", "status"}`. Auth: header `x-admin-token` con el `adminToken` de la raíz de `clients.json` (mismo patrón que los crons).

## Secciones de Output

| Sección | Dir | Qué contiene |
|---------|-----|-------------|
| Company Brief | `company-brief/` | Company Brief inicial: `company-brief.current.md` (un archivo, secciones H2) |
| Site Audit | `site-audit/` | Trust Score (opcional, auto-arranca tras Company Brief): `trust-score/trust-score.current.md` (6 pilares + gap vs competidores + verdict) |
| Market & Us | `market-and-us/` | Research profundo + Market Synthesis (SWOT, Summary, OPE Canvas, Presentación) |
| Go-To-Market | `go-to-market/` | Niche Discovery, Positioning, Pricing |
| Brand Identity | `brand-identity/` + `brand-voice/` | Full Voice Guide + Visual Identity |
| Métricas | `go-to-market/metrics-plan/` | Plan de métricas + integraciones + dashboard |
| Strategic Plan | `strategic-plan/` | Roadmap GTM |

## DAG — 8 Layers

```
L0 KICKOFF:    kickoff (1 skill → company-brief/company-brief.current.md)
                 └─ trust-score? (OPCIONAL, auto-arranca tras company-brief — requires URL; no bloquea)
L1 RESEARCH:   market-intelligence + competitor-intelligence + self-intelligence
L2 SYNTHESIS:  market-synthesis (SWOT + Summary + OPE Canvas + Presentación)
L3 DISCOVERY:  niche-discovery-100x + existing-customer-data?
L4 ACTIVATION: positioning-messaging + pricing-strategy + ecp-validation?
L5 BRAND:      brand-voice + visual-identity
L6 METRICS:    metrics-setup (plan + connect APIs + dashboard)
L7 STRATEGY:   strategic-plan
```

## Gate Check — requires vs enriches_with

**ANTES de cada pilar**, leer `GET {MC_BASE}/api/brand-brain/state?slug={slug}` y verificar:

1. **requires** → TODOS deben ser `completed`. Si no → **BLOQUEAR**.
2. **enriches_with** → Si `completed`, cargar como input. Si no → **funcionar sin él**.

Ver `references/pillar-registry.md` para mapa completo de dependencias.

---

## Flujo de Entrada

### Paso 1: Leer Estado
1. Leer `GET {MC_BASE}/api/brand-brain/state?slug={slug}` (sections→pillars→status, vocabulario de task)
2. Pilares sin task → `todo`
3. Determinar dónde quedamos

### Paso 2: Mostrar Progreso

```
🏗️ FOUNDATION — [Cliente]

📋 Kickoff               ✅ (company-brief/company-brief.current.md)
🔍 Site Audit            ⬜ Trust Score (opcional)
📊 Market & Us           ✅ Market · ⬜ Competitors · ✅ Self · ⬜ Synthesis
🎯 Go-To-Market          ⬜ Niches · ⬜ Positioning · ⬜ Pricing
🎨 Brand Identity        ⬜ Voice · ⬜ Visual
📏 Métricas              ⬜ Plan + Conexiones
🗺️ Strategic Plan        ⬜

Progreso: 6/13 pilares
```

Iconos: ✅ completed | ⚠️ pending-review | 🔧 in-progress | ⬜ todo | 🚫 blocked | ➖ cancelled

### Paso 3: Continuar
- Si hay pilar en `pending-review` → re-presentar
- Si hay pilar en `in-progress` con correcciones pedidas → aplicar correcciones
- Else → ejecutar siguiente pilar disponible (gate check)

---

## Kickoff — Layer 0

**Skill**: `kickoff`
**Thread**: `{slug}:kickoff`

Sesión de intake única (~30 min):
1. Usuario introduce URL (o modo manual sin URL)
2. Scrape web + sociales → pre-fill grounding
3. Validar con usuario → completar gaps
4. Genera `brand/{slug}/company-brief/company-brief.current.md` (un archivo, secciones H2: Company, Market, Brand Voice, ECPs)

Al aprobar → marcar el pilar `company-brief` como `completed` (POST pillar-status) → desbloquea Layer 1.

**Auto-arranque del Trust Score (Layer 0, OPCIONAL):** justo tras marcar `company-brief` como `completed` (ya hay URL), disparar el skill `trust-score` (agente `dulcinea`, thread `{slug}:trust-score`, sección `site-audit`). Es **fire-and-forget y NO bloqueante**: la skill corre el analyzer, escribe `site-audit/trust-score/trust-score.current.md` y se auto-marca `completed` vía `POST /api/brand-brain/pillar-status` (`section: "site-audit"`, `pillar: "trust-score"`). El orquestador **no lo gatea ni lo espera**: Layer 1 procede en paralelo. Si el analyzer falla (sin competidores descubribles → 409, discovery caído → 502, o `_stale`), el pilar `trust-score` queda pendiente **sin trabar** el avance ni el gate de Foundation completa. `trust-score` nunca es `requires` de ningún pilar downstream.

---

## Ciclo por Pilar (Layer 1+)

### 1. Gate Check
Verificar requires + cargar enriches_with disponibles.

### 2. Ejecutar Skill
Invocar el skill del registry. Si hay enriches_with disponibles, pasarlos como contexto.

**Convención de paths (v3.2):**
- Kickoff escribe SOLO `brand/{slug}/company-brief/company-brief.current.md` (Company Brief inicial, un archivo). NO toca carpetas de pilares.
- Las skills full escriben a `{carpeta}/{carpeta}.current.md` (`brand/{slug}/{carpeta}/{carpeta}.current.md`).
- Las skills full leen su sección de `company-brief/company-brief.current.md` como grounding opcional (si no existe, arrancan standalone). El `{carpeta}.current.md` final se regenera desde el paquete completo, nunca se limita a refinar el grounding.
- Si una skill full necesita un input upstream, ese input debe existir como `{carpeta}.current.md` (full, source of truth). No degradar a leer grounding como fuente final.

**Con model fallback:**
```
- 1er intento: sessions_spawn con model=default (Opus)
- Si falla: re-spawn con model=minimax/MiniMax-M2.5
- Si sigue fallar: marcar error + notificar usuario
```

### 3. Presentar Resumen Ejecutivo
5-10 bullets. **NO el doc entero.** Formato:

```
───────────────────────────────
📊 MARKET ANALYSIS — Resumen
───────────────────────────────
• TAM: €X.XM en [país]
• Segmentos principales: [lista]
• Tendencia: [crecimiento/estable]
• Regulación clave: [impactos]
• Oportunidad principal: [descripción]

📄 Doc: brand/{slug}/market-and-us/market/market.current.md
───────────────────────────────
¿Correcto? ¿Cambios?
───────────────────────────────
```

### 4. Respuesta del Usuario

**Aprobación** → actualizar state → regenerar MC → mensaje de celebración + progreso → **ejecutar siguiente automáticamente**

**Corrección** → aplicar cambios → re-presentar

**Skip** → pedir razón → marcar `cancelled` → siguiente

### 5. Persistir
- Actualizar el status del pilar vía `POST {MC_BASE}/api/brand-brain/pillar-status` con body `{"slug", "section", "pillar", "status"}` — status SIEMPRE en vocabulario canónico (`completed` | `in-progress` | `pending-review`).
- El Brand Snapshot del dashboard se deriva automáticamente del company-brief — no hay que mantener `brand_summary` a mano.
- Ejecutar `python3 scripts/regenerate.py` (legacy mc-data; no toca status)

---

## Market Synthesis — Layer 2 (skill dedicado)

**Skill**: `market-synthesis`
**Thread**: `{slug}:market-synthesis`

Genera 4 outputs en secuencia:
1. **SWOT + TOWS** con ICE prioritization
2. **Market Summary** (1-2 páginas)
3. **OPE Canvas** (14 secciones)
4. **Presentación HTML** (vía frontend-slides)

**Nota**: En v2.0 las síntesis (summary, ope-canvas) eran inline del orchestrator. En v3.0 son parte del skill `market-synthesis`. El orchestrator solo invoca el skill y valida el output.

---

## Competitors — Lista Dinámica

Los competidores se descubren en múltiples momentos:
1. **Kickoff** (L0): "¿Quiénes son tus competidores?"
2. **Market Analysis** (L1): descubiertos durante research
3. **Niche Discovery** (L3): competidores por nicho

Cada competidor → `market-and-us/competitors/{nombre}/{nombre}.current.md` (deep-dive). El roll-up consolidado vive en `market-and-us/competitors/competitors.current.md` y se regenera desde los subdirs.

El orchestrator puede preguntar proactivamente: "¿Hay otros competidores que deberíamos analizar?"

---

## Viability Checkpoint

Después de aprobar self-analysis:
- Si señales negativas (reviews <2.5, PMF dudoso) → alertar
- Advisory, NO bloqueante. El usuario decide.

---

## Resumen Final

Al completar toda la Foundation (Layer 0-5):

```
═══════════════════════════════════════
🏁 FOUNDATION COMPLETA — [Cliente]
═══════════════════════════════════════

📋 Company Brief: [empresa] — [1 línea]
📊 Mercado: TAM [€X] | Tendencia: [X]
⚔️ Competidores: [top 3]
🎯 ICP: [perfil principal]
💬 Posicionamiento: "[statement]"
💰 Pricing: [estrategia]
🎨 Voz: [3 atributos]

Siguiente: Métricas y Conexiones → Strategic Plan

Docs en: brand/{slug}/
═══════════════════════════════════════
```

---

## Error Handling & Retry

### Si una skill FALLA:

**Paso 1: Clasificar el error**
- **API/Timeout** (rate limit, network, 5xx) → Retry
- **Tool Error** (scraper failed, missing API key) → Retry con fallback
- **Quality** (output incompleto, mal formato) → Retry con más contexto
- **Unknown** → Notificar usuario + marcar pilar como `blocked` (POST pillar-status)

**Paso 2: Retry con Model Fallback**

| Intento | Model | Contexto | Notes |
|---------|-------|----------|-------|
| 1 | Opus (thinking:high) | Normal | Primary |
| 2 | Opus (thinking:high) | + enriches_with disponibles | Si primer intento tuvo context gaps |
| 3 | MiniMax-M2.5 | Normal | Fallback económico |

**Paso 3: Si sigue fallando**
1. Marcar el pilar como `blocked` vía `POST {MC_BASE}/api/brand-brain/pillar-status` (status `"blocked"`)
2. Notificar al usuario: qué falló, por qué, qué hacer
3. Ofrecer: reintentar manualmente, skippear, o resolver el error

---

## Reglas

1. **Gate check SIEMPRE** antes de cada pilar
2. **Resumen ejecutivo** — nunca el doc entero
3. **Flujo automático** — al aprobar, siguiente arranca solo
4. **Kickoff = 1 skill** — produce Company Brief directamente; no hay merge-view ni scripts de regeneración separados
5. **Market Synthesis = 1 skill** (SWOT + Summary + OPE Canvas + Presentación)
6. **Status siempre actualizado** — `POST /api/brand-brain/pillar-status` tras cada transición (vocabulario canónico)
7. **Retomable** — si la sesión se corta, retoma donde quedó
8. **enriches_with es silencioso** — si no está disponible, funcionar sin avisar
9. **Retry automático** — 3 intentos con model fallback antes de rendirse
10. **Error = notificar** — nunca silently fail
11. **Grounding** — las skills full leen su sección de `company-brief/company-brief.current.md` como seed opcional; nunca lo tratan como fuente final.
12. **Path discipline** — kickoff escribe SOLO `company-brief/company-brief.current.md`. Nunca toca carpetas de pilares. `{carpeta}.current.md` = full (source of truth); `company-brief.current.md` = Company Brief inicial (grounding opcional).
