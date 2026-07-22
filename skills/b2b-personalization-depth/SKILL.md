---
name: b2b-personalization-depth
description: "Sistema de personalización por niveles para outbound B2B, destilado de ColdIQ: cuándo personalizar en masa vs en profundidad, los 6 buckets de research rankeados, hooks fuertes vs ligeros, calibración ATL/BTL por seniority, esqueletos de email adaptables y cadencias de secuencia. Usar cuando el usuario pregunte 'cuánto personalizo', 'personalización a escala', 'primera línea del email', 'hooks', 'qué research hago del prospect', 'plantillas de cold email', 'cadencia', 'cada cuánto mando follow-ups', 'secuencia de toques', o al preparar los mensajes de una campaña outbound. Complementa el paso de personalización batch de Yalc (rol + empresa + señal verificada) y define el tier profundo para el futuro Investigador. NO usar para elegir el trigger (ver b2b-sales-triggers) ni definir la audiencia (ver b2b-targeting-playbook)."
metadata:
  version: 1.0.0
  author: Growth4U
  source: "Destilado de ColdIQ's GTM Skills (github.com/Cold-IQ/ColdIQ-s-GTM-Skills) — sin copia literal (repo sin licencia)"
---

# Personalización por niveles — masa vs profunda

La personalización no es un sí/no: es una **decisión de inversión por lead**.
El error caro no es personalizar poco — es personalizar al nivel equivocado:
research de 20 minutos para un lead de €2K de ACV, o plantilla con nombre
cambiado para una cuenta Tier A.

## Los dos niveles (y cuándo cada uno)

**Nivel masa (personalización estructural)**: rol + empresa + señal verificada,
inyectados en una estructura fija. Escala a cientos de leads por campaña. Es
exactamente lo que ejecuta nuestro paso de personalización batch de Yalc
(`outbound.workflow.personalize`): framework fijo *observación → puente de
relevancia → valor compartido → CTA*, variantes solo con evidencia explícita,
jamás una señal inventada.

**Nivel profundo (personalización 1:1)**: research real del prospect (los 6
buckets de abajo), hook fuerte con cita textual, mensaje escrito para UNA
persona. No escala; se reserva para cuentas que lo pagan. Este es el tier que
cubrirá el futuro **Investigador** — hasta que exista, es trabajo manual y hay
que presupuestarlo como tal.

**Matriz de decisión** (destilada del marco de ColdIQ):

| Factor | Profundo | Masa |
|---|---|---|
| ACV | >€25K | <€25K |
| Volumen diario | <50 leads | >100 leads |
| Tier de cuenta (ver `b2b-targeting-playbook`) | Tier A | Tier B/C |
| Fuerza de la señal | Débil (el research compensa) | Fuerte (la señal ya hace el trabajo) |
| Competencia por el inbox | Alta | Baja |

Regla contraintuitiva que conviene recordar: **cuanto más fuerte la señal, menos
personalización extra necesita el mensaje**. Un hand-raiser quiere el CTA, no tu
research.

## Los 6 buckets de research (rankeados por valor)

Para el nivel profundo, el research se organiza en 6 fuentes, de más a menos
valiosa:

1. **Contenido que él creó** — posts, artículos, podcasts, charlas. El oro: citarlo textualmente es el hook más fuerte que existe.
2. **Contenido con el que interactuó** — qué comenta, comparte, aplaude. Revela intereses sin que haya escrito nada.
3. **Cómo se describe a sí mismo** — headline, bio, descripción del rol. Usa sus propias palabras para encuadrar la relevancia.
4. **Cajón desastre personal** — hobbies, voluntariado, idiomas, universidad. Rapport en dosis mínimas; abusar de esto resulta invasivo.
5. **Trayectoria profesional** — antigüedad, movimientos de carrera, premios, conexiones mutuas. Contexto de credibilidad.
6. **Nivel empresa** — funding, hiring, lanzamientos, prensa, competidores. El bucket que escala (es el que alimenta el nivel masa vía triggers — ver `b2b-sales-triggers`).

**Fallback sin research (relevancia estática)**: cuando no hay nada de lo
anterior, la relevancia se construye con segmento: persona compradora, tamaño de
empresa, vertical, geografía o tech stack ("trabajamos con [perfil exacto]").
Es el suelo, no el techo.

## Hooks: fuerte vs ligero

- **Hook fuerte (cita textual)**: referencia literal a algo que dijo o publicó — "en tu post sobre X dijiste '[cita]'…". Para Tier A, enterprise, displacement. Requiere bucket 1-2.
- **Hook ligero (tema)**: referencia conceptual — "veo que estáis escalando el equipo de ventas…". Para volumen con contexto. Sale de buckets 3-6.
- El hook debe **conectar con el problema que resuelves**. Test: si quitas el hook y el mensaje sigue teniendo sentido, el hook era decoración — reescríbelo.

## Calibración ATL/BTL (por seniority)

- **ATL (VP, C-level, directores)**: piensan en estratégico — revenue, riesgo, posición competitiva. Mensajes de 2-3 frases. Error fatal: hablarles de problemas operativos (te delegan hacia abajo al instante).
- **BTL (managers, ICs)**: piensan en su semana — tiempo perdido, procesos manuales, quedar bien. Mensajes de 3-4 frases con el dolor cotidiano explícito. Error fatal: hablarles de ROI estratégico (no les resuena).
- Multi-thread (ambos a la vez) en enterprise: mismo trigger, ángulo por nivel — ver `b2b-targeting-playbook` §buying-committee.

## Nivel de personalización por categoría de outreach

Del marco de 4 categorías (ver `b2b-sales-triggers`):

| Categoría | Primera línea | Segunda línea |
|---|---|---|
| Inbound | SOLO relevancia del trigger | CTA a agendar |
| Postbound / Bridgebound | Trigger + (si hay) hook personal | Hook + relevancia estática |
| Outbound puro | Hook personal (cita o tema) | Relevancia estática ("trabajamos con…") |

## Reglas de escritura (nivel masa y profundo)

- 60-90 palabras por email; ATL menos. Sin bullets, sin HTML, sin adjuntos.
- UNA CTA por mensaje, de bajo compromiso ("¿lo exploramos?" gana a "¿30 minutos el jueves?").
- Prueba social con número concreto ("+47% en 90 días", no "mejoras significativas").
- Muestra la fuente del dato de personalización cuando aporte credibilidad — y protege si el dato viniera mal.
- Prohibido: halagos genéricos de IA ("¡me encanta lo que hacéis!"), "espero que estés bien", jerga corporativa, señales inventadas o exageradas.

## Plantillas y cadencias

- **Esqueletos de email adaptables** (primeros toques por tipo de trigger, follow-ups, re-engagement, breakup): [references/plantillas-email.md](references/plantillas-email.md)
- **Cadencias, tiempos entre toques y frecuencias**: [references/cadencias-y-frecuencias.md](references/cadencias-y-frecuencias.md)

## Integración con nuestro stack

- El **nivel masa** ya está operativo: Yalc `outbound.workflow.personalize` corre
  la personalización sobre el batch completo con evidencia verificada (rol +
  empresa + señal). Esta skill define QUÉ pedirle (approach, variantRules,
  ángulos por seniority); la ejecución y las reglas duras (no editar contactos
  uno a uno, no inventar señales) viven en `yalc-operator`.
- El **nivel profundo** hoy es manual. Cuando exista el "Investigador", su
  contrato será: recibir un lead Tier A + devolver los buckets 1-3 con evidencia
  citable (URL + fecha + cita) para construir el hook fuerte. Hasta entonces, si
  el usuario pide personalización profunda a escala, explica el coste real en
  vez de simularla.

## Fuente y atribución

Destilado de **ColdIQ's GTM Skills**
(https://github.com/Cold-IQ/ColdIQ-s-GTM-Skills): su marco de personalización
(6 buckets, hooks, playbooks por categoría — metodología Flip the Script curada
por ColdIQ), el framework ATL/BTL, las reglas de escritura SDR y la biblioteca
de plantillas y secuencias. El repo fuente **no declara licencia**, así que no se
copia contenido literal: marcos y plantillas reescritos, traducidos y adaptados
al stack de Sancho, con atribución a [ColdIQ](https://coldiq.com). Las
integraciones de herramienta del original (ColdIQ MCP/marketplace, Clay) se
sustituyen por nuestro stack.
