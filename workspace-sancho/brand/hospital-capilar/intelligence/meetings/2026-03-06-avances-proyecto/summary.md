# Avances proyecto HC — 2026-03-06

**Tipo:** Reunión técnica y planificación  
**Fecha:** 2026-03-06 15:59 CET  
**Participantes:** Philippe Sainthubert, Ramiro Perez  
**Duración:** ~1h 2min  

---

## 🎯 Resumen Ejecutivo

Sesión técnica enfocada en la **arquitectura del sistema de precualificación de leads** para Hospital Capilar y demostración de herramientas de automatización de contenido con Claude. Se definió la estrategia de división de trabajo entre Philippe (quiz + scoring con webhook) y Ramiro (landings + automatizaciones en Go High Level).

**Objetivo principal:** Precualificar leads usando IA para generar un resumen que ahorre tiempo a vendedores/médicos.

---

## 🔑 Decisiones

### 1. **División de trabajo técnico**
- **Ramiro Perez:** construirá las 3 landings y automatizaciones en Go High Level
- **Philippe Sainthubert:** investigará la integración de un quiz externo vía webhook
- **Rationale:** Aprovechar especialización de cada uno y paralelizar el trabajo
- **Source:** Minutos 00:49:06 - 00:52:42

### 2. **Stack tecnológico: Cursor + Cloud Code**
- Se adoptó Cursor (con Cloud Code integrado) para facilitar la creación del quiz y la conexión con Go High Level
- **Ramiro** descargará Cursor e investigará la integración del webhook
- **Source:** Minuto 00:22:48

### 3. **Integración quiz → GHL vía webhook**
- Dado que Go High Level no permite importar quizzes externos, se usará un **webhook como trigger** para pasar información (tags, scoring) del quiz externo a GHL
- Requiere versión premium de High Level
- **Source:** Minuto 00:43:23

### 4. **Priorización: precualificación primero, integraciones después**
- Enfoque inicial: precualificación de leads + ahorro de tiempo al comercial
- API de Coibox y agenda automática → **segunda fase**
- **Source:** Minuto 00:56:22

### 5. **Configuración de pagos (Stripe o PayPal)**
- Philippe consultará con Hospital Capilar qué método de pago usan para integrarlo directamente desde su cuenta
- Necesario para cubrir costos de notificaciones (email y SMS) durante fase piloto
- **Source:** Minutos 00:14:39 - 00:17:31

---

## ✅ Action Items

| Tarea | Owner | Deadline | Status |
|-------|-------|----------|--------|
| Consultar método de pago (Stripe/PayPal) con HC | Philippe | TBD | Pendiente |
| Adquirir suscripción Cloud Code (~18 USD/mes) | Ramiro | TBD | Pendiente |
| Descargar e instalar Cursor + investigar webhook | Ramiro | Lunes | Pendiente |
| Crear 3 landings en Go High Level | Ramiro | TBD | Pendiente |
| Definir estrategia de nurturing (tags, perfiles A/B/C, acciones) | Ramiro | TBD | Pendiente |
| Investigar y establecer lógica de scoring para el quiz | Philippe | Lunes | Pendiente |
| Desarrollar workflows en Go High Level (tags → pipeline) | Ramiro | TBD | Pendiente |
| Implementar quiz y verificar viabilidad del enfoque | Philippe | Lunes | Pendiente |
| Configurar automaciones, stages y conexión WhatsApp | Ramiro | Miércoles | Pendiente |

---

## 💡 Insights

### Pain Points
- **Ramiro:** dificultad para mantener organización en Notion debido a la cantidad de documentos generados
- **Ramiro:** problemas de rendimiento con Mac al compartir pantalla (Philippe sugiere Mac Pro M5)
- **Equipo:** acumulación de información y velocidad de trabajo dificulta ponerse al día (6 proyectos simultáneos)

### Features
- **Quiz diagnóstico capilar:** preguntas ya disponibles en Notion ("quiz diagnóstico capilar arquitectura")
- **Dashboard de métricas:** Philippe enfatiza necesidad de monitorear leads, canales de entrada, % conversión a agenda (para implementar una vez que sistema esté funcionando)
- **Notion IA:** Philippe muestra a Ramiro cómo usar Cloud Opus 4.6 integrado en Notion para ayudar a organizar planning del proyecto

### Success
- **Web Growth4U:** posicionando en Google para "consultora de growth en España" (creada desde cero en noviembre)
- **Lead generado:** la web ya generó un lead reciente
- **Claude:** Philippe menciona que "la explosión del proyecto se dio cuando pasaron de usar Gemini a usar Claude"

### Process
- **Arquitectura del funnel:**
  - 3 tipos de landings (mujer, hombres <28, hombres ≥28)
  - 4 vías de entrada: quiz corto, quiz largo, quiz con pago, formulario directo
  - Flujos se reflejan en pipeline de Go High Level
- **Notificación comercial:**
  - Leads "hot" (alta puntuación) → notificación por WhatsApp o Telegram al comercial
  - Indicación de prioridad de llamada
- **Scoring y acciones:**
  - Tags + tipos de perfiles (A, B, C)
  - Acciones según scoring: llamada, correo, agenda

---

## 📌 Contexto Adicional

### Demostración de automatización de contenido
- Philippe demostró herramienta automatizada para generar contenido (Instagram/LinkedIn) a partir de blogs existentes
- Usa API de Meta + Claude
- Genera avatar, formato, texto y programa publicación automáticamente

### Organización de reuniones
- Grabaciones se guardan en carpeta "Documentos de Hospital Capilar" con etiqueta "reunión"
- Documentos marcados en azul = reportes realizados por el equipo

### Timeline objetivo
- **Lunes:** determinar viabilidad del enfoque de quiz propuesto
- **Miércoles:** tener configuración montada para comenzar pruebas
- Si enfoque no es viable → usar quizzes nativos de Go High Level

---

## 🔗 Archivos Relacionados

- **Documento Google Drive:** [1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs](https://docs.google.com/document/d/1MhF-opiBmlvBlXZ5r7ixxj8_bTYiA9n1NSZRCxupeRs/edit?usp=drivesdk)
- **Quiz diagnóstico capilar arquitectura:** disponible en Notion (referencia: minuto 00:21:23)

---

## 🏷️ Tags
`meeting` `técnica` `arquitectura` `go-high-level` `quiz` `lead-scoring` `cursor` `webhook` `automatización`

---

**Procesado:** 2026-04-03T16:00:00Z  
**Intelligence Log ID:** mtg-2026-03-06-avances-proyecto
