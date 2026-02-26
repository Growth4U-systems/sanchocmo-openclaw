# Business Model & Growth Model — Hospital Capilar
> Owner: /business-model-audit | Updated: 2026-02-26

## Clasificación del Modelo

### Tipo de Negocio
- **Modelo:** B2C — Servicios médico-estéticos
- **Revenue Model:** Transaccional (pago por servicio) con potencial de recurrencia (tratamientos)
- **Dual track:**
  - **Cirugía capilar** — Ticket alto, one-shot (ticket medio estimado €4.000-8.000)
  - **Tratamientos capilares** — Ticket medio (consulta €195 + bonos ~€700), recurrencia potencial

### Unit Economics (Proyecto Tratamientos)
| Métrica | Valor | Fuente |
|---------|-------|--------|
| Ticket consulta | €195 | Definido |
| Ticket bono tratamiento | €700 (media) | Estimado |
| Conversión consulta → bono | 35% | Estimado |
| LTV estimado por paciente | €195 + (0.35 × €700) = **€440** (primer ciclo) | Calculado |
| LTV con recurrencia | €440 × 2-3 ciclos = **€880-1.320** | Hipótesis — Discovery Task |
| CAC actual (tratamientos) | **Desconocido** — sin inversión paid dedicada hasta ahora | Discovery Task |
| CAC target | <€100 para ser rentable en primer ciclo | Calculado (LTV/4) |
| Baseline orgánico | 152 tratamientos/mes sin inversión | Medido |

### Unit Economics (Cirugía — referencia)
| Métrica | Valor |
|---------|-------|
| Inversión paid | ~€33K/mes |
| Leads orgánicos web | 192/mes |
| Conversión SEO | 28,8% |
| ROI SEO reportado | 6.915% |

## Growth Motion

### Clasificación: **MLG (Marketing-Led Growth)**

| Señal | Evaluación |
|-------|------------|
| ¿Self-serve? | No — requiere consulta médica presencial |
| ¿Pricing visible? | No (cirugía). Sí para consulta €195 (tratamientos) |
| Decisor | Paciente individual, pero decisión de alto involvement emocional |
| Ciclo de venta | Semanas (tratamientos) a meses (cirugía) |
| Fuentes actuales | SEO orgánico (fuerte), Paid (cirugía), Word-of-mouth |

**Veredicto:** Hospital Capilar es **MLG puro**. El paciente no puede "auto-servirse" (necesita diagnóstico médico), pero la captación es 100% marketing → call center → asesor comercial. No hay equipo de ventas outbound ni ABM.

### Motion Actual
```
SEO/Paid → Web → Lead form → Call center (88% contactabilidad) → Asesor comercial → Consulta → Venta
```

### Motion Target (Tratamientos)
```
Content/Paid/SEO → Quiz/LP → Lead cualificado → GHL nurturing → Consulta €195 → Bono tratamiento
```

## Funnel Actual (Tratamientos)

```
[Tráfico orgánico]  →  [Web HC]  →  [Lead form]  →  [Call center]  →  [Consulta]  →  [Tratamiento]
  21.292 users/mes       ?             192 leads/mo     88% contacto      ?              152/mes
  -                      ?             0.9% conv        estimado          ?              -
```

**Bottleneck principal:** No hay funnel dedicado a tratamientos. Los 152 tratamientos/mes son cross-sell de cirugía o walk-in. Sin embudo propio, sin paid dedicado, sin nurturing.

**Estado:** Funnel parcialmente medido. Web analytics existen (GA). CRM Salesforce tiene datos pero no se toca. GHL es el nuevo destino.

## Discovery Tasks

| Desconocido | Tarea | Owner | Prioridad |
|-------------|-------|-------|-----------|
| LTV real con recurrencia | Analizar datos de pacientes que repiten tratamiento en Salesforce/Koibox | HC (María) | Alta |
| CAC por canal (histórico) | Extraer coste por lead y coste por paciente de cirugía como benchmark | HC (Miguel Ángel) | Media |
| Conversión consulta → bono real | Medir en los próximos 30 días con el piloto | HC + Growth4U | Alta |
| Tasa de recurrencia tratamientos | ¿Cuántos pacientes vuelven a un 2º bono? | HC (Koibox data) | Media |
| Atribución por fuente | UTMs + GA4 configurados para tratamientos | Growth4U + Ramiro | Alta |

## Implicaciones para Estrategia

1. **MLG es el motion correcto.** No hay self-serve posible (producto médico). Todo el crecimiento viene de marketing → conversion optimizado.

2. **El baseline orgánico de 152/mes es un activo.** Crecimiento +88% YoY sin inversión = product-market fit confirmado para tratamientos. La inversión en paid y funnel dedicado debería acelerar esto significativamente.

3. **El gap crítico es el funnel dedicado.** Hoy los tratamientos no tienen camino propio — dependen del flujo de cirugía. GHL + quiz + nurturing cierran este gap.

4. **CAC target agresivo (<€100).** Con LTV primer ciclo de ~€440, necesitamos mantener CAC bajo para que el piloto de €5K/mes sea rentable desde el primer mes (~50 consultas mínimo).

5. **Recurrencia es el multiplicador.** Si los pacientes vuelven a 2-3 ciclos de tratamiento, LTV sube a €880-1.320 y el modelo se vuelve muy rentable. Discovery Task prioritaria.

## Resumen

> **Hospital Capilar — Tratamientos Capilares:**
>
> **Tipo**: B2C — Transaccional con recurrencia potencial — Ticket primer ciclo €440
> **Motion**: MLG — captación por marketing, conversión asistida (consulta médica + asesor)
> **Funnel**: Sin funnel dedicado. 152 tratamientos/mes son orgánico/cross-sell. GHL en construcción.
> **Unit Economics**: LTV primer ciclo ~€440, CAC desconocido, target <€100
> **Benchmark sector**: Clínicas estéticas — CAC €50-150, LTV:CAC target >4:1
>
> **Discovery Tasks**: 5 datos pendientes
> **Implicación**: El modelo es viable y tiene tracción orgánica. Falta el funnel dedicado (Phase 2) y paid optimizado (Phase 3) para escalar.
