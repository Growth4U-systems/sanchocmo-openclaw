# Visual Identity — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Quick Mode (Layer 0)

### Path A (URL) o Path B (preguntas)
- [ ] **Fuente de datos definida** (URL analizado O 5 Quick Questions respondidas)

### Visual Snapshot
- [ ] **3 visual adjectives** definidos
- [ ] **Color Palette** capturada (primary, secondary, accent con hex)
- [ ] **Typography** documentada (style, observed fonts)
- [ ] **Imagery Style** definido (type + mood)
- [ ] **Logo Notes** capturadas (si existe logo)
- [ ] **Lite Visual World** (3-5 objetos que aparecen en brand visuals)
- [ ] **Overall Aesthetic** descrito (1-2 frases)
- [ ] **Design Tokens (lite)** generados en JSON
- [ ] **Confidence level** marcado (High/Medium/Low)
- [ ] **Gaps para Full mode** identificados

---

## Full Mode (Layer 4) — si brand-voice + ECPs listos

### Input Verification
- [ ] **Visual Snapshot** del Quick mode cargado
- [ ] **brand-voice AI Brand Kit** cargado (para alignment)
- [ ] **ECPs seleccionados** con personas
- [ ] **Positioning data** cargada

### Step 0: Style Direction Discovery
- [ ] **8 estilos mostrados** al usuario
- [ ] **Selección del usuario** documentada (single, hybrid, custom, extract)
- [ ] **Estilo seleccionado** como foundation para Layer 3

### Layer 1: Visual World Definition
- [ ] **5-7 object categories** propuestas y validadas por usuario
- [ ] **Exclusiones** definidas (qué NUNCA debe aparecer)
- [ ] **visual-world.md** generado
- [ ] **Validación**: "para imagen de blog sobre X, ¿qué objetos usarías?"

### Layer 2: Idea-to-Visual Mapping
- [ ] **Decision tree** construido (content type → core idea → visual metaphor → objects)
- [ ] **Mappings por content type** definidos (blog vs landing vs social)
- [ ] **idea-mapping.md** generado
- [ ] **Validación**: "para post sobre X, ¿qué ilustrarías y por qué?"

### Layer 3: Aesthetic Guidelines
- [ ] **References-first approach** seguido (minimizar generación costosa)
- [ ] **Step 3.1-3.3** ejecutados (user references → Step 0 examples → web search)
- [ ] **Aesthetic specifications** codificadas (7 dimensiones)
- [ ] **AI prompt library** generada (base + keywords + negatives)
- [ ] **1-2 samples validados** (máximo 2-3 generaciones)
- [ ] **visual-style.md** generado
- [ ] **Coste total ≤ €3** (2-3 imágenes máximo)
- [ ] **Iteration criteria met**: flexible, distinctive, consistent, scalable

### Child Skill Generation
- [ ] **Readiness verified** (3 layers complete + user approved + AI Brand Kit available)
- [ ] **[brand]-ui-system** generado e instalado en .claude/skills/
- [ ] **[brand]-visual-generator** generado e instalado
- [ ] **[brand]-deck-creator** generado (si solicitado)
- [ ] **Cada child skill** tiene YAML frontmatter válido
- [ ] **Files requeridos** existen (scripts, references, assets)
- [ ] **Usage examples** generados por child skill

### Visual DNA Kit
- [ ] **Visual Personality** (core aesthetic, design emotion, differentiation)
- [ ] **Visual World Inventory** quick-ref (core objects, scenes, exclusions)
- [ ] **Idea Mapping** quick-ref (content type → visual approach)
- [ ] **Aesthetic Specifications** summary (style, colors, typography, AI prompts)
- [ ] **Design Tokens** JSON completo
- [ ] **Accessibility compliance** (WCAG 2.2 AA, contrast ratios, color-blind safe)
- [ ] **Visual Do's / Don'ts** (5+ pares)

## Output

- [ ] **Summary generado** (Visual Snapshot o Visual DNA Kit según modo)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/visual-identity/current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada decisión visual tiene justificación** (no arbitraria)
- [ ] **Alignment con brand-voice** verificado (visual expresa la personalidad de voz)
- [ ] **Design tokens** son utilizables (JSON válido)
- [ ] **Child skills funcionan** (test invocation passed)
- [ ] **Coste de generación controlado** (≤ €3 target)
- [ ] **Coherencia con brand files** (company-context, positioning)

---

## Flujo de uso

```
1. Agente ejecuta Quick mode (siempre)
2. Si Full mode triggers → ejecutar Step 0 + 3 Layers + Child Generation
3. Al terminar, lee este checklist
4. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — completar
5. Si hay ❌ → completar
6. Test child skills si generados
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
