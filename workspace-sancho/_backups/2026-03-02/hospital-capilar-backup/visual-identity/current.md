<!-- version: 1 | fecha: 2026-02-28 | skill: visual-identity | mode: quick | qa: PASS -->
<!-- Self-QA: PASS | 2026-02-28 | items: 8✅ 0⚠️ 0❌ -->
<!-- Sources: hospitalcapilar.com (scrape + CSS extraction), self-intelligence v2 -->

# Visual Snapshot — Hospital Capilar
> Owner: /visual-identity | Updated: 2026-02-28 | Version: 1 | Mode: Quick (Layer 0)

---

## 3 Adjetivos Visuales

**Clínico · Limpio · Premium-accesible**

La web transmite entorno médico de confianza con aspiración premium, pero sin intimidar. Mucho blanco, tipografía moderna, toques de color contenidos.

---

## Paleta de Colores (extraída)

| Rol | Color | Hex | Uso actual |
|-----|-------|-----|------------|
| **Primario (teal oscuro)** | rgb(0, 72, 82) | `#004852` | Headings, links, fondos de sección |
| **Acento (teal claro)** | rgb(72, 176, 160) | `#48B0A0` | Botones "Saber más", links hover |
| **CTA principal** | rgb(85, 190, 174) | `#55BEAE` | Botón "Solicitar valoración" |
| **Texto principal** | rgb(51, 51, 51) | `#333333` | Body text |
| **Texto oscuro** | rgb(20, 20, 20) | `#141414` | Nav, headings en fondo claro |
| **Fondo** | rgb(255, 255, 255) | `#FFFFFF` | Background principal |
| **Gris sutil** | rgb(214, 214, 214) | `#D6D6D6` | Bordes, separadores |

**Observaciones**:
- Paleta muy restringida: esencialmente monocromática teal + grises
- Sin rojo, naranja ni colores cálidos — coherente con posicionamiento médico
- El teal oscuro (#004852) es el color de marca — aparece en headings y fondos hero
- El teal claro (#48B0A0 / #55BEAE) funciona como acento y CTA
- Alto contraste blanco/teal: sensación limpia y profesional

---

## Tipografía (extraída)

| Rol | Familia | Peso | Tamaño |
|-----|---------|------|--------|
| **Headings** | Raleway | 700 (Bold) | 46px (H1), 30px (H2), 21px (H3) |
| **Subheadings** | Raleway | 600 (Semi-Bold) | 25px |
| **Body** | System stack (-apple-system, Segoe UI, Roboto...) | 400 | 16px |

**Observaciones**:
- Raleway como display/heading: moderna, geométrica, limpia — buena elección para health/beauty
- Body sin fuente custom → oportunidad de mejora (podría usar Raleway Light o una sans-serif complementaria)
- Jerarquía clara H1 > H2 > H3 con saltos de tamaño proporcionales
- Todo uppercase en headings de sección — da sensación de autoridad

---

## Estilo de Imagen

**Tipo dominante**: Fotografía real (clínica + pacientes)
- **Clínica**: Fotos de instalaciones — espacios blancos, iluminación quirúrgica, equipamiento moderno
- **Resultados**: Antes/después de pacientes reales — formato comparativo, fondo neutro
- **Equipo**: Fotos del fundador (Óscar Mendoza) y equipo médico — bata blanca, entorno clínico
- **Mood**: Profesional, aséptico pero no frío. Transmite "esto es serio, pero vas a estar bien"

**Ausencias notables**:
- Sin ilustraciones ni iconografía custom
- Sin fotografía lifestyle (pacientes felices fuera de clínica)
- Sin elementos gráficos decorativos
- Sin video integrado visible (hay un botón de reproducir pero no es prominente)

---

## Logo

- **Formato**: Texto + icono (marca mixta)
- **Versiones detectadas**: Logo blanco sobre fondo teal (footer), logo oscuro sobre blanco (header)
- **Estilo**: Limpio, sans-serif, profesional
- **Tamaño**: Compacto en header, presencia moderada

---

## Visual World Lite (3-5 objetos recurrentes)

1. **Quirófano / silla de tratamiento** — el espacio donde ocurre la transformación
2. **Antes/después** — la prueba visual del resultado
3. **Bata médica / equipo clínico** — autoridad y profesionalismo
4. **Fachada de clínica** — presencia física, cercanía geográfica
5. **Hair Revolution Box** — producto tangible, experiencia premium

---

## Componentes UI (observados)

| Componente | Estilo |
|------------|--------|
| **Botones CTA** | Fondo teal (#55BEAE), texto blanco, uppercase, sin borde visible |
| **Botones secundarios** | Texto teal (#48B0A0), fondo transparente, estilo link |
| **Cards de precios** | Fondo blanco, lista con checks, precio destacado, CTA al final |
| **Formularios** | Inputs con borde sutil, dropdown para provincia, layout vertical |
| **Carruseles** | Flechas laterales + dots, para clínicas y medios |
| **Secciones** | Alternancia blanco / teal oscuro como fondo |

---

## Confidence & Gaps

| Dimensión | Confianza | Notas |
|-----------|-----------|-------|
| Colores | 🟢 Alta | Extraídos directamente del CSS |
| Tipografía | 🟢 Alta | Raleway confirmada vía CSS |
| Estilo fotográfico | 🟡 Media | Solo home analizada, falta Instagram/RRSS |
| Logo | 🟡 Media | Visto en web, faltan variantes SVG/PDF |
| Componentes | 🟡 Media | Patterns básicos observados |
| Visual World | 🟠 Baja | Inferido, necesita validación con cliente |

---

## Recomendaciones para Full Mode

1. **Definir body font** — actualmente stack del sistema, merece una fuente propia
2. **Ampliar paleta** — el teal funciona, pero falta acento cálido para tratamientos (vs cirugía)
3. **Estilo fotográfico lifestyle** — la nueva vertical de tratamientos necesita fotos menos quirúrgicas, más "bienestar"
4. **Iconografía custom** — no existe, sería diferenciador vs competidores genéricos
5. **Dark mode** — no considerado actualmente
6. **Accesibilidad** — #48B0A0 sobre blanco puede no pasar WCAG AA para texto pequeño (contrast ratio ~3.5:1)

---

📊 **¿Quieres profundizar?**
→ Escribe **"profundizar"** para lanzar Full Mode (Layer 4): 15 preguntas estratégicas, Visual World completo, Idea Mapping, Aesthetic con generación de muestras, y child skills.
