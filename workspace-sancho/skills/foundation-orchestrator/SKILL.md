---
name: foundation-orchestrator
description: "Orquesta la Foundation v3.0: 6 secciones, 8 layers, gate checks con requires/enriches_with. Flujo: Fast Foundation (1 skill, 5 docs lite) → Full Foundation (9 skills individuales) → Metrics Setup → Strategic Plan. Al aprobar un pilar, ejecuta automáticamente el siguiente. Leer pillar-registry.md para detalle de cada pilar."
user-invocable: false
context_required:
- brand/{slug}/foundation-state.json
- _system/foundation-protocol.md
---

# Foundation Orchestrator v3.0

> Orquesta el flujo de Foundation pilar a pilar. Presenta → Valida → Aprueba → Siguiente.

**Protocolo**: `_system/foundation-protocol.md`
**Registry**: `references/pillar-registry.md`
**Estado**: `brand/{slug}/foundation-state.json` (schema v3.0)

## Secciones de Output

| Sección | Dir | Qué contiene |
|---------|-----|-------------|
| Fast Foundation | `company-brief/` + varios | 5 docs lite: Company Brief, Self L1, Market L1, Brand Voice Snapshot, Niche básico |
| Market & Us | `market-and-us/` | Research profundo + Market Synthesis (SWOT, Summary, OPE Canvas, Presentación) |
| Go-To-Market | `go-to-market/` | Niche Discovery, Positioning, Pricing |
| Brand Identity | `brand-identity/` + `brand-voice/` | Full Voice Guide + Visual Identity |
| Métricas | `go-to-market/metrics-plan/` | Plan de métricas + integraciones + dashboard |
| Strategic Plan | `strategic-plan/` | Roadmap GTM |

## DAG — 8 Layers

```
L0 FAST-FOUNDATION:  fast-foundation (1 skill → 5 docs lite)
L1 RESEARCH:         market-intelligence + competitor-intelligence + self-intelligence
L2 SYNTHESIS:        market-synthesis (SWOT + Summary + OPE Canvas + Presentación)
L3 DISCOVERY:        niche-discovery-100x + existing-customer-data?
L4 ACTIVATION:       positioning-messaging + pricing-strategy + ecp-validation?
L5 BRAND:            brand-voice + visual-identity
L6 METRICS:          metrics-setup (plan + connect APIs + dashboard)
L7 STRATEGY:         strategic-plan
```

## Gate Check — requires vs enriches_with

**ANTES de cada pilar**, leer foundation-state.json y verificar:

1. **requires** → TODOS deben ser `approved`. Si no → **BLOQUEAR**.
2. **enriches_with** → Si `approved`, cargar como input. Si no → **funcionar sin él**.

Ver `references/pillar-registry.md` para mapa completo de dependencias.

---

## Flujo de Entrada

### Paso 1: Leer Estado
1. Leer `brand/{slug}/foundation-state.json`
2. Si no existe o es v1.x/v2.x → crear v3.0 con todo en `not-started`
3. Si version=3.0 → determinar dónde quedamos

### Paso 2: Mostrar Progreso

```
🏗️ FOUNDATION — [Cliente]

📋 Fast Foundation       ✅ (5 docs lite)
📊 Market & Us           ✅ Market · ⬜ Competitors · ✅ Self · ⬜ Synthesis
🎯 Go-To-Market          ⬜ Niches · ⬜ Positioning · ⬜ Pricing
🎨 Brand Identity        ⬜ Voice · ⬜ Visual
📏 Métricas              ⬜ Plan + Conexiones
🗺️ Strategic Plan        ⬜

Progreso: 6/13 pilares
```

Iconos: ✅ approved | ⚠️ pending-review | 🔧 in-progress | ⬜ not-started | ➖ skipped

### Paso 3: Continuar
- Si hay pilar en `pending-review` → re-presentar
- Si hay pilar en `revision` → aplicar correcciones
- Else → ejecutar siguiente pilar disponible (gate check)

---

## Fast Foundation — Layer 0

**Skill**: `fast-foundation`
**Thread**: `{slug}:fast-foundation`

Sesión de intake única (~30 min):
1. Usuario introduce URL (o modo manual sin URL)
2. Scrape web + sociales → pre-fill 5 docs
3. Validar con usuario → completar gaps
4. Genera 5 docs lite: Company Brief, Self L1, Market L1, Brand Voice Snapshot, Niche básico

Al aprobar → marcar `fast-foundation` section como `approved` → desbloquea Layer 1.

---

## Ciclo por Pilar (Layer 1+)

### 1. Gate Check
Verificar requires + cargar enriches_with disponibles.

### 2. Ejecutar Skill
Invocar el skill del registry. Si hay enriches_with disponibles, pasarlos como contexto.
Skills full leen los docs lite de Fast Foundation como **hydration** (no re-preguntan lo que ya existe).

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

📄 Doc: brand/{slug}/market-and-us/market/current.md
───────────────────────────────
¿Correcto? ¿Cambios?
───────────────────────────────
```

### 4. Respuesta del Usuario

**Aprobación** → actualizar state → regenerar MC → mensaje de celebración + progreso → **ejecutar siguiente automáticamente**

**Corrección** → aplicar cambios → re-presentar

**Skip** → pedir razón → marcar skipped → siguiente

### 5. Persistir
- Actualizar `foundation-state.json`
- Ejecutar `python3 scripts/regenerate.py`

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
1. **Fast Foundation** (L0): "¿Quiénes son tus competidores?"
2. **Market Analysis** (L1): descubiertos durante research
3. **Niche Discovery** (L3): competidores por nicho

Cada competidor → `market-and-us/competitors/{slug}/current.md`.
Actualizar `competitor-analysis.output_files[]` en state.

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
- **Unknown** → Notificar usuario + marcar error en state

**Paso 2: Retry con Model Fallback**

| Intento | Model | Contexto | Notes |
|---------|-------|----------|-------|
| 1 | Opus (thinking:high) | Normal | Primary |
| 2 | Opus (thinking:high) | + enriches_with disponibles | Si primer intento tuvo context gaps |
| 3 | MiniMax-M2.5 | Normal | Fallback económico |

**Paso 3: Si sigue fallando**
1. Marcar pilar como `error` en foundation-state.json
2. Notificar al usuario: qué falló, por qué, qué hacer
3. Ofrecer: reintentar manualmente, skippear, o resolver el error

---

## Reglas

1. **Gate check SIEMPRE** antes de cada pilar
2. **Resumen ejecutivo** — nunca el doc entero
3. **Flujo automático** — al aprobar, siguiente arranca solo
4. **Fast Foundation = 1 skill** (no 3 como en v2.0)
5. **Market Synthesis = 1 skill** (SWOT + Summary + OPE Canvas + Presentación)
6. **Estado siempre actualizado** — foundation-state.json tras cada transición
7. **Retomable** — si la sesión se corta, retoma donde quedó
8. **enriches_with es silencioso** — si no está disponible, funcionar sin avisar
9. **Retry automático** — 3 intentos con model fallback antes de rendirse
10. **Error = notificar** — nunca silently fail
11. **Hydration** — skills full leen docs lite de Fast Foundation, no re-preguntan
