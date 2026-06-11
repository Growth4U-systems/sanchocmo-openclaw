---
name: funnel-architect
description: "Design qualification and conversion funnels."
context_required:
  - brand/{slug}/company-brief/company-brief-current.md
  - brand/{slug}/go-to-market/positioning/*/*-current.md
  - brand/{slug}/go-to-market/ecps/ecps-current.md
context_writes:
  - campaigns/{slug}/funnel-architecture.md
---

# Funnel Architect

Diseña la arquitectura completa de un funnel de cualificación y conversión: etapas, criterios, descualificación, handoff a ventas, métricas y assets necesarios.

---

## Cuándo usar este skill

- Cuando se lanza una campaña nueva y necesitas definir el recorrido completo del lead
- Paso 4 del gtm-orchestrator DAG (después de channel-plan, antes de asset creation)
- Cuando un funnel existente no convierte y necesita rediseño

## Inputs requeridos

Lee estos archivos de Foundation antes de empezar:

| Archivo | Qué extraer |
|---------|-------------|
| `brand/{slug}/go-to-market/positioning/*/*-current.md` | Propuesta de valor, diferenciadores, categoría |
| `brand/{slug}/go-to-market/ecps/ecps-current.md` | Segmentos, pain points, objeciones, triggers de compra |
| `brand/{slug}/company-brief/company-brief-current.md` | Producto/servicio, precio, ciclo de venta, equipo disponible |
| `campaigns/{slug}/channel-plan.md` | Canales de entrada al funnel (si existe) |
| `brand/{slug}/go-to-market/ecps/ecps-current.md` | Emotional Connection Points (si existe) |

**Hard check**: Si `positioning.md` o `icp.md` están vacíos o no existen → STOP. No diseñes un funnel sin saber a quién vendes ni qué vendes.

---

## Tipos de funnel soportados

### 1. Quiz Funnel

**Ideal para**: Servicios con múltiples opciones donde el lead necesita orientación (clínicas, consultoría, educación).

#### Etapas

```
Traffic → Landing (hook) → Quiz (3-7 preguntas) → Resultado personalizado → CTA (agendar/comprar) → Follow-up
```

| Etapa | Objetivo | Criterio de cualificación | Descualificación | Métrica target |
|-------|----------|--------------------------|-------------------|----------------|
| **Landing** | Captar atención, iniciar quiz | Click en "Empezar quiz" | Bounce | CTR landing→quiz: 40-60% |
| **Quiz Q1-Q3** | Segmentar por necesidad | Responde preguntas relevantes | Abandono antes de Q3 | Completion rate: 65-80% |
| **Quiz Q4-Q7** | Cualificar (presupuesto, urgencia, fit) | Respuestas indican fit con servicio | Presupuesto insuficiente, timeline >12m, fuera de zona | Drop-off por pregunta: <10% |
| **Resultado** | Mostrar solución personalizada + valor | Ve resultado completo | — | View rate: 90%+ |
| **CTA** | Conversión (agendar cita, solicitar info) | Hace click en CTA | No actúa en 48h | CTR resultado→CTA: 15-30% |
| **Follow-up** | Recuperar leads que no convirtieron | Abre emails, re-engage | No abre 3 emails seguidos → cold | Email open rate: 35-50% |

#### Handoff a ventas
- **Inmediato**: Lead completa quiz + agenda cita → notificación al equipo comercial con respuestas del quiz
- **Diferido**: Lead completa quiz pero no agenda → entra en secuencia email (3-5 emails) → si agenda, handoff
- **Datos para ventas**: Respuestas del quiz, resultado asignado, tiempo en cada pregunta, source/canal

#### Assets necesarios
1. Landing page con hook + CTA "Empezar quiz"
2. Quiz (3-7 preguntas con lógica de ramificación)
3. Página de resultado (1 por segmento, mínimo 2-3 variantes)
4. Thank you page / Booking page
5. Email sequence follow-up (3-5 emails)
6. Ads de entrada (si paid traffic)
7. Retargeting ads para abandonos

---

### 2. Consultation Funnel

**Ideal para**: Servicios de alto valor con venta consultiva (B2B, servicios profesionales, tickets altos B2C).

#### Etapas

```
Traffic → Landing (problema) → Formulario de pre-cualificación → Booking page → Confirmación + nurture → Consulta → Propuesta → Cierre
```

| Etapa | Objetivo | Criterio de cualificación | Descualificación | Métrica target |
|-------|----------|--------------------------|-------------------|----------------|
| **Landing** | Educar sobre problema + posicionar solución | Scroll >50%, tiempo >45s | Bounce <10s | Bounce rate: <55% |
| **Formulario** | Pre-cualificar (BANT: Budget, Authority, Need, Timeline) | Completa formulario | Budget <mínimo, no decision-maker, sin necesidad real | Form completion: 20-35% |
| **Booking** | Agendar consulta gratuita | Elige slot y confirma | No agenda en 72h | Booking rate: 50-70% del form |
| **Pre-consulta** | Preparar al lead (nurture + expectativas) | Abre email de confirmación, consume contenido prep | No-show | Show rate: 70-85% |
| **Consulta** | Diagnosticar + presentar solución | Lead engaged, hace preguntas, confirma pain points | Sin presupuesto real, problema no encaja | Qualified rate: 60-75% |
| **Propuesta** | Cerrar venta | Revisa propuesta en <48h | No responde en 7 días | Close rate: 25-40% |

#### Handoff a ventas
- **Trigger**: Lead completa formulario Y pasa criterios BANT mínimos
- **Datos para ventas**: Respuestas del formulario, páginas visitadas, contenido consumido, source
- **Pre-consulta**: Vendedor recibe briefing automático con contexto del lead
- **Post-consulta**: CRM actualizado con notas de la llamada, siguiente paso definido

#### Assets necesarios
1. Landing page (problema → solución → prueba social → CTA)
2. Formulario de pre-cualificación (5-8 campos estratégicos)
3. Booking page integrada (Calendly/Cal.com)
4. Email de confirmación + preparación
5. Reminder emails (24h y 1h antes)
6. Deck/guión de consulta
7. Template de propuesta
8. Email sequence post-consulta (si no cierra: 3-5 emails)
9. Retargeting ads para visitantes que no completaron form

---

### 3. Webinar Funnel

**Ideal para**: Educación, SaaS, servicios donde necesitas demostrar expertise antes de vender.

#### Etapas

```
Traffic → Registro → Pre-webinar nurture → Webinar (live/evergreen) → Oferta → Post-webinar follow-up → Cierre
```

| Etapa | Objetivo | Criterio de cualificación | Descualificación | Métrica target |
|-------|----------|--------------------------|-------------------|----------------|
| **Registro** | Capturar lead con promesa de valor | Se registra (email + nombre mínimo) | — | Registration rate: 25-45% |
| **Pre-webinar** | Aumentar show rate + warm up | Abre emails, marca calendario | No abre ningún email pre-webinar | Email open rate: 50-65% |
| **Asistencia** | Educar + generar confianza | Asiste al webinar, se queda >50% del tiempo | No asiste (→ replay sequence) | Show rate: 30-45% |
| **Engagement** | Identificar leads calientes | Hace preguntas, responde polls, queda hasta oferta | Sale antes de la oferta | Engagement rate: 40-60% |
| **Oferta** | Presentar CTA (comprar/agendar) | Click en oferta durante/después del webinar | No interactúa con oferta | CTA click: 10-20% de asistentes |
| **Follow-up** | Cerrar indecisos | Abre emails de replay/oferta | No abre 3+ emails | Conversion total: 5-15% de registrados |

#### Handoff a ventas
- **Hot leads**: Asistieron + clickearon oferta → contacto en <2h
- **Warm leads**: Asistieron pero no clickearon → email sequence + retargeting
- **Cold leads**: Registrados que no asistieron → replay email sequence
- **Datos para ventas**: Tiempo en webinar, preguntas hechas, respuestas a polls, clicks en oferta

#### Assets necesarios
1. Landing de registro (beneficios del webinar + urgencia)
2. Thank you page post-registro
3. Emails pre-webinar (confirmación + 2-3 de calentamiento)
4. Webinar (presentación + guión con oferta integrada)
5. Landing de oferta / checkout
6. Emails post-webinar: replay (día 1), oferta (día 2-3), urgencia/cierre (día 4-5)
7. Ads de entrada (registro)
8. Retargeting ads (registrados no asistentes, asistentes no compradores)

---

## Cómo diseñar el funnel

### Paso 1: Analizar contexto

Lee los inputs requeridos y responde:
1. **¿Qué vendemos?** (producto/servicio, precio, complejidad)
2. **¿A quién?** (ICP, segmentos, nivel de awareness)
3. **¿Cuál es el ciclo de venta?** (impulso vs. considerado)
4. **¿Qué equipo hay disponible?** (puede atender llamadas? tiene vendedores?)
5. **¿Qué canales de entrada usamos?** (paid, organic, referral)

### Paso 2: Seleccionar tipo de funnel

| Si... | Entonces... |
|-------|-------------|
| Múltiples servicios/opciones + lead no sabe cuál necesita | **Quiz funnel** |
| Ticket alto + venta consultiva + equipo comercial disponible | **Consultation funnel** |
| Necesitas educar antes de vender + expertise como diferenciador | **Webinar funnel** |
| Combinación de lo anterior | Diseña **funnel híbrido** (ej: quiz → consultation) |

### Paso 3: Adaptar las etapas al contexto

Usa la plantilla del tipo seleccionado como base, pero adapta:
- **Preguntas del quiz** a los ECPs y pain points del ICP
- **Criterios de cualificación** al pricing y capacidad del negocio
- **Métricas target** al benchmark del sector (ajusta ±20% según madurez)
- **Assets** a los canales definidos en channel-plan

### Paso 4: Definir criterios de descualificación

Tan importante como cualificar. Define claramente:
- **Budget mínimo**: ¿Por debajo de qué cifra no es rentable atender?
- **Geografía**: ¿Hay limitación de zona de servicio?
- **Timeline**: ¿"Solo curioseando" vs. necesidad real?
- **Fit de producto**: ¿El servicio realmente resuelve su problema?
- **Qué pasa con los descualificados**: Redirect a recurso gratuito, lista de espera, o nada.

### Paso 5: Diseñar handoff a ventas

Define el momento exacto y la información que recibe el equipo comercial:
- Trigger de handoff (qué acción del lead lo activa)
- Datos que recibe el vendedor (formulario, quiz, comportamiento)
- SLA de respuesta (en cuánto tiempo debe contactar)
- Fallback si no hay respuesta del equipo (auto-email, re-queue)

---

## Output: funnel-architecture.md

Genera el archivo en `campaigns/{slug}/funnel-architecture.md` con esta estructura:

```markdown
# Funnel Architecture: {Campaign Name}

**Tipo**: {Quiz / Consultation / Webinar / Híbrido}
**Fecha**: {YYYY-MM-DD}
**Basado en**: positioning.md, icp.md, channel-plan.md

## Resumen ejecutivo

{2-3 párrafos: qué funnel, por qué este tipo, resultado esperado}

## Diagrama del funnel

\```mermaid
graph TD
    A[Traffic Source] --> B[Landing Page]
    B --> C{Acción principal}
    C -->|Sí| D[Cualificación]
    C -->|No| E[Retargeting]
    D -->|Qualificado| F[Conversión]
    D -->|No qualificado| G[Nurture / Exit]
    F --> H[Handoff a ventas]
    E --> B
\```

## Etapas del funnel

### Etapa 1: {Nombre}
- **Objetivo**: ...
- **Criterio de entrada**: ...
- **Criterio de cualificación**: ...
- **Criterio de descualificación**: ...
- **Métrica target**: ...
- **Assets necesarios**: ...
- **Brief**: {Instrucciones suficientes para que otra skill genere el asset}

{Repetir para cada etapa}

## Handoff a ventas

- **Trigger**: ...
- **Datos entregados**: ...
- **SLA**: ...
- **Fallback**: ...

## Métricas consolidadas

| Etapa | Métrica | Target | Cómo medir |
|-------|---------|--------|------------|
| ... | ... | ... | ... |

## Assets necesarios (resumen)

| # | Asset | Skill para generarlo | Prioridad |
|---|-------|---------------------|-----------|
| 1 | Landing page | direct-response-copy | P0 |
| 2 | Email sequence | email-sequences | P0 |
| ... | ... | ... | ... |

## Criterios de descualificación

| Criterio | En qué etapa | Qué pasa con el lead |
|----------|-------------|---------------------|
| ... | ... | ... |

## Notas y recomendaciones

- ...
```

---

## Integración con gtm-orchestrator

Este skill es el **paso 4** del DAG de go-to-market:

```
1. Foundation (positioning, ICP, ECPs)
2. Content strategy (content-pillars, editorial-calendar)
3. Channel plan (channel-plan)
4. → FUNNEL ARCHITECT ← (este skill)
5. Asset creation (direct-response-copy, email-sequences, lead-magnet)
6. Launch execution
```

El output de funnel-architect alimenta directamente a los skills de asset creation: cada asset listado en la tabla de assets se convierte en input para el skill correspondiente.

---

## Reglas

1. **No diseñes funnels sin Foundation**. Si no hay positioning o ICP, para y pide que se ejecuten primero.
2. **Cada etapa debe tener un brief accionable**. Otra skill o persona debe poder ejecutar el asset solo con ese brief.
3. **Incluye siempre descualificación**. Un funnel sin filtro desperdicia recursos de ventas.
4. **Métricas son benchmarks, no promesas**. Indica que son targets iniciales a validar con datos reales.
5. **Menos es más**. Un funnel de 3 etapas bien ejecutado > uno de 8 etapas teórico.
6. **Adapta al equipo real**. Si no hay vendedores, no diseñes un consultation funnel que requiera llamadas.
