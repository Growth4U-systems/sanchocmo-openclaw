# Hydration Map — business-model-audit

> Campos que ya existen upstream y NO deben re-preguntarse.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo esta skill | Tipo mapeo | Notas |
|-------------|---------------|-------------------|------------|-------|
| company-context | b2b_b2c | b2b_b2c | exacto | NUNCA re-preguntar |
| company-context | revenue_model | revenue_model | exacto | Base — profundizar si es "Hybrid" o vago |
| company-context | product_type | product_delivery | inferir | SaaS→Web, Physical→Physical, etc |
| company-context | avg_ticket | avg_ticket_monthly | exacto | Convertir a mensual si es anual |
| company-context | ltv_estimate | ltv_estimate | exacto | Si existe, validar cálculo |
| company-context | revenue_streams | (contexto) | exacto | Para revenue_model_secondary |
| company-context | current_channels | primary_traffic_sources | exacto | Mapeo directo |
| company-context | monthly_leads | monthly_leads | exacto | NUNCA re-preguntar |
| company-context | monthly_customers | monthly_customers | exacto | NUNCA re-preguntar |
| company-context | acquisition_source_primary | primary_traffic_sources | exacto | Complementa current_channels |
| company-context | has_analytics | funnel_measurement | inferir | true→partial min, false→none/gut_feeling |
| company-context | has_crm | (contexto) | exacto | Indica si hay datos de funnel reales |
| company-context | pricing_tiers | (contexto) | exacto | Para inferir self_serve, pricing_visible |
| competitors | (si existe) | competitor_motions | interpretar | Extraer growth motions de competitors |

## Campos genuinamente nuevos (siempre preguntar)

| Campo | Por qué no existe upstream | Pregunta sugerida |
|-------|--------------------------|-------------------|
| growth_motion | company-context no clasifica PLG/MLG/Sales | "¿El cliente puede empezar a usar el producto solo, sin hablar con nadie?" |
| self_serve_signup | No se analiza el signup flow antes | Inferir de URL si posible, confirmar |
| sales_cycle_length | Detalle de ciclo de venta no existe | "¿Cuánto tarda un cliente desde que os conoce hasta que paga?" |
| decision_maker_level | No se captura en company-context | "¿Quién decide la compra?" |
| funnel_steps | company-context tiene channels pero no funnel detallado | "Describime el camino desde descubrimiento hasta pago, paso a paso" |
| bottleneck_step | Requiere análisis del funnel | "¿Dónde se caen más personas?" |
| churn_rate_monthly | No existe upstream | "¿Qué % de clientes perdéis al mes?" |
| net_revenue_retention | No existe upstream | "¿Los clientes existentes gastan más con el tiempo?" |
| expansion_revenue_pct | No existe upstream | "¿Qué % de ingresos viene de upsell/cross-sell?" |
| gross_margin_pct | No existe upstream | "¿Cuál es vuestro margen bruto?" |
| cac_estimate | Requiere cálculo específico | "¿Cuánto os cuesta adquirir un cliente?" |

## Ejemplo de presentación hidratada

```
"De tu Company Context ya tengo:

  • Modelo: B2B ✅
  • Revenue: Suscripción mensual ✅
  • Ticket medio: €200/mes ✅
  • Leads actuales: ~30/mes ✅
  • Clientes nuevos: ~5/mes ✅
  • Fuente principal: LinkedIn + boca a boca ✅
  • Analytics: Sí (GA4) ✅

¿Correcto? ¿Algo que ajustar?

Lo que necesito profundizar (específico de business model):
1. ¿El cliente puede registrarse solo o necesita hablar con ventas?
2. Describime el camino desde que os descubren hasta que pagan
3. ¿Dónde se caen más personas en ese proceso?
4. ¿Tenéis datos de churn, expansión, o margen bruto?"
```
