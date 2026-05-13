# SEO Weekly — 2026-05-11

> **Período:** 2026-05-04 al 2026-05-10 | **Generado:** 2026-05-11 20:19 (Europe/Madrid)
> **Proyecto:** P01-SEO-BOFU | **Estado general:** 🔴 Bloqueado por APIs + 0 contenido BOFU publicado

---

## ⚠️ ALERTA CRÍTICA: APIs Google deshabilitadas

**Impacto:** No se pudieron obtener datos de GSC ni GA4 esta semana.

| API | Error | Acción requerida |
|-----|-------|-----------------|
| Google Search Console API | 403 — API deshabilitada en proyecto GCP `871376636741` | Habilitar en [console.developers.google.com](https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=871376636741) |
| Google Analytics Data API | 403 — API deshabilitada en proyecto GCP `871376636741` | Habilitar en [console.developers.google.com](https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=871376636741) |

> **Nota:** Ambas APIs comparten el mismo proyecto GCP. Habilitar las dos en el mismo paso. Tiempo estimado: 5 minutos. Sin esto, los crons de SEO Weekly y Daily Pulse no pueden funcionar.

---

## KPIs

> ⚠️ **Sin datos live esta semana** — GSC y GA4 bloqueadas. Se muestran últimos datos disponibles como referencia base.

| Métrica | Último dato disponible | Fuente | Estado |
|---------|----------------------|--------|--------|
| Sesiones orgánicas (día) | ~64/día (2026-03-29) | GA4 historical | Sin datos actuales |
| Sesiones totales (día) | ~95/día (2026-03-29) | GA4 historical | Sin datos actuales |
| Clics orgánicos (semanal) | N/D | GSC — bloqueada | 🔴 Bloqueado |
| Impresiones (semanal) | N/D | GSC — bloqueada | 🔴 Bloqueado |
| CTR medio | N/D | GSC — bloqueada | 🔴 Bloqueado |
| Posición media | N/D | GSC — bloqueada | 🔴 Bloqueado |
| Performance móvil | 40/100 (2026-05-06) | PageSpeed | 🔴 Crítico |
| Score SEO técnico | 92/100 (2026-05-06) | PageSpeed | ✅ Bueno |
| LCP móvil | 14.8s (2026-05-06) | PageSpeed | 🔴 Crítico |
| CLS móvil | 0.177 (2026-05-06) | PageSpeed | 🟡 Mejorable |
| TBT móvil | 520ms (2026-05-06) | PageSpeed | 🟡 Mejorable |

---

## Keywords BOFU tracking

> Sin datos de posición — GSC bloqueada. Tracking de objetivo basado en keyword research T01.

| Keyword | Vol. est./mes | Posición actual | Target | Estado BOFU |
|---------|--------------|----------------|--------|-------------|
| mejor exchange españa 2026 | 1.500-3.000 | N/D | Top 5 | 🔴 Sin contenido |
| mejores exchanges criptomonedas españa | 2.000-4.000 | N/D | Top 5 | 🔴 Sin contenido |
| criptan opiniones | 1.000-2.000 | N/D | Top 3 | 🔴 Sin contenido |
| criptan vs bit2me | 500-1.000 | N/D | Top 3 | 🔴 Sin contenido |
| criptan es seguro | 500-1.000 | N/D | Top 3 | 🔴 Sin contenido |
| comprar bitcoin seguro españa | 1.000-2.000 | N/D | Top 5 | 🔴 Sin contenido |
| alternativa depósito bancario rentabilidad | 300-600 | N/D | Top 5 | 🔴 Sin contenido |
| ganar intereses criptomonedas españa | 200-500 | N/D | Top 5 | 🔴 Sin contenido |
| criptan earn opiniones | 200-500 | N/D | Top 3 | 🔴 Sin contenido |
| exchange criptomonedas españa regulado | 500-1.000 | N/D | Top 5 | 🔴 Sin contenido |

> **Referencia:** 28 keywords BOFU en 5 clusters — ver `brand/criptan/projects/P01-seo-bofu/T01/keyword-research-bofu.md`

---

## Estado del Proyecto P01-SEO-BOFU

| Tarea | Status | Bloqueo |
|-------|--------|---------|
| T01 — Keyword research BOFU | ✅ Completada | — |
| T02 — Artículo Pillar Page (mejor exchange España) | 🔴 Pendiente | Sin ejecutar |
| T03 — Artículo Criptan opiniones + review | 🔴 Pendiente | Sin ejecutar |
| T04 — 3 artículos adicionales BOFU | 🔴 Pendiente | Sin ejecutar |
| T05 — Presencia en comparadores | 🔴 Pendiente | Requiere acceso cuentas |

**Resumen:** T01 es la única tarea completada. 0 artículos BOFU publicados. Criptan sigue sin aparecer en búsquedas de decisión de compra.

---

## Alertas

### 🔴 CRÍTICO — APIs Google deshabilitadas
- **Qué:** Search Console API y Analytics Data API inactivas en GCP project 871376636741
- **Impacto:** Monitoring SEO ciego. No podemos detectar caídas, oportunidades ni medir tráfico orgánico.
- **Acción:** Alfonso habilitar las 2 APIs en Google Cloud Console (5 min). Ver sección de bloqueo arriba.

### 🔴 CRÍTICO — Performance móvil en 40/100
- **Qué:** Score de rendimiento móvil de criptan.com es 40/100 (umbral "Poor")
- **LCP:** 14.8 segundos en mobile (Google considera >4s como "Poor" — Criptan está 3.7x por encima del umbral crítico)
- **TBT:** 520ms (umbral "Poor" = >600ms, cerca del límite)
- **Impacto:** Core Web Vitals penalizan directamente el ranking en mobile. Con LCP de 14.8s, cualquier artículo BOFU que publiquemos tendrá un handicap de posicionamiento desde el día 1.
- **Causas:** CSS sin usar (+230ms de ahorro posible), JS sin usar (+150ms)
- **Acción:** Limpiar CSS/JS sin usar en WordPress antes de lanzar campaña BOFU.

### 🟡 IMPORTANTE — 0 contenido BOFU publicado (6 semanas desde keyword research)
- T01 se completó el 2026-03-30 (hace 6 semanas). T02-T04 siguen sin ejecutar.
- Cada semana sin contenido BOFU = semana sin posicionarse en queries de decisión.
- Competidores (Rankia, Bit2Me blog, BerserkersFinance) siguen dominando las SERPs objetivo.

---

## Recomendaciones (semana del 11/05)

### 1. 🔧 Habilitar APIs Google (hoy, 5 min, Alfonso)
Habilitar Search Console API + Analytics Data API en GCP project 871376636741. Sin esto, los crons de monitoring son ciegos. Instrucciones: sección "ALERTA CRÍTICA" arriba.

### 2. ✍️ Arrancar T02 — Pillar Page "Mejor exchange España 2026"
Es el artículo de mayor impacto potencial (2.000-4.000 búsquedas/mes). Con T01 completo, Sancho puede ejecutar el artículo directamente. Tiempo estimado de producción: 45-60 min. Publicación en WordPress + schema FAQ.

### 3. 🚀 Arrancar T03 — "Criptan opiniones y review completa 2026"
"Criptan opiniones" tiene 1.000-2.000 búsquedas/mes y Criptan no controla la narrativa (la dominan Rankia y terceros). Urgente dado el CAC alto de Meta Ads — el tráfico orgánico de marca es el mejor complemento. Tiempo estimado: 40-50 min.

---

## PageSpeed — Referencia técnica (2026-05-06)

| Métrica | Mobile | Desktop |
|---------|--------|---------|
| Performance | 40 🔴 | 49 🔴 |
| SEO | 92 ✅ | 92 ✅ |
| Accesibilidad | 84 🟡 | — |
| Best Practices | 96 ✅ | — |
| LCP | 14.8s 🔴 | — |
| CLS | 0.177 🟡 | — |
| TBT | 520ms 🟡 | — |

**Oportunidades de mejora técnica:**
- Reducir CSS sin usar: -230ms potencial
- Reducir JS sin usar: -150ms potencial
- Reducir trabajo en main thread
- Mejorar contraste de color (accesibilidad)

---

<!-- Self-QA: PARTIAL | 2026-05-11 — Datos GSC/GA4 no disponibles por APIs bloqueadas. Report documenta el bloqueo y mantiene tracking de keywords BOFU desde T01. Se recomienda re-ejecutar tras habilitar APIs. -->
