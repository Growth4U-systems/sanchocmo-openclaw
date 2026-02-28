# Niche Discovery — Prompt de Ejecución

## Step 1: Problem Scraping (~30-60 min)

Define keywords desde market, product y sector (upstream pillars). Scrape foros, comunidades y review sites.

### Fuentes primarias
- Reddit (subreddits relevantes)
- Quora (topic spaces)
- Twitter/X (keyword search)
- Review sites (G2, Capterra, Trustpilot, App Store)
- Support forums y community boards
- LinkedIn posts y comments

### Fuentes fallback (cuando conversaciones públicas escasean)
- LinkedIn signal mining (posts de ICP personas sobre sus problemas)
- Competitor review mining (quejas de clientes de competidores)
- Industry Slack/Discord groups
- Conference content y speaker decks
- Sales team intelligence (si disponible)
- Targeted micro-interviews (5-10 personas)

**Todas las fuentes alimentan el mismo pipeline** — un problema entra a Step 2 igual sin importar el origen.

**Target**: 50+ raw problem statements. Más = mejor — cantidad permite reconocimiento de patrones.

---

## Step 2: JTBD Structuring (~20 min)

Estructura CADA problema recopilado en el framework JTBD:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| **Problem** | Qué intentan resolver | "Can't track which marketing channels actually drive revenue" |
| **Why** | Por qué importa (motivación subyacente) | "Wasting budget on channels that don't convert" |
| **Persona** | Quién tiene este problema (rol, contexto) | "B2B SaaS marketing manager, 10-50 employee company" |
| **Alternatives** | Qué usan/hacen actualmente | "Spreadsheets, gut feeling, last-click attribution in GA4" |

**Output**: Spreadsheet estructurado de 50+ problemas JTBD-formatted.

---

## Step 3: Triple Filter (~30 min)

Cada problema JTBD pasa por TRES filtros. Los tres deben pasar para ser candidato a ECP.

### Filter 1: SWOT Filter
- ¿Dónde NUESTRO producto es fuerte? (Strengths del SWOT)
- ¿Dónde COMPETIDORES son débiles? (Opportunities del SWOT)
- Score: PASS / PARTIAL / FAIL

### Filter 2: ICP Filter
- ¿La persona encaja con nuestro ICP amplio?
- ¿Podemos LLEGAR a esta persona por canales disponibles?
- ¿Es el tipo de cliente que queremos a largo plazo?
- Score: PASS / PARTIAL / FAIL

### Filter 3: Product Filter
- ¿Puede nuestro producto RESOLVER este problema HOY?
- ¿Qué tan bien vs alternativas?
- Score: PASS / PARTIAL / FAIL

**Output**: Lista filtrada — típicamente 15-25 problemas que pasan los 3 filtros.

---

## Step 4: Niche Clustering → ECPs (~20 min)

Agrupar los problemas filtrados en Early Customer Profiles (ECPs).

### Criterios de clustering
- Mismo tipo de persona (rol, tamaño empresa, industria)
- Misma categoría de problema (pains relacionados)
- Mismo contexto de compra (presupuesto, urgencia)
- Alcanzables por mismos canales

### Cada ECP captura
- **Nombre** (descriptivo, memorable)
- **Core JTBD** (el problema principal, en sus palabras)
- **Persona snapshot** (quién, dónde, qué contexto)
- **Current alternatives** (qué hacen hoy)
- **Why WE win** (nuestra ventaja para este nicho)
- **Estimated market size** (addressable count)

**Target**: 3-7 ECPs.

---

## Step 5: ECP Scoring & Prioritización (~15 min)

Score cada ECP en 3 dimensiones:

| Dimensión | Qué mide | Método |
|-----------|----------|--------|
| **Pain Score** (1-10) | Urgencia/dolor del problema | Frecuencia quejas, willingness to pay, intensidad emocional |
| **Reachability** (1-10) | Facilidad para encontrar y llegar a estas personas | Channel availability, community density, ad targeting precision |
| **Market Size** (1-10) | Tamaño del nicho | Población addressable, revenue potential, growth trend |

### Bubble chart
- X-axis = Reachability (DERECHA = más fácil)
- Y-axis = Pain Score
- Bubble size = Market Size
- Color = Product fit (verde = fuerte, amarillo = moderado)

### Output
Ranked list de ECPs con scores + recomendación de top 1-3 para atacar primero.

---

## Summary (siempre generado)

```
**Nichos de [Company Name]:**

**Problemas analizados**: [n] recopilados → [n] estructurados (JTBD) → [n] filtrados (Triple Filter)
**ECPs identificados**: [n] nichos

**Top 3 ECPs:**
1. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10
2. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10
3. [Name] — Pain [n]/10, Reach [n]/10, Size [n]/10

**Recomendación**: Empezar con [ECP #1] porque [1 sentence justification — typically highest reachability]
```

---

## Lite vs Deep

**Lite done** (mínimo):
- 50+ problemas scraped y JTBD-structured
- Triple Filter aplicado
- 3-7 ECPs seleccionados y scored
- Recomendación de priorización

**Deep done** (completo):
- Todo lo Lite +
- 100+ problemas de 5+ tipos de fuente
- Customer data integrado (si existe)
- TAM/SAM bottom-up por ECP
- Cross-market ECPs (si multi-mercado)
- Bubble chart producido
- ECP validation plan diseñado

---

## Si Existe Customer Data

Cuando la empresa YA tiene clientes, sus datos reales son el input #1:
1. Analizar CRM, analytics o conocimiento del fundador
2. Identificar top segment por LTV, engagement o satisfacción
3. Notar churn patterns
4. Usar estos datos para VALIDAR los problemas scraped (no reemplazarlos)

Real data siempre gana sobre scraped assumptions.

---

## Multi-Market

Buscar activamente **cross-market ECPs** — nichos que existen en múltiples geografías con el mismo problema. Compartir estrategia, adaptar idioma y regulación local.
