# Brand Check — Report Template

Estructura **obligatoria** del reporte generado en Phase 5. Guardado en:

```
brand/{slug}/compliance/brand-check-{YYYY-MM-DD}-{asset-slug}.md
```

---

## Template

```markdown
# Brand Check Report

**Asset**: `{ruta o descripción}`
**Channel**: {linkedin / blog / etc.}
**Brand**: {slug}
**Date**: YYYY-MM-DD
**Foundation snapshot**: {statuses de pilares leídos de GET /api/brand-brain/state}

---

## Veredicto: {🟢 PASS | 🟡 NEEDS REVISION | 🔴 MAJOR ISSUES}

**Score Global**: X/10

| Dominio | Score | Aplicado |
|---------|------:|:--------:|
| Voice & Tone | X/10 | ✅ |
| Messaging Consistency | X/10 | ✅ |
| Visual Identity | X/10 | ✅ / ❌ N/A |
| SEO Basics | X/10 | ✅ / ❌ N/A |

[1-2 frases de resumen ejecutivo]

---

## Voice & Tone (X/10)

### Findings

✅ **Aligned** ({N})
- *Cita del asset*: "..."
  *Anchor*: brand-voice.current.md → sección "..."
  *Por qué*: [breve razonamiento]

⚠️ **Partial** ({N})
- *Cita del asset*: "..."
  *Anchor*: brand-voice.current.md → "..."
  *Issue*: [qué falla]
  *Fix sugerido*: [reescritura concreta o ajuste]

❌ **Misaligned** ({N})
- *Cita del asset*: "..."
  *Anchor*: brand-voice.current.md → "..."
  *Issue*: [qué viola, ej. uso de palabra "don't"]
  *Fix sugerido*: [palabra/frase alternativa]

---

## Messaging Consistency (X/10)

### Findings

✅ **Aligned** ({N})
- *Claim del asset*: "..."
  *Anchor*: messaging-summary.md → UVP/USP "..."

⚠️ **Partial** ({N})
- *Claim del asset*: "..."
  *Issue*: [claim plausible pero no documentado en messaging-summary]
  *Fix sugerido*: [reformular hacia un UVP existente, o pedir actualización del messaging-summary]

❌ **Misaligned** ({N})
- *Claim del asset*: "..."
  *Anchor*: contradicción con [UVP X / claim prohibido / objection handling]
  *Issue*: [qué contradice]
  *Fix sugerido*: [eliminar, reformular, o consultar]

---

## Visual Identity (X/10)

> Solo presente si el dominio aplica al canal. Si no aplica: omitir sección y notar en la tabla `❌ N/A`.

### Findings

✅ **Aligned**
- Color palette: [hex codes usados] coinciden con tokens
- Typography: [fuentes] coinciden con jerarquía definida
- ...

⚠️ **Partial**
- ...

❌ **Misaligned**
- *Elemento*: "...".
  *Anchor*: visual-identity.current.md → "..."
  *Issue*: [color fuera de paleta, fuente no autorizada, logo deformado, etc.]
  *Fix sugerido*: [token correcto a aplicar]

---

## SEO Basics (X/10)

> Solo presente si el dominio aplica al canal.

### Findings

| Check | Estado | Detalle |
|-------|:------:|---------|
| Target keyword en H1 | ✅/⚠️/❌ | "..." |
| Target keyword en primer párrafo | ✅/⚠️/❌ | ... |
| Target keyword en URL slug | ✅/⚠️/❌ | ... |
| Meta description (140-160 chars + keyword) | ✅/⚠️/❌ | "{N} chars" |
| Title tag (≤60 chars + keyword) | ✅/⚠️/❌ | "{N} chars" |
| Heading hierarchy | ✅/⚠️/❌ | ... |
| Length apropiado | ✅/⚠️/❌ | "{N} palabras" |
| Internal links | ✅/⚠️/❌ | ... |

---

## Action List (priorizada)

### 🔴 Críticos (bloquean publicación)
1. [{Dominio}] {Issue corto} → {Fix concreto}
2. ...

### 🟡 Importantes (aplicar antes de publicar)
1. [{Dominio}] ... → ...

### 🟢 Nice to have (opcional)
1. [{Dominio}] ... → ...

---

## Notas adicionales

- **Claims numéricos detectados**: {sí/no}. {Si sí: "Recomendar pasar el asset por qa-bot vía deep-research para verificar fact-checks antes de publicar."}
- **Foundation files leídos**:
  - `brand/{slug}/brand-book/brand-voice/brand-voice.current.md`
  - `brand/{slug}/go-to-market/positioning/shared/messaging-summary.md`
  - {visual-identity / seo-guidelines si aplican}
- **Foundation files faltantes (saltados con warning)**: {lista o "ninguno"}

---

## Metadata

```json
{
  "skill": "brand-check",
  "version": "1.0",
  "agent": "rocinante",
  "asset": "...",
  "channel": "...",
  "brand": "...",
  "date": "YYYY-MM-DD",
  "verdict": "PASS | NEEDS REVISION | MAJOR ISSUES",
  "score_global": 8.4,
  "scores_per_domain": {
    "voice_tone": 9.0,
    "messaging": 8.0,
    "visual_identity": null,
    "seo_basics": null
  },
  "findings_count": { "aligned": 12, "partial": 3, "misaligned": 1 },
  "action_items": { "critical": 1, "important": 2, "nice_to_have": 0 }
}
```
```

---

## Reglas del template

1. **Una sección por dominio aplicable** — los no aplicables se marcan `❌ N/A` en la tabla del veredicto y se omiten del cuerpo.
2. **Cada finding ❌ o ⚠️ requiere**: cita del asset, anchor del Foundation file, issue, fix sugerido. Sin estos 4 campos el reporte está incompleto.
3. **El metadata JSON al final es obligatorio** — usado por dashboards y automation downstream para parsear veredictos.
4. **Sin emojis decorativos** — solo los de severidad (✅⚠️❌) y verdict (🟢🟡🔴).
5. **Citas literales**: si citas del asset, comillas dobles. Si citas del Foundation, comillas dobles + path. Sin paráfrasis.
