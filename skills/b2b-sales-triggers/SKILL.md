---
name: b2b-sales-triggers
description: "Catálogo accionable de 137 sales triggers para outbound B2B, destilado de ColdIQ (metodología Flip the Script). Cada trigger responde: qué señal lo dispara, cómo detectarla y qué ángulo de mensaje activa. Usar cuando el usuario pregunte 'con qué excusa/razón contacto a este lead', 'qué trigger uso', 'por qué escribirle ahora', 'sales triggers', 'buying signals', 'señales de compra', 'campaña signal-based', 'win-back', 're-engagement de closed-lost', 'a quién priorizo del inbound', o esté montando outbound y necesite elegir la premisa de contacto. NO usar para definir el ICP (ver b2b-targeting-playbook) ni para decidir el nivel de personalización o redactar la secuencia (ver b2b-personalization-depth)."
metadata:
  version: 1.0.0
  author: Growth4U
  source: "Destilado de ColdIQ's GTM Skills (github.com/Cold-IQ/ColdIQ-s-GTM-Skills) — sin copia literal (repo sin licencia)"
---

# Sales Triggers B2B — catálogo de 137 premisas de contacto

Un **trigger** es la razón verificable por la que escribes a un prospect HOY y no otro día.
Es la primera línea del mensaje y el filtro de priorización de la lista. La regla madre:
**ningún primer mensaje sin premisa**. Si no hay trigger, el mensaje es spray-and-pray y
compite con el peor outbound del inbox.

Los datos de referencia del material original: outreach frío puro responde ~6-8%;
con una señal, 18-22%; con varias señales apiladas, 35-40%. El trigger no es decoración —
es el multiplicador principal del reply rate.

## Las 4 categorías de outreach

Toda premisa cae en una de estas cuatro categorías (taxonomía de Flip the Script):

| Categoría | El prospect… | Mensajería | Personalización |
|---|---|---|---|
| **Inbound** | Te conoce y levantó la mano (demo, pricing) | 1:many | Baja — el trigger ya lo dice todo |
| **Postbound** | Te conoce pero NO levantó la mano (consumió contenido) | 1:many + 1:1 | Media |
| **Bridgebound** | A veces te conoce; hizo algo ajeno a tu marketing que sube la probabilidad de compra | 1:many + 1:1 | Media-alta, basada en la señal |
| **Outbound** | No te conoce; lo elegiste tú | Solo 1:1 | Alta — investigación obligatoria |

Bridgebound es la categoría más rica (101 de los 137 triggers) y la más rentable:
señales reales sin depender de que el prospect venga a ti.

## El catálogo — references/ por categoría

| Referencia | Triggers | Cuándo abrirla |
|---|---|---|
| [inbound-triggers.md](references/inbound-triggers.md) | 30 | Priorizar y responder leads de marketing (contenido, eventos, producto, social, influencers) |
| [bridgebound-relationship.md](references/bridgebound-relationship.md) | 39 | Explotar relaciones: clientes, inversores, advisors, empleados, tu red |
| [bridgebound-history.md](references/bridgebound-history.md) | 16 | Reactivar historia previa: demos caídas, closed-lost, champions que cambian de empresa |
| [bridgebound-in-market.md](references/bridgebound-in-market.md) | 20 | Prospectos probablemente "in market": vendors adyacentes, competidores, estacionalidad |
| [bridgebound-symptoms.md](references/bridgebound-symptoms.md) | 11 | Dolor observable: problemas visibles, capacidades ausentes, audiencias de influencers |
| [bridgebound-firmographic.md](references/bridgebound-firmographic.md) | 15 | Eventos de empresa: funding, IPO, M&A, contratación, lanzamientos |
| [outbound-premises.md](references/outbound-premises.md) | 6 | Frío puro: CXO passdown, groundswell, multi-persona, cold clásico |

## Cómo elegir el trigger (orden de trabajo)

1. **¿Hay historia previa?** (demo caída, closed-lost, champion que se movió) → bridgebound-history. Es la señal con mayor correlación de compra: confianza ya construida.
2. **¿Hay relación explotable?** (cliente común, inversor común, conexión mutua) → bridgebound-relationship. Un puente tibio gana a cualquier señal fría.
3. **¿Hay evento de empresa o señal in-market?** (funding, hiring, compró vendor adyacente, review negativa del competidor) → firmographic / in-market.
4. **¿Hay dolor observable?** → symptoms.
5. **Nada de lo anterior** → outbound puro: acepta el coste de investigación 1:1 o baja la prioridad del lead.

Ranking de correlación con compra (de mayor a menor, según el material de ColdIQ):
ex-clientes y ex-usuarios → liderazgo nuevo ≤90 días → visita a páginas BOFU →
cambio de tech stack → expansión (funding, nueva región) → hiring/downsizing.

**Apilar señales**: dos señales débiles simultáneas (p. ej. hiring + siguió tu página)
valen más que una fuerte aislada. Documenta cada señal con fecha y fuente.

## Timing maestro

| Trigger | Ventana óptima |
|---|---|
| Visita a pricing / alta intención web | 24-48 h |
| No-show a demo | Mismo día + recordatorio a los 2 días |
| Nuevo directivo en el rol | Días 14-45 |
| Funding anunciado | 2-4 semanas después |
| Compró vendor adyacente | 2-4 semanas después |
| Review negativa de competidor | Días |
| Renovación con competidor | ~90 días antes de la renovación |
| Ghosted / closed-lost | 30-60 días (ghosted) · 3-6 meses (closed-lost) |
| IPO / adquisición | 30-90 días tras el cierre |
| Patrón de contratación | ≤2 semanas tras detectarlo |

## Del trigger al mensaje

- **Primera línea = el trigger**, con la evidencia concreta (qué, cuándo, dónde lo viste). Nunca "espero que estés bien".
- **Segunda línea = el puente**: qué suele implicar esa señal para alguien en su rol ("las empresas que acaban de levantar ronda suelen escalar X…").
- **Cierra con UNA pregunta de bajo compromiso**, no con una petición de reunión de 30 min.
- Si la señal es fuerte (levantó la mano), NO la entierres en personalización extra: trigger + CTA y ya.
- **Jamás inventes o exageres una señal.** Si no puedes citar la evidencia, ese trigger no existe. Cita la fuente en el mensaje cuando aporte credibilidad ("vi en …").

Para elegir nivel de personalización, plantillas y cadencia una vez elegido el trigger:
skill `b2b-personalization-depth`.

## Activación con nuestro stack

- **Sourcing y campañas B2B**: el flujo canónico es Yalc — `outbound.workflow.start`
  (skill `yalc-operator`), que hace sourcing vía **Apollo**, enriquece, puntúa y prepara
  el batch. El trigger elegido debe viajar en `contactReason` / `targetSegment` del intent.
- **Búsqueda puntual de personas**: `leads.search` del ledger de ejecución
  (Apollo People Search, acotado y durable) para validar que la señal tiene
  personas alcanzables detrás antes de montar la campaña.
- **Señales de empresa (futuro)**: el provider `crustdata` ya existe como opción de
  sourcing/enriquecimiento en Yalc; cuando esté activo, será la vía para detectar
  triggers firmográficos (funding, hiring, tech stack) de forma programática. Hoy,
  muchos triggers de este catálogo se detectan manualmente (LinkedIn, prensa, reviews) —
  dilo explícitamente al usuario en vez de fingir detección automática.
- **Detección social / influencers**: para audiencias de creators, el discovery de
  Partnerships (`discovery-plan-builder`) cubre la parte de influencers.

## Fuente y atribución

Destilado de **ColdIQ's GTM Skills** (https://github.com/Cold-IQ/ColdIQ-s-GTM-Skills),
la librería pública de skills GTM de [ColdIQ](https://coldiq.com). La taxonomía de
137 triggers y las 4 categorías de outreach proceden de la metodología **Flip the Script**
tal y como ColdIQ la cura en su repo. El repo fuente **no declara licencia**, así que
aquí no se copia contenido literal: taxonomías, señales y datos están reescritos,
traducidos y adaptados al stack de Sancho, con atribución. Las integraciones de
herramienta del original (ColdIQ MCP/marketplace) se sustituyen por nuestro stack.
