# Hospital Capilar - Índice de Reuniones

Registro completo de reuniones del proyecto Hospital Capilar con Growth4U.

---

## 2026-02-06

### [Sales Presentation](./2026-02-06-sales-presentation.md)
**Participantes:** Equipo Growth4U, Hospital Capilar

Reunión inicial de ventas donde se definieron las bases del proyecto Hospital Capilar. Se estableció la necesidad de un presupuesto de marketing, contenido médico audiovisual y la infraestructura técnica para ejecutar la estrategia de captación de tratamientos.

**Decisiones clave:**
- Definir presupuesto de marketing
- Crear vídeo del equipo médico explicando el nuevo protocolo
- Evaluar Astro como framework principal
- Implementar Go High Level

---

## 2026-02 (fechas no especificadas)

### [Entrevista Ramiro - Experto Go High Level](./2026-02-fecha-no-especificada-entrevista-ramiro.md)
**Participantes:** Alfonso Sainz de Baranda, Philippe Sainthubert, Ramiro Pérez

Primera entrevista con Ramiro Pérez, candidato para implementar Go High Level en Hospital Capilar. Se validó su experiencia, se discutió la integración de IA en los flujos de trabajo y se acordó el modelo de colaboración inicial a través de Shakers.

**Decisiones clave:**
- Ramiro se convertirá en el experto interno de Go High Level
- Primera factura vía Shakers, siguientes directas
- Priorizar estabilidad sobre IA avanzada en fase inicial
- Philippe será el interlocutor principal

---

### [Briefing Técnico Ramiro - Arquitectura Hospital Capilar](./2026-02-fecha-no-especificada-briefing-ramiro.md)
**Participantes:** Philippe Sainthubert, Ramiro Pérez

Reunión técnica profunda donde se definió la arquitectura del proyecto de tratamientos: nuevo embudo B2C en Go High Level separado de Salesforce, quiz interactivo para precualificación, objetivo de 45 tratamientos/mes por clínica comenzando por Madrid, y pago de €195 por estudios como puerta de entrada al upsell.

**Decisiones clave:**
- Nuevo embudo completo en Go High Level, separado de Salesforce
- Objetivo: 45 tratamientos mensuales por clínica
- Pago de €195 por estudios como estrategia de conversión
- Quiz interactivo como pieza central
- Go to market de 2 semanas antes de construcción

**Insights destacados:**
- Margen de tratamientos (90%) vs cirugías (40%)
- Crecimiento de tratamientos 2x en 5 años sin inversión en marketing
- Alta carga de trabajo inicial (3-4h/día durante 2 meses)

---

### [Hospital Capilar - Growth4U Strategic Meeting](./2026-02-fecha-no-especificada-hospital-capilar-growth4u.md)
**Participantes:** Alfonso Sainz de Baranda, Philippe Sainthubert, Óscar Mendoza, Gerardo Redondo

Reunión estratégica clave donde se diagnosticó el cuello de botella de Hospital Capilar: incapacidad para atender la demanda de tratamientos (90% margen) mientras toda la captación se enfoca en cirugías (40% margen). Se propuso un proyecto piloto paralelo para optimizar el embudo de tratamientos, incluyendo el cobro de €195 por consultas médicas para precalificar y asegurar asistencia.

**Decisiones clave:**
- Proyecto piloto paralelo para tratamientos
- Protocolo de pago €195 para consultas médicas
- Meta agresiva: 500 citas presenciales pagadas/mes
- Usar mini-stack de herramientas aparte si Salesforce es lento
- Metodología: precio cerrado por proyecto

**Métricas importantes:**
- CPL Google: 50.69€ → 53.77€ (2024→2025), presupuesto €169,456
- CPL Meta: 10.32€ → 19.48€ (2024→2025), presupuesto €170,934
- Conversión a cirugía: Google 7.40% vs Facebook 1.60%
- Ventas bonos de tratamiento: 971 (2023) → 1828 (2025)
- No show en Madrid: hasta 30%

---

### [Entrevista Heiver - Candidato Go High Level](./2026-02-fecha-no-especificada-entrevista-heiver.md)
**Participantes:** Martin Fila, Heiver Gomez

Entrevista técnica con Heiver Gomez, candidato alternativo para implementación de Go High Level. Se exploró su experiencia con lógica de formularios, funnels multi-paso, estrategias de marketing bicanal (email + WhatsApp) y capacidades de integración con Posthog vía herramientas intermedias como N8N.

**Decisiones clave:**
- Lógica de formularios en GHL como solución principal
- Estrategia bicanal: Email + WhatsApp
- Usar dominio propio para email marketing
- Integración GHL → Posthog vía N8N o Make
- Plazo de implementación: 3-4 semanas

**Insights técnicos:**
- GHL capaz de grandes volúmenes (16,000 emails en 3 días)
- SMS efectivo en USA, WhatsApp en Colombia/España
- Considerar Google Gemini para aparecer en respuestas IA
- Modelo de colaboración flexible: €15/hora o precio cerrado

---

## Resumen Ejecutivo

**Total de reuniones:** 5

**Decisión central:** Proyecto piloto paralelo para optimizar captación de tratamientos (90% margen) vs cirugías (40% margen)

**Tecnología elegida:** Go High Level como plataforma central de automatización y embudos

**Candidato seleccionado:** Ramiro Pérez (Heiver Gomez como alternativa explorada)

**Estrategia de pricing:** Protocolo de pago €195 por consultas médicas (analítica + consulta)

**Meta agresiva:** 500 citas presenciales pagadas/mes (inicialmente mujeres)

**Objetivo piloto:** 45 tratamientos mensuales por clínica, comenzando por Madrid

**Metodología:** Precio cerrado por proyecto, iteración rápida, mini-stack independiente de Salesforce si necesario

**Inicio de proyecto:** 2 de marzo 2026
