# Briefing Técnico Ramiro - Arquitectura Hospital Capilar

**Fecha:** 2026-02 (fecha exacta no especificada)  
**Participantes:** Philippe Sainthubert, Ramiro Pérez

---

## Resumen

Reunión técnica profunda donde se definió la arquitectura del proyecto de tratamientos: nuevo embudo B2C en Go High Level separado de Salesforce, quiz interactivo para precualificación, objetivo de 45 tratamientos/mes por clínica comenzando por Madrid, y pago de €195 por estudios como puerta de entrada al upsell.

---

## Decisiones

- **Nuevo embudo completo en Go High Level, separado de Salesforce** – Salesforce es lento e inflexible para experimentación rápida
- **Objetivo: 45 tratamientos mensuales por clínica** – Empezando por Madrid, luego expansión
- **Pago de €195 por estudios como estrategia de conversión** – Sirve para upsell a cirugías o planes de tratamiento
- **Quiz interactivo como pieza central** – Visualmente atractivo, largo, con medición de flujo de usuario
- **Go to market de 2 semanas antes de construcción** – Análisis de competidores, canales, mensajes, definición de 2-3 nichos

---

## Acciones

| Tarea | Responsable | Deadline |
|-------|-------------|----------|
| Estudiar documentación y revisar tiempos de implementación | Ramiro | Tarde del mismo día |
| Enviar propuesta final de presupuesto (con/sin Shakers) | Ramiro | Tarde del mismo día |
| Validar facturación directa sin Shakers con Martín | Philippe | ASAP |
| Kickoff meeting con equipo Hospital Capilar | Equipo completo | Semana siguiente |
| Go to market (2 semanas): competidores, canales, mensajes | Growth4U | Primeras 2 semanas |
| Definir arquitectura GHL y lead nurturing | Ramiro + equipo | Antes de construcción |
| Reunión técnica con HC para ver config Salesforce actual | Growth4U + HC | Pre-construcción |

---

## Insights

- **Margen de tratamientos (90%) vs cirugías (40%)** – Huge oportunidad de rentabilidad
- **Crecimiento de tratamientos 2x en 5 años sin inversión en marketing** – Demanda orgánica brutal
- **Nueva línea de negocio sin tocar operaciones actuales** – Minimiza riesgo, maximiza upside
- **Quiz como herramienta de precualificación y medición** – GHL permite lógica condicional, scoring interno, custom fields, medición por pantalla
- **Alta carga de trabajo inicial (3-4h/día durante 2 meses)** – Luego mantenimiento más ligero
- **Landing pages específicas para atribución** – Ejemplo: tráfico de influencers
- **Fuentes de tráfico mixtas:** SEO, contenido interno, influencers, Google/Meta Ads (gestionadas por cliente)
- **Prioridad: definir embudo, estructura de quiz, custom fields y pipeline ANTES de construir**

---

## Participantes

- Philippe Sainthubert (Growth4U)
- Ramiro Pérez (Experto Go High Level)
