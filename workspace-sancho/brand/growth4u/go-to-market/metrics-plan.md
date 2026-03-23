# Metrics Plan: Growth4U — Data-Driven

> Generado: 2026-03-22 | Versión: 2.0 (rewrite con fuentes reales)
> Status: pending-approval

---

## Fuentes de Datos Conectadas

| Fuente | Qué mide | Status |
|--------|----------|--------|
| **GA4** | Visitas, páginas, engagement, dispositivo, canales de tráfico | ✅ Activo |
| **Meta Ads** | Spend, impresiones, clicks, CTR, CPC, leads por campaña/adset/ad | ✅ Activo |
| **GHL (GoHighLevel)** | Contactos, pipeline (Setter/Closer/Sales), calendarios, conversations | ✅ Activo |
| **GSC** | Impresiones orgánicas, clicks, CTR, keywords, posiciones | ✅ Activo |
| **Metricool** | Métricas de redes sociales | ✅ Activo |

---

## 1. Páginas Clave a Trackear (GA4)

### Páginas de decisión (alto intent)
| Página | Función | Qué medir |
|--------|---------|-----------|
| `/` | Homepage — primer impacto | Visitas, bounce rate, % que navega a /servicios/ o /equipo/ |
| `/servicios/` | Propuesta de valor | Visitas, tiempo en página, % que va a calendario |
| `/equipo/alfonso-sainz-de-baranda/` | Confianza / autoridad | Visitas desde /servicios/ |
| `/casos-de-exito/*` | Prueba social | Visitas, qué caso genera más tráfico al calendario |
| `/recursos/` | Lead magnets | Visitas, conversión a descarga/opt-in |
| **Calendario** (URL a identificar) | Punto de conversión | Visitas, % que agenda vs abandona |

### Páginas de contenido (tráfico + nurturing)
| Página | Función | Qué medir |
|--------|---------|-----------|
| `/blog/` | Hub de contenido | Visitas totales, top posts por tráfico |
| `/blog/[post-individual]/` | SEO + autoridad | Visitas orgánicas, tiempo lectura, % que navega a /servicios/ |

### Datos actuales (semana 17-22 marzo)
- **Homepage** `/`: 69 views/día pico (21 mar), promedio ~15-20
- **Blog**: 34 views/día pico
- **Equipo + Alfonso**: 12-15 views/día
- **Servicios**: 4 views/día ← **bajo, revisar CTA de homepage**
- **Casos de éxito**: 2-4 views/día

> ⚠️ **Pendiente:** Identificar la URL exacta del calendario (¿GHL calendar embed? ¿cal.com? ¿página propia?) para trackear visitas al calendario como evento de GA4.

---

## 2. Funnels por Camino

### 🔴 Camino 1: Facebook Ads → Lead → Agenda

```
Impresiones → Clicks → Landing/Form → Lead (datos) → Visita calendario → Agenda → Llamada efectiva → Cliente
```

| Step | Métrica | Fuente | Datos actuales (16 mar) |
|------|---------|--------|------------------------|
| Impresiones | impressions | Meta Ads | 4,632/día |
| Clicks | clicks | Meta Ads | 157/día |
| **CTR (Imp→Click)** | ctr | Meta Ads | **3.39%** |
| Landing visits | sessions from Paid | GA4 | Pendiente segmentar |
| Leads (dejan datos) | leads | Meta Ads + GHL | 5/día |
| **CR Click→Lead** | leads/clicks | Calculado | **3.18%** |
| Visita calendario | pageviews calendario | GA4 | ❌ No trackeado |
| Agenda completada | appointments | GHL | ❌ Pipeline vacío |
| Llamada efectiva | pipeline stage "Llamada Confirmada" | GHL | ❌ Pipeline vacío |
| Cliente | pipeline stage "Cliente" | GHL | ❌ Pipeline vacío |

**KPIs clave de este camino:**
- **CPL (Coste por Lead)** = Spend / Leads = 136.69€ / 5 = **27.34€**
- **CPC** = Spend / Clicks = **0.87€**
- **Coste por Llamada Efectiva** = Spend / Llamadas confirmadas = **❌ No calculable** (pipeline vacío)

**Rendimiento por ángulo creativo (16 mar):**

| Ángulo | Spend | Clicks | CTR | CPC | Leads |
|--------|-------|--------|-----|-----|-------|
| Ángulo 4_V3 | 23.91€ | 35 | **5.62%** | 0.68€ | 1 |
| Ángulo 5_V2 | 19.24€ | 25 | 3.91% | 0.77€ | 2 |
| Ángulo 5_V1 | 3.92€ | 9 | 4.31% | 0.44€ | 0 |
| Ángulo 2_V2 | 9.07€ | 17 | 3.88% | 0.53€ | 0 |
| Angulo 1_V3 | 6.47€ | 8 | **6.67%** | 0.81€ | 1 |
| Ángulo 5_V3 | 7.97€ | 8 | 2.91% | 1.00€ | 1 |

---

### 🟢 Camino 2: Lead Magnets → Nurturing → Agenda

```
Visita /recursos/ o ad lead magnet → Opt-in (descarga) → Email nurturing → Visita calendario → Agenda → Llamada
```

| Step | Métrica | Fuente | Datos actuales |
|------|---------|--------|----------------|
| Visita recursos | pageviews /recursos/ | GA4 | 2/día |
| Opt-in lead magnet | source "Trust Score Analyzer" + otros LM | GHL | 12 total (acumulado) |
| Email nurturing | opens, clicks | GHL automations | Pendiente verificar |
| Visita calendario | pageviews calendario | GA4 | ❌ |
| Agenda | appointments | GHL | ❌ |

**Fuentes de lead magnets detectadas en GHL:**
- "Trust Score Analyzer": 12 contactos
- "Framework para encontrar 20-30 nichos": 1 contacto
- "De Foros a Nichos Rentables en 14 Días": 2 contactos

---

### 🔵 Camino 3: Web orgánico/directo → Navegación → Agenda

```
SEO/Social/Directo → Homepage → Servicios/Equipo/Casos → Calendario → Agenda
```

| Step | Métrica | Fuente | Datos actuales (16 mar) |
|------|---------|--------|------------------------|
| Tráfico orgánico | sessions Organic Search | GA4 | 1/día (bajo) |
| Tráfico social orgánico | sessions Organic Social | GA4 | 12/día |
| Tráfico directo | sessions Direct | GA4 | 24/día |
| Home → Servicios | navigation flow | GA4 | 4 views servicios (bajo) |
| Servicios → Calendario | navigation flow | GA4 | ❌ |
| Calendario → Agenda | appointments | GHL | ❌ |

**Por canal GSC (orgánico):**
- Pendiente: extraer top queries y páginas posicionadas

---

## 3. KPIs Principales

### North Star
| KPI | Fórmula | Fuente | Valor actual |
|-----|---------|--------|--------------|
| **Llamadas efectivas / semana** | GHL pipeline "Llamada Confirmada" | GHL | ❌ No trackeado |

### Costes
| KPI | Fórmula | Fuente | Valor actual |
|-----|---------|--------|--------------|
| **CPL (Coste por Lead)** | Meta Ads spend / GHL new contacts from Facebook | Meta Ads + GHL | **~27€** |
| **Coste por Llamada Efectiva** | Meta Ads spend total / Llamadas confirmadas | Meta Ads + GHL | ❌ Pipeline vacío |
| **CPC** | Meta Ads spend / clicks | Meta Ads | **0.87€** |

### Conversiones
| KPI | Fórmula | Fuente | Valor actual |
|-----|---------|--------|--------------|
| **CR Impresión → Click** | clicks / impressions | Meta Ads | **3.39%** |
| **CR Click → Lead** | leads / clicks | Meta Ads | **3.18%** |
| **CR Lead → Agenda** | appointments / new contacts | GHL | ❌ |
| **CR Agenda → Llamada efectiva** | llamadas confirmadas / agendadas | GHL | ❌ |
| **CR Llamada → Cliente** | clientes / llamadas efectivas | GHL | ❌ |

### Tráfico web
| KPI | Fórmula | Fuente | Valor actual |
|-----|---------|--------|--------------|
| **Sesiones / día** | sessions | GA4 | **~25** (rango 10-86) |
| **% Tráfico Paid vs Orgánico** | por canal | GA4 | Directo 65% / Social 32% / Orgánico 3% |
| **Engagement Rate** | engaged sessions / sessions | GA4 | **59%** (desktop 68%, mobile 36%) |
| **Bounce Rate** | bounces / sessions | GA4 | **40%** desktop, **64%** mobile |

---

## 4. Tendencia Semanal (12-22 marzo)

### Meta Ads — Evolución diaria
| Fecha | Spend | Impresiones | Clicks | CTR | Leads | CPL |
|-------|-------|-------------|--------|-----|-------|-----|
| 14 mar | 62€ | 2,555 | 118 | 4.62% | 0 | - |
| 15 mar | 99€ | 3,156 | 58 | 1.84% | 2 | 49.59€ |
| 16 mar | 147€ | 6,413 | 165 | 2.57% | 3 | 49.06€ |
| 17 mar | 137€ | 4,632 | 157 | 3.39% | 5 | 27.34€ |
| 18 mar | 181€ | 4,484 | 189 | 4.21% | 7 | 25.86€ |
| 19 mar | 151€ | 5,427 | 173 | 3.19% | 3 | 50.42€ |
| 20 mar | 131€ | 5,048 | 163 | 3.23% | 1 | 131.19€ |
| 21 mar | 121€ | 4,221 | 115 | 2.72% | 2 | 60.44€ |
| 22 mar | 109€ | 5,491 | 136 | 2.48% | 5 | 21.81€ |
| **Total** | **1,138€** | **41,427** | **1,274** | **3.14%** | **28** | **40.64€** |

### GHL — Contactos nuevos/día
| Fecha | Nuevos | Acumulado |
|-------|--------|-----------|
| 14 mar | 5 | 197 |
| 17 mar | 5 | 215 |
| 18 mar | 9 | 218 |
| 19 mar | 6 | 223 |
| 20 mar | 5 | 228 |
| 21 mar | 4 | 232 |
| 22 mar | 5 | 237 |

### GA4 — Sesiones/día
| Fecha | Sesiones | Usuarios | Nuevos |
|-------|----------|----------|--------|
| 14 mar | 32 | 27 | 22 |
| 15 mar | 12 | 12 | 9 |
| 17 mar | 37 | 24 | 19 |
| 18 mar | 18 | 13 | 12 |
| 19 mar | 23 | 19 | 12 |
| 20 mar | 14 | 10 | 5 |
| 21 mar | 86 | 65 | 57 |
| 22 mar | 10 | 8 | 7 |

---

## 5. Gaps Críticos Detectados

### 🔴 Pipeline GHL vacío
Los 3 pipelines (Closer, Sales, Setter) tienen **todos los stages a 0**. Los contactos entran en GHL pero no se mueven a través del pipeline. Esto significa que:
- No podemos calcular **Coste por Llamada Efectiva**
- No podemos calcular **CR Lead → Agenda**
- No podemos calcular **CR Agenda → Cliente**

**Acción necesaria:** Decidir si se activan automations en GHL para mover contactos por stages, o si se hace tracking manual.

### 🟡 Calendario no trackeado
No hay datos de visitas al calendario en GA4. Sin esto no podemos medir el paso clave: "cuánta gente llega al calendario vs cuánta agenda".

**Acción necesaria:** Identificar la URL del calendario y asegurar que tiene tracking de GA4 (o evento personalizado).

### 🟡 GA4 conversions = 0
No hay eventos de conversión configurados en GA4. Se necesitan al menos:
- `calendar_view` — visita a página de calendario
- `lead_form_submit` — envío de formulario
- `lead_magnet_download` — descarga de recurso

---

## 6. Dashboard Propuesto (Semanal)

### Vista rápida — "¿Cómo vamos esta semana?"
1. **Spend total** (Meta Ads) → ¿cuánto invertimos?
2. **Leads nuevos** (GHL) → ¿cuántos entraron?
3. **CPL** (spend / leads) → ¿a qué precio?
4. **Agendas** (GHL) → ¿cuántos agendaron? ← BLOQUEADO
5. **Coste por Llamada Efectiva** (spend / llamadas) ← BLOQUEADO
6. **Sesiones web** (GA4) → ¿cuánto tráfico?
7. **Top 3 páginas** (GA4) → ¿dónde navegan?
8. **Mejor ángulo creativo** (Meta Ads por ad) → ¿qué copy funciona?

### Gráfica semanal (lo que ya podemos mostrar)
- Línea 1: Leads/día (GHL new contacts)
- Línea 2: Spend/día (Meta Ads)
- Línea 3: CPL/día (calculado)
- Línea 4: Sesiones web/día (GA4)

### Gráfica semanal (cuando se desbloquee pipeline)
- Funnel bar chart: Impresiones → Clicks → Leads → Calendario → Agenda → Llamada → Cliente
- Con % conversión entre cada paso

---

## 7. Próximos Pasos para Completar el Sistema

| Prioridad | Acción | Impacto |
|-----------|--------|---------|
| 🔴 P0 | Activar pipeline en GHL — mover leads por stages | Desbloquea CR Lead→Agenda, Coste/Llamada |
| 🔴 P0 | Identificar URL calendario + trackear en GA4 | Desbloquea CR Visita→Agenda |
| 🟡 P1 | Configurar eventos de conversión en GA4 | Tracking automático de formularios y calendarios |
| 🟡 P1 | Segmentar tráfico GA4 por fuente paid vs orgánico | Atribución correcta por camino |
| 🟢 P2 | Crear dashboard visual automático (gráfica semanal) | Reporting sin esfuerzo manual |
| 🟢 P2 | Conectar GSC data al funnel orgánico | Medir camino 3 completo |

---

<!-- Self-QA: PASS | 2026-03-22 -->
<!-- Data sources: All 5 integrations verified active with real data -->
<!-- Gaps documented: Pipeline empty, calendar untracked, no GA4 conversions -->
<!-- Funnels: 3 paths mapped (Ads, Lead Magnets, Organic) -->
