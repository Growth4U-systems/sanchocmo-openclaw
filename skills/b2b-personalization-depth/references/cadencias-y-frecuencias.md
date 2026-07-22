# Cadencias y frecuencias de secuencia

Tiempos destilados del marco de ColdIQ (secuencia estándar de 4 emails + mejores
prácticas de follow-up). Ajusta con datos propios en cuanto haya ≥50 envíos por
variante.

## La secuencia estándar de 4 emails

| Toque | Día | Hilo | Contenido |
|---|---|---|---|
| Email 1 | 0 | Nuevo | Apertura por trigger (esqueletos 1-8 de plantillas-email.md) |
| Email 2 | +3 | Mismo hilo | Dolor/KPI principal — nuevo ángulo, más corto |
| Email 3 | +14 | **Hilo y asunto nuevos** | Ángulo distinto + redirección ("¿quién lleva X?") |
| Email 4 | +7 tras el 3 | Mismo hilo que el 3 | Breakup limpio |

Por qué así: el +3 aprovecha la memoria del email 1 sin agobiar; el +14 con
asunto nuevo reinicia la atención de quien ignoró el hilo entero; el breakup
cierra con la pregunta de timing.

## Ajustes por seniority y canal

- **ATL (C-level/VP)**: menos toques (3), más espaciados, mensajes de 2-3 frases. Insistir rápido a un C-level quema la cuenta.
- **BTL (managers/ICs)**: la secuencia completa de 4, tolera un toque extra de valor.
- **Multicanal (email + LinkedIn)**: intercala — email 1 (día 0), conexión LinkedIn sin nota o con nota mínima (día 1-2), email 2 (día 3), interacción con su contenido (día 5), DM corto (día 7+ si aceptó). LinkedIn nunca repite el texto del email: mismo trigger, formato conversacional. Límites y envíos reales: siempre vía el flujo Yalc con gate humano (`yalc-operator`), jamás por fuera.

## Timing de primer toque por tipo de trigger

La ventana la manda el trigger (tabla maestra en `b2b-sales-triggers`):
alta intención web = 24-48 h; no-show = mismo día; directivo nuevo = días 14-45;
funding = 2-4 semanas; review negativa de competidor = días. Una señal caliente
con secuencia lenta es una señal desperdiciada — prioriza el backlog de envíos
por temperatura del trigger, no por orden de llegada.

## Frecuencias de operación de campaña

- **Volumen**: arranca conservador por dominio/remitente y sube gradualmente; la deliverability es un presupuesto que se gasta. Los límites concretos los gestiona la infraestructura de envío del cliente (Instantly/Yalc), no esta skill.
- **Revisión de copy**: itera mensualmente contra reply rate; con <50 envíos por variante no hay señal — no saques conclusiones.
- **A/B**: una variable por test (asunto O apertura, no ambos). Las variantes en Yalc via `variantRules`, cada una con su evidencia.
- **Re-engagement del pipeline muerto**: repaso trimestral de closed-lost y ghosted (ver `b2b-sales-triggers` §bridgebound-history).
- **Higiene**: re-verifica emails de listas con >30 días antes de reenviar; el decay anual de emails B2B ronda el 22-30%.

## Benchmarks de referencia

Del material original de ColdIQ, como orden de magnitud para fijar expectativas
con el cliente (no como promesa):

| Tipo de outreach | Reply rate esperable |
|---|---|
| Frío puro sin señal | 6-8% |
| Basado en una señal | 18-22% |
| Señales apiladas + buen timing | 35-40% |

Open rate sano: 40-60%. Reunión sobre enviados: 2-5%. Si el open rate está bien
y el reply no, el problema es el mensaje; si el open está mal, es el asunto, la
lista o la deliverability — en ese orden de sospecha.
