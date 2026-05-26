# Clarify Protocol

> Flujo Clarify-en-redaccion. Compartido por todos los writers
> (social-writer, seo-content, newsletter). NUNCA se salta.

---

## Principio

Clarify es el paso donde el humano confirma o ajusta la direccion de una
pieza ANTES de que el writer genere el draft. Existe porque:

1. **Reduce reescrituras** — mejor preguntar 2 cosas que rehacer el draft
2. **Captura POV** — el POV se decide POR PIEZA, no por pillar
3. **Construye POV Bank** — cada Clarify se guarda en Neon (`pov_clarify_patterns`
   / `pov_evidence_items`) para que el sistema aprenda patrones

## Flujo

### 1. Writer recibe idea aprobada

```json
{
  "pillar_id": "P1",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": { "summary": "...", "source": "...", "url": "..." },
  "angle_draft": "..."
}
```

### 2. Writer genera predicciones

Para cada pregunta, el writer genera UNA prediccion con un score de
confianza (0.0 - 1.0):

```
Pregunta 1: Angulo principal
  Prediccion: "Contrarian — 'Esto no es AI reemplaza marketers, es que
  marketers entry-level eran como se entrenaba la proxima generacion'"
  Confianza: 0.82

Pregunta 2: Tono especifico para esta pieza
  Prediccion: "Insider vulnerable — compartir experiencia de cuando
  tuvimos que hacer ese cambio en Bnext"
  Confianza: 0.65

Pregunta 3: CTA
  Prediccion: "Sin CTA explicito — engagement-driven (pregunta abierta)"
  Confianza: 0.91
```

### 3. Humano confirma o ajusta

- **Confianza alta (>0.75)**: la prediccion ya es buena. Humano confirma
  con 1 click o ajusta con pocas palabras.
- **Confianza baja (<0.75)**: pregunta mas abierta. Humano contesta con
  mas detalle.

**En AMBOS casos el humano pasa por el step.** Confianza alta = mejores
predicciones, NO skip.

### 4. Writer genera draft con las respuestas

### 5. Guardar en POV Bank

Persistir en Neon:

```json
{
  "date": "2026-04-25",
  "pillar_id": "P1",
  "channel": "linkedin",
  "content_type": "Hot Take",
  "clarify_responses": {
    "angle": "Contrarian — entry-level pipeline",
    "tone": "Insider vulnerable — experiencia Bnext",
    "cta": "Pregunta abierta sin CTA"
  },
  "prediction_accuracy": {
    "angle": 0.82,
    "tone": 0.65,
    "cta": 0.91
  },
  "human_adjusted": ["tone"]
}
```

## Preguntas tipicas por canal

**LinkedIn**: angulo, tono, CTA, longitud (short vs long-form)
**X/Twitter**: hook type (contrarian/proof/discovery), formato (thread vs tweet), tone level
**Blog SEO**: keyword target, estructura (hub vs spoke vs template), gating (LM or not)
**Newsletter**: tema central, tone (teaching vs storytelling vs digest), CTA principal

## Reglas

- **NUNCA saltarse Clarify.** Incluso si confianza es 0.99.
- **Max 3 preguntas.** Mas de 3 genera friccion.
- **Predicciones SIEMPRE.** Nunca preguntas vacias sin prediccion.
- **Cada Clarify se guarda en Neon.** Sin excepcion. El POV Bank depende de esto.
- **No usar `clarify-history.json` ni `pov-bank.json` como source of truth.**

## Persistencia automatica hacia POV Bank

- Al guardar `content/drafts/{ideaId}/clarify.md` via `PATCH /api/content-engine/drafts`, MC ejecuta `reconcileClarifyToPovBank(slug, { ideaId })`.
- Cada respuesta humana se convierte en `pov_evidence_items` (`source_type=clarify`, `status=active`) y en `pov_clarify_patterns`.
- El `pillar_id`, canal, content_type, angle y path original se guardan en `source_ref` para que Writer pueda citar ejemplos concretos sin volver al JSON.
- Para reconciliar manualmente todo el cliente: `POST /api/content-engine/pov-bank` con `{ "slug": "{slug}", "sources": ["clarify"] }`.
