# learnings.md — Hulahoop

## 2026-04-13 | Performance Analysis — Semana 1 (sin datos)

### Hallazgo clave
Hulahoop lleva 6 días operativa (fundada ~7 abril 2026). No hay métricas configuradas. Esto bloquea TODO el ciclo de medición.

### Estado actual
- **Foundation**: Capa 0 completa, Capa 1 en progreso (market-analysis pending review)
- **Metrics**: NO configuradas — `metrics-setup` pillar = not-started
- **APIs activas**: 0 — Morning Metrics reporta NO_APIS
- **Strategic Plan**: No creado — sin NSM formal definido

### Único dato disponible
PageSpeed (2 snapshots: 7 y 9 abril):
- Performance móvil: 59 → 64 (mejorando)
- SEO móvil/desktop: 92 (bien)
- LCP móvil: 14.4s (mal — objetivo <2.5s)
- CLS móvil: 0 (bien)
- TBT móvil: 138ms → 51ms (mejora notable)

### Acciones recomendadas
1. **Alta prioridad**: Ejecutar `metrics-setup` skill para definir KPIs y conectar fuentes (GA4, GSC, Meta Ads, GHL)
2. **Alta prioridad**: Completar strategic-plan para formalizar NSM = AUM 22,5M€

### Nota para weekly analysis
Este cliente no tendrá datos significativos para analysis hasta que metrics-setup se complete. Revisar semanalmente hasta que haya datos.

---
_Last updated: 2026-04-13 by Sancho (Performance Analysis cron)_

---

## 2026-04-20 | Performance Analysis — Semana 2 (datos parciales PageSpeed)

### Hallazgo clave
**2 semanas consecutivas** sin metrics-setup ejecutado. Hulahoop tiene Foundation progressing (Layer 2 approved, Layer 3 pending review) pero sigues sin métricas de negocio. Única señal cuantificable: PageSpeed.

### Estado PageSpeed (6 snapshots, 13 días — 14-20 abril vs baseline 7-13 abril)
| Métrica | Esta semana | Semana anterior | Cambio |
|---------|------------|-----------------|--------|
| Performance móvil | 57.4 | 62.2 | **-7.7%** ⚠️ |
| Performance desktop | 80.3 | 81.3 | -1.2% |
| LCP móvil | 16.07s | 15.87s | +1.3% → **CRÍTICO** |
| TBT móvil | 81.5ms | 56.0ms | **+45.5%** ⚠️ |
| SEO móvil/desktop | 92 | 92 | ✅ estable |
| CLS móvil | 0 | 0 | ✅ estable |

### Anomalías detectadas
1. **🔴 TBT spike 13-abril**: 801ms (4x threshold). Recovered a 23ms el día siguiente pero avg se mantiene elevado (+51% vs baseline). Root cause unknown — possible JS/plugin issue.
2. **🟡 LCP crítico**: 16s móvil = 6x objetivo Google. Sin mejora en 13 días. Factor #1 limitante del Core Web Vital score.
3. **🟡 Performance móvil degradando**: -7.7% WoW. Probablemente correlated con TBT.

### Oportunidades
- **SEO 92/100**: Excelente — arquitectura sólida. Oportunidad paracontent marketing/editorial authority.

### Blockers (sin cambios vs semana 1)
- `metrics-plan.json` → no existe
- `metrics-data.json` → no existe
- P00-Metrics (metrics-setup) → **not-started** — 2 semanas igual
- Strategic plan → **not-started**
- 0 APIs conectadas

### Acciones para próxima semana
1. **ALTA**: Trigger metrics-setup skill — esto desbloquea TODO
2. **MEDIA**: Investigar TBT spike — revisar cambios en web entre 9-13 abril
3. **ALTA**: Optimizar LCP — prioritario para SEO y Core Web Vitals
4. **MEDIA**: Foundation Layer 3 completion (niche-discovery pending review)

### Nota
NSM = AUM 22.5M€ 2026 (de company-brief). Sin tracking de AUM no se puede evaluar progreso real. Primera semana con datos de negocio será cuando P00-Metrics se ejecute.

---
_Last updated: 2026-04-20 by Sancho (Performance Analysis cron)_

---

## 2026-05-11 | Performance Analysis — Semana 4 / W19 (datos parciales PageSpeed)

### Hallazgo clave: Patrón TBT recurrente crítico
**Nueva señal de W17 (contexto recuperado)**: TBT spike de 1728ms el 22-abril — segundo evento mayor en 3 semanas. Patrón claro: eventos puntales extremos + elevación sostenida entre picos. No es ruido aleatorio — es problema sistémico.

### Estado sistema de colección
**⚠️ NUEVO**: PageSpeed collection interrumpida desde Apr 24. 17 días sin snapshots. El cron de morning-metrics probablemente no está ejecutando para Hulahoop. Sin datos May 2026.

### Estado PageSpeed (último snapshot: Apr 24)
| Métrica | Apr 7 (baseline) | Apr 24 (último) | Cambio |
|---------|-----------------|-----------------|--------|
| Performance móvil | 64 | 57 | **-10.9%** 🔴 |
| LCP móvil | 14.2s | 16.3s | **+14.8%** 🔴 crítico |
| TBT móvil | 51ms | 117ms | **+129%** 🔴 |
| SEO | 92 | 92 | ✅ estable |
| CLS | 0 | 0 | ✅ estable |

### Patrón TBT — línea de tiempo completa
- Apr 7: 51ms (baseline)
- Apr 9: 138ms (primer elevación)
- Apr 13: **801ms** (spike #1 — RED)
- Apr 14: 23ms (recovery)
- Apr 16: 64ms (elevado pero bajo)
- Apr 20: 99ms (subiendo)
- Apr 22: **1728ms** (spike #2 — CRÍTICO, 34x baseline) — fuente: W17 recurring task
- Apr 24: 117ms (post-spike elevado)

**Hipótesis**: Third-party script con comportamiento periódico. Candidatos: GTM tags no optimizados, Facebook Pixel conversions API, live chat widget (Intercom/Tidio), o media player embeds.

### 4 semanas sin métricas de negocio (sin cambio)
- metrics-plan.json: NO EXISTE
- integrations.json: services=[] (0 APIs)
- P00-Metrics: pending (sin avance visible)
- Strategic plan: not-started

### Para próxima semana
1. **P0**: Verificar morning-metrics cron → hulahoop (17 días sin datos)
2. **P0**: Debug TBT — usar Lighthouse CI o WebPageTest para capturar Long Tasks
3. **P0**: Ejecutar metrics-setup — desbloqueante de TODO el ciclo de medición
4. **P1**: Revisar niche-discovery (pending-review desde Apr 16)

---
_Last updated: 2026-05-11 by Sancho (Performance Analysis cron W19)_
