# ICP-to-Filters Mapping Guide

> Como traducir una definicion de ICP (de niche-discovery-100x) a filtros de busqueda ejecutables en Apollo, Clay, y LinkedIn Sales Navigator.

---

## Mapping Table

| ICP Attribute | Apollo Filter | Apollo API Param | Clay Column | LinkedIn SN Filter |
|---------------|---------------|-----------------|-------------|-------------------|
| **Industria** | Industry Tags | `q_organization_keyword_tags` | `industry` | Industry |
| **Tamano empresa** | Employee Range | `organization_num_employees_ranges` | `headcount` | Company headcount |
| **Revenue/facturacion** | Revenue Range | `revenue_range` | `annual_revenue` | Annual revenue (Adv+ only) |
| **Geografia (pais)** | Location | `organization_locations` | `hq_country` | Headquarters (country) |
| **Geografia (ciudad)** | Location | `organization_locations` | `hq_city` | Headquarters (region) |
| **Tech stack** | Technologies | `currently_using_any_of_technology_uids` | `technologies` | Technologies used (limitado) |
| **Funding stage** | Funding Round | `organization_latest_funding_stage_cd` | `latest_funding` | N/A |
| **Funding amount** | N/A (filtro indirecto) | N/A | `total_funding` | N/A |
| **Ano fundacion** | Founded Year | `organization_founded_year_min/max` | `founded_year` | Year founded |
| **Tipo empresa** | N/A | N/A | `company_type` | Company type (Public/Private) |
| **Crecimiento (hiring)** | Dept Size Change | `organization_department_size_change` | `growth_rate` | Department headcount changes |
| **Keywords producto** | Keywords | `q_organization_keyword_tags` | `description_keywords` | Keywords in profile |
| **Modelo negocio** | N/A (manual tag) | N/A | Custom column | N/A |
| **Regulatory status** | N/A | N/A | Custom enrichment | N/A |

---

## Guia de Traduccion por Atributo

### Industria

**ICP dice:** "Empresas SaaS B2B en fintech"

**Apollo:**
```json
{
  "q_organization_keyword_tags": ["SaaS", "fintech", "financial technology"],
  "organization_industries": ["financial services", "software"]
}
```
Nota: Apollo usa tags Y industries. Tags son mas flexibles (keywords). Industries son taxonomia fija.

**Clay:**
- Column: `industry` (from Clearbit/Apollo provider)
- Formula column: `IF(CONTAINS(industry, "fintech") OR CONTAINS(industry, "financial"), TRUE, FALSE)`

**LinkedIn SN:**
- Filtro: Industry > Financial Services, Technology
- Keyword: "SaaS" en busqueda de empresa

### Tamano Empresa

**ICP dice:** "10-50 empleados"

**Apollo:**
```json
{
  "organization_num_employees_ranges": ["11,50"]
}
```
Rangos disponibles: `1,10` | `11,50` | `51,200` | `201,500` | `501,1000` | `1001,5000` | `5001,10000` | `10001+`

**Clay:** Column `headcount`, filtro numerico directo.

**LinkedIn SN:** Rangos predefinidos: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+

### Revenue / Facturacion

**ICP dice:** "Revenue entre 1M y 10M EUR"

**Apollo:**
```json
{
  "revenue_range": {"min": 1000000, "max": 10000000}
}
```
Nota: Apollo reporta en USD. Convertir EUR a USD para el filtro.

**Clay:** Column `annual_revenue` via Clearbit/ZoomInfo provider. Mas preciso con waterfall.

**LinkedIn SN:** Solo disponible en plan Advanced+ (Annual revenue filter). Rangos limitados.

### Geografia

**ICP dice:** "Empresas en Espana, con foco en Madrid y Barcelona"

**Apollo:**
```json
{
  "organization_locations": ["Spain"],
  "organization_city": ["Madrid", "Barcelona"]
}
```

**Clay:** `hq_country` = "Spain", `hq_city` IN ("Madrid", "Barcelona")

**LinkedIn SN:** Headquarters > Spain > Madrid, Barcelona

### Tech Stack

**ICP dice:** "Empresas que usan Stripe y HubSpot"

**Apollo:**
```json
{
  "currently_using_any_of_technology_uids": ["stripe_uid", "hubspot_uid"]
}
```
Nota: Necesitas los UIDs internos de Apollo. Buscar via `/api/v1/mixed_people/search` con nombre de tecnologia.

**Clay:** Column `technologies` via BuiltWith/Wappalyzer provider. Waterfall: prueba BuiltWith, luego Wappalyzer, luego SimilarTech.

**LinkedIn SN:** Filtro "Technologies used" muy limitado (solo grandes plataformas).

### Funding Stage

**ICP dice:** "Startups Series A o Series B"

**Apollo:**
```json
{
  "organization_latest_funding_stage_cd": ["series_a", "series_b"]
}
```
Valores: `seed`, `series_a`, `series_b`, `series_c`, `series_d`, `series_e`, `ipo`, `debt_financing`, `grant`, `pre_seed`

**Clay:** `latest_funding` via Crunchbase provider. Mas detallado (incluye monto, fecha, investors).

**LinkedIn SN:** N/A (no tiene filtro de funding).

### Growth Signals

**ICP dice:** "Empresas creciendo (contratando en engineering)"

**Apollo:**
```json
{
  "organization_department_size_change": {
    "department": "engineering",
    "change": "growing"
  }
}
```

**Clay:** Custom signal column combinando: headcount change + job postings + funding recency.

**LinkedIn SN:** Insights de empresa > "Headcount growth" y "New hires in [department]".

---

## ICP Fit Scoring Methodology

Cada empresa encontrada recibe un **ICP Fit Score** de 1-10 basado en cuantos criterios del ICP cumple y con que precision.

### Criterios de Scoring

| Criterio | Peso | Score Logic |
|----------|------|-------------|
| **Industria match** | 2.0 | Exact match = 2.0, related = 1.0, no match = 0 |
| **Tamano match** | 1.5 | Within range = 1.5, adjacent range = 0.75, far = 0 |
| **Revenue match** | 1.5 | Within range = 1.5, adjacent = 0.75, unknown = 0.5* |
| **Geografia match** | 1.0 | Exact country+city = 1.0, country only = 0.5, no match = 0 |
| **Tech stack match** | 1.5 | All techs = 1.5, partial = 0.75, none = 0 |
| **Funding match** | 1.0 | Exact stage = 1.0, adjacent = 0.5, no data = 0.25* |
| **Growth signals** | 1.5 | Strong signals = 1.5, moderate = 0.75, no signals = 0 |

*Nota: "unknown/no data" recibe score parcial porque ausencia de dato != no cumple el criterio.

**Total maximo:** 10.0
**Peso total:** 10.0 (suma de todos los pesos)

### Score Calculation

```
icp_score = sum(criterion_weight * match_score) / max_possible_score * 10

Ejemplo:
- Industria: exact match (2.0/2.0)
- Tamano: within range (1.5/1.5)
- Revenue: unknown (0.5/1.5)
- Geo: country only (0.5/1.0)
- Tech: partial (0.75/1.5)
- Funding: exact (1.0/1.0)
- Growth: moderate (0.75/1.5)

Total: (2.0 + 1.5 + 0.5 + 0.5 + 0.75 + 1.0 + 0.75) / 10.0 * 10 = 7.0
```

### Priority Classification

| Score | Priority | Action |
|-------|----------|--------|
| **8.0 - 10.0** | **HOT** | Pursue immediately. High ICP fit + growth signals. |
| **6.0 - 7.9** | **WARM** | Good fit, missing some criteria. Enrich further before pursuing. |
| **4.0 - 5.9** | **COLD** | Partial fit. Park for later or monitor for signal changes. |
| **< 4.0** | **DISCARD** | Not ICP. Do not include in output. |

### Signal Boosters (add to base score)

Signals de alta intencion que suben la prioridad dentro de su tier:

| Signal | Boost | Detection Method |
|--------|-------|-----------------|
| Contratando en area relevante | +0.5 | Job postings, dept growth |
| Funding reciente (<6 meses) | +0.5 | Crunchbase, Apollo funding data |
| Cambio de liderazgo reciente | +0.3 | LinkedIn alerts, news |
| Expansion geografica | +0.3 | New office openings, job locations |
| Tech stack change | +0.3 | BuiltWith alerts, Apollo tech changes |
| Competitor customer (churn signal) | +0.5 | Review sites, LinkedIn posts |

**Boost cap:** +1.5 max (una empresa HOT 8.0 puede llegar a 9.5 con signals, pero no a 11).

---

## Mapping Workflow

```
1. Leer ICP de brand/{slug}/go-to-market/ecps.json
       |
2. Por cada atributo del ICP:
   a. Identificar campo equivalente en herramienta seleccionada (tabla arriba)
   b. Traducir valor a formato API/filtro
   c. Marcar atributos sin equivalente directo como "manual enrichment needed"
       |
3. Construir query con TODOS los filtros mapeables
       |
4. Ejecutar busqueda
       |
5. Enriquecer resultados con datos faltantes (atributos no mapeables)
       |
6. Aplicar ICP Fit Score a cada empresa
       |
7. Filtrar score >= 7 (o >= 6 si pocas empresas)
       |
8. Aplicar signal boosters para priorizar dentro de cada tier
```

---

## Pitfalls Comunes

| Problema | Solucion |
|----------|----------|
| Filtros demasiado estrictos = 0 resultados | Relajar un filtro a la vez, empezando por el menos critico |
| Revenue "unknown" en muchas empresas | No descartar: enriquecer con Clay waterfall o estimar por headcount |
| Industry tags inconsistentes entre plataformas | Usar multiples tags/keywords por industria. Apollo "fintech" != LinkedIn "Financial Services" |
| Tech stack data desactualizado | Cross-reference con BuiltWith (via Clay o Apify actor) |
| Geografia imprecisa (empresa remote-first) | Buscar por HQ registrado + filtrar manualmente empresas distribuidas |
| Duplicados entre fuentes | Deduplicar por dominio (primary key = company domain) |
