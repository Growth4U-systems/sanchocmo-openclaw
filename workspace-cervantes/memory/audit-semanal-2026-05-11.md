# Auditoría Semanal Tokens — 11 May 2026

_Generada por cron: Weekly Token Audit | 09:01 Madrid_

## Resumen 7 días (May 5–11)

- **Total USD**: $149.17 teóricos
- **Total turns**: 2.190
- **Promedio diario**: $21.31/día
- **Tendencia**: 📈 SUBIENDO +60% vs semana anterior (May 1–4 avg: $13.30/día → $21.31/día)
- **Acumulado mes**: $646.64 (tracker global) | Proyección: ~$1.822/mes

## Datos diarios (May 5–11)

| Fecha   | Total USD | Turns | System USD | System % |
|---------|-----------|-------|------------|----------|
| May 5   | $15.23    | 309   | $1.45      | 9.5%     |
| May 6   | $21.90    | 397   | $1.84      | 8.4%     |
| May 7   | $24.44    | 361   | $3.87      | 15.8%    |
| May 8   | $18.11    | 284   | $2.13      | 11.8%    |
| May 9   | $8.93     | 125   | $3.53      | 39.5%    |
| May 10  | $46.53 ⚠️ | 443   | $1.35      | 2.9%     |
| May 11  | $14.03    | 271   | $13.68     | 97.4%*   |

*May 11 solo hasta 9am, todos crons matutinos (este audit incluido)

## Semana anterior (May 1–4, solo 4 días disponibles)

| Fecha   | Total USD | Turns |
|---------|-----------|-------|
| May 1   | $21.80    | 427   |
| May 2   | $3.62     | 90    |
| May 3   | $6.01     | 138   |
| May 4   | $21.76    | 447   |
| **Avg** | **$13.30/día** | — |

## System % global semana: 18.7% ✅ (< 50%)

## Top 3 días más caros

1. 🔴 **May 10: $46.53** | 443 turns | system 2.9% → 100% actividad Sancho/clientes
2. 🟡 **May 7: $24.44** | 361 turns | system 15.8%
3. 🟡 **May 6: $21.90** | 397 turns | system 8.4%

## Por agente (global mes)

- **Sancho**: ~$315 (dominante — unclassified $273 + system $42)
- **Cervantes**: ~$98 (en system)
- **Escudero**: ~$0.25
- ⚠️ **Atribución por cliente**: todos muestran $0 USD — tokens llegan como "unknown", pipeline de tracking no atribuye costes reales por cliente

## Sesiones pesadas (>100K tokens)

- ⚠️ `Cron: News Monitor — Hulahoop`: **104.213 tokens** → candidata a /compact o reset

## Config check

- ✅ `cacheRetention: "long"` activo (`agents.defaults.models.anthropic/claude-opus-4-6.params.cacheRetention`)
- ✅ `thinkingDefault: adaptive`
- Bootstrap Cervantes: ~32.9 KB ≈ **~8.2K tokens**
- Bootstrap Sancho: ~17.6 KB ≈ **~4.4K tokens** — ambos en rango OK

## Recomendaciones

1. 🔍 **Investigar May 10** ($46.53 — 2.2x avg semanal): revisar sesiones de Sancho ese día, probablemente sesión larga de cliente o arquitectura
2. 📦 **Reducir contexto News Monitor — Hulahoop** (104K): resetear sesión o limitar historial a últimas 24h en el prompt del cron
3. 🏷️ **Fix atribución por cliente**: todos los clientes aparecen con $0 USD — necesario para análisis real de ROI. Investigar por qué tokens llegan como "unknown" en sesiones de cliente

## Nota de entrega

⚠️ Discord no disponible en contexto de cron. Reporte guardado localmente. Pendiente envío manual o fix de Discord en crons.

ℹ️ Plan Max $200/mes — coste fijo. Valores teóricos basados en pricing público Anthropic.
