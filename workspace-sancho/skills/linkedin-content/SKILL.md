# linkedin-content — Skill de Sancho

> Genera contenido nativo de LinkedIn: posts largos, carruseles (PDF), articles y comentarios estratégicos a partir de un artículo de blog o topic.

## Trigger
Cuando el usuario pide crear contenido para LinkedIn, generar posts de LI, crear carruseles PDF, escribir articles, o preparar contenido B2B social.

## Prerequisitos
- Artículo de blog generado (preferido) O keyword/topic del cliente
- `brand_voice` del cliente (desde Foundation: `brand/{slug}/brand-voice/current.md`)
- ECPs del cliente (desde Foundation: `brand/{slug}/niche-discovery/current.md`)
- Posicionamiento (desde Foundation: `brand/{slug}/positioning-messaging/current.md`)

## Pipeline

### Paso 1: Obtener Input
```
SI hay artículo de blog → usar como fuente (atomizer mode)
SI no hay artículo → usar keyword/topic directamente (standalone mode)
```

### Paso 2: Leer Brand Voice + ECPs + Positioning
```python
brand_voice = read(f"brand/{slug}/brand-voice/current.md")
ecps = read(f"brand/{slug}/niche-discovery/current.md")
positioning = read(f"brand/{slug}/positioning-messaging/current.md")
```

### Paso 3: Generar Contenido

#### 3a. Post Largo (texto)
Prompt al LLM:
```
Genera un post de LinkedIn para {marca} / {persona_nombre} (fundador/CEO).
Topic: {topic}
Target: {ecp_description}
Brand voice: {brand_voice_summary}
Positioning: {key_message}

Formato LinkedIn (alto engagement):
- Hook (primera línea visible antes de "ver más" — máx 150 chars, provoca curiosidad)
- Espacio en blanco
- Body (8-15 líneas cortas, 1 idea por línea, storytelling > datos secos)
- Espacio en blanco
- Insight/aprendizaje (la "pepita de oro" del post)
- CTA suave (pregunta abierta que invite a comentar)

Reglas LinkedIn:
- NO hashtags en el body (solo 3-5 al final)
- NO emojis excesivos (máx 3-4 en todo el post)
- Líneas cortas (máx 80 chars por línea)
- Tono: profesional pero humano, first person
- NO venta directa — value first
- Formato: storytelling, contrarian take, o framework compartido
```

#### 3b. Carrusel (documento PDF, 8-12 slides)
Prompt al LLM:
```
Genera un carrusel de LinkedIn (formato documento/PDF) de {num_slides} slides para {marca}.
Topic: {topic}
Fuente: {artículo o topic}

Formato por slide:
- Slide 1: Título hook (pregunta provocadora o dato impactante)
- Slide 2: Contexto del problema
- Slides 3-{n-1}: 1 punto clave por slide (título + 2-3 líneas máx)
- Penúltimo slide: Resumen / key takeaways
- Último slide: CTA + "Sígueme para más" + logo/brand

Para cada slide:
- Título (máx 6 palabras, bold)
- Texto (máx 40 palabras)
- Elemento visual sugerido (icono, gráfico, diagrama)

Caption del carrusel:
- Hook + "Guardé todo en este documento de {n} slides 👇" + CTA
```

#### 3c. Article (long-form)
Prompt al LLM:
```
Adapta este artículo de blog para formato LinkedIn Article de {marca}.
Fuente: {artículo}

Adaptaciones:
- Título más provocador/opinion-driven que el blog
- Intro personal (por qué escribo esto)
- Secciones más cortas que el blog
- Más opinión y experiencia, menos SEO
- CTA al final hacia el blog original (backlink)
- 800-1500 palabras (más corto que blog)
- Sin H1 (LinkedIn lo pone automático)
- Subtítulos cada 200-300 palabras
```

#### 3d. Comentario Estratégico
Prompt al LLM:
```
Genera 5 comentarios estratégicos que {persona_nombre} podría dejar en posts de competidores/influencers del sector {niche}.

Por comentario:
- Tipo de post donde dejar el comentario (ej: "post sobre tendencias en {sector}")
- Comentario (50-100 palabras, aporta valor, NO promociona directamente)
- Objetivo (visibilidad, networking, authority)

Reglas:
- NUNCA auto-promoción directa
- Siempre aportar insight o perspectiva única
- Preguntas inteligentes que generen conversación
- Mencionar datos o experiencias propias
```

### Paso 4: Output
Guardar en `brand/{slug}/content/linkedin/{fecha}-{topic-slug}.md`:

```markdown
# LinkedIn Content — {topic}
Generated: {fecha}
Source: {artículo_id o "standalone"}
ECP: {ecp_name}
Author: {persona_nombre} ({cargo})

## Post Largo
{post}

## Carrusel ({n} slides)
{slides}

## Article
{article}

## Comentarios Estratégicos
{comments}

---
<!-- Self-QA: PENDING | {fecha} -->
```

### Paso 5: Revisión Humana
Presentar al usuario. NUNCA publicar automáticamente.

## Formatos Soportados
| Formato | Extensión | Engagement típico |
|---|---|---|
| Post largo (texto) | — | Alto (comments + likes) |
| Carrusel (documento) | PDF | Muy alto (saves + shares) |
| Article | — | Medio (SEO + long-tail) |
| Comentario estratégico | — | Networking + visibility |

## Reglas
1. **Tono profesional-humano** — no corporate speak, no cringe motivacional
2. **First person** — posts desde la persona, no la marca (excepto page posts)
3. **Value first** — 80% valor, 20% promoción como máximo
4. **Formato mobile** — líneas cortas, espacios, escaneable
5. **Hashtags mínimos** — 3-5 al final del post, nunca inline
6. **Human in the loop** — presentar para aprobación
7. **Idioma del cliente** — siempre en el idioma registrado en `clients.json`
