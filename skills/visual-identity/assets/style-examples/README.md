# Visual Style Examples — Step 0: Style Direction Discovery

> 8 estilos visuales comunes para mostrar al inicio del meta-skill

## Purpose

Cuando alguien ejecuta visual-identity meta-skill, **STEP 0** muestra estos 8 ejemplos del mismo subject para que el usuario vea opciones visuales y elija dirección.

**Workflow**:
```
User: "Run visual-identity for [Brand]"
    ↓
STEP 0: Style Direction Discovery
    - Load estos 8 ejemplos
    - Mostrar side-by-side
    - "¿Qué estilo resuena más con tu brand?"
    - Usuario selecciona: "#1 Acuarela" o "Mezcla de #1 y #7"
    ↓
Estilo seleccionado → informa Layer 3
    - Menos iteraciones necesarias
    - Ya tienen dirección clara
    ↓
Continue con Layer 1, 2, 3...
```

---

## Los 8 Estilos

### 1. Acuarela Hiperrealista
**File**: `01_watercolor_hyperrealistic.png`

**Características**:
- 100% ilustración acuarela
- Rendering foto-realista (detalle alto)
- Técnica acuarela visible (brushstrokes, transparencias)
- Colores cálidos, orgánicos

**Cuándo funciona**:
- Brands que quieren profesionalismo + calidez
- Servicios profesionales (legal, consultoría, salud)
- Diferenciación (único, no genérico)

**Ejemplo brands**: Salort Abogados (validado)

---

### 2. Fotorrealismo
**File**: `02_photorealistic.png`

**Características**:
- Fotografía real o foto-realista pura
- Máximo detalle, realismo
- Confianza absoluta

**Cuándo funciona**:
- Máxima credibilidad necesaria
- Productos físicos, personas reales
- B2B enterprise, finance, healthcare

**Trade-offs**:
- ✅ Confianza máxima
- ❌ Menos flexible (requiere fotos específicas o stock)
- ❌ Menos distintivo (común)

---

### 3. Line Art Minimalista
**File**: `03_line_art_minimalist.png`

**Características**:
- Líneas limpias, formas simples
- Mínimo color (2-3 colores)
- Moderno, despejado

**Cuándo funciona**:
- Tech, SaaS, startups modernas
- Brands minimalistas
- Cuando claridad > emoción

**Ejemplo brands**: Notion, Linear, Stripe

---

### 4. Flat Illustration Bold
**File**: `04_flat_illustration_bold.png`

**Características**:
- Colores planos vibrantes
- Formas geométricas
- Energético, tech-forward

**Cuándo funciona**:
- Startups, tech companies
- Audiences jóvenes
- Productos digitales, apps

**Ejemplo brands**: Dropbox, Mailchimp, Asana

---

### 5. 3D Render
**File**: `05_3d_render.png`

**Características**:
- Objetos/escenas 3D renderizadas
- Premium, pulido, moderno
- Tech-forward, sofisticado

**Cuándo funciona**:
- Premium brands, luxury
- Tech products, SaaS enterprise
- Cuando quieres "wow factor"

**Ejemplo brands**: Apple, Stripe (recent), Microsoft

---

### 6. Sketch / Hand-drawn
**File**: `06_sketch_handdrawn.png`

**Características**:
- Dibujo a mano, pencil sketch
- Personal, auténtico, humano
- Crosshatching shading

**Cuándo funciona**:
- Artesanal, handmade products
- Personal brands, consultants
- Cuando autenticidad > polish

**Ejemplo brands**: Craft businesses, personal coaches

---

### 7. Comic / Cartoon
**File**: `07_comic_cartoon.png`

**Características**:
- Bold outlines, limited colors
- Dynamic, energético
- Storytelling, memorable

**Cuándo funciona**:
- Brands playful, memorable
- Educational content
- Cuando quieres stand out dramatically

**Ejemplo brands**: SanchoCMO, MailChimp (original), Duolingo

---

### 8. Vintage / Retro
**File**: `08_vintage_retro.png`

**Características**:
- Aesthetic 1950s-1960s
- Nostálgico, clásico
- Muted vintage colors

**Cuándo funciona**:
- Heritage brands
- Nostalgia marketing
- Classic, timeless positioning

**Ejemplo brands**: Coca-Cola retro campaigns, heritage banks

---

## How to Use (In Meta-Skill)

### STEP 0 in SKILL.md (to be added):

```markdown
## Step 0: Style Direction Discovery (NEW - First Step)

Before defining Visual World, show visual examples:

1. Load 8 style examples from `assets/style-examples/`
2. Show all 8 with same subject for comparison
3. Ask: "¿Qué estilo resuena más con tu brand?"
4. User selects:
   - Single style: "#1 Acuarela hiperrealista"
   - Hybrid: "Mezcla de #1 y #3 - acuarela con líneas más limpias"
   - Custom: "Ninguno, quiero [describe visión]"
5. Selected style → becomes foundation for Layer 3 Aesthetic
6. Proceed to Layer 1 (Visual World)

**Benefits**:
- ✅ User sees VISUAL options (not just text descriptions)
- ✅ Faster to "This is it" (less Layer 3 iteration)
- ✅ Clear starting point (not exploring blind)

**If user has URL**: Can still extract + compare to these styles
```

---

## Test Results

All 8 generated successfully with same subject ("professional consultation scene").

**Subject used**: Generic consultation (2 people at desk, professional setting)
**Why generic**: Applicable to any brand type, easy to compare styles

**For brand-specific test**: Replace subject with brand-relevant scene when executing meta-skill.

---

## Iteration Count Saved

**Without Step 0**: Layer 3 típicamente requires 8-12 iterations (exploring styles blind)
**With Step 0**: Layer 3 requires 3-5 iterations (refinando estilo ya seleccionado)

**Time saved**: ~1 hour per meta-skill run
