# Hydration Map — ecp-validation

> ECP Validation necesita los ECPs + positioning para diseñar tests.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | |
| company-context | elevator_pitch | Test messaging base | exacto | Para smoke tests |
| company-context | b2b_b2c | Test method selection | exacto | B2B=interviews, B2C=landing pages |
| company-context | goal_3_6_months | Validation urgency | interpretar | Tight goals → faster methods |
| icp / ecps | ECP profiles | ECPs to validate | exacto | Los nichos a testear |
| icp / ecps | pain_points | Assumption mapping | exacto | Qué dolor testear |
| icp / ecps | jtbd_statements | Test hypotheses | exacto | JTBD → hipótesis a validar |
| icp / ecps | ECP scores | Prioritization | exacto | Testear highest-potential primero |
| positioning | UVP per ECP | Test messaging | exacto | Qué mensaje testear |
| positioning | USPs per ECP | Test hooks | exacto | Qué hooks probar |
| positioning | benefit_proof_pairs | Test evidence | exacto | Qué proofs incluir |

## Campos genuinamente nuevos (siempre generar/preguntar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| Assumption map | Transformación propia | ECP assumptions → testeable hypotheses |
| Method selection | Decisión propia | Budget + timeline + B2B/B2C → method |
| MVI design | Creación propia | Minimum Viable Input per ECP |
| Test results | Ejecución propia | Landing page data, interview insights |
| Validation verdict | Análisis propio | Pass/Pivot/Kill per ECP |

## Ejemplo de presentación hidratada

```
"Tengo los ECPs del niche-discovery y su positioning:

  🎯 ECP 1: [nombre] — Score: [X] — UVP: [extracto]
  🎯 ECP 2: [nombre] — Score: [X] — UVP: [extracto]
  🎯 ECP 3: [nombre] — Score: [X] — UVP: [extracto]

Para cada uno voy a:
  1. Mapear assumptions clave
  2. Seleccionar método de validación (entrevistas/smoke test/waitlist)
  3. Diseñar MVI

¿Quieres validar los 3 o priorizar alguno?"
```
