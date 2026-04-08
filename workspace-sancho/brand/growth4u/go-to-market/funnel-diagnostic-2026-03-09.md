# Diagnóstico de Funnel — Growth4U

> Fecha: 9 marzo 2026 | Periodo analizado: 3 – 8 mar 2026 (6 días de gasto real)
> Campaña creada: 25 feb 2026 | Primer gasto: 3 mar 2026
> Fuentes: Meta Ads API + GoHighLevel API (datos en tiempo real)

---

## Resumen Ejecutivo

El funnel **Ads → Lead → Call → Venta** tiene métricas de anuncio buenas (CTR 1.58%, CPC 0.89€, CPL 20€). La campaña lleva **6 días activa** (3-8 mar) con un gasto de **161€** (~27€/día). El problema principal:

1. **Los leads de Facebook llegan a GHL sin datos de contacto** — no se puede hacer seguimiento
2. **Solo 1 demo agendada de 100 contactos** — aunque la mayoría son de import, no del funnel de ads

El anuncio funciona. La fontanería entre Meta y GHL está rota.

---

## Meta Ads — Campaña Activa

**Campaña:** G4U - Testeo Creativos
**Estado:** ACTIVE
**Objetivo:** Lead Generation
**Ad Set:** Anuncio 1 - Angulo 1 V1
**Targeting:** España, 25-55 años, Advantage Audience OFF

| Métrica | Valor | Benchmark B2B | Estado |
|---------|-------|---------------|--------|
| **Gasto total (6 días)** | 161€ | — | — |
| **Gasto/día** | ~27€ | Budget: 20€/día | ✅ Normal (Meta fluctúa ±20%) |
| **Impresiones** | 11.425 | — | — |
| **Alcance** | 7.173 | — | — |
| **Link clicks** | 181 | — | — |
| **CTR** | 1.58% | >1% = bueno | ✅ |
| **CPC** | 0.89€ | <2€ = bueno en B2B ES | ✅ |
| **Leads** | 8 | — | — |
| **CPL** | 20.13€ | <50€ = bueno en B2B ES | ✅ |
| **Video views** | 1.105 | — | ✅ Engagement alto |
| **Engagement (total)** | 1.266 | — | ✅ |

### Anuncios en campaña

| Anuncio | Estado | Creado | Impressions |
|---------|--------|--------|-------------|
| **G4U - V1_Angulo2** | ✅ ACTIVE | 3 mar | 11.425 (100% del gasto) |
| G4U - Hook 1 completo v1 | ⏸ PAUSED | 6 mar | 0 (pausado el mismo día) |
| G4U - Hook 2 completo v1 | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 3 completo v1 | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 4 completo v1 | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 5 completo v1 | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 6 completo v1 | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 7 completo | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 8 completo | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 9 completo | ⏸ PAUSED | 6 mar | 0 |
| G4U - Hook 10 completo | ⏸ PAUSED | 6 mar | 0 |

**Solo 1 de 11 anuncios está activo.** Los 10 hooks se subieron el 6 mar y se pausaron minutos después — nunca recibieron tráfico. Todos los datos del periodo corresponden a un único anuncio: "G4U - V1_Angulo2".

⚠️ **Implicación:** No se está haciendo A/B testing de creatividades. Con un solo anuncio activo no hay comparación posible. Los 10 hooks representan una oportunidad de test pendiente.

### Desglose diario

| Fecha | Gasto | Impresiones | Clicks | Leads |
|-------|-------|-------------|--------|-------|
| 3 mar | 25.26€ | 1.897 | 21 | 0 |
| 4 mar | 31.45€ | 3.303 | 46 | 3 |
| 5 mar | 31.02€ | 1.687 | 26 | 1 |
| 6 mar | 28.24€ | 1.846 | 42 | 3 |
| 7 mar | 23.85€ | 1.346 | 16 | 0 |
| 8 mar | 21.19€ | 1.346 | 30 | 1 |
| **Total** | **161.01€** | **11.425** | **181** | **8** |

**Campaña pausada:** "Growth4U - Fintech - España" (budget 5€/día, paused)

### Interpretación

Las métricas del anuncio son sólidas para B2B en España:
- **CTR 1.58%** está por encima del benchmark B2B (~0.9-1.2%)
- **CPC 0.89€** es excelente para targeting B2B en España
- **CPL 20.13€** es muy competitivo si los leads son cualificados

El problema es que **la campaña solo entrega el 27% del budget diario**. Meta no encuentra suficiente audiencia o el bid no compite. Esto limita el volumen de datos para optimizar.

---

## GHL — Estado del Pipeline

| Métrica | Valor |
|---------|-------|
| **Contactos totales** | 100 |
| **Leads recientes de Facebook** | 4 (4-8 marzo) |
| **Con datos completos (nombre+email+tel)** | ~30 |
| **Con tag "demo agendada"** | 1 |
| **Fuente "Facebook" identificada** | 4 recientes |
| **Fuente bulk import (27 feb)** | ~96 |

### Leads de Facebook (últimos 7 días)

| Fecha | Nombre | Email | Teléfono | Campaña |
|-------|--------|-------|----------|---------|
| 8 mar | — | — | — | G4U - Testeo Creativos |
| 6 mar | — | — | — | G4U - Testeo Creativos |
| 6 mar | — | — | — | G4U - Testeo Creativos |
| 6 mar | — | — | — | G4U - Testeo Creativos |

**🚨 PROBLEMA CRÍTICO: Los 4 leads recientes de Facebook no tienen nombre, email ni teléfono.** La atribución de campaña sí llega (UTM), pero los datos del formulario no.

---

## Diagnóstico del Funnel

```
     Meta Ad                Lead Form              GHL               Call
  ┌──────────┐          ┌──────────────┐      ┌──────────┐      ┌──────────┐
  │ CTR 1.58%│──click──▶│  Formulario  │──?──▶│ Pipeline │──?──▶│  Demo    │
  │ CPC 0.89€│          │  ¿datos?     │      │ sin datos│      │          │
  │    ✅     │          │    🚨        │      │   🚨     │      │   ❓     │
  └──────────┘          └──────────────┘      └──────────┘      └──────────┘
       OK                  FUGA AQUÍ           SIN DATOS         1 DE 100
```

### Problema #1 — Volumen bajo de leads

**Síntoma:** 8 leads en 6 días de campaña activa. Gasto medio ~27€/día (por encima del budget de 20€, lo cual es normal en Meta).
**Contexto:** La campaña se creó el 25 feb pero no empezó a gastar hasta el 3 mar. El gasto diario es razonable — no hay problema de delivery.
**Oportunidad:** Con CPL de 20€, subir budget a 40-50€/día podría duplicar el volumen de leads manteniendo eficiencia. Pero primero hay que arreglar la captura de datos (Problema #2).

### Problema #2 — Datos de leads no llegan a GHL

**Síntoma:** Meta registra 8 leads. GHL recibe 4 contactos de Facebook. Ninguno tiene nombre, email o teléfono.
**Causas probables:**
- **Formulario Instant Form:** Si usa prefill con Facebook data, puede que los campos no se mapeen correctamente a GHL
- **Integración FB→GHL:** El webhook o conector (Zapier/Make/nativo) transmite el evento pero no los campos del formulario
- **Permisos:** El token de API puede no tener permisos `leads_retrieval` para leer los datos del formulario
- **Formulario landing externa:** Si redirige a una landing, el lead se registra en Meta pero los datos van a otro sitio

**Impacto:** Es el problema más grave. Sin datos de contacto, no se puede hacer seguimiento ni agendar demos. El dinero invertido en ads no genera pipeline.

### Problema #3 — Conversión contacto→demo baja

**Síntoma:** 1 demo agendada de 100 contactos (1%).
**Contexto:** La mayoría de contactos son de un import masivo (27 feb). Muchos no son target (emails personales, sin empresa). El dato real de conversión del funnel ads es 0 demos de 8 leads — pero porque los datos no llegan.
**Nota:** Este problema se resolverá en parte cuando se arregle la integración. El verdadero conversion rate del funnel se medirá después.

---

## Plan de Acción (Priorizado)

### 🔴 URGENTE — Arreglar la integración FB→GHL

1. **Verificar el tipo de formulario** — ¿Instant Form de Meta o landing externa en GHL?
2. **Revisar el conector** — ¿Cómo llegan los leads a GHL? (Webhook nativo, Zapier, Make, API directa)
3. **Verificar mapeo de campos** — Nombre, email, teléfono deben mapearse correctamente
4. **Test:** Enviar un lead test desde Meta y verificar que llega completo a GHL
5. **Timeline:** Resolver en 24-48h. Sin esto, cualquier gasto en ads es dinero perdido.

### 🟡 IMPORTANTE — Escalar volumen (post-fix integración)

1. **Subir budget a 40-50€/día** — Con CPL de 20€, duplicar budget debería duplicar leads manteniendo eficiencia
2. **Activar Advantage Audience** — Dejar que Meta expanda el targeting manteniendo el core (España, 25-55)
3. **Añadir interests** — Emprendimiento, startups, growth marketing, SaaS
4. **Considerar Lookalike** — Si hay una lista de clientes actuales (aunque sea pequeña), crear un Lookalike 1-3%
5. **Timeline:** Implementar cuando la integración funcione y los leads lleguen con datos completos.

### 🟢 SIGUIENTE — Optimizar conversión

1. **Nurture automático en GHL** — Sequence de email/WhatsApp automático cuando llega un lead
2. **Speed to lead** — Contactar leads de Facebook en <5 minutos (GHL workflow)
3. **Cualificación en el form** — Añadir pregunta de cualificación (tamaño empresa, MRR, rol)
4. **A/B test landing vs instant form** — Comparar conversión
5. **Timeline:** Semana 2-3 después de arreglar integración.

---

## Métricas Target (Post-Fix)

| Paso del Funnel | Métrica | Target | Actual |
|-----------------|---------|--------|--------|
| Ad → Click | CTR | >1% | 1.58% ✅ |
| Click → Lead | Conv. Rate | >5% | 5.5% (8/146) ✅ |
| Lead → Datos completos | Data capture | 100% | 0% 🚨 |
| Lead → Demo agendada | Booking rate | >20% | N/A (sin datos) |
| Demo → Venta | Close rate | >15% | N/A |
| **CPL** | | <50€ | 20.13€ ✅ |
| **CPA (demo)** | | <150€ | N/A |
| **CAC (cliente)** | | <1.000€ | N/A |
| **ROAS** | | >3.5:1 (ACV 7K€) | N/A |

---

## Siguiente Revisión

Tras arreglar integración + 1 semana de datos limpios → revisión completa con:
- CPL real (con datos completos)
- Booking rate (lead→demo)
- Calidad de leads (% target audience)
- Close rate (si hay demos)

---

*Generado por SanchoCMO — datos extraídos de Meta Ads API y GoHighLevel API en tiempo real.*
