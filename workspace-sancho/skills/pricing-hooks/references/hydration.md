# Hydration Map — pricing-hooks

> Pricing Hooks tiene el upstream MÁS rico — lee casi todo Foundation.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | revenue_model | pricing_model_current | exacto | Modelo actual |
| company-context | pricing_tiers | tiers_current | exacto | Tiers actuales |
| company-context | avg_ticket | price_point_current | exacto | Precio actual |
| company-context | b2b_b2c | pricing_psychology | exacto | B2B=value-based, B2C=anchoring |
| company-context | differentiator_10x | value_anchor | exacto | Qué justifica el precio |
| business-model | revenue_model (detailed) | pricing_model_analysis | exacto | Más detalle que company-context |
| business-model | ltv_estimate | value_ceiling | exacto | Techo de pricing por LTV |
| business-model | cac_estimate | pricing_floor | exacto | El precio debe cubrir CAC |
| business-model | growth_motion | pricing_strategy | exacto | PLG=freemium viable, Sales=premium viable |
| business-model | expansion_revenue_pct | upsell_hooks | exacto | Si hay expansion → hooks de upgrade |
| budget | budget_monthly_range | (constraint) | exacto | Capacidad de inversión del cliente |
| market | tam | market_size_context | exacto | Para pricing vs market |
| market | maturity | pricing_aggression | interpretar | Emergente=penetration, Maduro=value |
| competitors | pricing_model per competitor | competitive_pricing | exacto | Landscape de precios |
| competitors | pricing_tiers per competitor | tier_comparison | exacto | Features por tier |
| competitors | vulnerabilities | pricing_gaps | exacto | Gaps = oportunidades de pricing |
| positioning | primary_angle | price_justification | exacto | El ángulo justifica el precio |
| positioning | USPs | value_pillars | exacto | USPs → pilares de valor del precio |
| swot | opportunities | pricing_opportunities | exacto | Oportunidades de mercado |
| swot | threats | pricing_risks | exacto | Riesgos de pricing |

## Campos genuinamente nuevos (siempre generar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| Pricing framework | Síntesis propia | Value-based, competitive, cost-plus análisis |
| Psychological hooks | Creación propia | Anchoring, decoy, charm pricing |
| Tier recommendations | Síntesis propia | Feature bundling + competitor gaps |
| Price sensitivity analysis | Análisis propio | Van Westendorp o Gabor-Granger (si data) |
| Implementation plan | Creación propia | Rollout strategy |

## Ejemplo de presentación hidratada

```
"De Foundation completo tengo:

  💰 Pricing actual: [tiers + avg_ticket] ✅
  📊 Revenue model: [revenue_model] ✅
  🏆 Competitor pricing: [landscape resumen] ✅
  🎯 Positioning: [primary_angle] ✅
  📈 Unit economics: LTV [X], CAC [Y] ✅
  🌍 Market: [maturity], TAM [Z] ✅

Con esto genero:
  1. Framework de pricing (value-based + competitive)
  2. Hooks psicológicos por tier
  3. Comparativa vs competitors
  4. Plan de implementación

¿Hay cambios de precio que estéis considerando?"
```
