# Comité de compra — mapeo de personas por cuenta

En cuentas Tier A/B no se contacta "a la empresa": se contacta a un **comité**.
Mapear los roles antes de lanzar evita el error clásico de gastar la cuenta
entera contra un único contacto que resulta no decidir.

## Los 6 roles

| Rol | Títulos típicos | Qué le importa | Prioridad de esfuerzo |
|---|---|---|---|
| **Champion** | Director, Head of | Resolver SU problema y apuntarse la victoria | La mayor: es quien empuja el deal por dentro |
| **Comprador económico** | CEO, CFO, VP | ROI, riesgo, impacto en objetivos | Alta: firma, pero entra tarde |
| **Usuario final** | Analista, especialista, IC | Workflow diario, facilidad de uso | Media: da la adopción y el feedback |
| **Evaluador técnico** | Manager, arquitecto, IT | Integración, seguridad, compliance | Baja hasta la evaluación; entonces crítica |
| **Blocker/gatekeeper** | Legal, compras, seguridad | Que nada rompa las reglas | Solo monitorizar; puede vetar, nunca inicia |
| **Coach** | Cualquier nivel | Te da información interna | Oportunista: cultívalo si aparece |

## Reglas de mapeo

- Mapea **3-6 contactos por cuenta Tier A** cubriendo como mínimo champion +
  comprador económico + usuario final. En Tier B bastan 2-3.
- **Mensaje distinto por rol**: mismo trigger, ángulo diferente. Al champion,
  carrera y solución del dolor; al económico, números y riesgo; al usuario,
  su día a día. Calibración ATL/BTL en `b2b-personalization-depth`.
- **Orden de entrada**: por defecto champion primero (construye el caso interno);
  CXO passdown (empezar arriba pidiendo derivación) cuando no identificas al
  champion — ver `b2b-sales-triggers` §outbound-premises.
- **Multi-threading ≠ bombardeo**: espacia los contactos al comité y asume que
  se enseñarán los mensajes entre ellos — que leídos juntos cuenten una historia
  coherente, no tres pitches desconectados.

## Atributos a capturar por persona

Para cada contacto mapeado: título y seniority real (no el asumido),
departamento, antigüedad en el rol (≤90 días es un trigger en sí — ver
`b2b-sales-triggers`), dolor probable por rol, métrica de éxito, y rol en el
comité (de la tabla). Con eso, la personalización por rol es mecánica en vez de
adivinanza.

## En nuestro stack

El mapeo se ejecuta con `leads.search` (Apollo People Search: títulos y
seniorities por cuenta) para validar que el comité existe y es alcanzable, y con
Yalc `outbound.workflow.start` pasando `personTarget.titles` y
`personTarget.seniorities` por rol. Para multi-persona real (varios roles a la
vez en la misma cuenta), lanza cohortes separadas por rol con su propio
`contactReason` — no mezcles ángulos en un mismo batch.
