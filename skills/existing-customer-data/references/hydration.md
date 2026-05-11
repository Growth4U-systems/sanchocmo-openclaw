# Hydration Map — existing-customer-data

> Usa upstream para saber QUÉ buscar en los datos de clientes.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | |
| company-context | b2b_b2c | Analysis type | exacto | B2B=account-level, B2C=individual |
| company-context | revenue_model | RFM configuration | exacto | Suscripción=frequency distinta vs one-time |
| company-context | avg_ticket | RFM thresholds | exacto | Para definir "high value" |
| company-context | monthly_customers | Volume baseline | exacto | Saber si hay suficientes datos |
| company-context | has_crm | Data source | exacto | Si no hay CRM, cambiar approach |
| icp / ecps | ECP profiles | Segment mapping | exacto | Buscar patrones por ECP en datos reales |
| icp / ecps | pain_points | Churn hypotheses | exacto | ¿Los dolores predicen churn? |

## Campos genuinamente nuevos (siempre ejecutar/preguntar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| Data source access | Necesita acceso real a CRM/datos | "¿Cómo accedo a vuestros datos de clientes?" |
| RFM segmentation | Análisis propio | Recency × Frequency × Monetary |
| Champions profile | Análisis propio | Top 20% customers → profile |
| Churn patterns | Análisis propio | Cluster analysis de churned |
| LTV by segment | Cálculo propio | Revenue data analysis |
| Upgrade patterns | Análisis propio | Tier movement analysis |

## Ejemplo de presentación hidratada

```
"De upstream sé que:
  • Modelo: [B2B/B2C] [revenue_model] ✅
  • Ticket medio: €[X]/mes ✅
  • Clientes/mes: ~[N] ✅
  • CRM: [sí/no] ✅
  • ECPs a buscar en datos: [lista ECPs] ✅

Para hacer el análisis necesito:
  1. Acceso a datos de clientes (CRM export, spreadsheet, o API)
  2. Mínimo: fecha registro, fecha última compra, valor compras, segmento

¿Cómo me das acceso?"
```

## Nota

Este skill es OPCIONAL — solo si hay >50 clientes y acceso a datos. La hydration reduce preguntas de contexto a cero: solo pide acceso a datos.
