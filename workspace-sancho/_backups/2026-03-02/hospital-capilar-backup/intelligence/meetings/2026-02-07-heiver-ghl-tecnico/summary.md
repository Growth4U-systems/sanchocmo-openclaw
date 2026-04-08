# Reunión: Heiver - Evaluación Técnica Go High Level

**Fecha:** 2026-02-07  
**Hora:** 20:11 CET  
**Participantes:** Heiver Gomez, Martin Fila  
**Fuente:** [Notas de Gemini](https://docs.google.com/document/d/1knNkCRakIM2xAIM5NHKcXmxDPLSlhUp3p3MOnO0rFNU)

---

## Resumen Ejecutivo

Reunión técnica de evaluación con Heiver Gomez como candidato para implementar Go High Level. Se exploró la lógica de formularios, secuencias multi-paso, integraciones con Posthog, y estrategias de email marketing. Heiver demostró experiencia práctica con GHL pero enfoque más táctico que estratégico. Propuso modelo flexible (proyecto o horas), timeline de 3-4 semanas, y rate de ~15 USD/hora. **Resultado final:** No seleccionado — se eligió a Ramiro Perez por mayor alineamiento estratégico.

---

## Decisiones

| # | Decisión | Quién | Por qué |
|---|----------|-------|---------|
| 1 | Usar lógica de formularios de GHL para embudos sencillos | Heiver + Martin | Permite personalización e integración vía iframe en cualquier web |
| 2 | Mapeo visual previo (Figma/Miro) obligatorio antes de implementar | Heiver + Martin | Secuencias complejas multi-paso requieren planificación de caminos lógicos |
| 3 | Estrategia bicanal: Email + WhatsApp | Heiver | Email más WhatsApp diversifica mensajes y permite evaluar rendimiento por canal |
| 4 | Usar dominio propio del cliente para email marketing | Heiver | Mantiene credibilidad, evita spam, usa datos de hosting real (@nucleo.com) |
| 5 | Integración GHL → Posthog vía N8N o base intermedia | Heiver + Martin | N8N parece tener conexión directa más simple que Make u otras opciones |
| 6 | Modelo de colaboración: "Done with You" o asesoría | Martin | Equipo de Martin define estructura, Heiver implementa |
| 7 | Timeline de implementación: 3-4 semanas | Heiver | Proyecto operativo y funcionando, no solo entregado |

---

## Acciones

| # | Tarea | Responsable | Deadline | Estado |
|---|-------|-------------|----------|--------|
| 1 | Buscar info sobre pagar a Google Gemini para aparecer en respuestas IA | Heiver | ASAP | ❌ |
| 2 | Enviar itinerario con estructura básica del proyecto (4 semanas) | Heiver | ASAP | ❌ |
| 3 | Definir modelo de colaboración (asesoría vs implementación intensiva) | Martin + equipo | Antes de lunes siguiente | ✅ |
| 4 | Negociar presupuesto para el proyecto | Heiver + Martin | Antes de inicio | ✅ |
| 5 | Establecer KPIs y confirmar duración proyecto | Heiver + Martin | Antes de inicio | ✅ |
| 6 | Equipo de Martin define preguntas, respuestas y caminos en Figma/Miro | Equipo Martin | Antes de construcción GHL | 🟡 |
| 7 | Reuniones semanales para revisar avances | Heiver + Martin | Durante proyecto | N/A |

---

## Insights Clave

### Capacidades de Go High Level

- **Lógica de formularios:** Mostrar/ocultar campos, redirigir según respuestas, crear embudos sencillos
- **Campos dinámicos:** Opciones dependientes de respuestas anteriores (ej: ciudad aparece si país = Colombia/España)
- **Funnels nativos:** Cada paso del funnel = landing page, lógica reside en formulario
- **Automatizaciones:** Secuencias de marketing con lapsos de envío personalizables
- **Email masivo:** Capacidad confirmada para grandes volúmenes (16K correos en 3 días citado como ejemplo)
- **Tracking completo:** Registra envío, recepción, apertura, rebote de emails
- **Dashboards personalizados:** Métricas de CPL, CPC, seguimiento de pipeline
- **Pipeline estructurado:** Identifica dónde se quedan clientes, habilita remarketing

### Estrategia de Canales

- **SMS efectivo en USA, WhatsApp en LatAm:** Adaptar canal al mercado
- **Bicanal obligatorio:** Diversificar para evaluar rendimiento
- **Dominio propio crítico:** Emails desde dominio real del cliente evitan spam
- **Mapeo de origen:** Etiquetar usuarios por fuente (Meta, Google) dentro de GHL
- **Google Gemini IA:** Menciona pago para aparecer en respuestas IA de Google (first position)

### Integraciones Técnicas

- **Cautela con integraciones third-party:** Pueden retener información
- **N8N o Make:** Herramientas intermedias para conectar GHL → Posthog
- **Base intermedia:** GHL → BaseTable → Posthog como alternativa
- **N8N preferido:** Parece tener conexión directa más simple

### Modelo de Trabajo (Heiver)

- **Rate:** ~15 USD/hora, flexible según presupuesto
- **Modelo preferido:** Proyecto si es más económico para cliente
- **Alcance:** Implementación completa GHL (formularios, landing pages, automatizaciones, salida de datos)
- **Timeline:** 3-4 semanas para proyecto operativo (no solo entregado)
- **Disponibilidad:** Horario flexible por otros compromisos, reuniones semanales
- **Herramientas:** Slack + Notion para comunicación y gestión
- **Facturación:** Internacional, cuenta en Gran Bretaña

### Proceso de Trabajo

1. Equipo cliente define preguntas, respuestas, caminos lógicos (Figma/Miro)
2. Heiver implementa en GHL
3. Reuniones semanales para revisar avances
4. Ajustes iterativos según feedback

---

## Evaluación del Candidato

### Fortalezas

- Experiencia práctica demostrable con GHL (cliente Núcleo citado)
- Conocimiento técnico sólido de capacidades de la plataforma
- Flexible en modelo de colaboración y presupuesto
- Disponibilidad para herramientas del cliente (Slack, Notion)
- Facturación internacional lista

### Debilidades

- Enfoque más táctico que estratégico
- No demostró pensamiento de alto nivel sobre el negocio de tratamientos
- Propuesta reactiva ("ustedes definen, yo implemento") vs proactiva
- No conectó la tecnología con los objetivos de negocio (45 tratamientos/mes)
- Faltó visión de cómo GHL resuelve el cuello de botella operativo específico de HC

### Comparación con Ramiro (seleccionado)

| Aspecto | Heiver | Ramiro |
|---------|--------|--------|
| **Enfoque** | Táctico/implementador | Estratégico/consultor |
| **Ownership** | Ejecutor externo | Experto interno |
| **Visión** | Herramienta | Solución de negocio |
| **Rate** | ~15 USD/hora | ~25-30 USD/hora (estimado) |
| **Alineamiento** | Medio | Alto |

**Decisión final:** Ramiro seleccionado por mayor alineamiento estratégico y capacidad de convertirse en experto interno de GHL para el equipo.

---

## Próximos Pasos (en momento de la reunión)

1. Decisión interna sobre tipo de colaboración
2. Negociación de presupuesto
3. Definición de estructura lógica del embudo en Figma/Miro
4. Kickoff si se selecciona a Heiver

**Actualización:** Heiver NO fue seleccionado. Se eligió a Ramiro Perez.

---

## Contexto en el Proyecto

Esta reunión fue parte del proceso de selección de candidatos para implementar Go High Level. Aunque Heiver demostró competencia técnica, el equipo finalmente seleccionó a Ramiro Perez por su enfoque más estratégico y capacidad de entender el negocio de tratamientos a nivel de outcomes, no solo de implementación técnica.

**Lecciones aprendidas:**
- Conocimiento técnico ≠ fit perfecto
- Necesitaban un partner estratégico, no solo un implementador
- El cuello de botella requería visión de negocio + ejecución técnica
- Ramiro conectó mejor con la meta de 45 tratamientos/mes y el contexto de márgenes

---

**Tags:** #ghl #evaluacion #candidato #tecnico #no-seleccionado #heiver #integraciones
