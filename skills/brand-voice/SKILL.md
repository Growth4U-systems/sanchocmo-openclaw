---
name: brand-voice
description: "Define brand voice, tone, vocabulary, Do/Don't rules, and AI Brand Kit. Use when: codifying how the brand speaks for consistent content creation. Two modes: Quick (Layer 0, ~30min, from URL or 5 questions) produces Voice Snapshot; Full (Layer 4, ~2-3h, after ECPs + positioning) produces complete Voice Guide + AI Brand Kit + Per-ECP and Per-Channel adaptations. Quick mode MANDATORY before any content. Full mode adds ECP tone shifts, channel guidance, vocabulary rules, Do/Don't library, and 5-check Voice Test. NOT for: visual identity (use visual-identity), content creation (use content skills), or positioning strategy (use positioning-messaging)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '3.0'
  system: SanchoCMO
  phase: '1'
  pillar: brand-voice
  layer: 0+4
  depends_on: none (Quick) | niche-discovery-100x, positioning-messaging (Full)
  updated: '2026-02-27'
  changes: v3 — Restructured per skill-creator principles. SKILL.md lean (~130 lines). Concepts/questions in references.
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/go-to-market/positioning/*/*.current.md
# Lite fallbacks (read-only, treat as preliminary seed, not as final truth):
- brand/{slug}/company-brief/lite.md            # merge view fallback (always lite today)
- brand/{slug}/brand-voice/lite.md              # own seed from fast-foundation (hydration only)
context_writes:
- brand/{slug}/brand-voice/brand-voice.current.md
---

# Brand Voice

> Cómo habla la brand — codificado para consistencia. Quick Snapshot al inicio; Full Voice Guide + AI Brand Kit cuando ECPs y positioning estén listos.

**Input**: URL/materiales (Quick) | ECPs + positioning + content samples (Full)
**Output**: Voice Snapshot / AI Brand Kit → `brand/{slug}/brand-voice/brand-voice.current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | 6 pattern categories (Extract) + 15 Strategic Questions (Build) + Build Pipeline |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems Quick + Full mode |
| [concepts.md](references/concepts.md) | Si necesitas modos, AI Brand Kit spec, Voice Test | Definiciones, edge cases, Lite/Deep |
| [schema.md](references/schema.md) | Si necesitas el schema de campos | Estructura de datos completa |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### Quick Mode (Layer 0 — siempre primero)

1. **Elegir path**: URL disponible → Path A (scrape + extract) | Sin URL → Path B (5 Quick Questions)
2. **Analizar**: Patterns de voz (tono, vocabulario, POV, ritmo) + visual notes ligeras
3. **Generar Voice Snapshot**: 3 adjectives + tone spectrum + words USE/AVOID + Do/Don't pairs + examples by type + confidence level
4. **Presentar al usuario** para validación

### Full Mode (Layer 4 — cuando ECPs + positioning listos)

1. **Cargar inputs**: Voice Snapshot + ECPs seleccionados + Messaging Playbook + Positioning data + 3-5 content samples
2. **Elegir approach** según confidence del Snapshot: Extract (high) | Hybrid (medium) | Build (low)
3. **Extract**: Analizar 6 pattern categories (ver `references/prompt.md`)
   **Build**: Usar 15 Strategic Questions + Build Pipeline (ver `references/prompt.md`)
4. **Generar Voice Profile completo**: traits, tone spectrum (5 dims), vocabulary, rhythm, boundaries
5. **Per-ECP Adaptation**: tone shift + vocabulary + proof emphasis + channels por cada ECP
6. **Per-Channel Guidance**: tone flex + length + structure + example por canal activo
7. **Generar AI Brand Kit**: 2-3 páginas AI-loadable (Voice DNA + Do/Don't + Vocab + Rhythm + Channel ref + ECP cheat sheet)
8. **Voice Test**: 5 checks (recognizable, actionable, differentiated, authentic, consistent). Iterar 1-2 rondas.

### Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **0 ❌** antes de entregar
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### Guardar con versionado
- Ruta: `brand/{slug}/brand-voice/brand-voice.current.md`
- Backup + versionado + history.json
- Link: `<MC_BASE>/docs/brand/{slug}/brand-voice/brand-voice.current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Voice Snapshot (3 adj + tone) | ALL content skills |
| AI Brand Kit | ALL downstream — loaded before any content generation |
| Words USE/AVOID | Every piece of copy |
| Do/Don't library | Content quality checks, AI prompts |
| Per-ECP tone adaptation | positioning-messaging, outreach-workflow |
| Per-channel guidance | social-content, email-sequences, paid-ads |
| Light Visual Notes | visual-identity (input for deep visual work) |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
→ Escribe **"profundizar"** para continuar.
```

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/brand-voice/
├── brand-voice.current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt
2. Si existe `brand-voice.current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + `brand-voice.current.md` + `v1.md` + `history.json`
4. Link: `<MC_BASE>/docs/brand/{slug}/brand-voice/brand-voice.current.md`
