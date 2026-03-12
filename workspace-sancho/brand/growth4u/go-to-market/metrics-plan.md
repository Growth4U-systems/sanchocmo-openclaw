# Acquisition Metrics Plan: Growth4U

> Generado: 2026-03-08 | Skill: acquisition-metrics-plan v1.0
> Status: pending-approval

---

## Business Profile

| Campo | Valor |
|-------|-------|
| **Archetype** | Lead-to-Sale (B2B Services) |
| **Monetización** | One-shot (Trust Engine 7K€) + Retainer (Consultoría 30-50K€+) |
| **Customer Journey** | Contenido/LinkedIn → Lead → Discovery Call → Propuesta → Deal |
| **Activation Event** | **Primera call cualificada** (no el lead, no el "contacto") |
| **Ticket medio ponderado** | ~12K€ (mix Trust Engine 7K€ + Consultoría 30K€+) |

### ¿Por qué "primera call cualificada" y no "lead"?

Un lead que rellena un formulario no ha visto valor. Un lead que responde en LinkedIn no ha visto valor. El momento donde el prospect experimenta la diferencia de Growth4U es cuando Alfonso le diagnostica su situación en una call. Ahí es donde se genera el "ajá" — y donde empieza la relación de confianza. Todo lo anterior es tráfico; la call cualificada es el primer momento de valor real.

---

## Metrics Dashboard

### Level 1 — Primary KPI (North Star)

| Métrica | Definición | Target inicial |
|---------|-----------|----------------|
| **Calls cualificadas / mes** | Calls de discovery completadas con prospect que cumple ICP (post-PMF, >10K€ MRR, equipo tech) | 8-12/mes |

> Con cierre estimado del 25% (regla Yer), 8-12 calls = 2-3 clientes/mes. A ticket medio ~12K€ = 24-36K€/mes de new business.

---

### Level 2 — Quality KPIs

| Métrica | Fórmula | Benchmark |
|---------|---------|-----------|
| **Activation Rate** | Calls cualificadas / Total leads | 15-25% |
| **CAC** | Gasto total marketing / Calls cualificadas | < 500€ (target: < 200€ dado modelo low-spend) |
| **Close Rate** | Deals cerrados / Calls cualificadas | 20-30% |
| **Revenue per Call** | Revenue total / Calls cualificadas | > 2.000€ |
| **Deal Value medio** | Revenue / Deals cerrados | 7K-30K€ |

---

### Level 3 — Funnel Steps (diagnóstico de bottlenecks)

```
Impresiones/Reach → Visita web/perfil → Contacto/Lead → Lead cualificado (MQL) → Call agendada → Call completada (SQL) → Propuesta enviada → Deal cerrado
```

| Step | Conversión esperada | Señal de alarma |
|------|-------------------|-----------------|
| Impresión → Visita | 1-3% (LinkedIn), 2-5% (SEO) | < 0.5% → contenido no resuena |
| Visita → Lead | 3-8% | < 2% → CTA/landing débil |
| Lead → MQL | 40-60% | < 30% → targeting incorrecto |
| MQL → Call agendada | 50-70% | < 40% → follow-up lento o propuesta de valor débil |
| Call agendada → Call completada | 70-85% | < 60% → no-shows, calendario poco accesible |
| Call → Propuesta | 50-70% | < 40% → call no convence, o ICP mal cualificado |
| Propuesta → Deal | 40-60% | < 30% → pricing problem o competencia |

**Funnel de referencia end-to-end:**
1.000 impresiones → 20 visitas → 1 lead → 0.5 MQL → 0.3 call → 0.2 propuesta → 0.1 deal

---

### Level 4 — Return / Sustainability KPIs

| Métrica | Target | Cadencia |
|---------|--------|----------|
| **LTV/CAC** | > 5x (servicios B2B high-ticket) | Trimestral |
| **Payback Period** | < 1 mes (dado que Trust Engine cobra upfront 7K€ vs CAC < 500€) | Trimestral |
| **Revenue por canal** | Atribución por canal de origen del deal | Mensual |
| **Referral Rate** | % de clientes que refieren otro cliente | Trimestral |
| **NPS / Satisfacción** | > 50 NPS post-Trust Engine | Cada cliente al cierre |

---

## Channel Tracking

| Canal | Tipo | Métricas específicas |
|-------|------|---------------------|
| **LinkedIn (Alfonso founder content)** | Orgánico - Primario | Posts publicados, impresiones, engagement rate, DMs recibidos, calls from LinkedIn |
| **Product Hackers Go! (Slack)** | Comunidad - Primario | Mensajes publicados, DMs enviados, calls from community |
| **SEO / Blog growth4u.io** | Orgánico - Secundario | Visitas orgánicas, keywords posicionadas, leads from SEO |
| **Newsletter / email** | Owned - Secundario | Suscriptores, open rate, CTR, leads from email |
| **Podcasts / Guest appearances** | PR - Secundario | Apariciones, reach estimado, calls from podcast |
| **Referrals (clientes existentes)** | Referral | Referidos recibidos, calls from referral, close rate referral |
| **Outbound (cold email/LinkedIn)** | Outbound | Emails/DMs enviados, response rate, calls from outbound |
| **Eventos (South Summit, PH Conf)** | Offline | Eventos asistidos, contactos generados, calls from events |

**Atribución:** Primer toque + último toque. En la call de discovery, preguntar siempre: "¿Cómo nos conociste?" y registrar como fuente declarada. Cruzar con datos digitales para atribución completa.

---

## Data Sources

| Métrica | Fuente | Método | Frecuencia | Owner |
|---------|--------|--------|------------|-------|
| Impresiones LinkedIn | LinkedIn Analytics | Manual (capturas semanales) | Semanal | Alfonso |
| Visitas web | Google Analytics 4 | API (cuando se configure) / Manual | Semanal | Alfonso |
| Leads (formulario/DM) | Notion CRM / Google Sheets | Manual | Cada evento | Alfonso |
| Calls agendadas | Calendly / Cal.com | Manual / API | Cada evento | Alfonso |
| Calls completadas | Registro manual | Manual | Cada evento | Alfonso |
| Propuestas enviadas | Notion / Google Sheets | Manual | Cada evento | Alfonso |
| Deals cerrados | Notion / Google Sheets | Manual | Cada evento | Alfonso |
| Revenue | Stripe / Facturación | Manual | Mensual | Alfonso |
| SEO (keywords, CTR) | Google Search Console | API (skill GSC) | Semanal | Sancho |
| Email (opens, clicks) | Mailchimp / Brevo | API | Semanal | Sancho |

> **Nota:** Growth4U está en fase pre-lanzamiento. El stack es ligero — no hay CRM enterprise, no hay automatización compleja. El tracking empieza con **Google Sheets + Notion** y escala cuando haya volumen. No sobreingeniería. Una hoja de cálculo bien mantenida > un CRM vacío.

---

## Decision Criteria

| Framework | Detalle |
|-----------|---------|
| **Método elegido** | Theoretical CAC (Day 1 ready) |
| **Max CAC** | 500€ por call cualificada (dado ticket 7-30K€, el CAC debería ser < 5% del deal) |
| **Min Activation Rate** | 15% (leads → calls cualificadas) |
| **Kill rule** | Canal con < 5% activation rate después de 3 meses → pausar y redirigir esfuerzo |
| **Double-down rule** | Canal con > 30% activation rate → duplicar inversión de tiempo/dinero |
| **Regla Yer (pricing)** | Si close rate ≥ 25% de calls → subir precio Trust Engine |

---

## Review Cadence

### Semanal (15 min, lunes)
- ¿Cuántas calls cualificadas esta semana?
- ¿De qué canal vinieron?
- Funnel: ¿dónde se caen los leads esta semana?
- LinkedIn: posts publicados, engagement, DMs

### Mensual (30 min, primer lunes del mes)
- CAC por canal
- Close rate
- Revenue total y por canal
- Pipeline: deals abiertos y valor estimado
- Activation rate por canal → decidir kill/scale

### Trimestral (1h)
- LTV/CAC actualizado con datos reales
- Payback period real vs teórico
- Cohort: ¿los clientes del Q1 refieren? ¿Compran consultoría después de Trust Engine?
- Recalibrar benchmarks con data real
- Revisar pricing (regla Yer)

---

## Cohort Design

| Campo | Valor |
|-------|-------|
| **Start event** | Call cualificada completada |
| **Cohort types** | Por mes de primera call, por canal de origen, por producto (TE vs Consultoría) |
| **Dimensiones** | Canal × Producto × Mes |
| **Métricas por cohort** | Close rate, deal value, time-to-close, referral rate, upsell rate (TE → Consultoría) |

---

## Template de Tracking

Para la fase actual (pre-lanzamiento, Alfonso solo), un **Google Sheet simple** con 3 tabs:

### Tab 1: Pipeline
| Fecha contacto | Nombre | Empresa | Canal origen | Fuente declarada | Status (Lead/MQL/Call/Propuesta/Deal/Lost) | Deal value | Fecha cierre | Notas |

### Tab 2: Weekly Dashboard
| Semana | Impresiones LI | Posts LI | Visitas web | Leads nuevos | Calls agendadas | Calls completadas | Propuestas | Deals | Revenue | CAC |

### Tab 3: Channel Performance
| Mes | Canal | Leads | MQLs | Calls | Deals | Revenue | CAC | Activation Rate | Close Rate |

> Cuando haya volumen (>20 leads/mes), migrar a CRM (HubSpot free o Pipedrive). Por ahora, una hoja bien mantenida es suficiente.

---

<!-- Self-QA: PASS | 2026-03-08 -->
<!-- Archetype classification: Lead-to-Sale B2B Services — validated against company-context -->
<!-- Activation event: First qualified call — not signup, not lead, not form fill -->
<!-- Benchmarks: Conservative for pre-launch bootstrapped consultancy -->
<!-- Data sources: Realistic for solo founder, no overengineering -->
