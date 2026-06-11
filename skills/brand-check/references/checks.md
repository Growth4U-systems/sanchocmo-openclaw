# Brand Check — Los 4 Dominios

Aplicados en Phase 3 (CHECK). Cada dominio tiene: aplicabilidad por canal, qué Foundation file consulta, qué busca, y prompts de verificación concretos.

---

## Matriz de Aplicabilidad

| Channel | Voice & Tone | Messaging | Visual Identity | SEO Basics |
|---------|:---:|:---:|:---:|:---:|
| linkedin | ✅ | ✅ | — | — |
| twitter | ✅ | ✅ | — | — |
| instagram | ✅ | ✅ | ✅ | — |
| tiktok | ✅ | ✅ | ✅ | — |
| email | ✅ | ✅ | — | — |
| newsletter | ✅ | ✅ | — | — |
| blog | ✅ | ✅ | — | ✅ |
| seo | ✅ | ✅ | — | ✅ |
| youtube | ✅ | ✅ | ✅ | ✅ |
| guest-post | ✅ | ✅ | — | ✅ |
| direct-response | ✅ | ✅ | — | — |
| frontend | ✅ | ✅ | ✅ | ✅ |
| slides | ✅ | ✅ | ✅ | — |
| ad | ✅ | ✅ | ✅ | — |
| image | — | ✅ | ✅ | — |

Si un canal no está en la tabla, aplicar **Voice & Tone + Messaging** por defecto.

---

## Dominio 1: Voice & Tone

**Foundation file**: `brand/{slug}/brand-book/brand-voice/brand-voice-current.md`

**Qué busca:**
- Tono coherente con el documento (ej. insider-vulnerable, coaching, data-driven, provocativo)
- Vocabulario do/don't respetado
- Per-channel guides aplicados (LinkedIn ≠ Twitter ≠ Email)
- Voice test pasado (si el brand-voice define uno, ej. "¿lo diría así un colega senior?")

**Prompts de verificación (aplicar cada uno como sub-check):**

1. **Tone match** — Lee el "tone" definido en brand-voice. Lee el primer párrafo del asset. ¿Suenan al mismo "narrador"? Cita la frase del asset que mejor (o peor) refleja el tono.
2. **Vocabulary do/don't** — Para cada palabra/frase de la lista "don't" del brand-voice, buscar en el asset (case-insensitive). Cada match es ❌. Para palabras "do" ausentes en el asset, marcar ⚠️ solo si el asset es largo (>200 palabras).
3. **Per-channel adaptation** — Si brand-voice tiene "LinkedIn voice" / "Twitter voice" específicos, contrastar contra el `channel` del QA REQUEST. Mismatch = ⚠️ o ❌ según severidad.
4. **Voice test** — Si el documento tiene un voice test explícito ("¿X o Y?"), aplicarlo al asset.
5. **Forbidden patterns** — Cliché corporativo, hype excesivo, jerga genérica (`leverage`, `synergy`, `unlock`, `revolutionary`) → ⚠️ por defecto.

**Severidad:**
- ❌ — uso de palabra explícitamente "don't" del brand-voice, o tono opuesto al definido
- ⚠️ — vocabulario neutro cuando se podría haber usado un "do", o tono medio-acertado
- ✅ — match claro

**Score (0-10):**
- 10: cero ❌, máx 1 ⚠️
- 7-9: 1-2 ❌ menores o varios ⚠️
- 4-6: ≥3 ❌ o tono claramente incorrecto
- 0-3: tono opuesto o múltiples palabras "don't"

---

## Dominio 2: Messaging Consistency

**Foundation files**:
- `brand/{slug}/go-to-market/positioning/shared/messaging-summary.md` (UVPs, USPs, claims aprobados)
- `brand/{slug}/go-to-market/positioning/ecp{N}-*/..-current.md` (cuando el asset apunta a un ECP específico)

**Qué busca:**
- Claims del asset coherentes con UVPs/USPs aprobados
- Cero contradicciones con positioning establecido
- Objection handling alineado (si el asset menciona objeciones)
- Per-ECP messaging si el asset target es específico

**Prompts de verificación:**

1. **UVP alignment** — ¿El asset hace algún claim que contradiga los UVPs del messaging-summary? Listar todo claim conflictivo con cita.
2. **USP coherence** — Si el asset menciona "diferenciadores" o "qué nos hace únicos", ¿coinciden con los USPs definidos? Cualquier divergencia = ⚠️ o ❌.
3. **Forbidden claims** — Algunos brands tienen "claims que NO podemos hacer" (ej. legales, regulatorios). Buscar coincidencias.
4. **Objection handling** — Si el asset reconoce/refuta objeciones, contrastar contra el objection handling del messaging-summary. Off-script = ⚠️.
5. **Per-ECP fit** — Si el `channel` o el contexto sugieren ECP target, leer ese ECP-positioning. Lenguaje, prioridades y JTBD deben coincidir.

**Severidad:**
- ❌ — claim que contradice positioning, claim prohibido (legal/regulatorio), objection handling opuesto
- ⚠️ — claim plausible pero no en messaging-summary, USP no documentado, mismatch parcial con ECP
- ✅ — claims son subset del messaging-summary

**Score (0-10):**
- 10: todos los claims tienen anchor en messaging-summary
- 7-9: 1-2 claims sin anchor (⚠️) pero ningún contradictorio
- 4-6: 1 claim contradictorio o ≥3 ⚠️
- 0-3: claim prohibido o múltiples contradicciones con positioning

---

## Dominio 3: Visual Identity

**Foundation file**: `brand/{slug}/brand-book/visual-identity/visual-identity-current.md` (+ `design-tokens.json` si existe)

**Aplicabilidad**: solo cuando el asset tiene componente visual (image, slide, frontend, ad, instagram, tiktok, youtube). Para canales puramente texto (linkedin/twitter/email/etc.), saltar este dominio.

**Qué busca:**
- Paleta de colores correcta (hex codes definidos)
- Typography correcta (fuentes y jerarquía)
- Logo usage (clear space, variantes correctas, contraste)
- Image style (filters, treatments, composición)
- Icon style (outline vs fill, weight)

**Prompts de verificación:**

1. **Color palette** — ¿Los hex codes principales del asset coinciden con los definidos en visual-identity? (Si el asset es texto-descriptivo del visual, basta con que mencione los colores correctos.)
2. **Typography** — ¿Fuentes coinciden? ¿Jerarquía (H1/H2/body) respeta los tokens?
3. **Logo** — ¿Hay logo? Verificar variante (color/blanco/negro), clear space, posición.
4. **Image style** — ¿Filtros, composición, mood coinciden con los moodboards/ejemplos del visual-identity?
5. **Iconografía** — ¿Estilo (outline vs solid, grosor) coherente?

**Severidad:**
- ❌ — color fuera de paleta usado como primario, fuente no autorizada, logo deformado o mal aplicado
- ⚠️ — color secundario/neutral fuera de paleta, fuente correcta pero jerarquía incorrecta
- ✅ — todo dentro de tokens

**Score (0-10):**
- 10: cero violaciones
- 7-9: 1-2 ⚠️ menores
- 4-6: 1 ❌ visible
- 0-3: marca irreconocible o múltiples ❌

---

## Dominio 4: SEO Basics

**Foundation file**: `brand/{slug}/brand-book/seo-guidelines.md` (si no existe, saltar dominio con warning).

**Aplicabilidad**: solo canales web (blog, seo, guest-post, youtube si tiene descripción/title SEO, frontend de landing pages).

**Qué busca:**
- Target keyword en H1, primer párrafo, y URL slug
- Meta description (length 140-160 chars, incluye keyword)
- Title tag (length ≤60 chars, incluye keyword)
- Internal linking básico (si el asset es blog largo)
- Heading hierarchy lógica (no saltos H1 → H3)

**Prompts de verificación:**

1. **Keyword presence** — ¿El target keyword (debe venir en el QA REQUEST o inferirse del asset) está en H1? ¿En primer párrafo? ¿En URL slug?
2. **Meta lengths** — Title tag y meta description dentro de límites.
3. **Heading hierarchy** — Lectura H1 → H2 → H3 sin saltos.
4. **Length appropriate** — Para blog: ≥800 palabras según seo-guidelines (o el límite que defina ese brand). Para landing: depende.
5. **Internal links** — Para blog largo: ≥1 link interno relevante. ⚠️ si no.

**Severidad:**
- ❌ — keyword ausente en H1, meta description >160 chars o ausente, title >60 chars
- ⚠️ — keyword falta en primer párrafo, jerarquía con saltos, length por debajo del mínimo
- ✅ — todo correcto

**Score (0-10):**
- 10: cero violaciones
- 7-9: 1-2 ⚠️
- 4-6: 1 ❌
- 0-3: SEO básicamente roto (sin keyword en H1, sin metas)

---

## Score Global (Phase 4)

Pesos por defecto:
- Voice & Tone: 35%
- Messaging: 35%
- Visual Identity: 20% (si aplica)
- SEO Basics: 10% (si aplica)

Si un dominio no aplica, redistribuir su peso proporcionalmente entre los aplicables.

**Verdicts:**
- ≥ 9.0 → **PASS**
- 7.0 – 8.9 → **NEEDS REVISION**
- < 7.0 → **MAJOR ISSUES**

Una sola ❌ en un dominio crítico (claim prohibido, palabra "don't" explícita, logo mal aplicado) **fuerza NEEDS REVISION mínimo**, independiente del score global.
