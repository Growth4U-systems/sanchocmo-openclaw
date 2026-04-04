# GTM Hospital capilar - Discord — 2026-02-27

**Tipo:** Reunión técnica interna (Growth4U)  
**Fecha:** 2026-02-27 13:17 CET  
**Participantes:** Alfonso Sainz de Baranda, Philippe Sainthubert  
**Duración:** ~1h 1min  

---

## 🎯 Resumen Ejecutivo

Sesión técnica interna de Growth4U enfocada en **mejoras de usabilidad de Mission Control** y **diferenciación de agentes** (Sancho, Cervantes, Rocinante). Se definieron estados de documentos, reorganización de carpetas, y flujo de trabajo con hilos de Discord. También se discutió automatización de contenido con Metricool.

**⚠️ NOTA:** Esta es una reunión INTERNA de Growth4U (desarrollo del sistema), NO específica de Hospital Capilar. Mencionan HC como caso de uso.

---

## 🔑 Decisiones

### 1. **Estados de documentos en Mission Control**
- 3 estados visuales:
  - No existente → cuadrado gris
  - Pendiente de revisar → símbolo de warning amarillo
  - Validado → checkbox verde
- **Owner:** Cervantes (sistema)
- **Source:** Minuto 00:39:15 - 00:39:59

### 2. **Reorganizar carpetas de documentación según flujo de Foundation**
- Orden actual: alfabético
- Nuevo orden: step-by-step del proceso de foundation
- **Scope:** Todos los clientes (no solo Hospital Capilar)
- **Source:** Minutos 00:28:43 - 00:32:13

### 3. **Reasignar reglas y checklists a skills (no a Rocinante)**
- Rocinante (QA) se enfocará SOLO en verificar campañas y trabajo contra la marca
- Foundation: cada skill maneja sus propias reglas y checklists (reduce consumo de tokens)
- **Rationale:** Rocinante es para QA de brand, no para foundation
- **Source:** Minuto 00:12:38

### 4. **Flujo de trabajo con hilos de Discord**
- Comando "Sancho Start" crea hilos para cada documento a generar
- Cada documento se maneja dentro de su hilo correspondiente
- Procesamiento incluye: versión rápida de research, opción de profundizar, self-check interno
- **Source:** Minuto 00:06:23

### 5. **Diferenciación de agentes**
- **Cervantes:** desarrollo únicamente (usa docs PRD)
- **Sancho:** análisis de marketing y growth (NO requiere PRD)
- **Rocinante:** QA de campañas y brand (NO foundation)
- **Source:** Minutos 00:10:26 - 00:12:38

---

## ✅ Action Items (Growth4U interno)

| Tarea | Owner | Deadline | Status |
|-------|-------|----------|--------|
| Screenshot doc marketing intelligence + editor MC | Philippe | TBD | Pendiente |
| Solicitar a Cervantes: fondo blanco + más espacio editor | Philippe | TBD | Pendiente |
| Montar estructura Foundation en MC para todos clientes | Cervantes | TBD | Pendiente |
| Implementar 3 estados de documentos en MC | Cervantes | TBD | Pendiente |
| Subir sistema Metricool a GitHub + dashboard métricas | Philippe | TBD | Pendiente |
| Añadir slash commands: "Sancho Start" y "Self Intelligence" | Cervantes | TBD | Pendiente |
| Cambiar base de cotización | Alfonso | TBD | Pendiente |
| Pensar entregables para el cliente | Philippe | TBD | Pendiente |

---

## 💡 Insights

### Process (sistema Growth4U)
- **Self-Intelligence skill:** funcional, ejecutable en Discord (crea hilo correctamente)
- **Proceso de investigación:** 1er paso usa mínimo tokens para overview, luego opción de profundizar ("deep research")
- **Testing de prompts:** cada documento tiene su propio hilo para iterar
- **Onboarding:** conversar con documento → colapsar todo a "brand" → hablar siempre en "brand" para acceder a cualquier doc
- **OpenClow vs app:** más sencillo iterar y avanzar haciendo cosas (menos planificación upfront)

### Features (sistema)
- **Automatización contenido Metricool + Slack:**
  - 3 publicaciones semanales LinkedIn
  - Generadas con Cloud Code
  - Enviadas a Slack para validar (okay) o regenerar
- **Apify:** implementado pero no probado completamente
- **Mission Control:** necesita mejoras de legibilidad (fondo blanco, fuente más grande)

### Context (TPVs - caso de uso mencionado)
- Sector complejo: terminales tradicionales + smart TPVs + software gestión restaurantes
- Numerosas conexiones para manejar órdenes, cobros, contabilidad

---

## 📌 Contexto Adicional

### Entregables para clientes
- Generación de presentaciones (ej: competidores)
- Sistema capaz de crear presentación o dar texto para Gemini

### Disponibilidad
- Alfonso no puede seguir trabajando ese día, planea involucrarse durante fin de semana
- Philippe debe enviar video o texto con cambios/avances al finalizar trabajo

---

## 🔗 Archivos Relacionados

- **Documento Google Drive:** [1aVyiYKj5DhsDUQRBnQX4iUqEl1RLag1s9tb6WChSo2E](https://docs.google.com/document/d/1aVyiYKj5DhsDUQRBnQX4iUqEl1RLag1s9tb6WChSo2E/edit?usp=drivesdk)
- **Doc Self Intelligence actual:** MC Brand hospital capilar/self intelligence/current

---

## 🏷️ Tags
`meeting` `interna` `growth4u` `mission-control` `agentes` `sancho` `cervantes` `rocinante` `discord` `ux`

---

**⚠️ ADVERTENCIA:** Esta es una reunión de desarrollo interno de Growth4U. NO contiene decisiones estratégicas de Hospital Capilar, sino mejoras del sistema SanchoCMO/Mission Control.

---

**Procesado:** 2026-04-03T16:00:00Z  
**Intelligence Log ID:** mtg-2026-02-27-gtm-discord
