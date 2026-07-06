# Visual Identity — Self-QA Checklist v3

> Revisar ANTES de entregar. ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente.
> Solo se entrega cuando 0 ❌. Si hay ❌, completar primero.

---

## Step -1: Brand Assets Intake

- [ ] **Brandbook solicitado** al cliente ANTES de cualquier análisis
- [ ] **URL principal** scrapeada (colores, tipografías, logo extraídos)
- [ ] **Si brandbook existe** → cargado y analizado como fuente de verdad
- [ ] **Tipografías**: vienen del brandbook/web, NO inventadas
- [ ] **Colores**: vienen del brandbook/web, NO inventados
- [ ] **Logo**: documentado (variantes, formatos disponibles)

---

## Quick Mode (Layer 0)

- [ ] **3 visual adjectives** definidos
- [ ] **Color Palette** del brandbook/web (primary, secondary, accent con hex)
- [ ] **Typography** del brandbook/web (heading + body fonts)
- [ ] **Imagery Style** definido (type + mood)
- [ ] **Lite Visual World** (3-5 objetos)
- [ ] **Overall Aesthetic** descrito (1-2 frases)
- [ ] **Design Tokens (lite)** generados en JSON
- [ ] **Confidence level** marcado (High/Medium/Low)
- [ ] **Gaps para Full mode** identificados
- [ ] **HTML preview** generado para validación en MC

---

## Reglas Cardinales (verificar en TODO momento)

### R1: Brand Assets
- [ ] **CERO colores/tipografías inventados** si existe brandbook
- [ ] **Fuente primaria documentada** para cada decisión visual

### R2: Anti-Pegote
- [ ] **CERO composiciones CSS** de personaje/ilustración sobre fondo
- [ ] **Toda pieza visual** generada como imagen completa integrada
- [ ] **Tabla de composición por canal** aplicada correctamente

### R3: Gate Checks
- [ ] **Máximo 2 opciones** presentadas por ronda
- [ ] **Generaciones totales ≤ 10** (tracking: [X/10] en cada una)
- [ ] **Feedback negativo** → PARAR y preguntar antes de regenerar

### R4: Personajes
- [ ] **Personajes secundarios** generados SIN copiar rasgos del principal
- [ ] **Cada personaje** validado contra foto original
- [ ] **Prompt incluye** "DO NOT copy facial features from style reference"

### R5: Tamaños de Texto
- [ ] **Ningún texto < 16px** en ningún canvas
- [ ] **Tabla de tamaños mínimos** respetada por canvas size
- [ ] **Text-shadow o fondo semi** en texto sobre imagen
- [ ] **Contraste WCAG AA** verificado (4.5:1 mínimo)

### R6: Output HTML
- [ ] **Entregable final** en HTML presentable (no solo .md)
- [ ] **Confirmaciones intermedias** como HTML preview en MC
- [ ] **Imágenes inline** (base64 o URLs) en el HTML

---

## Full Mode (Layer 4)

### Input Verification
- [ ] **Visual Snapshot** del Quick mode aprobado por cliente
- [ ] **Brand-voice AI Brand Kit** cargado
- [ ] **ECPs seleccionados** con personas
- [ ] **Positioning data** cargada
- [ ] **Brandbook/assets** ya analizados (Step -1)

### Fase 1: Dirección de Estilo
- [ ] **2 direcciones** propuestas (no 8)
- [ ] **1 ejemplo por dirección** generado
- [ ] **Cliente eligió** dirección → documentada
- [ ] **Máx 4 generaciones** en esta fase

### Layer 1: Visual World
- [ ] **5-7 object categories** propuestas y validadas
- [ ] **Exclusiones** definidas
- [ ] **visual-world.md** generado
- [ ] **Test**: "para imagen sobre X, ¿qué objetos usarías?"

### Layer 2: Idea Mapping
- [ ] **Decision tree** construido
- [ ] **Mappings por content type** definidos
- [ ] **idea-mapping.md** generado
- [ ] **Test**: "para post sobre X, ¿qué ilustrarías?"

### Layer 3: Aesthetic
- [ ] **Brandbook** como base para colores/tipografías
- [ ] **7 dimensiones** codificadas
- [ ] **AI prompt library** generada (base + keywords + negatives)
- [ ] **1-2 samples validados**
- [ ] **visual-style.md** generado
- [ ] **Iteration criteria**: flexible ✅ distinctive ✅ consistent ✅ scalable ✅

### Composición por Canal
- [ ] **Tabla** de composición completada para cada canal relevante
- [ ] **Cada entrada** especifica: dimensiones, fondo, regla de composición
- [ ] **CERO overlays CSS** en la tabla

### Visual Do's / Don'ts
- [ ] **5+ pares** de Do/Don't con razonamiento
- [ ] **Anti-pegote** incluido como Don't explícito
- [ ] **Tamaños de texto** incluidos como Do explícito

### Child Skill Generation (si aplica)
- [ ] **[brand]-ui-system** generado con tokens del brandbook
- [ ] **[brand]-visual-generator** generado con 3 layers + nano-banana-pro
- [ ] **YAML válido** en cada child skill
- [ ] **Test invocation** pasado

### Visual DNA Kit
- [ ] **Visual Personality** (core traits, emotion, differentiation)
- [ ] **Visual World** quick-ref
- [ ] **Idea Mapping** quick-ref
- [ ] **Aesthetic** summary + AI prompts
- [ ] **Design Tokens** JSON completo (del brandbook)
- [ ] **WCAG 2.2 AA** compliance confirmada
- [ ] **Visual Do's / Don'ts** (5+ pares)

---

## Almacenamiento

- [ ] **Slug** correcto
- [ ] **visual-identity.current.md** guardado en `brand/{slug}/visual-identity/`
- [ ] **visual-guide.html** generado como entregable presentable
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link MC** generado para el usuario

## META

- [ ] **Cada decisión visual tiene justificación** (fuente: brandbook/URL/cliente)
- [ ] **Alignment con brand-voice** verificado
- [ ] **Generaciones totales**: ___/10
- [ ] **Metadata QA**: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ | gen: Z/10 -->`
