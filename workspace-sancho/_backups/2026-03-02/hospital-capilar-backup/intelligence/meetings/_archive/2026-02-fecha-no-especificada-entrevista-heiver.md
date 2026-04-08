# Entrevista Heiver - Candidato Go High Level

**Fecha:** 2026-02 (fecha exacta no especificada)  
**Participantes:** Martin Fila, Heiver Gomez

---

## Resumen

Entrevista técnica con Heiver Gomez, candidato alternativo para implementación de Go High Level. Se exploró su experiencia con lógica de formularios, funnels multi-paso, estrategias de marketing bicanal (email + WhatsApp) y capacidades de integración con Posthog vía herramientas intermedias como N8N.

---

## Decisiones

- **Lógica de formularios en GHL como solución principal** – Facilita creación de embudos sencillos con campos dinámicos
- **Diseño personalizable e integración vía iframe** – Formularios pueden incrustarse en cualquier web
- **Estrategia bicanal: Email + WhatsApp** – Diversificar mensajes para evaluar rendimiento por mercado
- **Usar dominio propio para email marketing** – Mantener credibilidad y evitar spam
- **Integración GHL → Posthog vía N8N o Make** – Para transferencia de datos y seguimiento de métricas
- **Modelo de colaboración: por proyecto o por horas** – A criterio de Martin, Heiver cobra ~€15/hora
- **Plazo de implementación: 3-4 semanas** – Para proyecto totalmente operativo
- **Reuniones semanales para revisar avances**
- **Herramientas de comunicación: Slack + Notion**

---

## Acciones

| Tarea | Responsable | Deadline |
|-------|-------------|----------|
| Buscar info sobre pagar a Google Gemini para aparecer en respuestas IA | Heiver | ASAP |
| Enviar itinerario con estructura básica del proyecto (4 semanas) | Heiver | Pre-inicio |
| Definir tipo de colaboración (asesoría vs implementación intensiva) | Martin + equipo | Pre-inicio |
| Hablar internamente sobre tipo de colaboración necesaria | Equipo Martin | Interna |
| Negociar presupuesto para el proyecto | Heiver + Martin | Pre-inicio |
| Establecer KPIs y validar si 4 semanas es viable | Heiver + Martin | Pre-inicio |
| Definir preguntas, respuestas y caminos lógicos (Figma/Miro) | Equipo Martin | Pre-construcción |
| Inicio del proyecto | Ambos | Lunes siguiente (tentativo) |

---

## Insights

### Capacidades Técnicas de GHL
- **Lógica de formularios permite mostrar/ocultar campos o redirigir según respuestas** – Base para funnels dinámicos
- **Lógica puede basarse en pasos anteriores** – Requiere mapeo visual (Figma/Miro) para planificar
- **Campos dinámicos con dependencias** – Ejemplo: campo "ciudad" aparece solo si "nombre" lleno, "estado" solo si país es Colombia/España
- **Funnels = secuencia de landing pages** – Lógica principal en formulario, funnel contiene pantallas
- **Automatizaciones para secuencias de marketing** – Campañas creables directamente desde GHL con lapsos personalizables
- **Dashboards personalizados** – CPL, CPC, seguimiento de pipeline
- **Pipeline bien estructurado identifica dónde se quedan clientes** – Clave para remarketing

### Estrategia de Canales
- **SMS muy efectivo en USA** – Contexto cultural
- **WhatsApp más efectivo en Colombia** – Y probablemente España
- **Estrategia bicanal recomendada** – Diversificar para evaluar rendimiento
- **Email marketing con dominio propio (@nucleo.com)** – Credibilidad y evitar spam
- **Hosting de cliente necesario para envío masivo de emails** – Usar datos reales del dominio

### Email Masivo y Tracking
- **GHL capaz de grandes volúmenes** – Ejemplo: 16,000 emails en 3 días
- **Tracking completo:** enviados, recibidos, abiertos, rebotados

### Tráfico y Atribución
- **Influencers + Google + Meta como fuentes principales**
- **Considerar Google Gemini para aparecer en respuestas IA** – IA es primera opción que muestra Google
- **Mapeo de origen de usuarios:** etiquetar por fuente (Meta tags, cuenta Google anexada)

### Integración Técnica
- **Cautela con integraciones de terceros que retienen info**
- **Opciones para GHL → Posthog:**
  - N8N o Make como intermediarios
  - GHL → Base de datos intermedia (BaseTable) → Posthog
- **N8N parece tener conexión directa** – Simplifica flujo

### Modelo de Trabajo
- **Heiver se encarga de implementación completa:** formularios, landing pages, automatizaciones, salida de datos
- **Modelo "Done with You" o asesoría** – Flexible según necesidad
- **€15/hora o precio cerrado por proyecto** – Abierto a negociar según presupuesto
- **3-4 semanas para operativo, no solo entrega** – Enfoque en resultado funcional
- **Horario flexible** – Compromisos con otra empresa, reuniones semanales
- **Facturación internacional** – Cuenta en Gran Bretaña

### Prerequisitos
- **Equipo de Martin debe definir preguntas, respuestas, caminos lógicos** – Antes de que Heiver construya en GHL
- **Preferiblemente en Miro o Figma** – Para visualizar arquitectura

---

## Participantes

- Martin Fila (Growth4U)
- Heiver Gomez (Candidato experto Go High Level)
