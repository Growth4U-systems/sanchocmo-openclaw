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
