# Reunión: Briefing Técnico con Ramiro - Hospital Capilar

**Fecha:** 2026-02-17  
**Participantes:** Philippe Sainthubert, Ramiro Perez  
**Fuente:** [Google Docs](https://docs.google.com/document/d/1YTGedhyWETWvAyz7NFmtSE7sl7D-Hcsjax7d5vZWLQI)

---

## Resumen Ejecutivo

Reunión técnica profunda donde se detalló la arquitectura completa del proyecto de tratamientos capilares para Hospital Capilar. Se confirmó la estrategia de crear un nuevo embudo B2C en Go High Level, completamente separado de Salesforce, enfocado en lograr 45 tratamientos mensuales por clínica comenzando por Madrid. El quiz interactivo se posicionó como pieza central para precualificación, con un objetivo de conversión hacia el pago de €195 por estudios médicos que sirven de puerta de entrada al upsell de tratamientos o cirugías.

---

## Decisiones

### Nueva infraestructura en GHL separada de Salesforce
- **Qué:** Nuevo embudo completo en Go High Level, independiente del sistema actual
- **Quién:** Growth4U + Ramiro
- **Por qué:** Salesforce es lento e inflexible para experimentación rápida; necesitan agilidad para iterar

### Meta: 45 tratamientos mensuales por clínica
- **Qué:** Objetivo inicial de 45 tratamientos/mes comenzando por la clínica de Madrid
- **Quién:** Hospital Capilar + Growth4U
- **Por qué:** Meta alcanzable para piloto que capitaliza el margen del 90% en tratamientos vs 40% en cirugías

### Pago de €195 por estudios como estrategia de conversión
- **Qué:** Monetizar consultas médicas con analítica incluida
- **Quién:** Hospital Capilar
- **Por qué:** Precalifica leads, asegura asistencia, facilita upsell posterior a planes de tratamiento o cirugías

### Quiz interactivo como núcleo del embudo
- **Qué:** Formulario interactivo largo, visualmente atractivo, con lógica condicional
- **Quién:** Ramiro + Growth4U
- **Por qué:** Permite precualificación, engagement del usuario, medición detallada del flujo y comportamiento

### Go to Market de 2 semanas previo a construcción
- **Qué:** Análisis de competidores, canales, mensajes y definición de 2-3 nichos claros
- **Quién:** Growth4U
- **Por qué:** Fundamentar decisiones estratégicas antes de ejecutar infraestructura técnica

---

## Acciones

| Tarea | Owner | Deadline | Status |
|-------|-------|----------|--------|
| Estudiar documentación y revisar tiempos de implementación | Ramiro | Tarde del 17/02 | ✅ |
| Enviar propuesta final de presupuesto (con/sin Shakers) | Ramiro | Tarde del 17/02 | ✅ |
| Validar facturación directa sin Shakers con Martín | Philippe | ASAP | Pendiente |
| Kickoff meeting con equipo Hospital Capilar | Equipo completo | Semana del 24/02 | Pendiente |
| Go to market (2 semanas): competidores, canales, mensajes | Growth4U | Primeras 2 semanas | En progreso |
| Definir arquitectura GHL y lead nurturing | Ramiro + equipo | Antes de construcción | Pendiente |
| Reunión técnica con HC para ver config Salesforce actual | Growth4U + HC | Pre-construcción | Pendiente |

---

## Insights

### Oportunidad de margen
- **Tratamientos:** 90% margen vs **Cirugías:** 40% margen
- Volumen de tratamientos creció 2x en 5 años **sin inversión en marketing**
- Nueva línea de negocio sin tocar operaciones actuales → Minimiza riesgo, maximiza upside

### Quiz como herramienta estratégica
- GHL permite lógica condicional por respuesta
- Sistema de scoring interno para precalificar leads
- Custom fields para enriquecer perfil del usuario
- Medición granular: clics por elemento, tiempo de respuesta, flujo por pantalla

### Carga de trabajo inicial
- **Fase intensiva:** 3-4 horas/día durante primeros 2 meses
- **Post-lanzamiento:** Mantenimiento más ligero

### Landing pages específicas para atribución
- Ejemplo: tráfico de influencers necesita landing page dedicada
- Permite medir performance por fuente con precisión

### Fuentes de tráfico mixtas
- SEO orgánico
- Contenido interno de Hospital Capilar
- Influencers
- Google Ads + Meta Ads (gestionados por cliente)
- Pruebas de concepto: quiz vs pago directo vs agenda

### Arquitectura antes que construcción
- Prioridad: definir embudo, estructura de quiz, custom fields y pipeline ANTES de construir
- Reunión técnica con HC para entender Salesforce actual
- 2 semanas de Go to Market para fundamentar decisiones

---

## Contexto Adicional

**Growth4U:** Consultora de 5 personas especializada en fintech, expandiéndose a B2C con Hospital Capilar como proyecto piloto.

**Hospital Capilar:** Clínica de trasplante capilar con presencia en Madrid y planes de expansión (9 nuevas aperturas). Crecimiento orgánico sin inversión previa en marketing de tratamientos.

**Estrategia:** "Victorias rápidas" capitalizando el crecimiento del mercado español de tratamientos capilares mediante un nuevo pilar de negocio B2C separado de las operaciones actuales de cirugía.

---

## Próximos Hitos

1. **Semana del 24/02:** Kickoff meeting oficial
2. **Primeras 2 semanas:** Go to Market (competidores, canales, nichos)
3. **Pre-construcción:** Definición de arquitectura GHL + lead nurturing
4. **Construcción:** Implementación de quiz, landing pages, integraciones
5. **Lanzamiento:** Primeras campañas hacia Madrid

---

*Documento generado por Meeting Intelligence - Sancho CMO*  
*Fuente: Notas automáticas de Gemini - Reunión 2026-02-17 14:30 CET*
