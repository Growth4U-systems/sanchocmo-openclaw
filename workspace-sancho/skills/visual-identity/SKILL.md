---
name: visual-identity
description: "Visual identity meta-skill: defines how brand LOOKS and generates production child skills. Use when: establishing visual identity system for a client. Two modes: Quick (Layer 0, ~30min) produces Visual Snapshot from URL/questions; Full (Layer 4, ~2-3h) runs Step 0 style discovery + 3-layer build (Visual World, Idea Mapping, Aesthetic) + generates 2-3 child skills ([brand]-ui-system, [brand]-visual-generator, [brand]-deck-creator). Follows Brian Castle's proven workflow. Cost-conscious: references-first approach, €1-3 generation budget. NOT for: creating images directly (use generated child skills), brand voice (use brand-voice), or content creation."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: visual-identity
  layer: 0+4
  type: meta-skill
  depends_on: none (Quick) | brand-voice, niche-discovery-100x, positioning-messaging (Full)
  updated: '2026-02-27'
  changes: v2 — Restructured per skill-creator principles. SKILL.md lean (~140 lines). Concepts/questions in references.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/brand-voice/current.md
- brand/{slug}/go-to-market/positioning/*/current.md
context_writes:
- brand/{slug}/brand-identity/visual-identity/current.md
- brand/{slug}/operational/assets.md
---

# Visual Identity (Meta-Skill)

> Define cómo se ve la brand y genera skills de producción para crear visuales a escala. Meta-skill: no crea imágenes — crea los SKILLS que crean imágenes.

**Input**: URL/materiales (Quick) | brand-voice AI Brand Kit + ECPs + positioning (Full)
**Output**: Visual Snapshot / Visual DNA Kit + Child Skills → `brand/{slug}/visual-identity/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | 15 Strategic Questions + 9-step Build Pipeline + Extract categories |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems Quick + Full + child generation |
| [concepts.md](references/concepts.md) | Si necesitas arquitectura, Layer details, edge cases | Meta-skill design, Brian Castle, modes |
| [schema.md](references/schema.md) | Si necesitas el schema de campos | 14 sections, Tier 1/2/3 storage |
| [visual-world.md](references/visual-world.md) | Layer 1 template | Object inventory template |
| [idea-mapping.md](references/idea-mapping.md) | Layer 2 template | Content type → visual mapping |
| [visual-style.md](references/visual-style.md) | Layer 3 template | Aesthetic specifications |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### Quick Mode (Layer 0 — siempre primero)

1. **Elegir path**: URL → Path A (scrape + extract) | Sin URL → Path B (5 Quick Questions — ver `references/concepts.md`)
2. **Extraer**: Color palette, typography, imagery style, logo notes, lite visual world (3-5 objects)
3. **Generar Visual Snapshot**: 3 visual adjectives + palette + typography + imagery + design tokens lite + confidence
4. **Presentar** para validación

### Full Mode (Layer 4 — cuando brand-voice + ECPs listos)

1. **Cargar inputs**: Visual Snapshot + brand-voice AI Brand Kit + ECPs + Positioning
2. **Step 0 — Style Direction Discovery**: Mostrar 8 estilos de ejemplo, usuario elige (ver `references/concepts.md`)
3. **Layer 1 — Visual World**: 5-7 object categories + scenes + exclusiones → `references/visual-world.md`
4. **Layer 2 — Idea Mapping**: Decision tree content type → visual concept → objects → `references/idea-mapping.md`
5. **Layer 3 — Aesthetic** (COST-CONSCIOUS):
   - User references (free) → Step 0 examples (free) → web search (free) → generate 1-2 validation samples
   - Codify 7 dimensions + AI prompt library → `references/visual-style.md`
   - **Target: ≤ €3** (2-3 images max)
6. **Generate Child Skills**:
   - Verify 3 layers complete + user approved
   - `[brand]-ui-system` → from ui-system template + brand tokens
   - `[brand]-visual-generator` → from visual-generator template + 3 layer files
   - `[brand]-deck-creator` → optional, ask user
   - Verify each: YAML valid, files exist, test invocation
7. **Assemble Visual DNA Kit**: 2-3 page AI-loadable doc (personality, world, mapping, aesthetic, tokens, accessibility, do's/don'ts)

### Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **0 ❌** antes de entregar
- Verify child skills loadable + generation test
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### Guardar con versionado
- Ruta: `brand/{slug}/visual-identity/current.md`
- Backup + versionado + history.json
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/visual-identity/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Visual Snapshot | Quick reference for early content |
| Visual DNA Kit | landing-pages, social-content, email-sequences, paid-ads |
| Visual World inventory | Generated child skills (object selection) |
| Idea Mapping tree | Generated child skills (what to illustrate) |
| Aesthetic + AI prompts | Generated child skills (how to generate) |
| Design Tokens (JSON/CSS) | Generated child skills (web/UI styling) |
| **[brand]-ui-system** | User invokes for web pages |
| **[brand]-visual-generator** | User invokes for images |

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
brand/{{slug}}/visual-identity/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt
2. Si existe `current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/visual-identity/current.md`
