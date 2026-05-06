# growth4u-visual-generator

Genera imágenes de marca para Growth4U usando el sistema visual aprobado.

## Contexto
- **Brand**: Growth4U
- **Estilo**: Clean Line Art Editorial
- **Paleta**: Navy `#032149`, Royal `#1a3690`, Electric `#3f45fe`, Sky `#45b6f7`, Teal `#0faec1`, Purple `#6351d5`
- **Tipografía**: Manrope (títulos) + Roboto (cuerpo)
- **Assets base**: `brand/growth4u/brand-identity/visual-identity/mockups/`
- **Design tokens**: `brand/growth4u/brand-identity/visual-identity/design-tokens.json`
- **Idea mapping**: `brand/growth4u/brand-identity/visual-identity/idea-mapping.md`

## Personajes disponibles

| Personaje | Light | Dark | Gradient |
|---|---|---|---|
| Alfonso | `alfonso-v2-corrected.png` | `alfonso-ref-dark.png` | `alfonso-gradient-integrated.png` |
| Martín | `martin-ref-v4.png` | `martin-ref-dark.png` | — |
| Philippe | `philippe-character-ref.png` | `philippe-ref-dark.png` | — |

**Poses** (4 cada uno): presentando, laptop, pensando, saludando
- Alfonso: `alfonso-v2-poses.png`
- Martín: `martin-v3-poses.png`
- Philippe: `philippe-v3-poses.png`

## Cómo generar imágenes

### 1. LinkedIn / Instagram Quote Post (1080×1350)

**Paso 1**: Generar personaje en gradient (si no existe)
```
uv run /opt/homebrew/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  --prompt "Create a full portrait illustration of this character on a gradient background that smoothly transitions from dark navy (#032149) at the top through royal blue (#1a3690) to teal (#0faec1) at the bottom. WHITE line art outlines. Teal (#0faec1) accent on glasses. Purple (#6351d5) on collar. [POSE DESCRIPTION]. The gradient and character must feel like ONE cohesive illustration. Add subtle teal and purple bokeh in background. Tall vertical format (2:3)." \
  -i [REFERENCE_IMAGE] \
  --filename "[OUTPUT].png" --resolution 1K
```

**Paso 2**: Componer con template HTML
- Template base: `mockups/mockup-linkedin-v3.html`
- Cambiar: imagen del personaje, texto quote, highlights teal, nombre autor
- Mínimos: quote 54px, autor 30px, logo 44px
- Bottom fade: `height: 550px`, opacity 0.92-1.0 para contraste

**Paso 3**: Screenshot con Playwright
```
npx playwright screenshot --viewport-size="1080,1350" file://[PATH]/template.html output.png
```

### 2. Blog Header (1200×630)

Generar como UNA sola ilustración integrada:
```
uv run .../generate_image.py \
  --prompt "Create a wide blog header (16:9) in clean line art style matching the reference. Thin navy (#032149) outlines on white background with teal (#0faec1) and purple (#6351d5) accents. The scene: [CHARACTER] + [TOPIC VISUAL]. Growth4U logo top-left. Everything is one cohesive illustration." \
  -i [REFERENCE_IMAGE] \
  --filename "blog-header-[topic].png" --resolution 1K
```

### 3. Instagram Quote con Speech Bubble (1080×1080)

```
uv run .../generate_image.py \
  --prompt "Create a square Instagram post (1:1) in clean line art style. Thin navy (#032149) outlines on white background with teal (#0faec1) and purple (#6351d5) accents. [CHARACTER] from waist up, [POSE]. Speech bubble with text: '[QUOTE]'. Growth4U logo. Professional editorial line art." \
  -i [REFERENCE_IMAGE] \
  --filename "ig-[topic].png" --resolution 1K
```

### 4. Elementos / Iconos temáticos

```
uv run .../generate_image.py \
  --prompt "Create [DESCRIPTION] in clean line art style matching this reference. Thin navy (#032149) outlines on white background. Teal (#0faec1) and purple (#6351d5) accents. Professional, modern." \
  -i alfonso-v2-corrected.png \
  --filename "element-[name].png" --resolution 1K
```

## Reglas obligatorias

1. **SIEMPRE** usar un personaje de referencia como `-i` para mantener consistencia de estilo
2. **NUNCA** mezclar foto real + ilustración en la misma imagen
3. **Light vs Dark**: consultar idea-mapping.md
4. **Personaje por defecto**: Alfonso (70% del contenido)
5. **Datos/métricas**: siempre en teal `#0faec1` o amber
6. **Logo**: siempre visible, "4U" en teal o gradiente
7. **Texto mínimo**: 24px en canvas 1080px
8. **growth4u.io**: visible en posts social

## Prompt patterns por tono (del brand voice)

- **Diagnóstico-Provocador**: Personaje señalando + dato impactante grande + quote directa
- **Insider Vulnerable**: Personaje pensativo + reflexión en speech bubble
- **Directo con Datos**: Personaje presentando + pizarra con gráficas
- **Sistema sobre Táctica**: Personaje con laptop + diagrama de sistema/flywheel

---

## 🎨 Mission Control — Carousel templates HTML

Mission Control consume **plantillas HTML por canal** que viven SIEMPRE en
el directorio del cliente:

```
brand/{slug}/brand-book/visual-identity/templates/{template-id}/
├── meta.json
├── template.html        # single-slide
└── slide-cover/body/cta.html   # multi-slide
```

**Las plantillas son output obligatorio de esta skill.** No hay defaults
del sistema ni fallbacks genéricos. Si esta skill no se ha ejecutado para
una brand, la brand no tiene plantillas y Mission Control muestra un empty
state pidiendo lanzar `visual-identity` para crearlas.

Las plantillas viven dentro del pillar `visual-identity` de Foundation, así
que el cliente las edita desde MC → Foundation → Brand Book → Visual
Identity → templates → click sobre el archivo HTML → vista 2-col (HTML
editor a la izquierda + iframe preview en vivo a la derecha). El thread de
chat del pillar visual-identity es el que recibe pedidos de cambios — esta
skill NO crea threads ni tasks separados por plantilla.

Las 5 plantillas oficiales que esta skill mantiene:

| Template ID | Canal | Tamaño | Slides | Caso |
|---|---|---|---|---|
| `linkedin-quote` | linkedin | 1080×1350 | 1 | Quote post con cita fuerte (puede llevar personaje) |
| `linkedin-9-slide` | linkedin | 1080×1350 | 9 | Carrusel: cover + 7 body + CTA |
| `instagram-3-slide` | instagram | 1080×1080 | 3 | Carrusel cuadrado: cover + body + CTA |
| `blog-post` | blog | 1200×630 | 1 | Imagen ilustrativa para incrustar dentro del post |
| `blog-title` | blog | 1200×630 | 1 | Cover/OG: título dominante + autor + tiempo lectura |

### Cómo Mission Control renderiza una plantilla

1. UI llama `POST /api/content-engine/render-carousel` con `{ slug, ideaId, channel, templateId, slots, perSlide }`.
2. MC carga `template.html` (o `slide-{cover|body|cta}.html` según multi-slide).
3. Substituye placeholders (ver "Sintaxis del template" abajo).
4. Renderiza con Playwright al tamaño nativo del template y guarda PNGs en R2.
5. Para multi-slide combina los PNGs en un PDF y lo adjunta al draft (LinkedIn lo trata como swipeable).

### Sintaxis del template

**Substituciones** (todo HTML-escaped salvo modificadores):
- `{{slot.<key>}}` — valor del slot single-shot
- `{{per_slide.<key>}}` — valor del slot per-slide para el slideIndex actual
- `{{slot.<key>|attr}}` — escape suave (URLs en `src=""` no rompen con `&`)
- `{{slot.<key>|raw}}` — sin escape (usar con cuidado; nunca con input externo)
- `{{slide_index}}`, `{{slide_number}}`, `{{slide_number_padded}}`, `{{total_slides}}`
- `{{brand.name}}` · `{{brand.slug}}` · `{{brand.font}}`
- `{{brand.primary}}` · `{{brand.primary_dark}}` · `{{brand.primary_light}}` (derivados ±15% lightness)
- `{{brand.accent}}` · `{{brand.accent_dark}}`
- `{{brand.logo}}` (URL absoluta del PNG en `brand-book/visual-identity/logo-light.png`)
- `{{brand.footer}}` (handle/CTA del setup config — fallback `@{slug}`)

**Bloques condicionales**:
```html
<!-- if:slot.hero_image_url -->
<div class="character"><img src="{{slot.hero_image_url|attr}}" alt="" /></div>
<!-- /if:slot.hero_image_url -->
```
Se elimina entero si el valor es vacío. No anidable.

**Slots que cada template espera** están en su `meta.json`. NO añadir slots
sin actualizar también `meta.json` (la UI los lee de ahí para construir el
formulario que rellena el redactor humano).

### Sistema visual SC-G4U (consistente entre las 5 plantillas)

- **Background**: `linear-gradient(160deg, #032149 0%, #1a3690 35%, #0faec1 100%)`
- **Bokeh blobs**: 2-3 círculos `filter: blur(60-80px)` en teal/purple/sky para profundidad
- **Stripe lateral**: 8px verticales gradient (teal→electric→purple) en el borde izquierdo
- **Accent bar bottom**: 8-12px gradient horizontal igual al stripe
- **Tipografía**: Manrope ExtraBold (titulares), Roboto (body), Manrope uppercase tracking-wider para kickers
- **Color tokens**: `#032149` (navy), `#0faec1` (teal acento principal), `#3f45fe` (electric), `#6351d5` (purple), `#45b6f7` (sky)
- **Personaje**: filtro `drop-shadow(-12px 12px 0 rgba(2,19,42,0.45))` para integrarlo con el gradient
- **Footer**: divider 1.5px `rgba(255,255,255,0.18)` + logo 32-56px + handle del brand

### Flow de regeneración brand-specific (la "verdadera" calidad)

Esta es la operación principal de la skill. Cuando se invoca
`growth4u-visual-generator regenerate-templates` (o equivalente para otra
brand: `paymatico-visual-generator`, etc.), produce las 5 plantillas con la
DNA visual del brand: personajes, fotos integradas, multi-stop gradients
específicos, layouts custom. Si la brand no tiene plantillas todavía, esta
skill las crea desde cero — no hay defaults del sistema.

**Flujo paso a paso** (ejecutado por la skill al ser invocada):

#### Step 0 — Prerequisito (BLOCKING)

Antes de hacer NADA, verifica que el pillar `visual-identity` está
`approved` (o `done`) en Foundation L5. Es el pillar que produce
`design-tokens.json` (paleta + tipografía) y `visual-identity.current.md`
(reglas de composición, personajes). Sin esos dos archivos no se puede
producir ningún template — los templates los CONSUMEN, no los crean.

```bash
# Comprobación
jq -r '.sections | to_entries[] | .value.pillars["visual-identity"].status // empty' \
  brand/{slug}/foundation-state.json
```

Si el resultado NO es `approved` o `done`:

```
✗ Prerequisito no cumplido: visual-identity está en estado <X>.
  Lanza primero la skill visual-identity (Foundation Layer 5):
  · Define paleta navy/teal/etc.
  · Aprueba design-tokens.json
  · Genera personajes (Alfonso, Martín, Philippe)
  Cuando esté approved, reanuda esta skill.
PARA. No produzcas templates.
```

Mission Control aplica el mismo check al endpoint que crea la task de P14
(`POST /api/content-engine/templates/ensure-task` → 409 si no está
approved con un mensaje equivalente). Por tanto este Step 0 es la red de
seguridad final cuando se invoca la skill por otras vías (ej. directo desde
gateway sin pasar por MC).

#### Step 1 — Lectura de contexto (read-only)

- `brand/{slug}/brand-book/visual-identity/design-tokens.json` — paleta,
  typography, gradients oficiales (incluido el `gradient.brand` multi-stop).
- `brand/{slug}/brand-book/visual-identity/visual-identity.current.md` —
  reglas de composición, personajes, anti-pegote.
- `brand/{slug}/brand-book/brand-voice/brand-voice.current.md` — tone of
  voice, anti-AI-writing, signature patterns.
- `brand/{slug}/brand-book/visual-identity/templates/{id}/` — versión actual del brand
  si existe. Si hay overrides del cliente, RESPETARLOS — no machacar
  ediciones manuales sin permiso. Si la primera vez, generar desde cero.

#### Step 2 — Decisiones de assets

Por plantilla, decide:

| Template | Asset clave | Default decision |
|---|---|---|
| `linkedin-quote` | `hero_image_url` (personaje) | Alfonso pose "presentando" en gradient. Genera con nano-banana-pro si no existe en R2. |
| `linkedin-9-slide` | `hero_image_url` (cover) + `cta_image_url` (CTA) | Cover: Alfonso "presentando". CTA: Alfonso "saludando". |
| `instagram-3-slide` | `hero_image_url` + `cta_image_url` | Idem, en cuadrado 1080×1080. |
| `blog-post` | `hero_image_url` | Alfonso "señalando dato" o pose contextual al post. |
| `blog-title` | (sin personaje) | Solo título + autor. Tipografía dominante. |

Si el personaje requerido no existe en R2, la skill lo genera primero (sigue
las reglas de la sección "Cómo generar imágenes" de arriba) y persiste la URL
pública en R2.

#### Step 3 — Regenerar/sobrescribir HTMLs

Para cada plantilla:

1. Si ya existe una versión del cliente en
   `brand/{slug}/brand-book/visual-identity/templates/{id}/`: cargarla como
   base (preserva ediciones puntuales del cliente). Si no existe (primera
   vez): generar el HTML desde cero usando el sistema visual SC-G4U
   documentado más arriba.
2. Aplica/refresca las customizaciones brand-specific:
   - **Gradients multi-stop**: usa la versión completa de `gradient.brand`
     del design-tokens, no solo 2 colores
     (ej. growth4u: `linear-gradient(160deg, #032149, #1a3690 35%, #0faec1)`).
   - **Stripe lateral**: usa la versión multi-color completa
     (ej. growth4u: `#0faec1, #3f45fe, #6351d5` en 3 stops).
   - **Bokeh blobs**: añade un 3º blob con color secundario (purple, sky).
   - **Default `hero_image_url`** en `meta.json` apuntando a la URL del
     personaje generado en Step 2.
   - Mantener `{{brand.*}}` tokens donde aplique para que MC sustituya en
     runtime.
3. Guarda en `brand/{slug}/brand-book/visual-identity/templates/{id}/`. El
   loader de MC lee directamente de ahí.
4. Si el cliente tenía overrides manuales de un archivo, ABRIR pregunta
   (AskUserQuestion): "Detecté ediciones en X. ¿Sobrescribir o conservar?".
   Default conservador: conservar.

#### Step 4 — Validación

- Renderizar cada plantilla con datos de prueba via Playwright.
- Verificar que respeta los mínimos de R5 (visual-identity SKILL): texto ≥
  24px en 1080, contraste ≥ 4.5:1, personaje no se sale del canvas, etc.
- Si falla algún chequeo: generar versión nueva (max 10 iteraciones / R3).

#### Step 5 — Reportar

Output en chat:
```
✓ growth4u — 5 plantillas regeneradas
  · linkedin-quote: Alfonso presentando (R2: alfonso-gradient-v3.png)
  · linkedin-9-slide: cover + CTA con Alfonso, gradient multi-stop
  · instagram-3-slide: cover + CTA cuadrado
  · blog-post: Alfonso señalando dato
  · blog-title: tipografía dominante (sin personaje)
Validation: pasa R5 en las 5. 0 iteraciones extra.
```

### Iteraciones puntuales (sin regenerar todo)

**Cliente quiere ajuste en 1 plantilla** (ej. "el blog-title se ve
demasiado pequeño el título"):

1. Editar directamente desde MC UI → Foundation → Brand Book → Visual
   Identity → templates → click sobre el archivo HTML → vista 2-col (HTML
   editor a la izquierda + iframe preview en vivo a la derecha) → Guardar.
2. Alternativa por chat: usar el thread del pillar visual-identity y pedir
   el cambio. Esta skill (o `visual-identity` parent) edita el archivo
   `brand/{slug}/brand-book/visual-identity/templates/{id}/template.html`
   directamente.
3. Cambios de diseño que aplican a TODAS las brands se propagan
   re-ejecutando esta skill (o el `[brand]-visual-generator` equivalente)
   por brand. No hay seed compartido — cada brand mantiene sus propios
   archivos.

### Reset / regenerar una brand desde cero

Caso: el cliente arruinó las plantillas y quiere volver a empezar.

```bash
rm -rf workspace-sancho/brand/{slug}/brand-book/visual-identity/templates
```

La UI mostrará el empty state "esta brand no tiene plantillas todavía".
Re-ejecutar esta skill (`growth4u-visual-generator`, o el equivalente para
otra brand) para que las regenere desde cero leyendo design-tokens y
visual-identity, con calidad real brand-specific.

### Slot conventions (para que el redactor pueda rellenarlas con AskUserQuestion)

Single-slide:
- `kicker` (texto upper) → etiqueta superior
- `title` / `concept` / `headline` → titular principal
- `data_value` + `data_label` → cifra destacada (opcional)
- `hero_image_url` → URL del personaje (opcional)
- `attribution` / `author` → quién lo dice / firma

Multi-slide:
- `cover_*` → portada
- `cta_*` → última slide
- `slide_title` + `slide_text` (perSlide: true) → contenido de las body slides
- `hero_image_url` + `cta_image_url` → personaje opcional en cover y CTA

Mantén estos nombres consistentes entre brands distintas para que el editor
genérico de Mission Control sirva sin per-brand customization.
