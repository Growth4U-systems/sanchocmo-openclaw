---
name: b2b-targeting-playbook
description: "Playbook de targeting e ICP para outbound B2B, destilado de las master skills de list building y ABM de ColdIQ. Define y refina audiencias: ICP en 3 capas, scoring 0-100 con tiers A-D, criterios de exclusión, lookalikes desde mejores clientes, dimensionado de lista (revenue reverse-engineering) y mapeo del comité de compra. Usar cuando el usuario pida 'definir el ICP', 'ideal customer profile', 'a quién apuntamos', 'targeting', 'audiencia de outbound', 'segmentar la lista', 'scoring de cuentas', 'priorizar cuentas', 'tiers ABM', 'target account list', 'criterios de exclusión', 'cuántas cuentas necesito', o antes de lanzar cualquier campaña outbound nueva. NO usar para elegir el trigger de contacto (ver b2b-sales-triggers) ni para redactar mensajes o decidir personalización (ver b2b-personalization-depth)."
metadata:
  version: 1.0.0
  author: Growth4U
  source: "Destilado de ColdIQ's GTM Skills (github.com/Cold-IQ/ColdIQ-s-GTM-Skills) — sin copia literal (repo sin licencia)"
---

# Targeting B2B — del ICP a la lista priorizada

La lista es el 80% del resultado de una campaña outbound: un mensaje mediocre a
la audiencia correcta gana a un mensaje brillante a la audiencia equivocada.
Este playbook convierte "queremos vender a empresas X" en una lista puntuada,
tierizada y con exclusiones explícitas, lista para sourcing.

## La secuencia de decisiones

Trabaja SIEMPRE en este orden. Cada paso alimenta al siguiente; saltarse uno se
paga en bounce rate, reply rate o tiempo de SDR quemado.

1. **Definir el ICP en 3 capas** (abajo). Si el cliente tiene ≥10 clientes reales, empieza por el paso 7 (lookalike) y valida el ICP contra datos, no contra opiniones.
2. **Validar contra el mercado real**: comprueba que los filtros devuelven un universo razonable de cuentas antes de comprometerte (con `leads.search` / Apollo, ver "Nuestro stack"). Un ICP que devuelve 40 cuentas o 400.000 está mal calibrado.
3. **Dimensionar la lista** desde el objetivo de revenue, no al revés — ver [references/icp-scoring.md](references/icp-scoring.md) §Reverse-engineering.
4. **Sourcing** de cuentas y contactos (Yalc/Apollo).
5. **Puntuar cada cuenta 0-100** con la matriz de scoring — ver [references/icp-scoring.md](references/icp-scoring.md).
6. **Aplicar exclusiones** (abajo). Las exclusiones son parte del ICP, no una ocurrencia posterior.
7. **Asignar tiers y esfuerzo**: A → 1:1, B → 1:few, C → programmatic, D → fuera.
8. **Mapear el comité de compra** en cuentas Tier A/B — ver [references/buying-committee.md](references/buying-committee.md).
9. **Iterar trimestralmente** contra closed-won/closed-lost: re-pondera la matriz con lo que de verdad correlaciona con ganar.

## ICP en 3 capas

**Capa 1 — Firmográfica** (la empresa): industria/vertical (principal y
adyacentes), tamaño de plantilla (rango dulce, p. ej. 51-500), revenue anual,
geografía (sede y mercados), etapa de funding, ritmo de crecimiento.

**Capa 2 — Technográfica** (su stack): herramientas que complementas
(integración = fit), herramientas que sustituyes (competidor instalado = ángulo
de displacement), stack ausente que delata la etapa.

**Capa 3 — Comportamiento e intención** (por qué ahora): vacantes de roles que
tu producto potencia, funding reciente, cambios de liderazgo, engagement con
contenido de la categoría, visitas a tu web. Esta capa conecta directamente con
el catálogo de `b2b-sales-triggers` — un ICP sin capa 3 produce listas correctas
pero mensajes sin razón de "ahora".

## Criterios de exclusión

Definir a quién NO contactar es tan importante como el ICP positivo. Exclusiones
mínimas de toda campaña:

- **Score <50** (Tier D): fuera de outbound; como mucho inbound/nurture.
- **Clientes actuales y pipeline abierto**: cruzar SIEMPRE contra CRM antes de lanzar.
- **Closed-lost reciente sin trigger nuevo**: <90 días desde el cierre, salvo que haya un trigger de historia (ver `b2b-sales-triggers` §bridgebound-history).
- **Competidores del cliente** (no venderles) y **competidores de tus clientes** cuando haya conflicto de interés.
- **Geografías/idiomas no servidos** y verticales regulados que el cliente no puede atender.
- **Contactos ya tocados en otra secuencia activa** del mismo cliente (colisión de campañas quema dominio y marca).
- **Dominios de riesgo para deliverability** (genéricos, catch-all sin verificar, roles tipo info@).

## Scoring y tiers (resumen)

Matriz de 100 puntos sobre 7 criterios ponderados (industria 20, tamaño 15,
revenue 15, geo 10, fit tecnológico 15, crecimiento 10, intención 15). La
intención viva ajusta al alza: una cuenta de 65 con señal fuerte de primera mano
sube a Tier B. Matriz completa, ajustes por intención y ejemplos en
[references/icp-scoring.md](references/icp-scoring.md).

| Tier | Score | Tratamiento |
|---|---|---|
| A | 90-100 | 1:1 — multi-threading, personalización profunda, máximo esfuerzo |
| B | 70-89 | 1:few — secuencias por segmento con personalización media |
| C | 50-69 | 1:many — programmatic, mensajes por vertical |
| D | <50 | Excluir de outbound |

## Lookalikes desde los mejores clientes

El refinamiento más barato del ICP: exporta los 10-20 mejores clientes (por ARR,
LTV o NPS), extrae los atributos comunes (vertical, tamaño, geo, stack, etapa) y
convierte ESO en los filtros de la capa 1-2. El ICP declarado por el founder y el
ICP que emerge de los closed-won casi nunca coinciden — manda el segundo.

## Nuestro stack (dónde ejecuta cada paso)

Donde el material original de ColdIQ dice Sales Navigator, Clay o Apollo directo,
nuestro flujo es:

- **Validar universo y mapear contactos**: `leads.search` del ledger de ejecución —
  Apollo People Search acotado (página 1, resultados compactos), pensado justo
  para esta validación previa sin montar campaña.
- **Sourcing real de campaña**: Yalc `outbound.workflow.start` (skill
  `yalc-operator`) con el ICP traducido a `accountTarget` (industries, locations,
  employeeRanges, keywords) y `personTarget` (titles, seniorities). El scoring de
  Yalc (`b2b_fit_v1`) puntúa los leads sourced; esta matriz define QUÉ le pides.
- **Capa 3 programática (futuro)**: el provider `crustdata` de Yalc cubrirá señales
  de empresa (funding, hiring, stack). Hoy la capa 3 se verifica manualmente —
  sé explícito con el usuario sobre qué señal está verificada y cuál es hipótesis.
- **Exclusiones**: cruzar contra el CRM del cliente (GHL) y campañas Yalc previas
  antes de aprobar el batch.

## Fuente y atribución

Destilado de **ColdIQ's GTM Skills**
(https://github.com/Cold-IQ/ColdIQ-s-GTM-Skills), en particular su master skill
de list building (define-icp, qualify-accounts, account-selection,
persona-mapping) y su marco ABM. El repo fuente **no declara licencia**, así que
no se copia contenido literal: marcos, matrices y criterios reescritos,
traducidos y adaptados al stack de Sancho, con atribución a
[ColdIQ](https://coldiq.com). Las integraciones de herramienta del original
(ColdIQ MCP/marketplace, Sales Navigator, Clay) se sustituyen por nuestro stack.
