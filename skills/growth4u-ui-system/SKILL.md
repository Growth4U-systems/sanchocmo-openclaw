# growth4u-ui-system

Sistema de UI y templates para Growth4U. Genera templates HTML pixel-perfect para social, web y lead magnets.

## Contexto
- **Design Tokens CSS**: `brand/growth4u/brand-identity/visual-identity/design-tokens.css`
- **Design Tokens JSON**: `brand/growth4u/brand-identity/visual-identity/design-tokens.json`
- **Idea Mapping**: `brand/growth4u/brand-identity/visual-identity/idea-mapping.md`
- **Visual Guide**: `brand/growth4u/brand-identity/visual-identity/visual-identity-guide.html`
- **Mockups dir**: `brand/growth4u/brand-identity/visual-identity/mockups/`

## Design System

### Paleta
```css
--g4u-navy: #032149;      /* Líneas, fondos dark, texto */
--g4u-royal: #1a3690;     /* Fondos secundarios, gradientes */
--g4u-electric: #3f45fe;  /* Acentos, interactivos */
--g4u-sky: #45b6f7;       /* Highlights suaves */
--g4u-teal: #0faec1;      /* CTAs, datos, gafas, logo 4U */
--g4u-purple: #6351d5;    /* Badges, premium, detalles */
```

### Gradientes
```css
--g4u-gradient-brand: linear-gradient(160deg, #032149 0%, #1a3690 35%, #0faec1 100%);
--g4u-gradient-logo: linear-gradient(90deg, #0faec1, #3f45fe, #6351d5);
```

### Tipografía
- **Títulos**: `Manrope` Bold/ExtraBold (Google Fonts)
- **Cuerpo**: `Roboto` Regular/Medium (Google Fonts)
- **Mínimo social**: 24px en canvas 1080px

### Logo
```html
<span style="font-family: Manrope; font-weight: 800; font-size: 44px; color: white;">
  Growth<span style="background: linear-gradient(90deg, #0faec1, #3f45fe, #6351d5); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">4U</span>
</span>
```

## Templates disponibles

### LinkedIn Quote Post (1080×1350)
**Archivo**: `mockups/mockup-linkedin-v3.html`
**Estructura**:
- Fondo: imagen del personaje con gradient integrado (`object-fit: cover`)
- Logo: arriba izquierda, 44px, text-shadow
- Bottom fade: `height: 550px`, navy 92-100% opacity
- Quote: Manrope 800, 54px, highlights en `color: #0faec1`
- Autor: Manrope 800 30px + Roboto 500 22px
- URL tag: border teal, 22px

**Para crear variante**: duplicar HTML, cambiar:
1. `src` de la imagen del personaje
2. Texto del quote + spans `.highlight`
3. Nombre y rol del autor

### Screenshot
```bash
npx playwright screenshot --viewport-size="[W],[H]" file://[PATH]/template.html output.png
```

## Formatos por canal

| Canal | Formato | Dimensiones | Fondo |
|---|---|---|---|
| LinkedIn post | Vertical | 1080 × 1350 | Gradient brand |
| LinkedIn carousel cover | Horizontal | 1200 × 628 | White o gradient |
| LinkedIn carousel slide | Horizontal | 1200 × 628 | White |
| Instagram post | Cuadrado | 1080 × 1080 | White |
| Instagram story | Vertical | 1080 × 1920 | Gradient brand |
| Blog header | Horizontal | 1200 × 630 | White |
| Lead magnet portada | Vertical | A4 | Gradient brand |
| Lead magnet interior | Vertical | A4 | White |

## Reglas de composición

1. **Fade para texto sobre imagen**: mínimo 550px de alto, navy 92-100% opacidad
2. **Contraste**: text-shadow `0 2px 8px rgba(3,33,73,0.6)` para texto blanco sobre imagen
3. **Highlights**: palabras clave en `color: var(--g4u-teal)`
4. **Datos**: números grandes en Manrope Bold 36px+ en teal
5. **Logo siempre visible**: esquina superior izquierda, con text-shadow en dark
6. **growth4u.io**: esquina inferior derecha en posts social (border teal, border-radius 8px)
7. **Elementos decorativos del brandbook**: pills (border-radius 30px, opacity 0.06-0.08), dot grids (8px dots, gap 12px, opacity 0.15)

## Cómo usar

1. Leer `idea-mapping.md` para saber qué asset/template usar según tipo de contenido
2. Importar `design-tokens.css` para tener todas las variables
3. Usar `growth4u-visual-generator` skill para generar las ilustraciones
4. Componer con template HTML + screenshot con Playwright
