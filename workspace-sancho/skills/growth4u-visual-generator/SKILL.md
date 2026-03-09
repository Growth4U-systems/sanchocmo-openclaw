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
