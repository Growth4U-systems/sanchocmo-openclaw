<!-- version: 2 | fecha: 2026-02-28 | skill: business-model-audit | qa: PASS -->
<!-- Self-QA: PASS | 2026-02-28 | items: 24✅ 3⚠️ 0❌ -->
<!-- Sources: kickoff 2026-01-29, briefing-ramiro 2026-02-17, company-context v2, self-intelligence v2, competitors v3, market v4, ope-canvas v2 -->

# Business Model & Growth Model — Hospital Capilar
> Owner: /business-model-audit | Updated: 2026-02-28 | Version: 2

---

## Summary

> **Modelo de Hospital Capilar (Proyecto Tratamientos):**
>
> **Tipo**: B2C — Transaccional con recurrencia potencial — Ticket primer ciclo ~€440
> **Motion**: MLG (Marketing-Led Growth) — captación por marketing, conversión asistida (consulta médica + asesor comercial)
> **Funnel**: Sin funnel dedicado a tratamientos. 152/mes son orgánico/cross-sell. GHL en construcción (Ramiro, inicio 2 mar)
> **Unit Economics**: LTV primer ciclo ~€440, LTV con recurrencia €880-1.320 (hipótesis), CAC desconocido, target <€100
> **Sector benchmark**: HealthTech B2C CAC €50-200, LTV:CAC target >4:1, Payback target <3 meses (transaccional)
>
> **Discovery Tasks**: 5 datos pendientes
> **Implicación**: El modelo es viable y tiene tracción orgánica confirmada (+88% YoY sin inversión). Falta el funnel dedicado (Phase 2) y paid optimizado (Phase 3) para escalar. El margen de 90% en tratamientos vs 40% en cirugía hace que incluso un CAC alto sea rentable.

---

## 1. Clasificación del Modelo

### Tipo de Negocio

| Campo | Valor | Fuente |
|-------|-------|--------|
| **B2B/B2C** | B2C — Servicios médico-estéticos | company-context v2 |
| **Revenue Model** | Transaccional con recurrencia potencial | kickoff 2026-01-29 |
| **Revenue Model Secundario** | ⚠️ No identificado (posible recurrencia en bonos) | — |
| **Product Delivery** | Physical (clínica presencial, diagnóstico + tratamiento in-situ) | hospitalcapilar.com |

### Dual Track de Revenue

Hospital Capilar opera dos líneas de negocio complementarias con economics muy diferentes:

| Línea | Tipo | Ticket | Margen | Recurrencia | Fuente |
|-------|------|--------|--------|-------------|--------|
| **Cirugía capilar** | One-shot (con seguimiento incluido) | €3.145-4.345 | ~40% | Baja (1 cirugía, a veces retoque) | kickoff 2026-01-29, competitors v3 |
| **Tratamientos capilares** | Transaccional + recurrencia potencial | Consulta €195 + bono ~€700 | ~90% | Media-Alta (2-3 ciclos potenciales) | kickoff 2026-01-29, competitors v3 |

**Revenue streams confirmados:**
1. Cirugía FUE/DHI (core actual, ~€33K/mes en ads dedicados) [company-context v2]
2. Tratamientos (CRT, HRT, PRP, mesoterapia) — consulta €195 + bonos [kickoff 2026-01-29]
3. Consultas diagnósticas de pago (€195) — revenue propio independiente del bono [competitors v3]
4. Financiación 0% TAE 12-24m (cirugía) — no genera revenue directo [hospitalcapilar.com]

### Arquetipo de Revenue

| Dimensión | Valor | Implicación | Fuente |
|-----------|-------|-------------|--------|
| **ACV tratamientos** | ~€440 (primer ciclo) | Transaccional con potencial de recurrencia | business-model v1 |
| **ACV cirugía** | €3.145-4.345 | High-ticket one-shot | competitors v3 |
| **Motion natural** | MLG (marketing → consulta → venta asistida) | No hay self-serve posible | business-model v1 |
| **Canal primario** | SEO + Paid + RRSS → Call center → Asesor | — | company-context v2 |
| **Warning sign** | Dependencia de cirugía para revenue → pivot a tratamientos | En curso | kickoff 2026-01-29 |

---

## 2. Unit Economics

### Proyecto Tratamientos

| Métrica | Valor | Status | Fuente |
|---------|-------|--------|--------|
| **Ticket consulta** | €195 | ✅ Definido | kickoff 2026-01-29 |
| **Ticket bono tratamiento** | ~€700 (media, rango €600-900) | ✅ Estimado | competitors v3 |
| **Conversión consulta → bono** | 35% | ⚠️ Estimado — Discovery Task | kickoff 2026-01-29 |
| **Revenue medio por consulta** | €195 + (50% × €820) = ~€605 | ✅ Calculado (con ajuste post-competitors v3) | competitors v3 |
| **LTV primer ciclo** | €195 + (0.35 × €700) = **~€440** | ✅ Calculado | business-model v1 |
| **LTV con recurrencia** | €440 × 2-3 ciclos = **€880-1.320** | ⚠️ Hipótesis — Discovery Task | business-model v1 |
| **Margen bruto** | ~90% | ✅ Confirmado | kickoff 2026-01-29 |
| **CAC actual** | **Desconocido** — sin paid dedicado | ⚠️ Discovery Task | business-model v1 |
| **CAC target** | <€100 | ✅ Calculado (LTV/4 conservador) | business-model v1 |
| **CAC payback target** | <1 mes (break-even en primera consulta €195) | ✅ Calculado | — |

### Cirugía (referencia, no tocar)

| Métrica | Valor | Fuente |
|---------|-------|--------|
| Inversión paid | ~€33K/mes (Meta €19.232 + Google €13.790) | company-context v2 |
| CPL Google | €53,77 (2025) | kickoff 2026-01-29 |
| CPL Meta | €19,48 (2025) | kickoff 2026-01-29 |
| CAC Meta | €668/venta | ope-canvas v2 |
| CAC Google | €563/venta | ope-canvas v2 |
| CAC SEO | €25/venta | ope-canvas v2 |
| Leads orgánicos | 192/mes | company-context v2 |
| Conversión SEO | 28,8% | company-context v2 |
| ROI SEO | 6.915% | company-context v2 |
| Conversión Google → cirugía | 7,40% | kickoff 2026-01-29 |
| Conversión Meta → cirugía | 1,60% | kickoff 2026-01-29 |

### Sector Benchmarks

| Metric | HC (tratamientos) | HealthTech B2C benchmark | Status |
|--------|--------------------|--------------------------|--------|
| **CAC** | Desconocido (target <€100) | €50-200 | ⚠️ A validar |
| **LTV:CAC target** | >4:1 (si CAC <€100 y LTV €440) | >4:1 | ✅ Viable |
| **Payback** | <1 mes (si €195 consulta > CAC) | <3 meses (transaccional) | ✅ Excelente si se cumple |
| **Gross margin** | ~90% | 60-80% | ✅ Muy por encima |

---

## 3. Growth Motion

### Clasificación: **MLG (Marketing-Led Growth)**

| Señal | Evaluación | Fuente |
|-------|------------|--------|
| ¿Self-serve signup? | ❌ No — requiere consulta médica presencial | hospitalcapilar.com |
| ¿Pricing visible? | Parcial — cirugía no, consulta €195 sí | hospitalcapilar.com, competitors v3 |
| ¿Trial o free tier? | ❌ No — diagnóstico online gratis existe pero no convierte a tratamiento | self-intelligence v2 |
| Sales cycle length | Semanas (tratamientos) a meses (cirugía) | kickoff 2026-01-29 |
| Decision maker | Paciente individual (high emotional involvement) | — |
| Fuentes actuales | SEO orgánico (fuerte), Paid (solo cirugía), Word-of-mouth | company-context v2 |

**Veredicto:** Hospital Capilar es **MLG puro**. El paciente no puede "auto-servirse" (necesita diagnóstico médico presencial), pero la captación es 100% marketing → call center → asesor comercial. No hay equipo de ventas outbound ni ABM. [Fuente: business-model v1]

### Comparación Motion vs Competidores

| Competidor | Motion | Self-serve | Pricing visible | Consulta gratis | Fuente |
|-----------|--------|-----------|----------------|-----------------|--------|
| **HC** | MLG | ❌ | Parcial (€195) | ❌ (pago) | — |
| **Insparya** | MLG + Brand-led | ❌ | ❌ | ✅ | competitors v3 |
| **Svenson** | MLG + Network | ❌ | ❌ | ✅ | competitors v3 |
| **Medical Hair** | MLG | ❌ | Parcial | ✅ | competitors v3 |
| **IMD** | Sales-led (agresivo) | ❌ | ❌ | ✅ | competitors v3 |
| **Capilclinic** | MLG + Price-led | ❌ | ✅ | ✅ | competitors v3 |

**Motion pattern del mercado:** Todo el sector es MLG. Nadie es PLG (producto médico). IMD se acerca a Sales-led (cuotas de venta €40K/mes a vendedores). La diferenciación de HC está en consulta de pago (€195) como señal de calidad vs consulta gratis = venta disfrazada. [Fuente: competitors v3, swot v2]

**Motion fit assessment:** ✅ Aligned — MLG es el motion correcto para producto médico B2C de alto involvement emocional. [Fuente: análisis]

---

## 4. Funnel Actual

### Funnel Cirugía (existente, funciona)
```
[SEO/Paid]  →  [Web HC]  →  [Lead form]  →  [Call center]  →  [Asesor]  →  [Consulta]  →  [Cirugía]
  21.292/mes     ?            192 leads/mo     88% contacto      ?            ?              ?
  -              ?            0.9% conv        measured          estimated    unknown        unknown
```
[Fuente: company-context v2, kickoff 2026-01-29]

### Funnel Tratamientos (EN CONSTRUCCIÓN — no existe aún)
```
[Content/Paid/SEO] → [Quiz/LP] → [GHL lead] → [Nurturing] → [Consulta €195] → [Bono tratamiento]
  target: 25.000      target       target        target         target: 100/mes   target: 35/mes
  -                   ?            ?             automático     €195              ~€700
  -                   unknown      unknown       GHL            unknown           35% estimado
```
[Fuente: business-model v1, briefing-ramiro 2026-02-17]

### Bottleneck Principal
**No hay funnel dedicado a tratamientos.** Los 152 tratamientos/mes son cross-sell de cirugía + walk-in + orgánico no atribuido. Sin embudo propio, sin paid dedicado, sin nurturing. Este es el gap #1 que el proyecto cierra. [Fuente: business-model v1, swot v2]

### Funnel Measurement
- **Cirugía:** Partial — GA4 en web, leads tracked, conversión parcialmente medida
- **Tratamientos:** None — sin tracking, sin atribución, sin funnel
- GHL cerrará este gap con tracking completo: envío, recepción, apertura, rebote [briefing-ramiro 2026-02-17]

---

## 5. Discovery Tasks

| # | Unknown | Discovery Task | Owner | Method | Priority | Fuente |
|---|---------|---------------|-------|--------|----------|--------|
| 1 | **LTV real con recurrencia** | Analizar datos de pacientes que repiten tratamiento | HC (María) / Koibox | Exportar datos Koibox: pacientes con >1 bono | 🔴 Alta | business-model v1 |
| 2 | **CAC por canal (histórico)** | Extraer coste por lead y coste por paciente de cirugía como benchmark | HC (Miguel Ángel) | Exportar datos GA4 + Meta + Google Ads | 🟡 Media | business-model v1 |
| 3 | **Conversión consulta → bono real** | Medir en los próximos 30 días con el piloto | HC + Growth4U | Tracking en GHL desde día 1 | 🔴 Alta | business-model v1 |
| 4 | **Tasa de recurrencia tratamientos** | ¿Cuántos pacientes vuelven a un 2º bono? | HC (Koibox) | Query: pacientes con ≥2 bonos / total pacientes tratamiento | 🟡 Media | business-model v1 |
| 5 | **Atribución por fuente** | UTMs + GA4 configurados para tratamientos | Growth4U + Ramiro | Setup UTMs en todas las URLs de tratamiento + GA4 events | 🔴 Alta | business-model v1 |

---

## 6. Implicaciones para Estrategia

1. **MLG es el motion correcto.** No hay self-serve posible (producto médico). Todo el crecimiento viene de marketing → conversion optimizado. [business-model v1]

2. **El baseline orgánico de 152/mes es un activo.** Crecimiento +88% YoY sin inversión = product-market fit confirmado para tratamientos. La inversión en paid y funnel dedicado debería acelerar esto significativamente. [kickoff 2026-01-29]

3. **El gap crítico es el funnel dedicado.** Hoy los tratamientos no tienen camino propio — dependen del flujo de cirugía. GHL + quiz + nurturing cierran este gap. [briefing-ramiro 2026-02-17]

4. **CAC target agresivo (<€100).** Con LTV primer ciclo de ~€440 y margen del 90%, incluso un CAC de €100 da payback en la primera consulta (€195 > €100). El modelo es inherentemente rentable si el funnel funciona. [calculado]

5. **Recurrencia es el multiplicador.** Si los pacientes vuelven a 2-3 ciclos, LTV sube a €880-1.320 y el modelo se vuelve extremadamente rentable. Discovery Task #1 y #4 son prioritarios para confirmar. [business-model v1]

6. **La consulta de €195 es un moat financiero.** Todos los competidores ofrecen consulta gratis (= venta disfrazada). HC cobra €195 por diagnóstico integral real. Esto precualifica leads, reduce no-shows, y genera revenue propio. El riesgo es que sea barrera de conversión — mitigado por messaging diferenciador: "La consulta gratis te vende. Nuestra consulta €195 te diagnostica." [swot v2, competitors v3]

---

## Fuentes

- [Kickoff 2026-01-29](brand/hospital-capilar/intelligence/meetings/2026-01-29-kickoff-hospital-capilar.md)
- [Briefing Ramiro 2026-02-17](brand/hospital-capilar/intelligence/meetings/2026-02-17-ramiro-briefing-tecnico.md)
- [Company Context v2](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/company-context/current.md)
- [Self-Intelligence v2](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/self-intelligence/current.md)
- [Competitors v3](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/competitors/current.md)
- [Market v4](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/market/current.md)
- [OPE Canvas v2](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/ope-canvas/current.md)
- [SWOT v2](https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/hospital-capilar/swot-analysis/current.md)
- [hospitalcapilar.com](https://hospitalcapilar.com)
