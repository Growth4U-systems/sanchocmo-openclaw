# Composition Rules — Visual Identity

> Reglas de composición visual aprendidas de ejecución real. NUNCA violar estas reglas.

## Regla 1: Anti-Pegote (CRÍTICA)

**NUNCA** pegar una ilustración/personaje sobre un fondo CSS.

| ❌ MAL (pegote) | ✅ BIEN (integrado) |
|-----------------|---------------------|
| Generar personaje con fondo transparente → ponerlo sobre div CSS con gradient | Generar personaje CON el gradient en el prompt de imagen |
| Ilustración PNG sobre `background-color: #1a1a2e` | Generar ilustración con fondo `#1a1a2e` integrado |
| Foto recortada sobre fondo CSS | Generar composición completa como una sola pieza |

**Por qué falla**: Los bordes se notan, la iluminación no coincide, parece cutre. La IA genera mejor cuando el fondo es parte de la composición.

**Excepción**: Iconos simples (monocolor, sin fondo) SÍ pueden ir sobre fondos CSS. Solo aplica a ilustraciones/personajes/escenas complejas.

---

## Regla 2: Composición por Canal

| Canal | Dimensiones | Fondo | Composición |
|-------|------------|-------|-------------|
| **LinkedIn post** | 1200×628 | Gradient oscuro | Personaje + gradient + texto → TODO en una imagen |
| **LinkedIn carousel** | 1080×1080 | Variable | Cada slide = imagen completa con texto integrado |
| **Instagram feed** | 1080×1080 | Escena completa | Una sola pieza, nada sobrepuesto |
| **Instagram story** | 1080×1920 | Escena completa | Composición vertical integrada |
| **Blog hero** | 1200×628 o 1920×1080 | Claro/blanco | Ilustración sobre fondo claro, generado junto |
| **Twitter/X** | 1200×675 | Flexible | Ilustración con fondo sólido integrado |
| **Email header** | 600×200 | Claro | Ilustración limpia con fondo de marca integrado |
| **OG image** | 1200×630 | Según marca | Imagen completa con título integrado si aplica |
| **Landing section** | Variable | Según sección | Cada pieza visual como composición completa |

---

## Regla 3: Tamaños Mínimos de Texto

### Por canvas

| Canvas | Body | Subtítulos | Títulos | Headlines/Quotes |
|--------|------|-----------|---------|-------------------|
| 1080×1080 | ≥ 24px | ≥ 32px | ≥ 44px | ≥ 54px |
| 1200×628 | ≥ 18px | ≥ 24px | ≥ 36px | ≥ 44px |
| 1920×1080 | ≥ 16px | ≥ 20px | ≥ 32px | ≥ 40px |
| 600×200 (email) | ≥ 14px | ≥ 18px | ≥ 24px | ≥ 28px |

### Legibilidad obligatoria
- Texto sobre imagen → `text-shadow: 2px 2px 4px rgba(0,0,0,0.5)` O fondo semitransparente detrás del texto
- Texto sobre fondo oscuro → color claro con suficiente contraste (WCAG AA mínimo: 4.5:1)
- **NUNCA** texto < 16px en ningún canvas destinado a visualización en pantalla
- **Testear en móvil**: si no se lee en una pantalla de 375px de ancho, es demasiado pequeño

---

## Regla 4: Personajes desde Fotos Reales

### Flujo correcto

```
1. Foto de referencia de ESTILO (persona principal) → definir estilo artístico
2. Para la persona principal → usar su foto + estilo = resultado correcto
3. Para personajes SECUNDARIOS:
   - Prompt: "Use the art style from image 1 ONLY. DO NOT copy facial features.
     The subject is: [descripción detallada de la persona secundaria]"
   - Adjuntar foto de la persona secundaria como referencia SEPARADA
   - Generar POR SEPARADO, no en la misma imagen que el principal
4. Validar parecido con foto original → si no se parece, regenerar con más detalle
5. Generar variantes (light + dark) de cada personaje aprobado
```

### Errores comunes
- ❌ Usar la misma referencia para todos los personajes → todos se parecen al principal
- ❌ Generar 2+ personajes en un solo prompt → se mezclan rasgos
- ❌ No describir al personaje secundario → el modelo copia al principal por defecto

---

## Regla 5: Gate Checks de Generación

### Presupuesto de generaciones

| Fase | Generaciones permitidas | Propósito |
|------|------------------------|-----------|
| Style Discovery | 2 máx | 2 direcciones de estilo |
| Layer 3 Aesthetic | 3-4 máx | Refinamiento + consistencia |
| Validación final | 2-3 máx | Test cross-subject |
| Personajes | variable | 1 por personaje + variantes |
| **TOTAL proceso** | **≤ 10** | Sin contar personajes individuales |

### Protocolo ante feedback negativo
```
Cliente dice algo negativo ("horrible", "cutre", "no me gusta") →
  1. PARA. No generes más.
  2. Pregunta: "¿Qué específicamente no te gusta? ¿El estilo, los colores, la composición, el nivel de detalle?"
  3. Documenta el feedback concreto.
  4. Ajusta el prompt basándote en el feedback ESPECÍFICO.
  5. Genera UNA opción ajustada (no dos).
```

### Tracking
En cada imagen generada, incluir en el mensaje:
```
[Generación X/10] — Dirección: [nombre del estilo] — Propósito: [qué estamos validando]
```

---

## Regla 6: HTML como Formato de Entregable

### MC renderiza HTML → usarlo siempre para entregables visuales

**Estructura del visual-guide.html**:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Estilos inline — usar tipografías del brandbook */
    /* Design tokens del cliente */
  </style>
</head>
<body>
  <section id="visual-snapshot">
    <h1>Visual Identity — [Brand]</h1>
    <!-- Paleta con muestras de color -->
    <!-- Tipografías con ejemplos -->
    <!-- Adjetivos visuales -->
  </section>
  <section id="imagery">
    <!-- Imágenes generadas inline (base64 o URLs) -->
    <!-- Do's / Don'ts con ejemplos visuales -->
  </section>
  <section id="composition">
    <!-- Tabla de composición por canal con ejemplos -->
  </section>
  <section id="design-tokens">
    <!-- JSON renderizado como tabla visual -->
  </section>
</body>
</html>
```

**Para confirmaciones intermedias**: Generar HTML preview parcial, no esperar al final.
