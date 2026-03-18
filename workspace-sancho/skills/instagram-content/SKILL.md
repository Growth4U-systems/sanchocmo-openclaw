# instagram-content — Skill de Sancho

> Genera contenido nativo de Instagram: captions, carruseles (slides), reel scripts y stories a partir de un artículo de blog o topic.

## Trigger
Cuando el usuario pide crear contenido para Instagram, generar posts de IG, crear carruseles, escribir captions, o preparar contenido social para IG.

## Prerequisitos
- Artículo de blog generado (preferido) O keyword/topic del cliente
- `brand_voice` del cliente (desde Foundation: `brand/{slug}/brand-voice/current.md`)
- ECPs del cliente (desde Foundation: `brand/{slug}/niche-discovery/current.md`)

## Pipeline

### Paso 1: Obtener Input
```
SI hay artículo de blog → usar como fuente (atomizer mode)
SI no hay artículo → usar keyword/topic directamente (standalone mode)
```

### Paso 2: Leer Brand Voice + ECPs
```python
# Leer brand voice del cliente
brand_voice = read(f"brand/{slug}/brand-voice/current.md")
ecps = read(f"brand/{slug}/niche-discovery/current.md")
```

### Paso 3: Generar Contenido

#### 3a. Caption Post (imagen única)
Prompt al LLM:
```
Genera un caption de Instagram para {marca}.
Topic: {topic}
Target: {ecp_description}
Brand voice: {brand_voice_summary}

Formato de salida:
- Hook (primera línea que engancha, máx 125 chars)
- Body (3-5 párrafos cortos, emojis relevantes)
- CTA (llamada a acción clara)
- Hashtags (20-25 relevantes, mix popularidad alta/media/baja)
- Alt text para la imagen
```

#### 3b. Carrusel (5-10 slides)
Prompt al LLM:
```
Genera un carrusel de Instagram de {num_slides} slides para {marca}.
Topic: {topic}
Fuente: {artículo o topic}

Formato de salida por slide:
- Slide 1: Hook (título impactante, pregunta o dato)
- Slides 2-{n-1}: Contenido (1 idea por slide, texto grande legible)
- Slide final: CTA + mención de la marca

Para cada slide:
- Título (máx 8 palabras, bold)
- Texto (máx 30 palabras)
- Nota visual (qué tipo de imagen/gráfico usar)

Caption del carrusel:
- Hook + resumen + CTA + hashtags
```

#### 3c. Reel Script
Prompt al LLM:
```
Genera un script de reel de Instagram (30-60 segundos) para {marca}.
Topic: {topic}

Formato:
- Hook (0-3s): frase que detenga el scroll
- Problema (3-10s): pain point del target
- Solución (10-25s): cómo {marca} resuelve esto
- Prueba (25-40s): dato, testimonio o resultado
- CTA (40-60s): qué hacer ahora
- Audio sugerido: tipo de música/trending audio
- Texto overlay por sección
- Hashtags
```

#### 3d. Story Sequence (3-5 stories)
Prompt al LLM:
```
Genera una secuencia de 3-5 stories de Instagram para {marca}.
Topic: {topic}

Por story:
- Tipo (texto/imagen/encuesta/quiz/countdown/link)
- Texto principal
- Sticker/elemento interactivo sugerido
- CTA o transición a la siguiente
```

### Paso 4: Output
Guardar en `brand/{slug}/content/instagram/{fecha}-{topic-slug}.md` con formato:

```markdown
# Instagram Content — {topic}
Generated: {fecha}
Source: {artículo_id o "standalone"}
ECP: {ecp_name}

## Caption Post
{caption}

## Carrusel ({n} slides)
{slides}

## Reel Script
{script}

## Story Sequence
{stories}

---
<!-- Self-QA: PENDING | {fecha} -->
```

### Paso 5: Revisión Humana
Presentar al usuario para aprobación antes de publicar. NUNCA publicar automáticamente.

## Formatos Soportados
| Formato | Slides/Duración | Uso |
|---|---|---|
| Caption post | 1 imagen | Engagement, educación |
| Carrusel | 5-10 slides | Educación, guías, listas |
| Reel | 30-60s | Alcance, trending |
| Story sequence | 3-5 stories | Engagement, tráfico |

## Reglas
1. **Brand voice siempre** — todo el contenido respeta el tono definido
2. **Hashtags research** — mix de hashtags: 5 altos (>1M), 10 medios (100K-1M), 10 bajos (<100K)
3. **Emojis nativos** — usar emojis como separadores y énfasis, no spam
4. **CTA en todo** — cada pieza tiene una acción clara
5. **Accesibilidad** — alt text en imágenes, subtítulos en reels
6. **Human in the loop** — presentar para aprobación, nunca auto-publicar
7. **Idioma del cliente** — siempre en el idioma registrado en `clients.json`
