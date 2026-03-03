# Hydration Map — budget-constraints

> Campos que ya existen upstream y NO deben re-preguntarse.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo esta skill | Tipo mapeo | Notas |
|-------------|---------------|-------------------|------------|-------|
| company-context | b2b_b2c | (contexto) | exacto | Determina benchmarks a aplicar |
| company-context | team_size | team_structure | inferir | 1→founder_only, 2-5→small_team, 6+→mixed |
| company-context | marketing_team_size | team_structure | inferir | Refina team_structure si existe |
| company-context | goal_3_6_months | timeline_expectation | interpretar | Interpretar urgencia del goal |
| company-context | marketing_constraints | channels_excluded | interpretar | Extraer exclusiones si mencionadas |
| company-context | current_channels | (contexto) | exacto | Informa tool stack existente |
| company-context | revenue_model | (contexto) | exacto | Para calcular budget_pct_of_revenue |
| company-context | avg_ticket | (contexto) | exacto | Para benchmarks de CAC viabilidad |
| business-model | revenue_model | (contexto) | exacto | Más detallado si existe |
| business-model | growth_motion | (contexto) | exacto | PLG/MLG/Sales impacta budget allocation |
| business-model | avg_ticket_monthly | (contexto) | exacto | Más preciso que company-context |
| business-model | ltv_estimate | (contexto) | exacto | Para calcular CAC viable |

## Campos genuinamente nuevos (siempre preguntar)

| Campo | Por qué no existe upstream | Pregunta sugerida |
|-------|--------------------------|-------------------|
| budget_monthly_range | Ningún pilar captura inversión en marketing | "¿Cuánto invertís en marketing al mes?" |
| budget_split | Detalle de allocation no existe upstream | "De ese presupuesto, ¿cuánto va a ads vs herramientas vs personas?" |
| budget_flexibility | Nadie pregunta si el budget es fijo o escalable | "¿Hay flexibilidad para aumentar si los resultados lo justifican?" |
| weekly_hours_marketing | team_size existe pero no horas dedicadas a marketing | "¿Cuántas horas semanales puede dedicar tu equipo al marketing?" |
| can_create_content | Capacidad de creación de contenido no se captura antes | "¿Hay alguien que puede crear contenido? (escribir, diseñar, grabar)" |
| content_capabilities | Detalle de qué tipo de contenido pueden crear | "¿Qué tipo de contenido podéis crear? (texto, diseño, video, foto)" |
| tools_list | Stack de herramientas no se captura en detalle antes | "¿Qué herramientas usáis para marketing?" |
| hard_deadlines | Deadlines específicos no se preguntan en company-context | "¿Hay fechas límite importantes?" |
| outsource_budget | Presupuesto para externalizar no existe upstream | "¿Tenéis presupuesto para freelancers o agencias?" |

## Ejemplo de presentación hidratada

```
"De tu Company Context ya tengo:

  • Modelo: B2B SaaS, suscripción ✅
  • Equipo: 3 personas (fundador + 2 devs) ✅
  • Goal: 'Conseguir 50 leads/mes en 3 meses' → timeline medium ✅
  • Canales activos: LinkedIn, blog (esporádico) ✅

¿Correcto? ¿Algo que ajustar?

Lo que necesito saber (específico de budget):
1. ¿Cuánto invertís en marketing al mes?
2. ¿Cuántas horas/semana dedica tu equipo a marketing?
3. ¿Qué herramientas usáis?
4. ¿Alguien puede crear contenido (escribir, diseñar, grabar)?"
```
