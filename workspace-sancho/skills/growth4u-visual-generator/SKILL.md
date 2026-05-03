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
brand/{slug}/content/carousel-templates/{template-id}/
├── meta.json
├── template.html        # single-slide
└── slide-cover/body/cta.html   # multi-slide
```

**Bootstrap automático**: hay un directorio seed (read-only) en
`workspace-sancho/skills/_shared/carousel-templates/` con las 5 plantillas
oficiales en formato neutral (gradients y colores usan `{{brand.primary}}`,
`{{brand.accent}}` en lugar de hex hardcoded). La primera vez que MC carga
las plantillas para un brand, copia desde seed los archivos que falten al
directorio del cliente. Después, los archivos del cliente son la fuente de
verdad — ediciones nunca tocan el seed, ni el seed sobrescribe ediciones del
cliente.

Implicación: si añades una plantilla nueva al seed, todas las brands la
reciben automáticamente al siguiente render. Si quitas un archivo del brand
dir, también se recopia desde el seed (no es destructivo — solo rellena
huecos).

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

### Cómo iterar / regenerar las plantillas

Cuando el cliente pide cambios visuales (cambia paleta, añade carrusel nuevo,
ajusta el ratio de blog-title):

**Para una sola brand**:
1. **Editar** `brand/{slug}/content/carousel-templates/{id}/template.html`
   o crear uno nuevo con su `meta.json`. Los cambios solo afectan a esa brand.
2. **Validar** el render desde MC UI → Content Creation → Configuración → 🎨
   Carrusel → click sobre la plantilla. La preview se actualiza al instante
   (es un iframe del HTML real escalado).
3. **Asegurar** que el resultado respeta los mínimos de tamaño de texto que
   manda la skill `visual-identity` R5 (24px body en 1080×1080, etc.).
4. Si la plantilla necesita un personaje nuevo (pose/expresión que no existe),
   primero genera el PNG con `nano-banana-pro` (siguiendo las reglas de arriba
   de esta skill), súbelo a R2, y referencia su URL como `slot.hero_image_url`
   default en el `meta.json`.

**Para todas las brands a la vez** (cambios al diseño "oficial"):
1. **Editar** `workspace-sancho/skills/_shared/carousel-templates/{id}/...`
   — el seed. Mantener `{{brand.*}}` tokens (no hex) para que cada brand
   aplique su paleta automáticamente.
2. **Reset opcional** en una brand: borra su `brand/{slug}/content/carousel-templates/{id}/`
   y al siguiente load se recopia desde seed. Brands con overrides intencionales
   los conservan (el seed solo rellena lo que falta).

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
