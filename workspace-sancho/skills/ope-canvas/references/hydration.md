# Hydration Map — ope-canvas

> OPE Canvas es un skill de SÍNTESIS. Debería pre-rellenarse al 80%+ de upstream.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo OPE | Tipo mapeo | Notas |
|-------------|---------------|------------|------------|-------|
| company-context | elevator_pitch | Core Product | exacto | Base del bloque producto |
| company-context | differentiator_10x | Obvious Choice | exacto | Diferenciador principal |
| company-context | b2b_b2c | ICP (seed) | exacto | Base segmentación |
| company-context | product_type | Core Product | exacto | |
| company-context | key_features | Core Product | exacto | Features principales |
| company-context | markets_served | Geography | exacto | Mercados geográficos |
| company-context | current_channels | Channels | exacto | Canales actuales |
| company-context | goal_3_6_months | Year Picture / Quarter Picture | interpretar | Objetivos a corto |
| company-context | vision_3_5_years | Endgame | interpretar | Visión largo plazo |
| company-context | brand_values | Core Values | exacto | Valores de marca |
| company-context | non_negotiables | Core Values | exacto | |
| business-model | revenue_model | Core Product | exacto | Modelo de ingresos |
| business-model | growth_motion | Channels | exacto | PLG/MLG/Sales → tipo de canal |
| business-model | avg_ticket_monthly | (contexto) | exacto | Para sizing |
| business-model | funnel_steps | (contexto) | exacto | Para mapear canales |
| business-model | bottleneck_step | Core Problem (seed) | interpretar | Dónde atacar |
| budget | budget_monthly_range | (constraint) | exacto | Limita Channels viables |
| budget | team_structure | Core Capabilities | exacto | Capacidad del equipo |
| budget | weekly_hours_marketing | Core Capabilities | exacto | Horas disponibles |
| budget | tools_list | Core Capabilities | exacto | Stack actual |
| self-intelligence | core_message | Obvious Choice (validar) | interpretar | Comparar con differentiator |
| self-intelligence | channel_consistency | (contexto) | exacto | Gaps en comunicación |
| self-intelligence | strengths (evidenced) | Core Capabilities | exacto | Fortalezas evidenciadas |
| self-intelligence | weaknesses (evidenced) | Core Problem | interpretar | Debilidades = problemas core |

## Campos genuinamente nuevos (confirmar/preguntar)

| Campo OPE | Por qué puede no existir completo | Pregunta sugerida |
|-----------|----------------------------------|-------------------|
| Obvious Choice (síntesis) | Requiere triangulación de datos | "Basándome en tus docs, tu Obvious Choice sería: [X]. ¿Correcto?" |
| ICP (refinado) | company-context tiene B2B/B2C pero no ICP detallado | "¿Quién es tu cliente ideal en una frase?" |
| Core Problem | Inferible de funnel + self-intel pero necesita validación | "El problema principal que resolvéis es: [X]. ¿De acuerdo?" |
| Moats | No existe upstream | "¿Qué haría difícil que un competidor os copie?" |
| Strategy Choice | No existe upstream | "¿Dominar nicho, innovar producto, o escalar distribución?" |
| Monthly Picture | No existe upstream | "¿Cuáles son las 3 acciones clave de este mes?" |

## Ejemplo de presentación hidratada

```
"He leído los 4 pilares de La Empresa. Tu OPE Canvas pre-rellenado:

  🎯 Obvious Choice: [inferido de differentiator + self-intel]
  👤 ICP: [inferido de b2b_b2c + channels]
  ❓ Core Problem: [inferido de bottleneck + weaknesses]
  📦 Core Product: [de elevator_pitch + revenue_model]
  🌍 Geography: [de markets_served]
  📡 Channels: [de current_channels + growth_motion]
  🏰 Moats: 🔴 DUDA — necesito tu input
  🎯 Endgame: [de vision_3_5_years]
  💎 Core Values: [de brand_values]
  🛠️ Core Capabilities: [de team + tools + strengths]
  ♟️ Strategy Choice: 🔴 DUDA — necesito tu input
  📅 Year/Quarter/Monthly: [de goals] + 🔴 DUDA monthly

¿Revisa y corrige? Solo necesito que me confirmes los ✅ y completes los 🔴."
```
