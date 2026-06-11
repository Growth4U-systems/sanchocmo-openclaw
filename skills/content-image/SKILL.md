---
name: content-image
description: "Generate or attach media to a Content Engine draft. The ONLY legitimate way for an agent to put images, carousels, or PDFs into a draft's media[] so the Mission Control MediaPanel renders them. Use whenever a writer skill (newsletter, social-writer, seo-content, instagram-content, content-atomizer) needs a hero image, header, carousel, or any visual asset for the approved draft. NEVER edit frontmatter.media by hand."
user-invocable: false
context_required:
- brand/{slug}/content/drafts/{ideaId}/{channel}.md
context_writes:
- brand/{slug}/content/drafts/{ideaId}/{channel}.md (frontmatter.media[] via API)
---

# /content-image — Persist media into Content Engine drafts

> Esta skill es la **unica** via legitima para que el agente añada
> imagenes, carruseles o PDFs al `media[]` del frontmatter de un draft.
> Sin esto, el MediaPanel de Mission Control queda vacio aunque el
> agente afirme que genero el visual.

Cumple `_system/media-persistence-protocol.md`. Si esta skill no se
puede invocar (por la razon que sea), el agente debe responder
"no puedo persistir la imagen ahora mismo, el MediaPanel quedara
vacio" — NUNCA fingir que el visual existe.

## Cuando usarla

- Una writer skill termina y la pieza necesita hero/header image.
- El usuario aprueba un draft y entra el Media Gate (paso 7 del
  Content Engine, ver `_system/content-engine-architecture.md`).
- El usuario pide explicitamente "genera una imagen para esto" o
  "subeme esta foto al carrusel".

## Como compone con `[brand]-visual-generator` (lectura obligada)

Esta skill **es la unica via** por la que las writer skills consumen el
brand visual. La marca como "infraestructura" la mantiene la skill
per-brand `[brand]-visual-generator` (ej. `growth4u-visual-generator`),
que escribe en `brand/{slug}/brand-book/visual-identity/` el catalogo
completo de artefactos: templates HTML, style-references, manifest,
voz visual.

Reparto de responsabilidades (NO confundir):

| | `[brand]-visual-generator` | `content-image` (esta skill) |
|---|---|---|
| Frecuencia | 1 vez al onboarding + cuando cambia marca | Cada pieza de contenido |
| Escribe en | `brand/{slug}/brand-book/visual-identity/` | `frontmatter.media[]` del draft |
| Output | Templates, style-references, manifest.json | URL R2 servible al user |
| Llama a | nano-banana-pro / Playwright para construir templates | endpoints `/api/content-engine/*` |

Las writer skills NUNCA llaman a `[brand]-visual-generator`. Llaman a
esta skill, y esta skill lee del folder visual-identity. Ver
`_system/content-engine-architecture.md` y
`_system/media-persistence-protocol.md`.

## Step 0a — Pre-flight: storage health (R2)

ANTES de generar nada, comprueba que el storage de imagenes esta
configurado. Sin R2 (o equivalente) no se puede persistir la URL en
`media[]`, y este protocolo PROHIBE escribir `localPath` como fallback
(ver `_system/media-persistence-protocol.md` Regla 5).

```bash
MC_BASE="${MC_BASE:-http://localhost:3000}"
SLUG="${SLUG:?slug requerido}"
STORAGE=$(curl -fsS "$MC_BASE/api/content-engine/image-providers?slug=$SLUG" | jq -r '.storage')
STORAGE_OK=$(jq -r '.ok' <<< "$STORAGE")

if [ "$STORAGE_OK" != "true" ]; then
  MISSING=$(jq -r '.missing | join(", ")' <<< "$STORAGE")
  cat <<EOF
⚠ No puedo generar la imagen ahora mismo: storage caido.
Faltan estas variables: $MISSING
Configuralas en ~/.openclaw/.env.local y reinicia 'next dev'.
Te dejo la propuesta del prompt — lanzala cuando este arriba:
{prompt-textual aqui}
EOF
  exit 1
fi
```

**Si storage NO esta ok**: aborta limpiamente, NO llames a
`provider.generate`, NO escribas nada en `frontmatter.media`. Devuelve
al usuario el mensaje de arriba como **propuesta**, no como entrega.

## Step 0b — Pre-flight: leer el manifest del brand

ANTES de invocar cualquier endpoint, lee
`brand/{slug}/brand-book/visual-identity/manifest.json`. Es el indice
producido por `[brand]-visual-generator` que dice que esta disponible
para esta brand.

```bash
test -f "brand/${SLUG}/brand-book/visual-identity/manifest.json" || {
  echo "Brand no tiene manifest. Lanza [brand]-visual-generator antes."
  exit 1
}

MANIFEST="brand/${SLUG}/brand-book/visual-identity/manifest.json"
PROMPT_PREFIX=$(jq -r '.style_references.prompt_prefix // ""' "$MANIFEST")
```

Si no hay manifest:
- NO improvises generacion sin contexto de marca.
- Si la brand NUNCA ha pasado por visual-identity → redirige al
  pillar visual-identity (Foundation L5) con un MC link. Es
  onboarding visual: hay que definir DNA antes que catalogo.
- Si la brand ya tiene visual-identity pero no manifest → redirige al
  thread de **T07 (`[brand]-visual-generator`) en P14-Content-Engine**
  con un MC link. Ejemplo:
  ```
  ⚠ Esta brand no tiene manifest visual todavia.
  Lanza el bootstrap del catalogo desde T07:
  <APP_BASE>/dashboard/{slug}/tasks/{T07-id}
  Cuando la skill termine vuelve aqui y genero la imagen.
  ```
  (`<APP_BASE>` = el host pre-resuelto de `workspace-sancho/TOOLS.md` quitando el sufijo `/mc`. NUNCA inventes uno distinto.)

Con manifest cargado:
- `templates[<id>]` te dice si una plantilla existe antes de pedir
  `render-carousel` (evita 404 inutiles).
- `style_references.prompt_prefix` es texto que **debes** prepender al
  prompt del Modo 1 (sin pedir permiso, automatico).
- `style_references.reference_files` son las imagenes que pasas como
  `--input-image` (Modo 1 con providers que lo soporten, ej.
  nano-banana-pro).

### Que hacer cuando una plantilla NO existe en el manifest

Si necesitas `templateId: "newsletter-header"` (o cualquiera) y el
manifest no la tiene, NO falles silenciosamente y NO la improvises
desde cero. Redirige al **thread de T07
(`[brand]-visual-generator`)** — ese es el unico lugar donde se extiende
el catalogo. NUNCA redirijas al thread del pillar visual-identity para
esto: ese thread esta cerrado tras el onboarding.

Mensaje canonico al usuario:

```
⚠ La plantilla 'newsletter-header' no esta en el catalogo de {slug}.
Pidesela al [brand]-visual-generator desde T07:

<APP_BASE>/dashboard/{slug}/tasks/{T07-id}

Una vez la anyada al manifest vuelvo aqui y te genero la imagen.
```
(`<APP_BASE>` = el host pre-resuelto de `workspace-sancho/TOOLS.md` quitando el sufijo `/mc`. NUNCA inventes uno distinto.)

(El task-id concreto de T07 lo lees del proyecto P14-Content-Engine
del cliente; el formato suele ser `P14-T07` o el equivalente que la
brand tenga.)

## Inputs requeridos

Del thread context (siempre disponibles cuando el agente ejecuta
dentro de una ContentTask):

- `slug` — brand slug (ej: `growth4u`)
- `ideaId` — el `idea_id` del draft (ej: `idea-2026-05-01-3`)
- `channel` — canal del draft (`newsletter`, `linkedin`, `x`,
  `blog`, `instagram`)

Si falta alguno, NO inventes valores. Pregunta al usuario o aborta
con un mensaje claro.

## Tres modos de operacion

### Modo 1 — Generar imagen desde prompt (provider configurado)

Para cuando partes solo de un concepto/prompt y quieres que el
provider de image-gen del cliente lo cree.

**Composicion del prompt** (importante): el prompt que envias al
endpoint NO es solo lo que se te ocurre. Es:

```
{style_references.prompt_prefix del manifest}
+
{tu prompt content-specific}
```

El endpoint `generate-image` ya prepende `visual-identity-current.md`
del brand-book automaticamente (ver
`src/pages/api/content-engine/generate-image.ts`). Pero el
`prompt_prefix` del manifest es **mas operativo** (estilo concreto,
paleta, anti-pegote rules) y es esencial pasarselo. Adicionalmente, si
quieres "image-as-style-reference" pasa una de las
`reference_files` del manifest como input-image al provider que lo
soporte (Modo 1b abajo).

```bash
MC_BASE="${MC_BASE:-http://localhost:3000}"
SLUG="growth4u"
MANIFEST="brand/${SLUG}/brand-book/visual-identity/manifest.json"
PROMPT_PREFIX=$(jq -r '.style_references.prompt_prefix // ""' "$MANIFEST")
USER_PROMPT="Editorial header: broken playbook on the left transforming into a structured compliance framework on the right. No text. 1.91:1."
FULL_PROMPT="${PROMPT_PREFIX}

${USER_PROMPT}"

curl -fsS -X POST "$MC_BASE/api/content-engine/generate-image" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg slug "$SLUG" --arg prompt "$FULL_PROMPT" '{
    slug: $slug,
    ideaId: "idea-2026-05-01-3",
    channel: "newsletter",
    prompt: $prompt,
    aspectRatio: "1.91:1"
  }')"
```

Response (200) ejemplo:
```json
{
  "ok": true,
  "url": "https://r2.openclaw.dev/.../newsletter-1715000000.webp",
  "draft": { "...": "..." },
  "providerId": "nano-banana-pro",
  "model": "gemini-3-pro-image"
}
```

La URL ya esta en `media[]` del draft. Pegala al chat para que el
usuario vea la imagen real.

**Resolucion de provider**: si no pasas `providerId`, el endpoint
sigue 1) `image_generation.provider` del `content/config.json` si
mode=fixed, 2) primer provider configurado. Lo mismo para `model`.

**Brand voice**: el endpoint precarga el contenido de
`brand-book/visual-identity.md` y lo prepende al prompt
automaticamente. NO tienes que duplicarlo.

### Modo 2 — Subir un binario propio (multipart)

Para cuando ya tienes el archivo en disco (porque lo generaste con
`nano-banana-pro` localmente, porque el usuario lo adjunto, o
porque viene de otro pipeline).

```bash
MC_BASE="${MC_BASE:-http://localhost:3000}"
curl -fsS -X POST "$MC_BASE/api/content-engine/upload-media" \
  -F "slug=growth4u" \
  -F "ideaId=idea-2026-05-01-3" \
  -F "channel=newsletter" \
  -F "file=@/abs/path/to/header.webp"
```

MIME types aceptados: `image/jpeg`, `image/png`, `image/gif`,
`image/webp`, `image/svg+xml`. Tamaño max 10MB.

### Modo 3 — Renderizar plantilla HTML→PDF/PNG

Para CUALQUIER plantilla brand-specific declarada en el manifest:
LinkedIn / Instagram carousels, newsletter-header, ad creatives, web
heroes, etc. Antes de invocar, valida que el `templateId` existe en
`manifest.templates`:

```bash
SLUG="growth4u"
TEMPLATE_ID="newsletter-header"
MANIFEST="brand/${SLUG}/brand-book/visual-identity/manifest.json"
jq -e --arg id "$TEMPLATE_ID" '.templates[$id]' "$MANIFEST" > /dev/null || {
  echo "Template '$TEMPLATE_ID' no existe en el catalogo de la brand."
  echo "Disponibles: $(jq -r '.templates | keys | join(", ")' "$MANIFEST")"
  echo "Si necesitas uno nuevo, lanza [brand]-visual-generator para anyadirlo."
  exit 1
}
```

Si la validacion pasa, el render funciona igual para cualquier
`templateId`:

```bash
MC_BASE="${MC_BASE:-http://localhost:3000}"
curl -fsS -X POST "$MC_BASE/api/content-engine/render-carousel" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "growth4u",
    "ideaId": "idea-2026-05-01-3",
    "channel": "linkedin",
    "templateId": "linkedin-9-slide",
    "slots": { "title": "...", "subtitle": "..." },
    "perSlide": [{"body": "..."}, {"body": "..."}]
  }'
```

Ver `src/pages/api/content-engine/render-carousel.ts` para el
contrato exacto de `templateId`/`slots`/`perSlide`.

## Flujo recomendado (post-approval)

> Reglas de oro:
>
> 1. **Las plantillas son tus herramientas, NO un menú para el usuario.**
>    El redactor no elige `linkedin-quote` vs `linkedin-9-slide` por id.
>    Pregunta el FORMATO (carrusel / imagen estática / header) y tú
>    eliges la plantilla del catálogo que encaja.
> 2. **NO decidas tu sólo el prompt o los slots.** Compón propuesta a
>    partir del body del draft, péguela al usuario y espera "ok" antes
>    de llamar al endpoint. Esta skill orquesta una conversación.

### Step 1 — Clarify formato (obligatorio)

Tras pasar Step 0a/0b, **pregunta al usuario qué FORMATO quiere**.
Las opciones dependen del canal — propón el más habitual primero:

- LinkedIn → carrusel multi-slide (default) | imagen única quote |
  hero image
- Instagram → carrusel | imagen | reel cover
- Twitter/X → imagen única
- Newsletter / Blog → header editorial (1.91:1) | hero
- Email → header simple

Pega al usuario:

```
Voy a preparar la media para {channel}. ¿Qué formato?

  1) 🎞️ Carrusel multi-slide   ← suele funcionar mejor en {channel}
  2) 🖼️ Imagen única (quote / hero / header)
  3) ✨ Algo libre con IA       (sin plantilla, prompt creativo)
  4) 📤 Lo subo yo

Dime el número o explícame qué imaginas.
```

Mapeo formato → flujo:
- (1) o (2) → **Step 2a** (template-driven, render-carousel).
  Tú eliges la plantilla apropiada del catálogo. **NO** muestres ids
  de plantillas al usuario; tú decides.
- (3) → **Step 2b** (generate-image libre con prompt).
- (4) → "perfecto, sube desde Mission Control → tab Media → 📤 Subir asset" y terminas.

### Step 2a — Render desde plantilla (template-driven)

1. Lista las plantillas del manifest filtradas por canal:
   `GET /api/content-engine/carousel-templates?slug={slug}&channel={channel}`.
2. Si la lista está vacía → redirige al thread del
   `[brand]-visual-generator` (T07) sin generar nada. NO improvises HTML.
3. **Tú** eliges la plantilla que encaja con el formato pedido en
   Step 1 (carrusel / imagen única / etc.). Ejemplo: para LinkedIn
   carrusel, elige una con `slideCount > 1`; para "imagen quote" en
   LinkedIn, `linkedin-quote` (1 slide).
4. **Lee `meta.json` del template** (no solo el id):
   ```bash
   curl -fsS "$MC_BASE/api/docs/brand/$SLUG/brand-book/visual-identity/templates/$TEMPLATE_ID/meta.json"
   ```
   Mira **qué slots tienen `perSlide: true`** y cuál es `slideCount`.
   Eso te dice exactamente qué arrays tienes que componer.

   **Si el meta tiene `payload_example`** (la mayoría de templates lo
   tienen), **ese es la fuente de verdad del shape** — copia esa
   estructura literal y solo sustituye los valores. No inventes el
   payload. Es importantísimo porque:

   - Te dice qué keys van en `slots` (globales) vs `perSlide` (arrays).
   - Te muestra los índices que cada slot ocupa en los arrays per-slide
     (`""` en `[0]` cover y `[N-1]` CTA cuando solo aplica al body).
   - Evita el anti-patrón clásico: poner `slide_1_title`,
     `slide_2_title`, ... en `slots`. El endpoint detecta ese patrón y
     devuelve **400** con un mensaje educativo explicando el fix.

5. Lee el body del draft con
   `GET /api/content-engine/drafts?slug={slug}&ideaId={ideaId}&channel={channel}`
   y compón:
   - **`slots`** (globales, sin perSlide): `cover_title`, `cta_headline`,
     etc. → un valor por key.
   - **`perSlide`** (slots con `perSlide:true` en el meta):
     `Record<string, string[]>` donde **cada array tiene EXACTAMENTE
     `slideCount` elementos**. Si una posición no aplica (ej. cover/CTA
     en slot que solo usan los body slides), pon `""` — pero el array
     debe tener todos los huecos.

   Para `linkedin-9-slide` (slideCount=9, structure cover + 7 body + CTA),
   el payload correcto es:
   ```jsonc
   {
     "slug": "growth4u",
     "ideaId": "idea-...",
     "channel": "linkedin",
     "templateId": "linkedin-9-slide",
     "slots": {
       "cover_kicker": "GROWTH · SISTEMA",
       "cover_title":  "Tu CAC sube cada trimestre",
       "cover_subtitle": "Y qué hacer al respecto",
       "cta_headline": "Quita el heroísmo",
       "cta_subtext":  "El sistema no se construye con esfuerzo",
       "cta_button":   "Hablamos"
     },
     "perSlide": {
       // 9 elementos cada uno. [0] = cover, [1..7] = body, [8] = CTA.
       // "" en slots que no usa cover/CTA.
       "slide_eyebrow":    ["", "01·DOLOR", "02·DOLOR", "03·SHIFT", "04·SHIFT", "05·SHIFT", "06·CAUSA", "07·CAUSA", ""],
       "slide_title":      ["", "Tu CAC sube cada trimestre", "Tu LTV no compensa", "El playbook ya no aplica", "...", "...", "...", "...", ""],
       "slide_text":       ["", "...", "...", "...", "...", "...", "...", "...", ""],
       "slide_data_value": ["", "+45%", "−12%", "", "", "", "", "", ""],
       "slide_data_label": ["", "CAC YoY", "Win rate", "", "", "", "", "", ""]
     }
   }
   ```

   **Regla dura**: cada slot con `perSlide:true` debe estar presente en
   `perSlide` con `length === slideCount`. Si no, el endpoint devuelve
   **400** con el listado de keys faltantes (validación añadida 2026-05-11
   tras un fallo que produjo 7 PNGs en blanco — silently).

6. **Antes de renderizar**, péguele al usuario la propuesta completa:

```
Voy a usar la plantilla **{nombre legible de la plantilla}** ({slideCount} slides).

Slide 1 (cover):
  · Kicker: "{cover_kicker}"
  · Título: "{cover_title}"
Slide 2 (body 1):
  · Eyebrow: "{slide_eyebrow[1]}"
  · Título: "{slide_title[1]}"
  · Texto: "{slide_text[1]}"
…
Slide 9 (CTA):
  · Headline: "{cta_headline}"

¿Lanzo el render, o ajusto algo? (responde "ok", "cambia el título
del slide 3 por X", o reescribe los slots como prefieras).
```

7. Solo cuando confirme, llama `POST /api/content-engine/render-carousel`
   con `{slug, ideaId, channel, templateId, slots, perSlide}`.

8. **Post-flight check obligatorio**: tras recibir `200 OK` con `urls`,
   abre el PDF (`urls[0]`) o uno de los slides del medio (no la cover,
   no el CTA — esos siempre se ven; los body son donde falla) y
   confirma visualmente que tiene texto. Si los slides body están en
   blanco (solo chrome, sin texto), **NO digas al usuario "listo"**.
   Reporta: *"El render del carrusel ha producido slides en blanco para
   los body. Reviso los `perSlide` y reintento."*

### Step 2b — Generate libre con IA (sin plantilla)

Para cuando el usuario explícitamente pide algo "libre", "fuera de
plantilla", o el formato no encaja con ninguna del catálogo:

1. Lee el body del draft (paso 4 de Step 2a).
2. Compón un prompt usando el ángulo del post + `prompt_prefix` del
   manifest + ratio del canal (LinkedIn 1.91:1, IG 1:1, etc.).
3. Pega al usuario la propuesta:

```
Te propongo este prompt para la imagen:

  > {prompt_completo_aqui}

Provider: {provider} · ratio: {ratio} · modelo: {model}

¿Lanzo así, o lo ajusto? (responde "ok", "cambia X" o
pega el prompt que prefieras)
```

4. Solo cuando confirme, llama `POST /api/content-engine/generate-image`.

### Step 3 — Persist y report

Tras llamar al endpoint (`render-carousel` o `generate-image`):

- Si `200`: pega la URL al chat tal cual ("Lista, aquí está:
  {url}") + el thumbnail si el chat lo permite. Pregunta "¿OK o
  ajusto algo?".
- Si NO `200`: comunica el error literal del response. NO digas que
  se hizo. Sugiere acción (reintentar, cambiar provider, ajustar
  slots, subir asset manual).

## Errores frecuentes

| Codigo | Causa | Fix |
|---|---|---|
| 400 `Missing slug, ideaId or channel` | falto algun campo | Verifica el thread context |
| 400 `No image-gen provider configured` | el cliente no tiene API conectada | Mandale al usuario el link `/dashboard/{slug}/settings` y la skill `connect-api` |
| 404 `Draft not found` | el `{ideaId}/{channel}.md` no existe en disco | El writer no termino o el path esta mal |
| 502 `Generation failed` | el provider devolvio error | Reintentar; si persiste, sugerir cambio de provider |

## Lo que esta skill NO hace (limites)

- **No edita el body del draft.** Solo añade a `media[]`. Si
  necesitas cambiar el texto, usa `PATCH /api/content-engine/drafts`.
- **No publica.** El status sigue siendo `Media`/`approved` tras
  añadir el visual. La publicacion la hace un dispatcher distinto
  (Metricool/Beehiiv/CMS) en un paso posterior.
- **No crea drafts.** El draft tiene que existir antes; lo crea el
  writer skill via `/api/content-engine/generate-drafts`.
- **No genera imagenes localmente con nano-banana-pro.** Si quieres
  ese flujo, llama `nano-banana-pro` para producir el archivo en
  disco y luego usas el **Modo 2** para subirlo.

## Checklist anti-hallucination

Antes de afirmar al usuario que la imagen esta lista:

- [ ] He llamado a uno de los 3 endpoints (no he editado
      frontmatter a mano).
- [ ] He recibido `200 OK` con un campo `url` real.
- [ ] He pegado esa URL en el chat (o un preview que la consuma).
- [ ] El `media[]` del draft contiene una entrada nueva (puedes
      verificar con `GET /api/content-engine/drafts?slug=...&ideaId=...&channel=...`).

Si algun paso falla, el agente comunica el fallo, no el exito.
