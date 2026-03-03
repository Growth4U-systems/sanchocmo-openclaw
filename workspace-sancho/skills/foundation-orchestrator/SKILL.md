---
name: foundation-orchestrator
description: "Orquesta la Foundation v2.0: 4 secciones, 6 layers, gate checks con requires/enriches_with. Flujo continuo — al aprobar un pilar, ejecuta automáticamente el siguiente. Company Brief como flujo único (3 skills → 1 aprobación). Genera síntesis inline (summary, ope-canvas, messaging-summary). Leer pillar-registry.md para detalle de cada pilar."
user-invocable: false
---

# Foundation Orchestrator v2.0

> Orquesta el flujo de Foundation pilar a pilar. Presenta → Valida → Aprueba → Siguiente.

**Protocolo**: `_system/foundation-protocol.md`
**Registry**: `references/pillar-registry.md`
**Estado**: `brand/{slug}/foundation-state.json` (schema v2.0)

## Secciones de Output

| Sección | Dir | Qué contiene |
|---------|-----|-------------|
| Company Brief | `company-brief/` | Doc único: Identity + Business Model + Budget |
| Market & Us | `market-and-us/` | Research + síntesis (summary, swot, ope-canvas) |
| Go-To-Market | `go-to-market/` | ECPs, positioning, pricing, messaging |
| Brand Identity | `brand-identity/` | Voice + Visual |

## DAG — 6 Layers

```
L0 INTAKE:     company-brief (3 skills → 1 aprobación)
L1 RESEARCH:   market-analysis + competitor-analysis + self-analysis
L2 SYNTHESIS:  swot + summary* + ope-canvas*    (* = orchestrator inline)
L3 DISCOVERY:  niche-discovery + existing-customer-data?
L4 ACTIVATION: positioning + pricing + ecp-validation? + messaging-summary*
L5 BRAND:      brand-voice + visual-identity
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
2. Si no existe o es v1.x → crear v2.0 con todo en `not-started`
3. Si version=2.0 → determinar dónde quedamos

### Paso 2: Mostrar Progreso

```
🏗️ FOUNDATION — [Cliente]

📋 Company Brief          ✅
📊 Market & Us            ✅ Market · ⬜ Competitors · ✅ Self · ⬜ SWOT
🎯 Go-To-Market           ⬜ Niches · ⬜ Positioning · ⬜ Pricing
🎨 Brand Identity         ⬜ Voice · ⬜ Visual

Progreso: 5/12 pilares
```

Iconos: ✅ approved | ⚠️ pending-review | 🔧 in-progress | ⬜ not-started | ➖ skipped

### Paso 3: Continuar
- Si hay pilar en `pending-review` → re-presentar
- Si hay pilar en `revision` → aplicar correcciones
- Else → ejecutar siguiente pilar disponible (gate check)

---

## Company Brief — Flujo Especial (Layer 0)

Las 3 skills se ejecutan en secuencia como UNA conversación:

1. Invocar `company-context` → escribe `## Company Identity`
2. Invocar `business-model` → escribe `## Business Model`
3. Invocar `budget` → escribe `## Budget & Resources`
4. **Además**: preguntar competidores conocidos (guardar para Layer 1)
5. Presentar Company Brief completo → **1 sola aprobación**

NO pedir aprobación entre skills internas. El usuario ve un solo flujo.

Al aprobar → `brand/{slug}/company-brief/current.md` + versionado.

---

## Ciclo por Pilar (Layer 1+)

### 1. Gate Check
Verificar requires + cargar enriches_with disponibles.

### 2. Ejecutar Skill
Invocar el skill del registry. Si hay enriches_with disponibles, pasarlos como contexto.

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

📄 Doc: brand/{slug}/market-and-us/market-analysis.md
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

## Síntesis Inline (Layer 2 y 4)

### Cuándo generar
- **summary.md + ope-canvas.md**: al completar TODA Layer 1 (market + competitors + self approved)
- **messaging-summary.md**: al completar positioning (+ pricing si disponible)

### Cómo generar
El orchestrator lee los documentos fuente y genera la síntesis directamente:

**summary.md**: "Lee market-analysis, todos los competitor-{x}.md, y self-analysis. Sintetiza en 1-2 páginas: posición en el mercado, ventajas competitivas, gaps, oportunidades. Referencia cada documento fuente."

**ope-canvas.md**: "Lee todo lo anterior. Genera One-Page Endgame: empresa + mercado + competencia + posición propia en 1 página visual. Formato tabla/canvas."

**messaging-summary.md**: "Lee ecps.md + todos los positioning-{ecp}.md + pricing.md. Sintetiza: segmentos target, mensaje por segmento, canales recomendados, hooks de pricing."

### Post-síntesis
Presentar síntesis al usuario para review (no aprobación formal — es derivada).
Marcar `syntheses.X.status = "generated"` en state.

---

## Competitors — Lista Dinámica

Los competidores se descubren en múltiples momentos:
1. **Company Brief** (L0): "¿Quiénes son tus competidores?"
2. **Market Analysis** (L1): descubiertos durante research
3. **Niche Discovery** (L3): competidores por nicho

Cada competidor → `market-and-us/competitor-{slug}.md`.
Actualizar `competitor-analysis.output_files[]` en state.

El orchestrator puede preguntar proactivamente: "¿Hay otros competidores que deberíamos analizar?"

---

## Viability Checkpoint

Después de aprobar self-analysis:
- Si señales negativas (reviews <2.5, PMF dudoso) → alertar
- Advisory, NO bloqueante. El usuario decide.

---

## Resumen Final

Al completar toda la Foundation:

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

Docs en: brand/{slug}/
═══════════════════════════════════════
```

---

## Reglas

1. **Gate check SIEMPRE** antes de cada pilar
2. **Resumen ejecutivo** — nunca el doc entero
3. **Flujo automático** — al aprobar, siguiente arranca solo
4. **Company Brief = 1 aprobación** para las 3 skills internas
5. **Estado siempre actualizado** — foundation-state.json tras cada transición
6. **Retomable** — si la sesión se corta, retoma donde quedó
7. **enriches_with es silencioso** — si no está disponible, funcionar sin avisar excepto la primera vez
