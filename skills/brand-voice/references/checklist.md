# Brand Voice — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Quick Mode (Layer 0) — OBLIGATORIO

### Path A (URL) o Path B (preguntas)
- [ ] **Fuente de datos definida** (URL analizado O 5 Quick Questions respondidas)
- [ ] **Voice patterns extraídos** (tono, vocabulario, POV, ritmo)

### Voice Snapshot
- [ ] **3 adjectives** que definen la voz
- [ ] **Tone Spectrum** posicionado (Formal↔Casual, Serious↔Playful, Simple↔Technical)
- [ ] **Signature patterns** identificados (2-3 elementos distinctivos)
- [ ] **Words to USE** (5-10 palabras/frases on-brand)
- [ ] **Words to AVOID** (5-10 palabras/frases off-brand)
- [ ] **Do This / Not That** pairs (3+ pares con ejemplo on-brand vs off-brand)
- [ ] **Example per content type** (social post, email subject, landing page headline)
- [ ] **Visual Notes** capturadas (colors, typography, image style, overall feel)
- [ ] **Confidence level** marcado (High/Medium/Low)

---

## Full Mode (Layer 4) — si ECPs y positioning listos

### Input Verification
- [ ] **Voice Snapshot** del Quick mode cargado
- [ ] **ECPs seleccionados** cargados con personas y JTBDs
- [ ] **Messaging Playbook** por ECP cargado
- [ ] **Positioning data** cargada (diferenciadores, opportunity zones)

### Extract or Build
- [ ] **Modo elegido** (Extract/Build/Hybrid) basado en confidence del Snapshot
- [ ] **3-5 content pieces** analizados (si Extract) O **15 Strategic Questions** respondidas (si Build)
- [ ] **6 pattern categories** analizadas (si Extract)

### Complete Voice Profile
- [ ] **Personality traits** definidos (3-4 core traits con descripción)
- [ ] **Tone spectrum** completo (5 dimensiones con posiciones)
- [ ] **Vocabulary rules** establecidas (USE + AVOID con contexto, 10-15 cada una)
- [ ] **Rhythm patterns** definidos (sentences, paragraphs, openings)
- [ ] **Do This / Not That library** completa (5-10 pares con razonamiento)
- [ ] **Boundaries** explícitas (qué NUNCA hacer)

### AI Brand Kit (KEY deliverable)
- [ ] **Voice DNA** resumido (personality, tone, POV, relationship)
- [ ] **Do/Don't table** (5-10 pares con Why)
- [ ] **Vocabulary Rules** condensadas
- [ ] **Rhythm rules** condensadas
- [ ] **Channel Quick-Reference** (por cada canal activo)
- [ ] **Per-ECP Cheat Sheet** (tone shift, key vocab, proof style por ECP)

### Per-ECP Tone Adaptation
- [ ] **Tone shift** definido por ECP (qué dimensiones se mueven)
- [ ] **Vocabulary shift** por ECP (términos específicos +/-)
- [ ] **Proof emphasis** por ECP (qué trust signals importan)
- [ ] **Example headline** por ECP

### Per-Channel Guidance
- [ ] **Guidance definida** por cada canal activo (tone flex, length, structure, example)
- [ ] **Solo canales relevantes** incluidos (skip irrelevantes)

### Voice Test (5 checks)
- [ ] **Recognizable**: ¿se identifica como "suyo" sin byline?
- [ ] **Actionable**: ¿un writer puede producir on-brand solo con el AI Brand Kit?
- [ ] **Differentiated**: ¿suena diferente a competidores?
- [ ] **Authentic**: ¿se siente verdadero a quienes son?
- [ ] **Consistent**: ¿se aplica cross-format (social, email, landing, ad)?
- [ ] **1-2 rounds de iteración** completados

## Output

- [ ] **Summary generado** (personalidad, tono dominante, diferenciador de voz, adaptaciones por ECP)

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/brand-voice/brand-voice.current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada pattern tiene fuente** (extracted from URL, user input, content analysis)
- [ ] **0 patrones inventados** — todos basados en evidencia real
- [ ] **Coherencia** voz ↔ positioning (voice apoya el posicionamiento)
- [ ] **AI Brand Kit es AI-loadable** (2-3 páginas, formato limpio)
- [ ] **Ejemplos son nativos** por idioma (no traducciones)
- [ ] **Per-ECP adaptations** son coherentes con ECPs y messaging playbook

---

## Flujo de uso

```
1. Agente ejecuta Quick mode (siempre)
2. Si Full mode triggers → ejecutar Full mode completo
3. Al terminar, lee este checklist
4. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — completar
5. Si hay ❌ → completar
6. Ejecutar Voice Test (5 checks)
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
