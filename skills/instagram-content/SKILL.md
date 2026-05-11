# instagram-content — Skill de Sancho

> Genera contenido nativo de Instagram: captions, carruseles (slides), reel scripts y stories a partir de un artículo de blog o topic.

## Media Persistence (obligatorio)

Esta skill cumple `_system/media-persistence-protocol.md`. Reglas duras:

- **Nunca** afirmar "carrusel generado" / "imagen lista" / "slide creado"
  sin URL real devuelta por un endpoint. Si solo describes un concepto,
  di "te propongo este concepto, ¿lo genero?".
- Persistir media via `POST /api/content-engine/generate-image`,
  `/api/content-engine/render-carousel` (carruseles HTML→PNG/PDF) o
  `/api/content-engine/upload-media`. **Nunca** editar `frontmatter.media`
  a mano con Edit/Write.
- **Nunca** escribir `status:` (de ningún tipo) al frontmatter del draft.
  Ese campo fue eliminado: la fase vive en `tasks.json` bajo
  `ContentTask.channel_phases[<canal>]`. Para reportarla:
  ```bash
  curl -fsS -X PATCH "$MC_BASE/api/content-engine/content-tasks" \
    -H "Content-Type: application/json" \
    -d '{"slug":"<slug>","parentTaskId":"<pid>","id":"<ctid>","channel_phases":{"<channel>":"draft"}}'
  ```
  El writer-trigger te da los IDs y los curl ya construidos.

## Trigger
Cuando el usuario pide crear contenido para Instagram, generar posts de IG, crear carruseles, escribir captions, o preparar contenido social para IG.

## Prerequisitos
- Idea aprobada con `signal + angle_draft + target_channel: instagram` (Content Engine flow), O artículo de blog / keyword (modos legacy)
- `brand_voice` del cliente: `brand/{slug}/brand-book/brand-voice/brand-voice.current.md`
- Pillars + POV: `brand/{slug}/content/content-pillars.md` + `brand/{slug}/content/pov-bank.json`
- Strategy guardrails: `brand/{slug}/content/strategy-decisions.md`
- ECPs (opcional): `brand/{slug}/go-to-market/ecps/current.md`

## Pipeline

### Paso 1: Obtener Input
```
SI hay artículo de blog → usar como fuente (atomizer mode)
SI no hay artículo → usar keyword/topic directamente (standalone mode)
```

### Paso 2: Leer Brand Voice + Pillars + POV
```python
brand_voice = read(f"brand/{slug}/brand-book/brand-voice/brand-voice.current.md")
pillars = read(f"brand/{slug}/content/content-pillars.md")
pov_bank = read_json(f"brand/{slug}/content/pov-bank.json")
strategy = read(f"brand/{slug}/content/strategy-decisions.md")
ecps = read(f"brand/{slug}/go-to-market/ecps/current.md")  # opcional
```

### Paso 2.5: Deep Research (ALWAYS — pre-step before Clarify)

Invoca el skill `deep-research` con `angle_draft` + `signal.url` + `signal.summary`. Verifica el dato del signal y trae stats/quotes/ejemplos adyacentes. Captura todo en un `research_pack` object para alimentar Clarify y el draft.

Skip SOLO si el signal es `personal-story` puro y no hay nada externo a verificar — registra `research_pack: { skipped: true, reason: "personal-story" }`.

### Paso 2.6: Clarify (ALWAYS — see _system/clarify-protocol.md)

Genera 2-3 preguntas con predictions + confidence (formato Clarify Protocol):
- **Angle** — qué encuadre del topic encaja mejor con la audiencia IG (relatable / aspirational / behind-the-scenes / educational)
- **Visual hint** — qué tipo de imagen/carousel anclará el caption (foto producto, cita en card, antes/después, screenshot, frame video, etc.)
- **CTA** — comment-bait pregunta / save-this-post / link in bio / DM word

Presenta al humano. Espera confirmación o ajuste. NUNCA saltar.

Guarda el resultado en `brand/{slug}/content/clarify-history.json`.

### Paso 3: Generar Contenido

#### 3a. Caption Post (imagen única)
Prompt al LLM:
```
Genera un caption de Instagram para {marca}.
Topic: {topic}
Target: {ecp_description}
Brand voice: {brand_voice_summary}

Formato de salida:
- Hook (primera línea que engancha, máx 125 chars)
- Body (3-5 párrafos cortos, emojis relevantes)
- CTA (llamada a acción clara)
- Hashtags (20-25 relevantes, mix popularidad alta/media/baja)
- Alt text para la imagen
```

#### 3b. Carrusel (5-10 slides)
Prompt al LLM:
```
Genera un carrusel de Instagram de {num_slides} slides para {marca}.
Topic: {topic}
Fuente: {artículo o topic}

Formato de salida por slide:
- Slide 1: Hook (título impactante, pregunta o dato)
- Slides 2-{n-1}: Contenido (1 idea por slide, texto grande legible)
- Slide final: CTA + mención de la marca

Para cada slide:
- Título (máx 8 palabras, bold)
- Texto (máx 30 palabras)
- Nota visual (qué tipo de imagen/gráfico usar)

Caption del carrusel:
- Hook + resumen + CTA + hashtags
```

#### 3c. Reel Script
Prompt al LLM:
```
Genera un script de reel de Instagram (30-60 segundos) para {marca}.
Topic: {topic}

Formato:
- Hook (0-3s): frase que detenga el scroll
- Problema (3-10s): pain point del target
- Solución (10-25s): cómo {marca} resuelve esto
- Prueba (25-40s): dato, testimonio o resultado
- CTA (40-60s): qué hacer ahora
- Audio sugerido: tipo de música/trending audio
- Texto overlay por sección
- Hashtags
```

#### 3d. Story Sequence (3-5 stories)
Prompt al LLM:
```
Genera una secuencia de 3-5 stories de Instagram para {marca}.
Topic: {topic}

Por story:
- Tipo (texto/imagen/encuesta/quiz/countdown/link)
- Texto principal
- Sticker/elemento interactivo sugerido
- CTA o transición a la siguiente
```

### Paso 4: Output

Para flujos legacy (standalone topic), guardar en
`brand/{slug}/content/instagram/{fecha}-{topic-slug}.md`. Para Content
Engine, guardar en `content/drafts/{ideaId}/instagram.md`.

**File format (STRICT)** — sigue `_system/draft-file-format.md`:

- **Frontmatter** con metadatos operativos (idea_id, channel, status,
  source, ecp, fecha) + Self-QA si aplica.
- **Body** = solo el contenido publicable. **No H1** (Instagram no
  renderiza título). **No HTML comments**. **No `---` decorativos.**
- **Self-QA va en el frontmatter**, nunca inline. Si el verdict aún no
  se ha calculado, omite el campo (no escribas `PENDING`).

```markdown
---
idea_id: {ideaId}
channel: instagram
kind: channel-draft
iteration: 1
status: draft
source: {artículo_id o "standalone"}
ecp: {ecp_name}
self_qa: PASS  # opcional, una vez auto-validado
self_qa_notes:
  - "Hook scroll-stopping: ✅"
  - "Carrusel 5-10 slides: ✅"
created_at: '{ISO date}'
updated_at: '{ISO date}'
---

## Caption Post
{caption}

## Carrusel ({n} slides)
{slides}

## Reel Script
{script}

## Story Sequence
{stories}
```

### Paso 5: Revisión Humana
Presentar al usuario para aprobación antes de publicar. NUNCA publicar automáticamente.

## Formatos Soportados
| Formato | Slides/Duración | Uso |
|---|---|---|
| Caption post | 1 imagen | Engagement, educación |
| Carrusel | 5-10 slides | Educación, guías, listas |
| Reel | 30-60s | Alcance, trending |
| Story sequence | 3-5 stories | Engagement, tráfico |

## Reglas
1. **Brand voice siempre** — todo el contenido respeta el tono definido
2. **Hashtags research** — mix de hashtags: 5 altos (>1M), 10 medios (100K-1M), 10 bajos (<100K)
3. **Emojis nativos** — usar emojis como separadores y énfasis, no spam
4. **CTA en todo** — cada pieza tiene una acción clara
5. **Accesibilidad** — alt text en imágenes, subtítulos en reels
6. **Human in the loop** — presentar para aprobación, nunca auto-publicar
7. **Idioma del cliente** — siempre en el idioma registrado en `clients.json`
