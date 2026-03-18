# twitter-content — Skill de Sancho

> Genera contenido nativo de Twitter/X: tweets individuales, threads, quote tweets y respuestas estratégicas a partir de un artículo de blog o topic.

## Trigger
Cuando el usuario pide crear contenido para Twitter/X, generar tweets, crear threads, o preparar contenido para X.

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

### Paso 3: Generar Contenido

#### 3a. Tweet Individual
Prompt al LLM:
```
Genera 5 tweets individuales para {marca}/{persona} sobre {topic}.
Target: {ecp_description}
Brand voice: {brand_voice_summary}

Por tweet:
- Texto (máx 280 chars, idealmente 200-240 para engagement)
- Tipo: hot take | dato | pregunta | tip | observación
- Media sugerida: imagen/video/poll/ninguna

Reglas Twitter:
- Punchy y directo — cada palabra cuenta
- NO hashtags (salvo que sea trending topic relevante, máx 1)
- Opiniones > neutralidad
- Datos concretos > generalidades
- Preguntas que generen replies
- Formato: una idea = un tweet
```

#### 3b. Thread (5-12 tweets)
Prompt al LLM:
```
Genera un thread de Twitter de {num_tweets} tweets para {marca}/{persona}.
Topic: {topic}
Fuente: {artículo o topic}

Formato:
- Tweet 1 (HOOK): "🧵 {afirmación provocadora o promesa de valor}"
- Tweet 2: Contexto/problema
- Tweets 3-{n-1}: 1 punto por tweet (dato, insight, ejemplo)
- Tweet {n-1}: Resumen / key takeaway
- Tweet {n}: CTA + "Si te fue útil, RT el primer tweet 🔄"

Reglas de thread:
- Cada tweet debe tener sentido por sí solo (los leen sueltos)
- Máx 250 chars por tweet (dejar espacio para numeración)
- Numeración: x/n o no numerar (según preferencia)
- Hook del tweet 1 es 80% del éxito del thread
- Incluir 1-2 tweets con datos/estadísticas concretas
- NO emojis excesivos (máx 1-2 por tweet)
```

#### 3c. Quote Tweets
Prompt al LLM:
```
Genera 3 quote tweets que {persona} podría hacer sobre noticias/posts del sector {niche}.

Por quote tweet:
- Tipo de tweet original (ej: "noticia sobre {tendencia}")
- Quote (máx 200 chars, añade perspectiva propia)
- Objetivo: hot take, complementar dato, disagree constructivo
```

#### 3d. Respuestas Estratégicas
Prompt al LLM:
```
Genera 5 respuestas estratégicas para conversaciones del sector {niche}.

Por respuesta:
- Contexto (tipo de tweet al que responder)
- Respuesta (máx 250 chars, aporta valor)
- Objetivo: networking, authority, visibility

Reglas:
- NUNCA auto-promoción
- Añadir dato, experiencia o perspectiva
- Hacer preguntas inteligentes
```

### Paso 4: Output
Guardar en `brand/{slug}/content/twitter/{fecha}-{topic-slug}.md`:

```markdown
# Twitter Content — {topic}
Generated: {fecha}
Source: {artículo_id o "standalone"}
ECP: {ecp_name}

## Tweets Individuales
{tweets}

## Thread ({n} tweets)
{thread}

## Quote Tweets
{quotes}

## Respuestas Estratégicas
{replies}

---
<!-- Self-QA: PENDING | {fecha} -->
```

### Paso 5: Revisión Humana
Presentar al usuario. NUNCA publicar automáticamente.

## Formatos Soportados
| Formato | Límite | Engagement típico |
|---|---|---|
| Tweet individual | 280 chars | Quick engagement |
| Thread | 5-12 tweets | Deep engagement + saves |
| Quote tweet | 280 chars | Networking + visibility |
| Respuesta | 280 chars | Community + authority |

## Reglas
1. **Brevedad es poder** — cada carácter cuenta en Twitter
2. **Opiniones > neutralidad** — Twitter premia las hot takes
3. **Sin hashtags** — salvo trending topic relevante (máx 1)
4. **Hook primero** — el primer tweet/línea determina todo
5. **Datos concretos** — "43% de X hace Y" > "muchos hacen Y"
6. **Human in the loop** — presentar para aprobación
7. **Idioma del cliente** — siempre en el idioma registrado en `clients.json`
