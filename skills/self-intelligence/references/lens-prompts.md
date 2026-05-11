# Lens Analysis Prompts

5 sequential analysis prompts that process scraped data through the 3-lens methodology. Each prompt builds on the previous output. Run in order.

**Template variables:**
- `{{competitor_name}}` — For self-intelligence, use the client's own company name
- `{{company_name}}` — The company performing the analysis (for self-intel, same as competitor_name)
- `{{competitor_description}}` — Optional company description
- `{{company_description}}` — Optional description of the analyzing company
- `{{target_audience}}` — Optional target audience
- `{{step:X}}` — Output from a previous step (injected automatically)

---

## Prompt 1: Autopercepcion

**Input data**: Deep Research output + Group 1 scraped data (website content, social posts, LinkedIn insights)

```
Actua como analista de comunicacion y branding.

COMPETIDOR: {{competitor_name}}
{{#if competitor_description}}DESCRIPCION: {{competitor_description}}{{/if}}

DEEP RESEARCH PREVIO:
{{step:Deep Research}}

DOCUMENTOS DISPONIBLES:
Los documentos adjuntos contienen:
- Contenido scrapeado del website del competidor
- Posts de Facebook
- Videos/transcripciones de YouTube
- Posts de TikTok
- Posts de LinkedIn
- Insights del perfil de empresa en LinkedIn
- Posts de Instagram

TAREA:
Analiza como el competidor {{competitor_name}} SE PERCIBE Y SE PRESENTA A SI MISMO.

ANALIZA:
1. Mensaje Central:
   - Cual es su propuesta de valor principal?
   - Que promesa hacen a sus clientes?
   - Que problema dicen resolver?

2. Tono y Personalidad:
   - Como se comunican? (formal/informal, tecnico/accesible)
   - Que emociones intentan evocar?
   - Cual es su "voz" de marca?

3. Posicionamiento Declarado:
   - Como se definen vs la competencia?
   - Que diferenciadores destacan?
   - Que segmento dicen atender?

4. Consistencia entre Canales:
   - El mensaje es consistente en web, RRSS?
   - Hay variaciones por canal?
   - Que canal priorizan?

5. Contenido y Temas:
   - De que hablan mas?
   - Que temas evitan?
   - Que tipo de contenido publican?

OUTPUT FORMAT:
## Autopercepcion: {{competitor_name}}

### Mensaje Central y Propuesta de Valor
[Analisis del mensaje principal]

### Tono y Personalidad de Marca
[Descripcion del voice & tone]

### Posicionamiento Declarado
[Como se posicionan ellos mismos]

### Consistencia Cross-Channel
[Analisis de consistencia entre canales]

### Temas y Contenido Prioritario
[Que comunican y que evitan]

### Insights Clave de Autopercepcion
[Resumen de hallazgos principales]
```

---

## Prompt 2: Percepcion de Terceros

**Input data**: Deep Research output + Group 2 scraped data (SEO/SERP data, news corpus)

```
Actua como analista de relaciones publicas y SEO.

COMPETIDOR: {{competitor_name}}
CONTEXTO PREVIO:
{{step:Deep Research}}

DOCUMENTOS DISPONIBLES:
Los documentos adjuntos contienen:
- Datos de SEO/SERP (posicionamiento en buscadores, keywords organicas)
- Corpus de noticias (menciones en prensa y medios)

TAREA:
Analiza como TERCEROS (medios, buscadores, industria) perciben al competidor {{competitor_name}}.

ANALIZA:
1. Visibilidad SEO:
   - Por que keywords rankean?
   - Cual es su autoridad de dominio estimada?
   - Que terminos dominan vs cuales no?

2. Cobertura de Medios:
   - Que medios hablan de ellos?
   - El tono es positivo, neutral o negativo?
   - Que aspectos destacan los periodistas?

3. Reconocimiento de Industria:
   - Aparecen en rankings o premios?
   - Son citados como referentes?
   - Que posicion ocupan en el mercado segun terceros?

4. Narrative de Terceros:
   - Como los describen externamente?
   - Coincide con su autopercepcion?
   - Hay gaps entre lo que dicen y lo que otros dicen?

OUTPUT FORMAT:
## Percepcion de Terceros: {{competitor_name}}

### Visibilidad y Posicionamiento SEO
[Analisis de presencia en buscadores]

### Cobertura Mediatica
[Resumen de menciones en prensa]

### Reconocimiento de Industria
[Premios, rankings, menciones como referente]

### Narrativa Externa vs Autopercepcion
[Comparacion de como los ven vs como se ven]

### Insights Clave de Percepcion de Terceros
[Resumen de hallazgos principales]
```

---

## Prompt 3: Percepcion del Consumidor — RRSS

**Input data**: Deep Research output + Autopercepcion output + Group 3 scraped data (social media comments)

```
Actua como analista de social listening y sentiment analysis.

COMPETIDOR: {{competitor_name}}
CONTEXTO PREVIO:
{{step:Deep Research}}
{{step:Autopercepcion}}

DOCUMENTOS DISPONIBLES:
Los documentos adjuntos contienen comentarios de usuarios en:
- LinkedIn (comentarios en posts)
- Instagram (comentarios en publicaciones)
- TikTok (comentarios en videos)
- YouTube (comentarios en videos)
- Facebook (comentarios en publicaciones)

TAREA:
Analiza que dicen los CONSUMIDORES Y USUARIOS sobre {{competitor_name}} en redes sociales.

ANALIZA:
1. Sentimiento General:
   - Predominan comentarios positivos, negativos o neutros?
   - Cual es el engagement promedio?
   - Hay defensores de marca activos?

2. Temas Recurrentes:
   - De que se quejan mas?
   - Que elogian frecuentemente?
   - Que preguntas hacen?

3. Pain Points Detectados:
   - Que problemas mencionan los usuarios?
   - Hay quejas recurrentes?
   - Que funcionalidades piden?

4. Comparaciones con Competencia:
   - Mencionan alternativas?
   - Como los comparan?
   - Por que eligieron o dejaron el producto?

5. Analisis por Canal:
   - El sentimiento varia por red social?
   - Que canal tiene mejor/peor percepcion?

OUTPUT FORMAT:
## Percepcion del Consumidor (RRSS): {{competitor_name}}

### Analisis de Sentimiento General
[Resumen del sentiment predominante]

### Temas Recurrentes en Comentarios
[Que dicen mas frecuentemente]

### Pain Points y Quejas Detectadas
[Problemas mencionados por usuarios]

### Comparaciones con Competencia
[Como los comparan con alternativas]

### Analisis por Canal Social
[Diferencias de percepcion por red]

### Insights Clave de Percepcion RRSS
[Resumen de hallazgos principales]
```

---

## Prompt 4: Percepcion del Consumidor — Reviews

**Input data**: Deep Research output + Autopercepcion output + Group 4 scraped data (review platforms)

```
Actua como analista de customer experience y product reviews.

COMPETIDOR: {{competitor_name}}
CONTEXTO PREVIO:
{{step:Deep Research}}
{{step:Autopercepcion}}

DOCUMENTOS DISPONIBLES:
Los documentos adjuntos contienen resenas de:
- Trustpilot
- G2 Crowd
- Capterra
- Google Play Store
- Apple App Store

TAREA:
Analiza las RESENAS DE CLIENTES que han usado el producto de {{competitor_name}}.

ANALIZA:
1. Rating y Tendencia:
   - Cual es el rating promedio por plataforma?
   - La tendencia es ascendente o descendente?
   - Cuantas resenas tienen?

2. Pros Mas Mencionados:
   - Que valoran mas los clientes?
   - Que features destacan positivamente?
   - Que los hace recomendar el producto?

3. Cons Mas Mencionados:
   - Que frustraciones tienen los usuarios?
   - Que features faltan o son debiles?
   - Por que darian malas reviews?

4. Perfiles de Reviewers:
   - Que tipo de empresas/usuarios reviewean?
   - Hay patrones por tamano de empresa?
   - Que casos de uso mencionan?

5. Competencia Mencionada:
   - De que producto migraron?
   - A que producto se van si cancelan?
   - Como los comparan con alternativas?

OUTPUT FORMAT:
## Percepcion del Consumidor (Reviews): {{competitor_name}}

### Rating y Volumen de Reviews
[Metricas por plataforma]

### Fortalezas Segun Clientes
[Lo que mas valoran]

### Debilidades y Frustraciones
[Quejas y features faltantes]

### Perfil de Usuarios que Reviewean
[Quienes son y que casos de uso tienen]

### Competencia Mencionada en Reviews
[Migraciones y comparaciones]

### Insights Clave de Reviews
[Resumen de hallazgos principales]
```

---

## Prompt 5: Sintesis Final

**Input data**: ALL previous outputs (Deep Research + Autopercepcion + Terceros + RRSS + Reviews)

> **For self-intelligence**: Skip the Battle Card section. Replace "Oportunidades para {{company_name}}" with "Prioridades de mejora".
> **For competitor-intelligence**: Use full prompt including Battle Card.

```
Actua como estratega de inteligencia competitiva senior.

COMPETIDOR: {{competitor_name}}
EMPRESA QUE ANALIZA: {{company_name}}
{{#if company_description}}DESCRIPCION DE TU EMPRESA: {{company_description}}{{/if}}
{{#if target_audience}}AUDIENCIA OBJETIVO: {{target_audience}}{{/if}}

ANALISIS PREVIOS COMPLETOS:
1. Deep Research:
{{step:Deep Research}}

2. Autopercepcion (como se ven ellos):
{{step:Autopercepcion}}

3. Percepcion de Terceros (medios y SEO):
{{step:Percepcion Terceros}}

4. Percepcion de Consumidores en RRSS:
{{step:Percepcion del consumidor RRSS}}

5. Percepcion de Consumidores en Reviews:
{{step:Percepcion del consumidor Reviews}}

TAREA:
Sintetiza TODAS las percepciones anteriores en un analisis triangulado que compare como el competidor se ve a si mismo vs como lo ven terceros y consumidores.

SINTETIZA:
1. Triangulacion de Percepciones:
   - Coincide la autopercepcion con la realidad?
   - Hay gaps entre lo que prometen y lo que entregan?
   - La percepcion de terceros coincide con la de consumidores?

2. Fortalezas Reales (confirmadas por multiples fuentes):
   - Que fortalezas son consistentes entre todas las perspectivas?
   - Que ventajas competitivas son reales?

3. Debilidades Reales (confirmadas por multiples fuentes):
   - Que debilidades aparecen consistentemente?
   - Que promesas no cumplen?

4. Oportunidades para {{company_name}}:
   - Donde puede atacar {{company_name}}?
   - Que pain points puede resolver mejor?
   - Que segmentos estan desatendidos?

5. Battle Card:
   - Argumentos para vender contra este competidor
   - Respuestas a objeciones comunes
   - Diferenciadores clave a destacar

OUTPUT FORMAT:
## Resumen Ejecutivo: Analisis de {{competitor_name}}

### Triangulacion de Percepciones
| Aspecto | Autopercepcion | Terceros | Consumidores | Realidad |
|---------|---------------|----------|--------------|----------|

### Fortalezas Confirmadas
[Lo que realmente hacen bien]

### Debilidades Confirmadas
[Lo que realmente hacen mal]

### Gaps Percepcion vs Realidad
[Diferencias entre lo que dicen y lo que entregan]

### Oportunidades para {{company_name}}
[Donde podemos ganarles]

---

## Battle Card: {{company_name}} vs {{competitor_name}}

### Cuando Elegir {{company_name}}
[Escenarios donde somos mejor opcion]

### Cuando Considerar {{competitor_name}}
[Ser honestos sobre sus fortalezas]

### Argumentos de Venta
[Puntos clave para el pitch]

### Manejo de Objeciones
| Objecion | Respuesta |
|----------|-----------|

### Diferenciadores Clave
[Top 3 razones para elegirnos]
```

---

## Self-Intelligence Adaptation

When running for self-intelligence (analyzing your own company):

1. `{{competitor_name}}` = `{{company_name}}` (same entity)
2. In Prompt 5 (Synthesis), replace:
   - "Oportunidades para {{company_name}}" → "Prioridades de mejora"
   - Skip the Battle Card section entirely
   - Add instead: "Gap Analysis" (what to fix between promise and reality)
3. The Viability Checkpoint (in SKILL.md) runs after synthesis to determine if the company should proceed with full Foundation or needs Pre-Product Marketing first.
