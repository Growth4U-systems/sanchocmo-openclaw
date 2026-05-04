# Learnings — Growth4U

## 2026-05-04 — Weekly Synthesis (semana 28 abr – 4 may)

### 🔴 HALLAZGO PRINCIPAL
**Gap lead→cita es ya crónico (4+ semanas). Health Score mínimo histórico: 22.** El problema es estructural, no un incidente.

### Patrones Confirmados

1. **Conversión lead→cita: crisis crónica (semana 4+)** — 28 leads 'llamada-agendada' en GHL vs ~0 citas. 0 transcripts nuevos. Health Score 22 (mínimo histórico, desde 57 hace 2 semanas).
2. **Meta Ads: deterioro sostenido** — CPC €2.65-€8.21 (benchmark €0.67). CTR cayó de 1.01% a 0.50%. Sin pixel = sin optimización por conversiones.
3. **Engagement equipo: cero 9+ semanas** — 0 msgs humanos en Discord. Solo crons activos.
4. **APIs bloqueadas** — Instantly falló, Apollo sin config, Slack scope bloqueando dispatch desde 28/04.
5. **Señales positivas aisladas** — Lead magnet LinkedIn funciona (1 lead orgánico). SEO posición ~5.86. Impresiones Meta +55% el 4 mayo.

### Patrón Nuevo Confirmado
- **H3 validándose**: Sin pixel activo → Meta optimiza por clicks baratos → leads de peor calidad → menor conversión. El CPC 4-12x por encima del benchmark es síntoma, no causa.
- **H4 nueva**: Equipo ha abandonado Discord como canal operativo (9+ semanas sin actividad humana). La operación ocurre por otro canal no monitorizado.

---

## 2026-04-20 — Weekly Synthesis (semana 14-20 abril)

### 🔴 HALLAZGO PRINCIPAL
**Crisis de conversión se profundiza: 15+ días sin citas (NSM bloqueada).** La adquisición sigue funcionando (~3 leads/día, €130-150 spend) pero el funnel lead→booking está completamente roto. No es un problema de volumen — es un problema de conversión.

### Patrones Confirmados (esta semana)

1. **Cuello de botella post-lead se agrava (CRÍTICO — CRÓNICO)**:
   - 15+ días consecutivos sin citas en GHL.
   - 12 leads con tag 'llamada-agendada' (todos existentes, sin cambios).
   - 0 transcripts nuevos en Drive — los leads no están avanzando.
   - Señal: el problema no es adquisición. El funnel post-lead (lead→email/WhatsApp→booking→cita) está completamente bloqueado.
   - Fuente: daily-pulse 14-20 abril.

2. **Fatiga creativa Meta Ads = crisis de eficiencia**:
   - CTR en caída sostenida: 2.37% (media) → 0.76% → 0.60% → 0.73%.
   - Spend subiendo +26% (€147) pero leads no crecen proporcionalmente.
   - CPC histórico bajo: €0.45-0.48. Máximo actual: €3.16 (+77% vs media).
   - Fuente: daily-pulse 14-20 abril.

3. **Pipeline caliente pero sin movimiento**:
   - 8-12 leads con tag 'llamada-agendada' sin avanzar.
   - 0 transcripts nuevos en Drive para estos leads.
   - Jose Antonio Martinez Marcos: 3 cancelaciones/no-show — lead en riesgo de pérdida.
   - Lead duplicado en GHL: Manuel Campos Figal (pendiente merge).
   - Fuente: daily-pulse 13-17 abril.

4. **Oportunidades identificadas**:
   - **Marta Luis Ortiz Ortega** (DMD Asesores Legales): sector reclamaciones masivas, 40k€/mes marketing, Trust Score 68, follow-up pendiente — oportunidad de 40k€/mes.
   - **Josep M Gil** (Heltech): healthtech pre-producto, 6 equipo, busca growth orgánico, acuerdo 3 meses, follow-up lunes 16:00.
   - **Propuesta Gutendurance v2** (Josep): en revisión interna — si aprobada, preparar envío.
   - **Sergi Candel** (XHYPE): Superwallet for Crypto Spending, lead nuevo vía Facebook.
   - Fuente: daily-pulse 14-17 abril.

5. **Competencia en movimiento**:
   - Product Hackers: posicionamiento fuerte en GEO (posicionamiento en IA) — señal de oportunidad para Growth4U.
   - Ricardo Tayar: lanzamiento nuevo 4 mayo — monitorizar.
   - Glissmarket: nicho marketing jurídico — posible solapamiento con lead DMD.
   - Fuente: daily-pulse 15 abril (Thief Marketer).

6. **Proyecto nuevo: P09 Eventos Rumanía**:
   - Scoping activo (abierto por Alfonso, 16/03). Hilo con 35 msgs en #projects. Fase inicial.
   - Fuente: daily-pulse 13, 14 abril.

### Lo Que Funciona

- **SEO mejorando**: Posición media pasó de 12.95 → 7.05 en 3 semanas (marzo). Tendencia positiva sostenida.
- **Adquisición estable**: Meta Ads genera ~3-6 leads/día con spend €130-200. Volumen predecible.
- **CPC mínimo histórico**: €0.45-0.48€ en mejores días — benchmark para evaluar fatiga.

### Acciones Pendientes (heredadas + nuevas)

| Prioridad | Acción | Owner | Estado |
|-----------|--------|-------|--------|
| P0 | Audit flujo booking GHL (lead→booking→cita) | Equipo | **Pendiente** |
| P0 | Follow-up Marta (DMD Asesores, 40k€/mes) | Alfonso/Martín | **Pendiente** |
| P0 | Renovar API key GHL (expirada — afecta Call Prep + CRM) | Philippe | **Pendiente** |
| P1 | Rotar/renovar creativos Meta Ads (CTR 0.60%) | Oier | **Pendiente** |
| P1 | Merge lead duplicado Manuel Campos Figal en GHL | Philippe | **Pendiente** |
| P1 | Apollo.io: configurar enrichment automático | Philippe | **Pendiente** |
| P1 | Follow-up Gutendurance v2 (revisión interna) | Alfonso | **Pendiente** |
| P2 | Reenganche Jose Antonio Martinez Marcos (3 cancelaciones) | Alfonso/Martín | **Pendiente** |

### Hipótesis Activas

- **H1 (Alta probabilidad)**: El flujo de secuencias GHL no tiene CTA funcional de booking o el calendario de booking no está configurado/visible para el lead. Test journey completo urgente.
- **H2**: Los leads con tag 'llamada-agendada' son candidatos sin confirmar — no es un bug de nurturing sino un problema de expectativa o proceso.
- **H3 (Nueva)**: La propuesta Gutendurance v2 podría ser un indicador de que el pipeline tiene proposals pero sin follow-up estructurado — revisar proceso de closing.

---

## 2026-04-13 — Weekly Synthesis (semana 8-13 abril)

### 🔴 HALLAZGO PRINCIPAL
**El funnel se ha roto en la conversión: 0 citas en GHL durante 5+ días consecutivos a pesar de leads activos.** La adquisición funciona (3-6 leads/día) pero lead→booking está completamente bloqueado.

### Patrones Confirmados

1. **Cuello de botella post-lead (CRÍTICO)**:
   - 5+ días sin citas en GHL. 15 leads con tag 'llamada-agendada' sin convertir.
   - Señal: el problema dejó de ser tráfico/adquisición. Ahora es el funnel post-lead.
   - Fuente: daily-pulse 08-13 abril.

2. **Fatiga creativa Meta Ads acelerándose**:
   - CTR: 2.37% media 7d → 0.76% (abril 13). Caída sostenida.
   - CPC subiendo: mejor día €0.45 → €1.48 ayer.
   - Mejor creative histórico: Ángulo 8_V3 (5-abril, 274 clicks, CPC €0.82).
   - Fuente: daily-pulse 08-13 abril.

3. **GHL API key expirada afecta operacion**:
   - Call prep limitado a Calendar. No acceso CRM.
   - Sin enriquecimiento automático de leads.
   - Fuente: daily-pulse 09-10 abril.

4. **Leads sin enrichment bloquean pipeline**:
   - 4 leads sin company data (Alfonso Griñán, Albert Totil, Moh Dak, Carlos T).
   - Jose Antonio Martinez Marcos: 3 cancelaciones — lead en riesgo de pérdida.
   - Fuente: daily-pulse 08-10 abril.

### Lo Que Funciona

- **SEO mejorando**: Posición media 12.95 → 7.05 en 3 semanas.
- **CPC histórico bajo**: Mínimo €0.45-0.48€ (referencia para benchmarks).
- **Proyecto nuevo**: P09 Eventos Rumanía — scoping activo (abierto por Alfonso, 16/03).

### Hipótesis Activas

- **H1 (Alta probabilidad)**: Secuencias GHL no tienen CTA claro de booking o el calendario no está funcionando. Test journey completo recomendado.
- **H2**: Los leads taggeados como 'llamada-agendada' son candidatos sin confirmar — no es un bug de nurturing sino un problema de expectativa.

---

## 2026-04-01 — Weekly Performance Analysis

### 🟢 Wins
- **Appointments activated**: After 0 appointments for 10 consecutive days (Mar 13-21), meetings jumped to 4-6/day starting Mar 22. 44 appointments in March total. NSM is moving.
- **CPC at all-time low**: Meta Ads CPC dropped to 0.45-0.48€ on best days, 0.67€ 7d avg. Ángulo 4_V3 (CTR 7.4%) and Ángulo 5_V2 (CTR 6.3%) are clear winners.
- **SEO position improving**: Average position improved from 12.95 (Mar 14) to 7.05 (Mar 29). Consistent improvement over 3 weeks.
- **Lead→Meeting rate 72.7%**: 32 meetings from 44 leads this week = excellent conversion.

### 🔴 Issues
- **Website engagement 0%**: Bounce rate 100% on multiple days. GA4 engagement rate = 0. Paid traffic is landing and leaving immediately. Critical UX issue.
- **CTR creative fatigue**: Meta Ads CTR dropped from 4.6% to 2.3% in 3 weeks. Needs creative refresh.
- **Pipeline tracking gap**: 44 appointments but 0 opportunities in GHL. Pipeline value = 0€. Can't measure ROI without fixing this.
- **Metricool data missing**: No LinkedIn/social data in last 2+ weeks. Either posting paused or data collection broken.

### 💡 Insights
- The appointment activation on Mar 22 is the single most important event this month. Understanding what changed (automation? manual follow-up? new landing?) is critical.
- Mar 30 contact spike (25 in one day) needs investigation — could be a replicable channel.
- CPL for March: 21.78€ — slightly above the <18€ target but within range given early stage.
