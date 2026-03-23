# HC Lead-Nurturing Madrid — Resumen Ejecutivo
**Fecha:** 2026-03-18  
**Tipo:** Técnica-Operativa  
**Asistentes:** Philippe Sainthubert, Ramiro

---

## 🎯 Resumen de 1 Línea
Reunión operativa para diagnosticar problemas actuales del sistema de gestión de leads (KOIBOX + Salesforce) y planificar la migración a Go High Level con automatización completa del nurturing.

---

## 📊 Contexto
Hospital Capilar enfrenta duplicación de trabajo entre KOIBOX y Salesforce, inconsistencias de datos, y una tasa de no-shows del 50%. Se decide implementar Go High Level como sistema principal de CRM + automatización, manteniendo KOIBOX solo para agenda y facturación.

---

## ✅ Decisiones Clave

1. **Go High Level será el CRM principal** — Todo el lead nurturing se automátizará desde GHL, integrando KOIBOX solo para agendar citas
2. **Automatización completa excepto llamadas** — Call center recibirá avisos para llamar, pero confirmaciones, recordatorios y asignación de asesor serán automáticos
3. **Recordatorios multi-canal** — 4 recordatorios automáticos: 1 semana antes, 2 días antes, 1 día antes, mismo día (si tarde)
4. **Cancelación con 48h de antelación** — Para liberar agenda y alertar automáticamente al asesor del hueco disponible
5. **WhatsApp vía Meta + GHL** — Noemí configurará WhatsApp escaneando QR desde GHL una vez llegue el teléfono físico

---

## 🚧 Problemas Identificados del Sistema Actual

- **Duplicación de trabajo** entre KOIBOX y Salesforce (entrada manual doble)
- **Inconsistencias de datos** (teléfonos, apellidos en diferentes formatos)
- **Recordatorios manuales** generan errores por falta de disciplina
- **WhatsApp desde KOIBOX** no distingue citas reales de bloqueos, causando envíos indebidos
- **Riesgo de bloqueo de WhatsApp** por uso excesivo manual
- **10 llamadas de call center** sin estrategia horaria ni intercalación con WhatsApp

---

## 💡 Mejoras al Protocolo

- Reducir número de llamadas (de 10 a menos)
- Intercalar llamadas con WhatsApp de forma más eficiente
- Llamadas en diferentes tramos horarios (no solo laboral)
- Priorizar velocidad de respuesta inicial al lead

---

## 🔗 Integración entre Sistemas

- **Noemí** trabajará con GHL + KOIBOX simultáneamente
- **KOIBOX** solo para agenda y facturación
- **Link de KOIBOX** integrado en CRM → al agendar, fecha/hora se rellena automáticamente en CRM
- **Recordatorios** salen desde CRM, no desde KOIBOX
- **Slot específico** creado en agenda KOIBOX para este proyecto
- **Médicos rotarán** diariamente para atender pacientes del slot
- **Presupuestos y facturas** se cargarán en CRM para historial completo

---

## 🔄 Flujo Post-Consulta

1. Asesor realiza estudio diagnóstico → presupuesto
2. Presupuesto en KOIBOX (selección de tratamientos con precios)
3. Si acepta → recepción cobra bono/reserva quirófano (700–1.000 €)
4. Tramitación de financiación si necesario
5. Pasa a médico para cita o inicio de tratamiento
6. **Estados del lead:** Candidato → Cuenta → Apto/No Apto → Convertido → Oportunidad de Venta

---

## 🎯 Actions Pendientes

| Acción | Responsable | Deadline |
|--------|-------------|----------|
| Recordar configuración WhatsApp con Noemí | Philippe | 19/03/2026 |
| Coordinar escaneo QR WhatsApp cuando llegue teléfono | Philippe + Noemí | En cuanto llegue |
| Enviar campos detallados de Salesforce para migración | María | Esta semana |
| Proporcionar ID de KOIBOX para filtros de agenda | Hospital Capilar | Esta semana |
| Testear nuevo sistema GHL | Equipo | Próximos días |
| Evaluar necesidades de personal para Noemí | Óscar / María | Por definir |

---

## 🔮 Futuro

- Si funciona bien, evaluar migración completa de Salesforce a GHL
- Posibilidad de extender uso de CRM a recepción para recordatorios automáticos
- **Principal riesgo:** doble carga de trabajo durante transición entre sistemas

---

## 🔗 Fuente
Google Drive Doc ID: `1Dun42lJdsRliJVvB7VLjJ3nif_2x-m92NAFFf6aurRs`
