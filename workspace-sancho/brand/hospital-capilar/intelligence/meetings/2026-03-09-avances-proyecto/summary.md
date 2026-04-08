# Avances Proyecto HC — Resumen Ejecutivo
**Fecha:** 2026-03-09  
**Tipo:** Técnica-Desarrollo  
**Asistentes:** Philippe Sainthubert, Ramiro Perez

---

## 🎯 Resumen de 1 Línea
Sesión técnica de configuración de herramientas (Cursor + Cloud Code), definición de arquitectura de datos en Go High Level, y planificación del embudo de nurturing con foco en simplicidad de custom fields y tags.

---

## 📊 Contexto
Proyecto en fase de construcción técnica. Se define la infraestructura del quiz, la integración de Posthog para tracking, y la estructura de datos en GHL. Prioridad: **no complicar el nurturing hasta validar el proceso comercial actual de Hospital Capilar**.

---

## ✅ Decisiones Clave

1. **Cursor + Cloud Code como stack principal** — Cursor es el marco, Cloud Code hace el trabajo pesado. Uso obligatorio de la extensión de Cloud
2. **GitHub como repositorio único** — Todo el código del quiz hospital se subirá a GitHub para colaboración
3. **Minimizar custom fields y tags en GHL** — Mantener lo mínimo necesario para facilitar extracción de métricas
4. **Contactos ≠ Opportunities** — Contactos almacena info del lead (resumen IA + scoring). Opportunities almacena estado comercial
5. **No diseñar nurturing sin validar funnel actual** — Primero entender proceso comercial de HC, luego diseñar automatizaciones
6. **WhatsApp + Email (NO SMS)** — Foco en estos 2 canales para comunicación de nurturing
7. **Testing de funnels por SP** — Crear diferentes funnels para cada Service Provider y testear conversión

---

## 🛠️ Stack Técnico Confirmado

- **Cursor + Cloud Code** → Desarrollo del quiz
- **Go High Level** → CRM + automatización de nurturing
- **Posthog** → Tracking de actividad del usuario en el quiz (frames, clics, abandono)
- **GitHub** → Repositorio de código
- **Stripe** → Pasarela de pagos (integración pendiente)
- **UTMs** → Tracking de origen del tráfico (Meta, Google, SEO) → integrar en Posthog y GHL

---

## 🔗 Integraciones Pendientes

- **SalesForce API** → Migración de datos en tiempo real (⚠️ cuidado con tokens costosos)
- **CoBox API** → Validar integraciones, organizar demo con el manejador
- **Calendario** → Integración por contacto (Ramiro)
- **Stripe** → Configurar pasarela de pagos y vincular a GHL (Ramiro)
- **DNS** → Configurar dominio para GHL + Netlify (Philippe)

---

## 💡 Insights Clave

1. **No shows al 50%** → Se necesitan recordatorios claros: 2 días antes + día anterior con llamada + confirmación de cita
2. **Cloud Code permite desarrollo sin formación formal en programación** — Clave: entender arquitectura y relaciones tecnológicas, no código puro
3. **Scoring nativo en GHL** — Se puede usar para asignar puntos por acciones (abrir correo, clic, etc.). Pendiente configurar post-quiz
4. **Proyecto LinkedIn externo** — Ramiro tiene un proyecto de generación de leads de LinkedIn con preocupaciones GDPR. Philippe se ofrece a revisar y sumarse si necesario
5. **Automatización de mensajes para agentes comerciales** — Ya funciona con Cloud Code: genera resumen del quiz para el agente de ventas

---

## 🎯 Actions Pendientes

| Acción | Responsable | Deadline |
|--------|-------------|----------|
| Subir proyecto completo a GitHub y compartir con Ramiro | Philippe | Esta semana |
| Pruebas de landings (evaluar llegada de lead a GHL) | Ramiro | Esta semana |
| Enviar documento de proyecto LinkedIn a Philippe | Ramiro | Esta semana |
| Consultar con HC el funnel actual post-lead | Philippe | Antes de diseñar nurturing |
| Investigar API de SalesForce y planificar migración | Philippe | Esta semana |
| Organizar demo con manejador de CoBox | Philippe | Por agendar |
| Validar preguntas y estructura del quiz | Philippe | Esta semana |
| Diseñar estrategia de Nurturing y funnel | Ramiro | Después de validar funnel actual |
| Generar funnel inicial por SP con Cloud Code | Philippe | Esta semana |
| Configurar integración de calendario por contacto | Ramiro | Próxima semana |
| Configurar pasarela de pagos Stripe | Ramiro | Próxima semana |
| Configurar dominio y DNS (GHL + Netlify) | Philippe | Esta semana |
| Crear landings con contacto directo por WhatsApp | Philippe | Esta semana |
| Crear landings con formulario embebido | Philippe | Esta semana |
| Optimizar landing (contenido, testimonios, imágenes) | Philippe | Próxima semana |
| Configurar devolución de información UTM a API de GHL | Ramiro | Esta semana |

---

## 📌 Notas Técnicas

- **Pestaña de chat de Cursor** → NO usar, no es útil. Solo usar Cloud Code vía `Command Shift P open cloud new tab`
- **Trabajo en local** → Ramiro trabajará en local para no interferir con infraestructura actual. Philippe avisará antes de cambios importantes
- **Custom fields visibles en Contactos** → Quitar `negocio` y `activity`, añadir `lead score`
- **Acceso del equipo comercial a GHL** → Inicialmente presentar resumen en Excel, luego formar en GHL para mayor visión

---

## 🔗 Fuente
Google Drive Doc ID: `1H8wb4w85UGVX-LIlUZyKRY9uxaByllCyUZmLsNwdYaU`
