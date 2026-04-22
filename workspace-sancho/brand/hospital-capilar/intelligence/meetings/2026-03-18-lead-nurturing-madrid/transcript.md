# HC Lead-Nurturing Madrid — Transcript de Reunión 18/03/2026

**Fecha:** 2026-03-18T11:00:00.000+01:00  
**Asistentes:** Philippe Sainthubert, Ramiro  
**Fuente:** Google Drive Doc ID 1Dun42lJdsRliJVvB7VLjJ3nif_2x-m92NAFFf6aurRs

---

## Contexto

Reunión de trabajo sobre el proyecto de **Lead Nurturing para Hospital Capilar (Madrid)**, centrada en el diagnóstico del sistema actual, el plan de migración al nuevo CRM (Go High Level) y la integración con los sistemas existentes (KOIBOX, Salesforce).

---

## Problemas identificados con el sistema actual

- **Duplicación de trabajo** constante entre KOIBOX y Salesforce — todos los datos deben ingresarse manualmente en ambos sistemas
- Inconsistencias en datos entre sistemas (números de teléfono, apellidos con diferente formato)
- Recordatorios manuales desde recepción generan errores por falta de disciplina
- Limitaciones con WhatsApp desde KOIBOX — no diferencia entre citas reales y bloqueos internos de agenda, lo que causa envíos indebidos
- Riesgo de bloqueo de WhatsApp por uso excesivo manual

---

## Proceso actual de gestión de leads

1. Los leads se capturan directamente en Salesforce
2. Call center realiza máximo **10 llamadas** intentando contactar
3. Si no contesta, se envía WhatsApp
4. Al entrar el lead se envía correo de bienvenida automático
5. Una vez contactado, se agenda cita y se asigna asesor capilar
6. Se envían correos de confirmación de cita y datos del asesor
7. Si tras 10 intentos no se logra contacto, se envía correo final
8. Opción de diagnóstico online para pacientes fuera de ubicaciones (Madrid, Murcia, Pontevedra)
9. Una vez confirmada la cita, pasa a manos del asesor en clínica

---

## Sugerencias de mejora al protocolo

- Reducir de 10 a menos llamadas
- Intercalar llamadas con WhatsApp de forma más eficiente
- Llamadas en diferentes tramos horarios (evitar solo horario laboral)
- WhatsApp es más efectivo que correo para contacto con pacientes
- Priorizar el tiempo de respuesta inicial al lead

---

## Plan de implementación — Go High Level

### Automatización

- Todo será automático excepto las llamadas del call center
- Call center recibirá avisos para llamar a leads nuevos y hacer seguimiento
- Confirmaciones de cita, asignación de asesor → todo automático
- Correos automáticos de bienvenida y seguimiento

### Recordatorios automáticos

- Una semana antes
- Dos días antes
- Un día antes
- El mismo día (si la cita es por la tarde)

### Gestión de cancelaciones y no-shows

- Opción de cancelación con **48 horas** de anticipación para liberar agenda
- Alerta automática al asesor cuando se libera un hueco
- Secuencia automática "No Shows" cuando paciente no asiste a cita confirmada

---

## Integración entre sistemas

- Noemí trabajará con **Go High Level** y **KOIBOX** simultáneamente durante el proyecto
- KOIBOX se mantendrá solo para **agenda y facturación**
- Link de KOIBOX integrado en CRM para agendar citas
- Una vez agendada, automáticamente se rellena fecha/hora en CRM
- Recordatorios salen desde CRM, no desde KOIBOX
- Se creó slot específico en agenda de KOIBOX para este proyecto
- Médicos se rotarán diariamente para atender pacientes de este slot
- Presupuestos y facturas se cargarán en CRM para mantener historial

---

## Flujo post-consulta

1. Asesor realiza estudio diagnóstico y genera presupuesto
2. Presupuesto se crea en KOIBOX seleccionando tratamientos con precios
3. Si acepta → recepción cobra bono o reserva de quirófano (700–1.000 €, según tipo de cirugía)
4. Se tramita financiación si es necesario
5. Pasa a parte médica para cita con doctor o inicio de tratamiento
6. Lead cambia de estado: candidato → cuenta → apto/no apto → convertido → oportunidad de venta

---

## Problema técnico — WhatsApp / Meta

- Teléfono verificado en Meta pero no permite añadir socios
- Teléfono físico enviado a Noemí por urgente (esperado para hoy)
- Una vez llegue, Noemí deberá escanear código QR desde Go High Level para completar conexión
- Philippe dará acceso a Noemí y guiará proceso paso a paso

---

## Consideraciones futuras

- Proyecto separado inicialmente entre **campaña de cirugías** y **tratamientos**
- Si funciona bien, evaluar migrar todo Salesforce al nuevo CRM
- Posibilidad de extender uso de CRM a recepción para recordatorios automáticos
- Go High Level tiene muchas APIs conectadas y permite automatizaciones avanzadas (ej: mensajes personalizados automáticos basados en quiz)
- **Principal riesgo:** doble carga de trabajo durante transición entre sistemas

---

## Tareas pendientes

- [ ] Philippe: Recordar mañana la configuración de WhatsApp con Noemí o enviar mensaje por grupo de Telegram
- [ ] Coordinar con Noemí cuando llegue el teléfono para completar verificación de WhatsApp (escanear código QR desde Go High Level)
- [ ] María: Enviar información detallada de todos los campos que Salesforce necesita recoger de candidatos que se convierten en pacientes (nombre, apellido, correo, móvil, valoración médica, presupuesto, apto/no apto, etc.)
- [ ] Proporcionar ID de KOIBOX para configurar filtros en la agenda
- [ ] Testear el nuevo sistema en los próximos días
- [ ] Evaluar necesidades de personal para Noemí (jornada reducida, principalmente mañanas)
