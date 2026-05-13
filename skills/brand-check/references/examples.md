# Brand Check — Examples

Dos ejemplos sintéticos para calibrar el output. Brand de referencia: **Growth4U** (consultora de growth para B2B SaaS). Foundation files mocked.

---

## Example 1 — PASS 🟢

### Input

**Asset**: LinkedIn post (post.md)
**Channel**: linkedin
**Brand**: growth4u

```
Hace 3 meses, un cliente de SaaS B2B nos pidió bajar CAC un 40% en un trimestre.

No teníamos magia. Teníamos sistema:

- Auditamos el funnel completo en 5 días
- Identificamos 3 fugas que costaban 12.000€/mes
- Cerramos 2, dejamos 1 por decisión estratégica
- Resultado: CAC -38% en 11 semanas

¿La parte que casi nadie habla?

Los primeros 5 días fueron 80% del valor. El resto, ejecutar lo obvio.

Si te suena raro tu CAC y crees que necesitas "más leads", probablemente tienes un problema de funnel. No de adquisición.

—

PD: ese 1 que dejamos abierto era un canal saliente con CAC alto pero con cuentas de €100K+ ARR. A veces el dato sin contexto miente.
```

### Foundation snippets relevantes

**brand-voice.current.md** (extracto):
- Tone: insider-vulnerable, coaching, dato-en-mano
- Do words: sistema, funnel, ejecutar, cuentas
- Don't words: magia, revolucionario, leverage, unlock, simple
- LinkedIn voice: primera persona, narrativa con dato concreto, una pausa "¿la parte que…?", PD opcional
- Voice test: ¿lo diría un growth lead senior a otro growth lead?

**messaging-summary.md** (UVP top):
- "Sistema repetible para reducir CAC y mejorar funnel en SaaS B2B sin contratar más SDRs"

### Reporte (extracto)

```
# Brand Check Report
**Asset**: post.md
**Channel**: linkedin
**Brand**: growth4u
**Date**: 2026-05-01

## Veredicto: 🟢 PASS
**Score Global**: 9.4/10

| Dominio | Score | Aplicado |
|---------|------:|:--------:|
| Voice & Tone | 9.5/10 | ✅ |
| Messaging | 9.3/10 | ✅ |
| Visual Identity | — | ❌ N/A |
| SEO Basics | — | ❌ N/A |

Asset alineado con voice y messaging de Growth4U. Listo para publicar.

## Voice & Tone (9.5/10)

✅ Aligned (5)
- "No teníamos magia. Teníamos sistema:"
  Anchor: brand-voice → tone "insider-vulnerable" + don't word "magia" usado contrastivamente
  (uso correcto: la don't word aparece para negarla, no para afirmar)
- "¿La parte que casi nadie habla?" — pausa típica del LinkedIn voice
- "PD: …" — formato PD opcional, bien usado para añadir matiz
- Primera persona narrativa con dato concreto (-38% en 11 semanas)
- Voice test: ✅ suena a growth lead senior

⚠️ Partial (1)
- "Si te suena raro tu CAC" — informal apropiado pero borderline coloquial
  Fix sugerido: ninguno crítico, mantener.

❌ Misaligned: 0

## Messaging Consistency (9.3/10)

✅ Aligned (3)
- "Sistema repetible" implicado en "Teníamos sistema" — anchor en UVP top
- "Auditamos el funnel completo en 5 días" — anchor en sistema repetible documentado
- "problema de funnel. No de adquisición" — coherente con positioning anti-"más leads"

⚠️ Partial: 0
❌ Misaligned: 0

## Action List (priorizada)
🔴 Críticos: ninguno
🟡 Importantes: ninguno
🟢 Nice to have: ninguno

## Notas
- Claims numéricos detectados: SÍ ("-38% en 11 semanas", "12.000€/mes", "5 días").
  Recomendar pasar por qa-bot si son datos verificables públicos. Si son datos
  internos del cliente, asegurar que el cliente autorizó la mención.
```

### Por qué PASS

- Tono coherente: insider, primera persona, dato concreto.
- Don't words usadas contrastivamente, no afirmativamente.
- Claims anclados en UVP.
- Sin pretender ser viral; honesto sobre la parte estratégica.

---

## Example 2 — NEEDS REVISION 🟡

### Input

**Asset**: LinkedIn post (post.md)
**Channel**: linkedin
**Brand**: growth4u

```
🚀 ¿Quieres revolucionar tu pipeline de ventas y unlock un crecimiento exponencial?

En Growth4U tenemos la solución mágica que ha transformado a más de 100 empresas SaaS. Nuestro framework propietario combina IA, machine learning y data science para entregar resultados que parecen magia.

Beneficios:
✅ +500% leads
✅ -80% CAC
✅ ROI garantizado en 30 días
✅ Sin esfuerzo

Reserva una demo y descubre cómo escalamos negocios que están estancados. ¡No te quedes atrás!

#growth #saas #ai #marketing #b2b
```

### Foundation snippets

Mismas que Example 1, **además**:
- **messaging-summary.md → claims prohibidos**: "ROI garantizado", "exponencial", "sin esfuerzo"
- **brand-voice.current.md → don't words**: revolucionar, magia, mágica, unlock, leverage, escalar (uso vacío)
- **LinkedIn voice → no hashtags en body** (máx 3 al final si hay)

### Reporte (extracto)

```
# Brand Check Report
**Asset**: post.md
**Channel**: linkedin
**Brand**: growth4u
**Date**: 2026-05-01

## Veredicto: 🔴 MAJOR ISSUES
**Score Global**: 3.2/10

| Dominio | Score | Aplicado |
|---------|------:|:--------:|
| Voice & Tone | 2.0/10 | ✅ |
| Messaging | 4.5/10 | ✅ |
| Visual Identity | — | ❌ N/A |
| SEO Basics | — | ❌ N/A |

Asset rompe múltiples reglas críticas de voice y contiene claims prohibidos.
NO publicar. Reescritura completa requerida.

## Voice & Tone (2.0/10)

❌ Misaligned (5)
- "🚀 ¿Quieres revolucionar tu pipeline…?"
  Anchor: brand-voice.current.md → don't word "revolucionar" + LinkedIn no hooks de hype
  Issue: don't word + tono opuesto al "insider"
  Fix sugerido: hook desde un dato concreto o pregunta honesta. Ej. "El 60% de los SaaS B2B tienen una fuga de funnel que vale más que su CAC. Aquí cómo encontrarla en 5 días."

- "unlock un crecimiento exponencial"
  Anchor: don't words "unlock" + "exponencial"
  Fix: eliminar.

- "solución mágica … resultados que parecen magia"
  Anchor: don't word "mágica/magia" usada afirmativamente
  Fix: describir el sistema con dato. "Sistema en 5 fases que ha bajado CAC entre 20-40% en 11 semanas en 12 cuentas SaaS."

- "framework propietario combina IA, machine learning y data science"
  Anchor: brand-voice → "evitar buzzword sandwich"
  Fix: nombrar 1-2 técnicas concretas en lugar de buzzwords.

- 5 hashtags en body
  Anchor: LinkedIn voice → "no hashtags in body, max 3 at very end"
  Fix: mover al final, reducir a 3 máx.

⚠️ Partial (2)
- "Reserva una demo" — CTA correcto pero contexto de hype debilita.
- "¡No te quedes atrás!" — FOMO genérico. Brand-voice prefiere CTA con razón.

✅ Aligned: 0

## Messaging Consistency (4.5/10)

❌ Misaligned (3)
- "ROI garantizado en 30 días"
  Anchor: messaging-summary.md → claims prohibidos
  Issue: claim prohibido (legal/regulatorio en consultoría B2B).
  Fix: eliminar. Sustituir por "ROI medible típicamente en X-Y semanas según baseline".

- "Sin esfuerzo"
  Anchor: messaging-summary.md → claims prohibidos
  Issue: claim prohibido + contradice positioning de "sistema requiere ejecución".
  Fix: eliminar.

- "+500% leads / -80% CAC"
  Anchor: messaging-summary.md → "evitar números agregados sin contexto"
  Issue: claim sin caso/contexto, plausibilidad baja, riesgo regulatorio.
  Fix: reemplazar por dato específico de un caso real con anchor.

⚠️ Partial (1)
- "100 empresas SaaS" — claim cuantitativo sin verificación pública.
  Fix: verificar número real con qa-bot, o reformular como "decenas".

✅ Aligned: 0

## Action List (priorizada)

🔴 Críticos
1. [Messaging] Eliminar "ROI garantizado en 30 días" — claim prohibido.
2. [Messaging] Eliminar "sin esfuerzo" — claim prohibido.
3. [Voice] Eliminar todas las don't words: revolucionar, unlock, mágica, magia, exponencial.
4. [Voice] Reescribir hook desde un dato concreto, no desde hype.

🟡 Importantes
1. [Voice] Mover hashtags al final, reducir a 3 máx.
2. [Messaging] Reemplazar números agregados por caso real con anchor.
3. [Voice] Sustituir buzzword sandwich (IA + ML + data science) por descripción concreta.

🟢 Nice to have
1. [Voice] CTA con razón en lugar de FOMO genérico.

## Notas
- Claims numéricos detectados: SÍ. Si tras reescritura quedan claims con número
  ("+500%", "100 empresas", "30 días"), MUY recomendable pasar por qa-bot.
- Sospecha de generación AI sin grounding en Foundation. Recomendar regenerar el
  draft con social-writer leyendo brand-voice + messaging-summary explícitamente.
```

### Por qué MAJOR ISSUES

- 5 don't words afirmativas.
- 2 claims prohibidos (ROI garantizado, sin esfuerzo).
- Tono opuesto al insider-vulnerable definido.
- Cero anchors en messaging-summary.
- Una ❌ crítica (claim prohibido) ya forzaría NEEDS REVISION; aquí hay 2 + colapso de voice → MAJOR ISSUES.

---

## Cómo usar estos ejemplos

Antes de entregar tu reporte, escanea estos dos ejemplos:
- ¿Tu reporte cita evidencia (cita + anchor) en cada finding ❌/⚠️ como en los ejemplos?
- ¿Tu action list está priorizada con dominio entre brackets?
- ¿Tu metadata JSON al final está completo?
- Si todo es ✅, no inventes problemas para parecer riguroso. Un PASS con findings ✅ documentados es perfectamente válido (Example 1).
