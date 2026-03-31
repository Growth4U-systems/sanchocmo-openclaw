# Channel-Skill Map

> Mapeo de tipo de tarea → canal Discord → skills sugeridos → persona Escudero.
> Derivado de `dispatch-map.json`. Consultar este archivo al asignar canal y skill a cada tarea.

---

## Canales de Ejecución

| Tipo de tarea | Canal | Skills sugeridos | Persona Escudero |
|---------------|-------|------------------|------------------|
| Landing pages, CRO, copy web | `web` | direct-response-copy, lead-magnet, positioning-messaging | El Arquitecto |
| Artículos SEO, keyword research, content calendar | `content` | keyword-research, seo-content, content-calendar-planner | El Redactor |
| Social media, newsletter, atomización | `content` | content-atomizer, newsletter, direct-response-copy | El Comunicador |
| Ad copy, retargeting, campañas paid | `paid-ads` | direct-response-copy, sancho-visual | El Amplificador |
| Prospecting, listas, enrichment, outreach | `prospecting` | company-finder, decision-maker-finder, contact-enrichment, outreach-sequence-builder, email-sequences | El Explorador |
| Email sequences, lead magnets, sales | `prospecting` | positioning-messaging, pricing-strategy, direct-response-copy | El Comercial |
| Partnerships, afiliados, colaboraciones | `partners` | company-finder, decision-maker-finder, contact-enrichment, direct-response-copy | El Conector |
| Assets visuales, identidad visual, diseño | `creatives` | visual-identity, brand-voice, sancho-visual | El Creativo |

## Canales de Intelligence

| Tipo de tarea | Canal | Skills sugeridos | Persona Escudero |
|---------------|-------|------------------|------------------|
| Deep research, competitive intel, market analysis | `research` | market-intelligence, competitor-intelligence, deep-research | El Investigador |
| Signals, patterns, daily pulse, meeting intel | `intelligence` | daily-pulse, meeting-intelligence, signal-monitor, thief-marketers, pattern-detector | El Investigador |
| CRM analysis, trends, self-intelligence | `learning` | last-30-days, self-intelligence | El Investigador |

## Canales de Decisión (no ejecutar)

| Canal | Rol | Regla |
|-------|-----|-------|
| `general` | Solo cuando @mencionado | Nunca ejecutar skills. Proponer y redirigir. |
| `brand` | Consultar/actualizar marca | Post-onboarding. No crear desde cero. |
| `campaigns` | Proponer y planificar | Proponer campañas. Ejecución va a canales de ejecución. |

## Canal de Soporte

| Canal | Rol |
|-------|-----|
| `soporte` | Bugs, feedback, escalation a Cervantes |

---

## Reglas de asignación

1. **Una tarea = un canal.** Si una tarea toca dos canales, dividirla en dos tareas.
2. **El canal determina el contexto.** El skill asignado debe existir y ser ejecutable en ese canal.
3. **Intelligence → campaigns → execution.** Las ideas nacen en intelligence, se proponen en campaigns, se ejecutan en canales de ejecución.
4. **Nunca ejecutar en canales de decisión.** General, brand y campaigns son para proponer, no ejecutar.
