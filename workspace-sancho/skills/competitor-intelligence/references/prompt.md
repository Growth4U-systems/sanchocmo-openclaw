# Competitor Intelligence — Prompt (Fuente de verdad del output)

---

## 🎯 REGLAS DE STORYTELLING (OBLIGATORIO)

### Estructura Narrativa Global
El documento final debe contarse como una historia de **mapeo competitivo**, no como un catálogo de fichas. Sigue este flujo narrativo:

**PARTE 0: Executive Narrative** (obligatorio al inicio)
- 1 página máximo, narrativa pura, CERO tablas
- Cuenta la historia completa del panorama competitivo
- Estructura: ¿Quiénes son los jugadores? → ¿Cómo compiten? → ¿Dónde están las oportunidades?
- Quien lea solo esto debe entender el 80%

**Para cada Battle Card:**
1. **Contexto narrativo** (2-3 párrafos antes de la ficha)
   - ¿Quién es este competidor en el contexto del mercado?
   - ¿Por qué importa analizarlos?

2. **Battle Card estructurada** (datos organizados)
   - Profile, Positioning, Market perception, Customer sentiment
   - Citas y fuentes inline

3. **Interpretación** ("So what?")
   - ¿Qué significa su estrategia?
   - ¿Qué están haciendo bien/mal?

4. **How to Beat Them** (accionable)
   - Estrategias específicas para competir
   - Monitoring triggers

**Para el Competitive Landscape (Step 6):**
1. **Apertura narrativa** del landscape: "Cuando vemos el campo completo, emergen X patrones..."
2. **Overview Table** con interpretación antes y después
3. **Positioning Map 2x2** con análisis de cuadrantes
4. **Feature Heatmap** con "So what?" (¿qué gaps existen?)
5. **Growth Model Analysis** con interpretación estratégica
6. **Pricing Landscape** con implicaciones para nosotros
7. **Cross-Competitor Opportunities** (síntesis narrativa final)

**Tono de presentación:**
- Escribir como si fuera para el CEO y equipo de producto
- "Esto significa que podemos...", "El gap más claro es...", "La amenaza principal es..."
- Evitar lenguaje de análisis competitivo genérico
- Las tablas/fichas son soporte, la narrativa estratégica es protagonista

**Cierre final:**
- Párrafo conclusivo: "En este panorama competitivo, nuestra mejor jugada es... porque los competidores X/Y/Z dejan abierto..."

---

## Pipeline completo

```
Step 0: Competitor Discovery          → Identify + categorize
Step 1: Profile Discovery (per comp)  → Find all digital footprint URLs
Step 2: Scraping (per comp)           → Collect raw data by lens
Step 3: Deep Research (per comp)      → Context via Gemini/web research
Step 4: Lens Analysis (per comp)      → Autopercepción → Terceros → Reviews
Step 5: Battle Card (per comp)        → Synthesize into actionable card
Step 6: Competitive Landscape Map     → Cross-competitor synthesis
```

---

## Step 0: Competitor Discovery

**Discovery sources:** User knowledge, search engines, review sites ("alternatives to X"), app stores, industry reports.

**Categorización:**

| Category | Description | Research Depth |
|----------|-------------|----------------|
| **Direct** | Same product, same market | Full 3-lens (3-5 competitors) |
| **Indirect** | Different product, same problem | Lens 1 only (2-3) |
| **Emerging** | New entrants, adjacent | Monitor only (1-2) |

**Monitoring tiers:** Tier A (top 3 direct) = weekly | Tier B (4-10 direct) = monthly | Tier C (indirect + emerging) = quarterly

---

## Steps 1-4: Per-Competitor Deep Dive

### Step 1: Profile Discovery
Platforms: Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X, Trustpilot, G2, Capterra, App Stores, Website + subdomains + blog, **Paid Ads** (FB Ads Library, Google Ads Library).

### Step 2: Scraping (APIFY OBLIGATORIO)

**Usar Apify actors para scraping real — no solo web_search.**

**Lens 1 (Autopercepción):**
- `apify/web-scraper` → Homepage, /pricing, /about, /blog (10 últimos posts)
- `apify/instagram-scraper` → Últimos 20 posts + bio + métricas
- `apify/facebook-ads-scraper` → Ads activos en FB Ads Library
- Fallback: `web_fetch` si un actor falla

**Lens 2 (Terceros):**
- `apify/google-search-scraper` → "[nombre] reviews", "[nombre] vs [competidor]"
- `web_search` → noticias, press, artículos recientes
- `web_fetch` → backlink profile (via Ahrefs free, Moz free)

**Lens 3 (Consumidores):**
- `apify/trustpilot-scraper` → Últimas 50 reviews + rating
- `web_search` → "[nombre] opiniones", Reddit, foros
- `web_fetch` → Threads relevantes de Reddit/foros

### Step 3: Deep Research
Company background, product evolution, growth model, public financials.

### Step 4: Lens Analysis

**Lens 1 — Autopercepción:**
- Value proposition stated
- Positioning (keywords, claims, comparisons)
- Target audience implied
- Pricing model and strategy
- Features emphasized vs hidden
- Content strategy (topics, frequency, channels)
- Paid ads (messaging, targeting, offers)

**Lens 2 — Percepción de Terceros:**
- Influencer/media description
- SEO visibility (DA, top keywords, ranking strength)
- Press narrative
- External ≠ self-messaging alignment?

**Lens 3 — Percepción del Consumidor:**
- Overall sentiment (positive/neutral/negative/mixed)
- Top 3-5 loved aspects
- Top 3-5 complained aspects
- Migration from/to patterns
- Unmet needs (problems they ask to solve but competitor doesn't)

---

## Step 5: Battle Card Format (CON STORYTELLING)

**CADA BATTLE CARD DEBE SEGUIR:**

### Apertura Narrativa (2-3 párrafos antes de la ficha)
- ¿Quién es [Competidor] en el contexto del mercado?
- ¿Por qué son relevantes como competidor?
- ¿Qué rol juegan en el panorama competitivo?

### Battle Card Estructurada

```
## Battle Card: [Competitor Name]
**Tier**: [A/B/C] | **Type**: [Direct/Indirect/Emerging] | **Updated**: [date]

### Quick Profile
- Founded: [year] | HQ: [location] | Team: [size]
- Funding: [total raised or revenue if known]
- Growth model: [PLG/Sales-led/Content/Paid/Community]

### Their Positioning (Lens 1)
**Claim**: "[Their stated value proposition]"
**Target audience**: [Who they say they serve]
**Key features**: [Top 3-5 emphasized]
**Pricing**: [Model + tiers summary]

### External Perception (Lens 2)
**Media narrative**: [How press/influencers describe them]
**SEO strength**: DA [X], ranks for [top keywords]
**Recognition**: [Awards, rankings, notable coverage]

### Customer Reality (Lens 3)
**Rating**: [Weighted avg across platforms]
**Love**: [Top 3]
**Hate**: [Top 3]
**Unmet needs**: [What customers want but don't get]

### Lens Conflicts
[Where Lens 1 claims ≠ Lens 3 reality — vulnerabilities]
```

### Slide KPIs (bloque estandarizado — OBLIGATORIO)
Inmediatamente después de Lens Conflicts, incluir este bloque con campos fijos. Si no hay dato, poner "N/D":

```
### Slide KPIs
| KPI | Valor |
|-----|-------|
| Slide Title | [Titular de 1 línea para la slide — captura la esencia del competidor] |
| Slide Summary | [2-3 frases: qué son, por qué importan, y la oportunidad/amenaza clave] |
| Revenue | [cifra + YoY si disponible] |
| Team | [número de personas] |
| Founded | [año] |
| Users/Clients | [cifra o "N/D"] |
| Pricing | [modelo resumido, ej: "Retainer 5-15K€/mes"] |
| Trustpilot | [X.X/5 (N reviews) o "Sin perfil"] |
| Google Maps | [X.X/5 (N reviews) o "Sin perfil"] |
| App Store | [X.X/5 (N reviews) o "N/A"] |
| Play Store | [X.X/5 (N reviews) o "N/A"] |
| G2/Capterra | [X.X/5 (N reviews) o "N/A"] |
```

Este bloque es consumido por el generador de presentaciones (`frontend-slides`). Los campos deben ser concisos (max 40 chars).

### Interpretación (párrafo "So what?" después de la ficha)
- ¿Qué significa su estrategia?
- ¿Qué están haciendo bien que deberíamos temer?
- ¿Qué están haciendo mal que podemos explotar?

### How to Beat Them (accionable con rationale)
**Their weakness, our strength**: [specific areas] — *Por qué esto es explotable*
**Positioning angle**: [how to differentiate] — *Por qué esto resonará*
**What NOT to compete on**: [where they're genuinely stronger] — *Por qué no vale la pena pelear aquí*
**Sales talking points**: [3-5 specific points con evidencia]

### Monitoring Triggers
[What changes would require re-analysis]

---

## Step 6: Competitive Landscape Map (CON STORYTELLING)

### Apertura Narrativa del Landscape (obligatoria)
Escribe 2-3 párrafos que establezcan:
- "Cuando vemos el campo competitivo completo, emergen X patrones claros..."
- ¿Cómo está dividido el mercado? (concentrado/fragmentado, por precio/features/modelo)
- ¿Qué gaps o clusters vemos?

Luego presenta cada componente del landscape:

### 1. Overview Table
**Antes de la tabla** (contexto narrativo):
- "Esta tabla resume los 10 competidores mapeados. Lo que destaca es..."

**Tabla**: All competitors (name, type, tier, positioning, pricing, rating, strength, weakness)

**Después de la tabla** (interpretación):
- ¿Qué patrones vemos en fortalezas/debilidades?
- ¿Hay clusters de competidores similares?

### 2. Positioning Map
**Antes del mapa** (contexto narrativo):
- "Mapeando competidores en [eje X] vs [eje Y], vemos 4 cuadrantes claramente diferenciados..."

**Mapa**: 2x2 matrix (axes configurables: Price/Features, Enterprise/SMB, Specialist/Generalist)

**Después del mapa** (interpretación):
- ¿Qué cuadrantes están saturados?
- ¿Dónde hay white space?
- ¿Dónde deberíamos posicionarnos nosotros?

### 3. Feature Heatmap
**Antes del heatmap** (contexto narrativo):
- "Comparando features clave, encontramos que..."

**Heatmap**: Features × competitors (🟢 strong / 🟡 partial / 🔴 weak / ⚪ absent)

**Después del heatmap** (interpretación + "So what?"):
- ¿Qué features son table stakes (todos las tienen)?
- ¿Qué features son diferenciadores (pocos las tienen bien)?
- ⚪ White space = oportunidades → **¿Qué podemos ofrecer que nadie más tiene?**

### 4. Growth Model Analysis
**Antes del análisis** (contexto narrativo):
- "Los competidores adquieren clientes de formas muy diferentes..."

**Análisis**: How each acquires customers (Content-led, PLG, Sales-led, Paid, Community, Partnerships)

**Después del análisis** (interpretación):
- ¿Qué modelos dominan?
- ¿Hay modelos infrautilizados que podríamos explotar?

### 5. Pricing Landscape
**Antes de la comparación** (contexto narrativo):
- "El pricing revela estrategias radicalmente diferentes..."

**Comparación**: All pricing models compared (freemium, subscription tiers, one-time, usage-based)

**Después de la comparación** (interpretación):
- ¿Dónde está el punto dulce del mercado?
- ¿Hay oportunidades de undercut o premium positioning?

### 6. Cross-Competitor Opportunities (SÍNTESIS NARRATIVA FINAL)
Escribe 2-3 párrafos de síntesis estratégica:

**What EVERYONE says but nobody delivers well**
- Claims comunes en Lens 1 pero con complaints en Lens 3
- *Implicación*: Nosotros podemos hacerlo de verdad

**Features nobody offers that customers want**
- Unmet needs recurrentes en reviews
- White space en feature heatmap
- *Implicación*: Diferenciación obvia

**Positioning angles nobody uses**
- Gaps en positioning map
- Narrativas no exploradas
- *Implicación*: Mensajería única

**Channels nobody exploits**
- Growth models subutilizados
- Plataformas sin presencia competitiva
- *Implicación*: First-mover advantage

**CIERRE DEL LANDSCAPE**:
Párrafo final que sintetiza: "En este panorama competitivo, nuestra mejor jugada es [estrategia] porque los competidores X/Y/Z dejan abierto [gap específico]..."
