---
name: od-generate
description: |
  Orchestrator de generación visual/audiovisual para Maese Pedro. Lee el catálogo
  de plantillas del brand activo desde filesystem
  (brand/<slug>/brand-book/visual-identity/templates/), selecciona la mejor para
  el brief, carga su contrato (meta.json: output_format, generation_strategy,
  slots, dimensions, slidesCount), enruta a la strategy adecuada (html,
  html-to-image, image-model, html-to-video, video-model, audio-model) y dispara
  la generación contra el daemon de Open Design. Si no encaja ninguna plantilla,
  ofrece crear una nueva.
metadata:
  layer: "5"
  pillar: "brand"
  agent: "maese-pedro"
  workspace: "workspace-maese-pedro"
  type: "orchestrator"
  wraps_endpoint: "POST /api/chat"
  daemon_url_env: "OD_DAEMON_URL"
  version: "4.0"
triggers:
  - "generar imagen"
  - "generar video"
  - "generar audio"
  - "crear plantilla"
  - "crear mockup"
  - "crear social card"
  - "linkedin quote"
  - "linkedin carousel"
  - "instagram carousel"
  - "blog post"
  - "blog cover"
  - "intro de video"
  - "jingle"
  - "podcast intro"
  - "od-generate"
od:
  mode: orchestrator
  design_system:
    requires: true
  capabilities_required:
    - file_write
    - file_read
    - surgical_edit
inputs:
  - name: brand_slug
    type: string
    required: true
  - name: brief
    type: string
    required: true
    description: "Brief del usuario en lenguaje natural. Tipo de asset, plataforma, contenido, contexto."
  - name: design_system_id
    type: string
    required: false
    description: "Override del design system. Si vacío, usa el del brand."
outputs:
  primary: artifact (output_format depende de la plantilla — index.html | png | jpg | svg | mp4 | mp3 | wav)
context_required:
  - brand/{slug}/brand-book/visual-identity/DESIGN.md
  - brand/{slug}/brand-book/visual-identity/templates/*/meta.json
context_writes:
  - .od/artifacts/{id}/{primaryFile} (histórico OD)
  - brand/{slug}/brand-book/visual-identity/_generated/{id}/{primaryFile} (canónico tras promoción)
  - brand/{slug}/projects/P*/tasks.json (task de asset al confirmar)
  - brand/{slug}/chat/ (hilo de la task)
---

# od-generate — orchestrator OD-compliant multi-strategy

> Punto único de entrada para toda generación visual y audiovisual. **Las
> plantillas viven como datos**, no como skills: el orchestrator lee el catálogo
> del brand desde filesystem, identifica el `generation_strategy` declarado y
> enruta al flow correspondiente. Soporta 6 estrategias: html, html-to-image,
> image-model, html-to-video, video-model, audio-model.

---

## Pre-condiciones

1. **Daemon de OD vivo**: `curl ${OD_DAEMON_URL:-http://localhost:7456}/api/health` → `{"ok":true}`.
2. **DESIGN.md presente**: `brand/<slug>/brand-book/visual-identity/DESIGN.md`. Si no → ejecutar `design-system` primero.
3. **Catálogo de plantillas**: `brand/<slug>/brand-book/visual-identity/templates/` con subcarpetas, cada una con `meta.json` válido.

---

## Schema de meta.json (contrato del template)

Cada plantilla en `templates/<id>/meta.json` declara:

```json
{
  "id": "linkedin-9-slide",
  "name": "linkedin-9-slide",
  "channel": "linkedin",
  "description": "Carrusel educativo: cover + 7 body slides + CTA final",
  "use_case": "Carrusel educativo LinkedIn (9 slides 1080×1350) — cover + 7 body + CTA. Ideal para how-to, listas, frameworks.",

  "output_format": "html",
  "generation_strategy": "html",

  "slideCount": 9,
  "width": 1080,
  "height": 1350,

  "slots": [
    { "key": "cover_kicker", "label": "Kicker portada", "placeholder": "GROWTH · SISTEMA" },
    { "key": "cover_title",  "label": "Título portada",  "maxLength": 120 },
    { "key": "slide_title",  "label": "Título de slide", "perSlide": true }
  ],

  "model_hints": {
    "preferred_model": null,
    "prompt_prefix_from": null
  },
  "pre_steps": [],

  "triggers": ["linkedin carousel", "linkedin 9 slide", "carousel educativo linkedin"],
  "od_kind": "template"
}
```

Campos del contrato:

| Campo | Tipo | Significado |
|---|---|---|
| `id`, `name` | string | Identificador único de la plantilla. |
| `channel` | string | `linkedin` \| `instagram` \| `blog` \| `youtube` \| `podcast` \| `web` \| `email`. |
| `description`, `use_case` | string | Texto humano para fallback semántico. |
| `output_format` | string | Extensión del artifact final: `html` \| `png` \| `jpg` \| `svg` \| `mp4` \| `mp3` \| `wav`. |
| `generation_strategy` | string | Cómo se genera (ver §Strategies). |
| `slideCount`, `width`, `height` | int | Dimensiones del canvas (cuando aplique). |
| `slots[]` | array | Placeholders que el agente rellena. `perSlide: true` → se repite por slide. |
| `model_hints.preferred_model` | string\|null | Modelo Replicate/OD sugerido (`flux-1.1-pro`, `kling-v1`, `suno-v3`, etc.). |
| `model_hints.prompt_prefix_from` | string\|null | Sección de DESIGN.md a inyectar (`illustration-discipline`, `motion-rules`, `audio-rules`). |
| `pre_steps[]` | array | Pasos previos al render principal (e.g. generar imagen de personaje antes de un HTML que la consume). |
| `triggers[]` | array | Frases que matchean el brief (substring lowercase). |
| `od_kind` | string | `template` \| `mockup` \| `logo` \| `style-reference` \| `export` \| `misc` (promoción canónica). |

---

## Strategies soportadas

| Strategy | Output | Cuándo usarla | Cómo se ejecuta |
|---|---|---|---|
| `html` | `index.html` | Pieza estática con CSS/HTML puro (social cards, slides, mockups). | `POST /api/chat` con prompt OD-compliant. |
| `html-to-image` | `png` \| `jpg` | Pieza visual que finalmente vive como bitmap (avatar, OG image binario). | Genera HTML → invoca `od-export {format}`. |
| `image-model` | `png` \| `jpg` \| `svg` | Ilustración fotorrealista o estilo que no se puede pintar con HTML. | Skill upstream OD con modelo (Flux, SDXL, Replicate). |
| `html-to-video` | `mp4` \| `webm` | Animación corta basada en HTML/CSS (intros, transiciones, motion graphics simples). | HTML con animations → `od-export {format: "mp4"}` (HyperFrames). |
| `video-model` | `mp4` | Video generado por modelo (Kling, Runway, Sora). | Skill upstream OD con modelo de video. |
| `audio-model` | `mp3` \| `wav` | Jingle, voiceover, podcast intro, sonido para social. | Skill upstream `audio-jingle` (Suno/MiniMax/ElevenLabs). |

Cada strategy tiene un workflow distinto. Ver §Workflow.

---

## Workflow

### 1. Pre-flight

```pseudo
designMd = read("brand/{slug}/brand-book/visual-identity/DESIGN.md")
if not designMd:
    fail("No DESIGN.md. Ejecuta `design-system` primero para crear el design system del brand.")
```

### 2. Cargar el catálogo del brand

```pseudo
templates_dir = "brand/{slug}/brand-book/visual-identity/templates/"
catalog = []
for tpl_dir in list_directories(templates_dir):
    meta_path = tpl_dir + "/meta.json"
    if exists(meta_path):
        catalog.append(read_json(meta_path))
```

### 3. Seleccionar la plantilla

Estrategia de matching (en orden de prioridad):

1. **Trigger match exacto**: si el brief lowercase contiene literal alguna entry de `triggers[]` de alguna plantilla → esa plantilla gana.
2. **Trigger match por tokens**: si todos los tokens de un trigger están presentes en el brief → match.
3. **Channel + intent**: si el brief menciona el `channel` (linkedin/instagram/blog/podcast/youtube) y un intent (carousel/post/cover/jingle/intro) → narrow al subset y elige por dimensiones razonables.
4. **Fallback semántico**: usar `description` y `use_case` para LLM-side ranking (el agente decide).
5. **Sin match**: ofrecer al usuario crear una plantilla nueva (§7).

### 4. Routing por `generation_strategy`

Una vez seleccionada la plantilla, leer `meta.generation_strategy` y enrutar:

```pseudo
switch tpl.generation_strategy:
    case "html":            workflow_html(tpl)
    case "html-to-image":   workflow_html_then_export(tpl, "png" | tpl.output_format)
    case "image-model":     workflow_model(tpl, surface: "image")
    case "html-to-video":   workflow_html_then_export(tpl, "mp4")
    case "video-model":     workflow_model(tpl, surface: "video")
    case "audio-model":     workflow_model(tpl, surface: "audio")
    default: fail("Strategy desconocida: " + tpl.generation_strategy)
```

### 5. Workflow por strategy

#### 5.a — Strategy `html`

Generación directa de `index.html` autocontenido.

1. Si `pre_steps[]` no vacío, ejecutar primero (e.g. generar imagen de personaje vía `image-model` y obtener su `data:` URI o ruta para inyectar).
2. Construir el system prompt con DESIGN.md + slots + reglas OD-compliant (ver §6).
3. `POST ${OD_DAEMON_URL}/api/chat`:
   ```json
   {
     "projectId": "<scoped-project-id>",
     "designSystemId": "<slug>",
     "prompt": "<system prompt construido>"
   }
   ```
4. Consumir SSE. Reenviar eventos al thread MC.
5. Tras `done`, `validateArtifact` corre (ver `client.ts`):
   - HTML count = 1.
   - `data-od-id` count ≥ {slideCount * 4} (multi-slide) o ≥ 4 (single).
   - No external URLs excepto Google Fonts.

#### 5.b — Strategy `html-to-image`

Render HTML → export a PNG/JPG.

1. Igual que §5.a hasta paso 4 (`done` del HTML).
2. Invocar skill `od-export` del daemon:
   ```json
   {
     "skillId": "od-export",
     "artifactId": "<id del HTML recién generado>",
     "format": "png",
     "width": tpl.width,
     "height": tpl.height
   }
   ```
3. El artifact final es el bitmap. El HTML queda como fuente auditable en `.od/artifacts/<id>/`.
4. `validateArtifact` strategy-aware:
   - Existe archivo con extensión `tpl.output_format`.
   - `size > 0`.

#### 5.c — Strategy `image-model`

Skill upstream OD con modelo de imagen (Flux, SDXL, Replicate, etc.).

1. Construir prompt para el modelo:
   - Base: `brief` del usuario.
   - Prefix: sección de DESIGN.md indicada por `model_hints.prompt_prefix_from` (típicamente `illustration-discipline` — estilo, paleta, dont's).
   - Constraints técnicos: dimensiones, aspect ratio, formato.
2. Invocar skill upstream OD:
   ```json
   {
     "skillId": "<modelo, e.g. 'flux-pro' o 'replicate-image'>",
     "designSystemId": "<slug>",
     "prompt": "<prompt construido>",
     "params": {
       "width": tpl.width,
       "height": tpl.height,
       "model": tpl.model_hints.preferred_model
     }
   }
   ```
3. `validateArtifact` strategy-aware: existe bitmap, size > 0, extensión correcta.

#### 5.d — Strategy `html-to-video`

HTML con CSS animations renderizado a MP4 vía HyperFrames.

1. Igual que §5.a, pero el prompt OD-compliant incluye reglas adicionales:
   - CSS animations declarativas (no JS).
   - `--od-duration` y `--od-fps` declarados como custom properties.
   - Sección de DESIGN.md inyectada según `model_hints.prompt_prefix_from` (típicamente `motion-rules`).
2. Tras `done` del HTML, invocar `od-export` con `format: "mp4"` y params `duration` / `fps` derivados del CSS.
3. `validateArtifact`: existe MP4, size > 0.

#### 5.e — Strategy `video-model`

Skill upstream OD con modelo de video (Kling, Runway, Sora).

1. Construir prompt:
   - Base: `brief` del usuario.
   - Prefix: `motion-rules` de DESIGN.md.
   - Constraints: aspect ratio (16:9, 9:16, 1:1), duración (segundos), seed opcional.
2. Invocar skill upstream:
   ```json
   {
     "skillId": "<video-model, e.g. 'kling-v1' o 'runway-gen3'>",
     "designSystemId": "<slug>",
     "prompt": "<prompt construido>",
     "params": {
       "aspect_ratio": "9:16",
       "duration": 5,
       "model": tpl.model_hints.preferred_model
     }
   }
   ```
3. `validateArtifact`: existe MP4, size > 0, duración aproximada coincide.

#### 5.f — Strategy `audio-model`

Skill upstream `audio-jingle` (Suno, MiniMax, ElevenLabs).

1. Construir prompt:
   - Base: `brief` (mood, instrumentación, BPM, voiceover si aplica).
   - Prefix: sección `audio-rules` o `brand-voice` de DESIGN.md.
2. Invocar skill upstream:
   ```json
   {
     "skillId": "audio-jingle",
     "designSystemId": "<slug>",
     "prompt": "<prompt construido>",
     "params": {
       "duration": 15,
       "format": "mp3",
       "model": tpl.model_hints.preferred_model
     }
   }
   ```
3. `validateArtifact`: existe MP3/WAV, size > 0, duración aproximada.

### 6. System prompt para strategies HTML (`html`, `html-to-image`, `html-to-video`)

```
# Contexto

Brand: {slug}
DESIGN.md: <contenido completo del DESIGN.md>

Plantilla seleccionada: {meta.id}
- Canal: {meta.channel}
- Strategy: {meta.generation_strategy}
- Output esperado: {meta.output_format}
- Dimensiones: {width}×{height}px
- Slides: {slideCount}
- Use case: {meta.use_case}
- Slots a rellenar: <list de meta.slots>

# Reglas OD-compliant (no negociables)

## Output structure
- ÚN artifact con UN solo `index.html` autocontenido. Nada más.
- Todo el CSS dentro de `<style>` en el `<head>`. No archivos externos.
- Fonts vía Google Fonts CDN (fonts.googleapis.com / fonts.gstatic.com) o system fonts.
- NO uses imágenes externas. Usa data: URIs, gradientes CSS o SVG inline.
- NO uses JS. Vanilla HTML + CSS (excepto motion: CSS animations declarativas).

## Layout
- Canvas exacto: {width}×{height}px (declarado en CSS).
- Si {slideCount} > 1: apila los N slides verticalmente, cada uno con su tamaño exacto.

## data-od-id (obligatorio)
Cada sección lógica del HTML debe llevar `data-od-id="<slug>"` con un slug único kebab-case.
Mínimo {slideCount * 4} slugs distintos para multi-slide; mínimo 4 para single.

## Design tokens
- Usa SOLO los tokens declarados en DESIGN.md (paleta, tipografías, spacing, radii, shadows).
- NO inventes hex codes ni font families fuera de los listados.
- Cada color tiene `use:` semántico — respétalo.

## Anti-pegote
- Si la pieza incluye personaje + fondo, ese personaje viene como `pre_step` (imagen ya generada). NO uses CSS overlay para fingirlo.

## Tamaños mínimos
- Social 1080×* canvas: body ≥ 24px, headlines ≥ 44px.
- Web desktop ≥ 16px, mobile ≥ 14px.

## Específico de html-to-video (solo si strategy = html-to-video)
- CSS animations declarativas (@keyframes, animation:).
- Declarar `--od-duration: Ns;` y `--od-fps: 30;` en `:root`.
- Loops infinitos OK; duración total del export se deriva de --od-duration.

# Brief del usuario

{brief}

# Slots disponibles

<para cada slot del meta.slots, listar key + label + placeholder + maxLength + perSlide>

Genera el HTML completo respetando contrato + DESIGN.md + reglas OD-compliant.
```

### 7. Crear plantilla nueva (si no hay match)

Si paso §3 no encuentra plantilla, el flow es:

1. **Preguntar al usuario**: "No tengo ninguna plantilla que encaje con tu brief. ¿Quieres que cree una nueva en `templates/<id>/`?"
2. Si confirma:
   - Derivar `id` slug del brief.
   - Inferir `generation_strategy` y `output_format` del intent (e.g. "video corto de 5 segundos" → `video-model` + `mp4`; "social card" → `html` + `html`; "ilustración fotorrealista" → `image-model` + `png`).
   - Generar `meta.json` inicial con todos los campos del schema.
3. Generar el primer render usando ese `meta.json` recién creado (paso 4 del workflow).
4. Persistir `meta.json` + ejemplo del output en `templates/<id>/`.
5. La plantilla queda disponible para futuros usos.

### 8. Promoción a ubicación canónica

Lee `meta.od_kind` y mueve el output según extensión real:

| od_kind | Destino |
|---|---|
| `template` (html) | `brand/{slug}/brand-book/visual-identity/_generated/{tpl-id}-{timestamp}/index.html` |
| `template` (png/jpg/svg) | `brand/{slug}/brand-book/visual-identity/_generated/{tpl-id}-{timestamp}/output.{ext}` |
| `template` (mp4/webm) | `brand/{slug}/brand-book/visual-identity/_generated/{tpl-id}-{timestamp}/output.{ext}` |
| `template` (mp3/wav) | `brand/{slug}/brand-book/visual-identity/_generated/{tpl-id}-{timestamp}/output.{ext}` |
| `mockup` | `brand/{slug}/brand-book/visual-identity/mockups/{id}.{ext}` |
| `logo` | `brand/{slug}/brand-book/visual-identity/logo-{variant}.png` |
| `style-reference` | `brand/{slug}/brand-book/visual-identity/style-references/{id}.webp` |
| `export` | `brand/{slug}/brand-book/visual-identity/exports/{id}.{ext}` |
| `misc` (default) | `brand/{slug}/brand-book/visual-identity/_generated/{id}/` |

`.od/artifacts/<id>/` queda como histórico auditable.

**Importante**: las nuevas generaciones aterrizan en `_generated/` para no sustituir los templates legacy. Esos siguen siendo el "canónico estable"; lo nuevo es iteración.

### 9. Crear task de seguimiento al confirmar (manager-intake)

Cuando una generación se **promueve** (asset aprobado, no un render exploratorio), regístrala como **task** en Mission Control para que el asset sea trazable y revisable. Crea la task **al confirmar** la promoción, nunca al abrir el chat (confirm-first, igual que `sancho-manager`).

1. **Propón, no ejecutes.** Tras promover: "¿Registro este asset como una task de media? La asignaría a **Maese Pedro** (skill `od-generate`)." (máx 2 preguntas si falta algo).
2. **Espera confirmación explícita** ("sí").
3. **Crea la task**, añadida al proyecto de Media activo (`project.category == "media"`) si existe; si no, a un proyecto ligero. Shape canónico (**3 anchors**: `skill` + `deliverable_file` + `mc_chat_thread_id`; status `todo`):
   ```json
   {
     "id": "P{XX}-T{YY}",
     "name": "Asset: {nombre}",
     "description": "Asset generado y promovido vía od-generate.",
     "deliverable": "Asset canónico en brand/{slug}/brand-book/visual-identity/_generated/",
     "done_criteria": "Asset aprobado y promovido a su ubicación canónica.",
     "depends_on": null,
     "status": "todo",
     "owner": "Sancho",
     "agent": "maese-pedro",
     "channel": "media",
     "type": "media",
     "skill": "od-generate",
     "deliverable_file": "brand/{slug}/brand-book/visual-identity/_generated/{id}/{primaryFile}",
     "mc_chat_thread_id": "task-p{xx}-t{yy}",
     "created": "{hoy}",
     "completed": null,
     "output_files": []
   }
   ```
4. Crea el **hilo de chat vacío** `brand/{slug}/chat/{mc_chat_thread_id}.json` (`{ "messages": [], "createdAt": "{hoy}" }`) y actualiza `tasks_total` en `project.json`. Mission Control lee `tasks.json` **en vivo** — sin paso de regeneración.

---

## Reglas

1. **Sin DESIGN.md, no se genera.** Bloquear con instrucción clara.
2. **Catálogo siempre primero.** No inventes plantillas; usa las existentes.
3. **Routing por `generation_strategy`** declarado en meta.json — no improvises.
4. **Constraints OD-compliant siempre se inyectan** para strategies HTML. Indep. del modelo / skill upstream.
5. **Promoción explícita por `od_kind`** declarado en meta.json.
6. **`.od/artifacts/<id>/` se preserva.** Trazabilidad auditable.
7. **Las plantillas legacy NO se sustituyen.** Las generaciones nuevas viven en `_generated/`.
8. **Si el brief introduce un patrón nuevo**, ofrecer crear plantilla, no improvisar.

---

## Errores y fallback

- **Daemon offline** → tarea `blocked`, mensaje "OD daemon offline. Arranca con `~/.openclaw/scripts/od-daemon.sh start`".
- **DESIGN.md ausente** → tarea `blocked`, instruir ejecución de `design-system`.
- **Catálogo vacío** → ofrecer crear primera plantilla via flow §7.
- **Strategy desconocida** → fail con mensaje claro indicando qué valores son válidos.
- **Skill upstream para image/video/audio no disponible** → mensaje al usuario con instrucción de instalar/configurar la skill upstream en OD.
- **SSE timeout** → reintentar 1 vez; si falla, marcar `failed` y guardar log en thread.
- **Validation warnings** → no bloquean. Mensaje al usuario con instrucción de re-prompt.

---

## Referencias

- Endpoint daemon: `/Users/ragi/open-design/docs/architecture.md` §7.
- Catálogo: `brand/{slug}/brand-book/visual-identity/templates/*/meta.json`.
- Validador: `src/lib/open-design/client.ts` → `validateArtifact` (strategy-aware).
- Skills upstream OD (catálogo): `GET /api/skills` o `od-list-skills`.
- Design systems upstream (catálogo): `GET /api/design-systems` o `od-list-design-systems`.
- Export (html-to-image, html-to-video): skill `od-export` del daemon.
- Audio: skill `audio-jingle` del daemon (Suno/MiniMax/ElevenLabs).
