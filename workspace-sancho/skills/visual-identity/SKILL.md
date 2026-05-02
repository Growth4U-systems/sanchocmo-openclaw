---
name: visual-identity
description: "Visual identity meta-skill: defines how brand LOOKS and generates production child skills. Use when: establishing visual identity, defining brand aesthetics, creating visual guidelines, building design system, generating brand illustration style, defining color/typography/imagery systems. Two modes: Quick (~30min, Visual Snapshot from URL + brandbook) and Full (~2-3h, 3-layer system + child skills). Triggers: visual identity, brand visuals, look and feel, design system, brand aesthetics, visual guidelines, brand style, illustration style, visual DNA. ALWAYS asks for brandbook/brand assets FIRST. Generates HTML deliverables for MC. NOT for: creating images directly (use generated child skills), brand voice (use brand-voice), or content creation."
---

# Visual Identity (Meta-Skill) v3

> Define cómo se ve la brand y genera skills de producción. Meta-skill: no crea imágenes — crea los SKILLS que crean imágenes.

## Skill Metadata
- **Version**: 3.0 | **Author**: Alfonso Sainz de Baranda (Growth4U) | **Updated**: 2026-03-08
- **Phase**: 1 (Foundation) | **Layer**: 0+4 | **Type**: meta-skill
- **Depends on**: none (Quick) | brand-voice, niche-discovery-100x, positioning-messaging (Full)

## Context
- **Reads**: `brand/{slug}/company-brief/current.md`, `brand/{slug}/brand-voice/current.md`, `brand/{slug}/go-to-market/positioning/*/current.md`
- **Writes**: `brand/{slug}/brand-identity/visual-identity/current.md`, `brand/{slug}/operational/assets.md`

**Input**: Brandbook + URL (Quick) | + brand-voice AI Brand Kit + ECPs + positioning (Full)
**Output**: Visual Snapshot / Visual DNA Kit + Child Skills → `brand/{slug}/visual-identity/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems Quick + Full + child generation |
| [concepts.md](references/concepts.md) | Si necesitas arquitectura, edge cases | Meta-skill design, Brian Castle, modes |
| [schema.md](references/schema.md) | Si necesitas el schema de campos | Tier 1/2/3 storage |
| [visual-world.md](references/visual-world.md) | Layer 1 template | Object inventory template |
| [idea-mapping.md](references/idea-mapping.md) | Layer 2 template | Content type → visual mapping |
| [visual-style.md](references/visual-style.md) | Layer 3 template | Aesthetic specifications |
| [composition-rules.md](references/composition-rules.md) | **SIEMPRE** durante generación | Anti-pegote, canal, tamaños |

---

## ⛔ Reglas Cardinales (violan = fallo de ejecución)

### R1: Brand Assets PRIMERO
ANTES de analizar, preguntar, o generar NADA:
1. Buscar URL principal en `company-context` → `web_fetch` → extraer colores/tipografías/logo
2. Preguntar: **"¿Tienes brandbook, manual de marca, o guía de estilo? Si sí, pásalo ANTES de continuar."**
3. Si hay brandbook → es la FUENTE DE VERDAD. No inventar colores/tipografías propias.
4. Si no hay brandbook → extraer de URL + preguntar preferencias.
- **NUNCA** usar tipografías/colores inventados si existen definidos.

### R2: Anti-Pegote
**NUNCA** componer personaje/ilustración + fondo con CSS overlay.
- Si necesitas personaje sobre fondo de color → genera TODO como UNA sola imagen con nano-banana-pro.
- Si necesitas texto sobre imagen → genera la imagen CON el texto integrado, O usa text-shadow obligatorio.
- CSS es para layout y estructura, NO para composición visual de piezas gráficas.

### R3: Gate Checks de Iteración
- **Máximo 2 opciones** por ronda → el cliente valida → iteras.
- **Máximo 10 generaciones** en todo el proceso (Quick + Full combinados).
- Si el cliente dice algo negativo → **PARA**. Pregunta QUÉ no le gusta antes de generar más.
- Lleva cuenta: `[Generación X/10]` en cada imagen.

### R4: Personajes Secundarios
Cuando generas personajes basados en fotos de personas reales:
- La imagen de referencia de estilo (persona principal) es SOLO para el estilo artístico.
- Para cada personaje secundario: `"DO NOT copy facial features from the style reference image — use it ONLY for art style. The subject is [descripción de la persona]"`
- Generar cada personaje **POR SEPARADO**, sin mezclar referencias.
- Validar parecido con foto original antes de seguir.

### R5: Tamaños Mínimos de Texto

| Canvas | Texto body | Títulos | Quotes/Headlines | Subtítulos |
|--------|-----------|---------|------------------|------------|
| 1080×1080 (IG/social) | ≥ 24px | ≥ 44px | ≥ 54px | ≥ 32px |
| 1200×628 (LinkedIn/OG) | ≥ 18px | ≥ 36px | ≥ 44px | ≥ 24px |
| 1920×1080 (blog/web) | ≥ 16px | ≥ 32px | ≥ 40px | ≥ 20px |

- Texto sobre imagen → `text-shadow` obligatorio o fondo semitransparente.
- **Nunca** texto < 16px en ningún canvas.

### R6: Output = HTML Presentable
- MC renderiza HTML → **SIEMPRE** ofrecer entregable como HTML con imágenes inline.
- El output del Full mode es un documento visual presentable, NO solo un .md.
- Estructura: HTML con estilos inline, imágenes en base64 o URLs, tipografías del brandbook.
- Para confirmaciones intermedias: generar HTML preview en MC.

---

## Flujo de Ejecución

### Step -1: Brand Assets Intake (OBLIGATORIO — antes de TODO)

```
1. Leer company-context → extraer url_primary
2. web_fetch(url_primary) → analizar: colores, tipografías, logo, estilo visual
3. Buscar /assets, /brand, /press en la web
4. Preguntar al cliente:
   - "¿Tienes brandbook o manual de marca?"
   - "¿Logo en formato vectorial (SVG/AI)?"
   - "¿Paleta de colores y tipografías ya definidos?"
5. Si brandbook existe → CARGARLO Y ANALIZARLO antes de continuar
6. Documentar: qué assets tenemos, qué falta, fuente de cada dato
7. Persistir el logo siguiendo la convención canónica (sección de abajo).
```

**Output**: Inventario de assets existentes con fuente primaria de cada uno + logo registrado on-disk o marcado como `missing: true`.

#### Logo: convención canónica (no negociable)

Mission Control y la skill de carrusel esperan el logo en una ruta fija:

```
brand/{slug}/brand-book/visual-identity/logo-light.png   # OBLIGATORIO si hay logo
brand/{slug}/brand-book/visual-identity/logo-dark.png    # opcional (variante para fondos oscuros)
```

PNG con transparencia, ratio horizontal o cuadrado, ancho mínimo 800px (para que aguante en carruseles 1080×1350 sin pixelar).

Reglas durante el intake:

- **Si encontraste logo en la web del cliente** (web_fetch encontró un asset claro en `/assets`, `/brand` o el header de la home): descárgalo, conviértelo a PNG con fondo transparente si hace falta, y escríbelo a `brand/{slug}/brand-book/visual-identity/logo-light.png`. Si tienes versión sobre fondo oscuro, también `logo-dark.png`.
- **Si el cliente te aportó el archivo** (vía AskUserQuestion con upload o URL pegada): mismo destino canónico.
- **Si NO hay logo y el cliente confirma que no tiene**: NO inventes uno. Marca el flag de "missing registered" en `design-tokens.json`:

  ```json
  {
    "logo": {
      "full": "Growth4U",
      "short": "G4U",
      "colorRules": { ... },
      "missing": true,
      "reason": "cliente sin logo: usaremos wordmark de texto"
    }
  }
  ```

  Importante: con el flag, MC distingue "registrado como inexistente" (no preguntes más downstream) de "skill upstream no ha corrido todavía" (lanza la skill). Sin el flag, content-engine-setup y el carrusel tendrán que volver a preguntar al usuario.

- **Si dudas**: prefiere `missing: true` con `reason: "no encontrado en web ni aportado por cliente; pendiente de revisión"` antes que dejar el campo silencioso.

**NO** dejes el logo solo en `mockups/` o `_archive/`. Esos son working dirs; `logo-light.png` en la raíz de `visual-identity/` es la fuente de verdad.

Para clientes existentes con logos colocados en otros sitios (mockups antiguos, brand-identity legacy), corre el backfill desde la raíz de Mission Control:

```bash
tsx scripts/backfill-brand-logo.mts --slug={slug}
```

Mueve cualquier candidato razonable al path canónico y, si no hay nada, escribe `logo.missing: true`.

### Step 0: Context Hydration
- Lee `references/hydration.md` para el mapeo específico
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map + assets del Step -1
- Presenta al usuario: "De [fuente] ya tengo X. Del brandbook tengo Y. ¿Correcto?"
- Solo pregunta campos genuinamente nuevos

### Quick Mode (Layer 0 — siempre primero)

1. **Con URL** (Path A): Assets intake ya hecho → extraer patrones visuales → Visual Snapshot
2. **Sin URL** (Path B): 5 Quick Questions (ver `references/concepts.md`)
3. **Generar Visual Snapshot**: 3 adjetivos visuales + paleta (DEL BRANDBOOK si existe) + tipografía (DEL BRANDBOOK) + imagery + design tokens lite + confidence
4. **Presentar como HTML** en MC para validación

### Full Mode (Layer 4 — cuando brand-voice + ECPs listos)

**Prerequisitos**: Visual Snapshot aprobado + brand-voice AI Brand Kit + ECPs + Positioning

#### Fase 1: Dirección de Estilo (2-4 generaciones máx)
1. Cargar: Visual Snapshot + brand-voice + ECPs + brandbook assets
2. **Step 0 Style Discovery**: Mostrar 2 direcciones de estilo (no 8) basadas en brand-voice
3. Generar 1 ejemplo por dirección → `[Generación 1/10]` y `[Generación 2/10]`
4. Cliente elige → iterar SI es necesario (máx 2 más)

#### Fase 2: 3-Layer Build
5. **Layer 1 — Visual World**: 5-7 categorías de objetos + escenas + exclusiones → `references/visual-world.md`
6. **Layer 2 — Idea Mapping**: Decision tree content type → concepto visual → objetos → `references/idea-mapping.md`
7. **Layer 3 — Aesthetic**: Codificar 7 dimensiones + AI prompt library → `references/visual-style.md`
   - Usar assets del brandbook como base (colores, tipografías, logo)
   - Generar 1-2 samples de validación
   - **Verificar reglas de composición** → leer `references/composition-rules.md`

#### Fase 3: Entregables
8. **Tabla de composición por canal** (ver R2 + composition-rules.md)
9. **Visual Do's / Don'ts** con pares de ejemplo
10. **Generar Child Skills** (si templates disponibles):
    - `[brand]-ui-system` → tokens + componentes
    - `[brand]-visual-generator` → 3 layers + nano-banana-pro config
    - Verificar: YAML válido, archivos existen, test invocation
11. **Assemblar Visual DNA Kit** como HTML presentable

---

## Tabla de Composición por Canal

| Canal | Fondo | Regla de composición |
|-------|-------|---------------------|
| LinkedIn (dark) | Gradient oscuro integrado | Generar personaje CON gradient en la misma imagen |
| Blog (light) | Blanco/claro | Generar ilustración SOBRE fondo blanco en la imagen |
| Instagram | Escena completa | Generar escena completa como una sola pieza |
| Twitter/X | Flexible | Ilustración con fondo sólido integrado |
| Email header | Claro | Ilustración limpia sobre fondo de marca |
| Landing page | Variable | Generar cada sección como pieza integrada |

**Regla universal**: El fondo de color SIEMPRE va en el prompt de generación, NUNCA como CSS detrás de la imagen.

---

## Integración con nano-banana-pro

Para generar imágenes durante el proceso:
1. Leer el skill `nano-banana-pro` para conocer parámetros
2. Pasar el prompt completo: `[AI Base Prompt] + [Subject from Idea Mapping] + [Background from Composition Table]`
3. Para personajes con foto de referencia: adjuntar imagen + instrucciones claras sobre qué copiar (estilo) y qué no (rasgos faciales de otros)
4. Llevar cuenta de generaciones: `[Generación X/10]`

---

## 15 Strategic Questions (Full Mode Build)

Presentar como 3 rondas conversacionales, no un cuestionario de 15 preguntas sueltas:
- **Ronda 1** (Q1-Q6): Personalidad visual + colores — proponer basándose en brand-voice + brandbook
- **Ronda 2** (Q7-Q12): Tipografía + imagery — confirmar brandbook fonts, definir estilo de imagen
- **Ronda 3** (Q13-Q15): Visual world + mapping — objetos, exclusiones, adaptación por canal

**Detalle completo de cada pregunta y pipeline de 9 steps**: ver [prompt.md](references/prompt.md)

---

## Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **0 ❌** antes de entregar
- Verificar: ¿cada color/tipografía viene del brandbook? ¿O tiene justificación si es nuevo?
- Verificar: ¿tamaños de texto cumplen R5?
- Verificar: ¿ninguna composición viola R2 (anti-pegote)?
- Verificar: ¿generaciones ≤ 10 total?
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ | generaciones: Z/10 -->`

---

## Guardar con versionado
- Ruta: `brand/{slug}/visual-identity/current.md`
- HTML presentable: `brand/{slug}/visual-identity/visual-guide.html`
- Backup + versionado + history.json
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/visual-identity/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Visual Snapshot | Quick reference for early content |
| Visual DNA Kit | landing-pages, social-content, email-sequences, paid-ads |
| Visual World inventory | Generated child skills (object selection) |
| Idea Mapping tree | Generated child skills (what to illustrate) |
| Aesthetic + AI prompts | Generated child skills (how to generate) |
| Design Tokens (JSON/CSS) | Generated child skills (web/UI styling) |
| Composition Table | Generated child skills (per-channel rules) |
| **[brand]-ui-system** | User invokes for web pages |
| **[brand]-visual-generator** | User invokes for images |

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/visual-identity/
├── current.md         ← versión activa (datos estructurados)
├── visual-guide.html  ← entregable visual presentable
├── v1.md, v2.md...    ← versiones anteriores
├── history.json       ← log de versiones
├── qa-log.md          ← historial de QA
└── assets/            ← imágenes generadas durante el proceso
```
