---
name: brand-check
description: "Brand coherence verification de cualquier output de marca (post, blog, ad, email, slide, página, thread) contra la Foundation. Aplica 4 dominios: voice & tone (siempre), messaging consistency (siempre que haya claims), visual identity (cuando aplique), SEO basics (cuando aplique). Devuelve veredicto PASS / NEEDS REVISION / MAJOR ISSUES con score y action list priorizada. Skill de Rocinante — invocada solo vía dispatch (`sessions_send` con `**Tipo**: brand-check`), no user-invocable. Use when: pipeline ha generado un draft y antes de publicar, cualquier sancho-manager request con tipo brand-check, o tras editar un asset existente. NOT for: fact-checking de datos numéricos (eso es qa-bot vía deep-research Phase 6), copy-editing prosaico (eso es copywriting), generación de contenido (skills de canal como social-writer/seo-content/newsletter)."
user-invocable: false
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  agent: rocinante
  phase: any
  layer: any
  depends_on: []
  updated: '2026-05-01'
context_required:
  - brand/{slug}/foundation-state.json
  - brand/{slug}/brand-voice/brand-voice.current.md
  - brand/{slug}/go-to-market/positioning/shared/messaging-summary.md
context_optional:
  - brand/{slug}/brand-identity/visual-identity/visual-identity.current.md
  - brand/{slug}/brand-book/seo-guidelines.md
  - brand/{slug}/go-to-market/positioning/ecp{N}-{slug}/*.current.md
context_writes:
  - brand/{slug}/compliance/brand-check-{YYYY-MM-DD}-{asset-slug}.md
---

# Brand Check

> Verificación estructural de alineamiento marca de cualquier output, antes de publicar. Skill de Rocinante.

## When to Use

Invocada por dispatch desde un pipeline (social-writer, seo-content, newsletter, ad-creative, frontend-design…) tras generar un draft y **antes de publicar**. Formato de invocación (ver [dispatch-protocol.md](../../dispatch-protocol.md)):

```
QA REQUEST
**Tipo**: brand-check
**Output a revisar**: <ruta o contenido>
**Channel**: linkedin / blog / instagram / twitter / tiktok / email / newsletter / youtube / guest-post / direct-response / frontend / slides / ad / image
**Brand slug**: growth4u
```

## NOT for

- Fact-checking de datos numéricos / claims verificables → invocar `qa-bot` (vía `deep-research` Phase 6 o directo)
- Copy-editing prosaico (ortografía, fluidez) → `copywriting` o `copy-editing`
- Generación de contenido desde cero → skill del canal correspondiente
- Auditoría de Foundation Files → `foundation-orchestrator` o skills específicos del pilar

## Workflow Overview

```
TARGET → CONTEXT → CHECK (4 dominios) → SCORE → REPORT
   1        2            3                4        5
```

Cada fase es obligatoria. La fase 3 puede saltar dominios cuando no aplican al canal.

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [checks.md](references/checks.md) | **SIEMPRE** — fuente de verdad | Los 4 dominios con criterios, prompts de verificación y reglas de aplicabilidad |
| [report-template.md](references/report-template.md) | Phase 5 (REPORT) | Estructura exacta del reporte de salida |
| [examples.md](references/examples.md) | Antes de entregar (para calibrar) | Ejemplos PASS y NEEDS REVISION con razonamiento |

---

## Phases

### Phase 1: TARGET

Identificar exactamente qué se revisa.

**Inputs del QA REQUEST:**
- `Output a revisar` — ruta a archivo o bloque de contenido
- `Channel` — determina qué dominios aplican (ver matriz en [checks.md](references/checks.md))
- `Brand slug` — necesario para resolver Foundation paths

Si falta cualquiera, devolver al pipeline con error claro: `❌ brand-check: missing field {X}`.

### Phase 2: CONTEXT

1. Leer `brand/{slug}/foundation-state.json` para resolver paths actuales (no hardcodear).
2. Cargar Foundation files según los dominios aplicables al `channel`:
   - **Siempre**: `brand-voice.current.md`, `messaging-summary.md`
   - **Si visual-identity aplica al channel**: `visual-identity.current.md`
   - **Si SEO aplica al channel**: `seo-guidelines.md` (si existe; si no, gracefully skip dominio con warning)
3. Si algún Foundation file mandatorio no existe → devolver: `⚠️ brand-check: foundation file missing: {path}. Pipeline puede continuar pero el dominio se salta.`

### Phase 3: CHECK

Aplicar los 4 dominios según la matriz de aplicabilidad ([checks.md](references/checks.md)). Cada dominio produce findings clasificados:

- ✅ **Aligned** — coincide con Foundation
- ⚠️ **Partial** — match parcial; ajuste recomendado
- ❌ **Misaligned** — contradice Foundation; fix requerido

### Phase 4: SCORE

Computar score 0-10 por dominio aplicable + score global ponderado:

| Score global | Verdict |
|--------------|---------|
| ≥ 9.0 | **PASS** — publicar |
| 7.0 – 8.9 | **NEEDS REVISION** — aplicar fixes y re-check |
| < 7.0 | **MAJOR ISSUES** — rework |

Pesos por defecto (ajustables por channel en [checks.md](references/checks.md)):
- Voice & Tone: 35%
- Messaging Consistency: 35%
- Visual Identity: 20% (cuando aplica; si no, redistribuir)
- SEO Basics: 10% (cuando aplica; si no, redistribuir)

### Phase 5: REPORT

Generar reporte siguiendo [report-template.md](references/report-template.md). Guardar en:

```
brand/{slug}/compliance/brand-check-{YYYY-MM-DD}-{asset-slug}.md
```

Devolver al pipeline:
1. Verdict (PASS / NEEDS REVISION / MAJOR ISSUES)
2. Score global
3. Action list priorizada
4. Path al reporte completo

---

## Mandatory Rules

1. **Cita evidencia siempre** — cada finding ❌ o ⚠️ debe citar (a) la línea/sección del asset y (b) la regla específica del Foundation file que rompe.
2. **Constructivo, no complaciente** — cada problema viene con un fix concreto sugerido.
3. **No reescribas el asset** — brand-check identifica problemas, no genera contenido nuevo. Devuelve action list, no draft alternativo.
4. **Coherencia con qa-bot** — si el asset tiene claims numéricos sin verificar, brand-check NO los valida (eso es qa-bot). Marca: `ℹ️ Claim numérico detectado — recomendar pasar por qa-bot`.
5. **Skip graceful** — dominios no aplicables o con Foundation file ausente se saltan con warning explícito en el reporte, no bloquean.
6. **Output determinista** — mismo asset + mismo Foundation = mismo reporte. Sin variaciones creativas.

## Comunicación durante ejecución

1. **Inicio**: `🛡️ brand-check sobre {asset} ({channel}, brand: {slug}). Aplicando {N} dominios...`
2. **Por dominio**: `📋 {dominio}: {N findings} (✅ {a} ⚠️ {b} ❌ {c})`
3. **Final**: `{verdict-emoji} brand-check: {VERDICT} ({score}/10). Reporte: {path}`
   - PASS → 🟢
   - NEEDS REVISION → 🟡
   - MAJOR ISSUES → 🔴
