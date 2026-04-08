# Status arquitectura Hospital Capilar — 2026-03-04

**Tipo:** Reunión estratégica y planificación  
**Fecha:** 2026-03-04 18:30 CET  
**Participantes:** Philippe Sainthubert, Ramiro Perez  
**Duración:** ~52min  

---

## 🎯 Resumen Ejecutivo

Sesión de definición estratégica donde se consolidó el **posicionamiento de Hospital Capilar** (jóvenes con alopecia temprana buscando claridad médica) y se simplificó la arquitectura técnica del sistema de leads. Se confirmaron 3 nichos iniciales y se planificó un sistema replicable basado en Go High Level con quiz + scoring vía Make.

---

## 🔑 Decisiones

### 1. **Posicionamiento: jóvenes con alopecia temprana**
- Nicho principal: 20-30 años con alopecia temprana que buscan autotratamiento en TikTok/Reddit antes de consultar médico
- Mensaje: "La clínica prefiere perderte a mentirte" + médico (no vendedor) atiende
- Criterios de valor: autoridad médica, transparencia, protocolo personalizado, diagnóstico completo (tricoscopia + análisis hormonal) en 1 visita
- **Source:** Minutos 00:02:35 - 00:06:58

### 2. **3 nichos iniciales para el quiz**
- Jóvenes 20-30 años con alopecia temprana
- Pacientes frustrados con productos OTC (minoxidil/finasterida)
- Mujeres (especialmente posparto)
- **Source:** Minuto 00:42:11

### 3. **Arquitectura simplificada: quiz + Make + sheet**
- Quiz largo con scoring (Hot/Warm/Cold)
- Make para cálculo de scoring (en lugar de sumatorio complejo)
- Hoja de cálculo para resumir respuestas al comercial/médico (GHL no tiene "masticador de información")
- Sistema replicable para otras sedes
- **Source:** Minutos 00:16:45 - 00:34:53

### 4. **Leads "Hot" → pago directo del bono (€195)**
- Leads con alta puntuación reciben CTA de alta conversión: pagar bono o agenda directa
- Leads "hot" disparan notificación al comercial (WhatsApp/Telegram) para llamada inmediata
- **Source:** Minuto 00:15:21

### 5. **Facturación: consultora factura licencia GHL a Hospital Capilar**
- Plan básico €97/mes incluye 3 subaccounts
- 1 subaccount por hospital para simplificar gestión (cada ciudad puede tener políticas diferentes)
- Escalabilidad se estudiará después de montar Madrid
- **Source:** Minutos 00:49:41 - 00:51:08

### 6. **3 tipos de landings por nicho**
- Cada landing con CTA diferente:
  - Formulario directo embebido
  - Quiz largo
  - Quiz corto
- **Source:** Minuto 00:32:33

---

## ✅ Action Items

| Tarea | Owner | Deadline | Status |
|-------|-------|----------|--------|
| Reservar newsletter "Milla" | Philippe | TBD | Pendiente |
| Preguntar precio newsletter Zona Mixta | Philippe | TBD | Pendiente |
| Validar quiz con cliente Hospital Capilar | Philippe | TBD | Pendiente |
| Crear doc: política privacidad + condiciones HC | Ramiro | TBD | Pendiente |
| Compartir enlace video campañas GHL | Ramiro | TBD | Pendiente |
| Reenviar video GHL al experto de Meta de HC | Philippe | TBD | Pendiente |
| Documentar 3 nichos en Notion | Philippe | TBD | Pendiente |
| Documentar posicionamiento en Notion | Philippe | TBD | Pendiente |
| Revisar setup y docs de trabajo | Ramiro | Viernes | Pendiente |
| Estructura básica del quiz lista | Ramiro | Lunes | Pendiente |
| Reunión seguimiento (definir entregables) | Ambos | Mañana 4 PM | Pendiente |

---

## 💡 Insights

### Positioning & Messaging
- **Dolor activado:** incertidumbre → necesidad de diagnóstico médico exacto
- **Rechazo:** "no más suplementos ni videos de TikTok"
- **Transparencia:** punto fuerte de HC vs competidores que presionan cirugía
- **2do nicho (OTC frustrados):** "el problema no fue el producto, sino la falta de diagnóstico real"

### Features
- **Value criterias:** autoridad médica, precisión diagnóstico, transparencia tratamiento, protocolo personalizado
- **Activos clave:** tricólogo médico en cada consulta, diagnóstico completo en 1 visita (tricoscopia + análisis hormonal)
- **Protocolos propios:** HRT y CRT
- **Reseñas:** Trustpilot
- **FAQ honesta:** aclara que tratamientos NO hacen crecer cabello nuevo

### Process
- **Quiz estructura:**
  - 1ra pregunta: sexo (determina preguntas siguientes + tags)
  - Preguntas condicionales (ej: tema hormonal en mujeres → contacto directo, no bono)
  - Scoring final: Hot, Warm, Cold
  - Microtips, preguntas sobre efectos secundarios, expectativas, presupuesto
  - CTA final: reservar presencial o que llamen
- **Warning:** evitar exceso de tags en GHL (complica automatizaciones)
- **Integración bidireccional con Salesforce:** debe compartirles leads también
- **UTMs:** definir parámetros para seguimiento de campañas (mismo formato en todos los links)

### Timeline
- **2 semanas:** sistema simple funcional para probar con campañas
- **Luego:** perfeccionar y escalar

---

## 📌 Contexto Adicional

### Sancho CMO
- Philippe explica que "Sancho CMO" es una aplicación/sistema que genera toda la estrategia de go to market de una empresa
- Chatbot especializado en marketing que hace autoanálisis + investiga competencia + refina estrategia
- Origen de los resultados y lógica de quiz compartidos

### Modelo de negocio consultora
- "Done with you" (no "done for you")
- Dan acceso a herramienta Sancho para que clientes trabajen por su cuenta con apoyo

### Necesidades legales
- Política de privacidad + condiciones de Hospital Capilar ANTES de implementar formularios/quizzes
- Cumplimiento legal al solicitar teléfono de usuarios

### Testing de campañas
- Proceso ordenado con seguimiento claro: objetivo, duración, rendimiento de leads a lo largo del embudo

---

## 🔗 Archivos Relacionados

- **Documento Google Drive:** [1Vh7964tPDqql7W-r9GQzUNyvtxronQGz1mW3kqVgPjU](https://docs.google.com/document/d/1Vh7964tPDqql7W-r9GQzUNyvtxronQGz1mW3kqVgPjU/edit?usp=drivesdk)
- **Quiz funcional (código ejemplo):** URL compartida por Philippe (minuto 00:40:48)

---

## 🏷️ Tags
`meeting` `estrategia` `posicionamiento` `nichos` `arquitectura` `quiz` `go-high-level` `make` `scoring`

---

**Procesado:** 2026-04-03T16:00:00Z  
**Intelligence Log ID:** mtg-2026-03-04-status-arquitectura
