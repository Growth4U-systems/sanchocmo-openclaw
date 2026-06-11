# calc-creator-core

Motor de la calc de **Partnerships** (SAN-75). Paquete **TS puro**: sin DOM, sin Next, sin DB, sin side-effects — importable desde endpoints, skills, workers y el MCP server.

- **Pasada A (esta, Ola 0):** quality score 0-100 + config sembrada.
- **Pasada B (SAN-75b, Ola 2 — NO construida):** break-even. La estructura ya la acoge (ver abajo).

```ts
import {
  computeQualityScore,
  DEFAULT_CREATOR_MODEL_CONFIG,
  isBelowQualificationThreshold,
  SEED_CREATORS,
} from "@/lib/calc-creator-core";
```

## Quality score (discovery: solo calidad, sin precio, para ELEGIR)

```ts
const result = computeQualityScore(metrics /*, config? */);
```

**Input — `CreatorMetrics`** (todo opcional; señal ausente → neutro 50 + flag, nunca NaN):

| Campo | Fuente prevista | Alimenta |
|---|---|---|
| `followers`, `engagementRatePct` | ScrapeCreators (SAN-79) | ER vs tier (tier se deriva de la config) |
| `signals.fakeFollowersPct`, `signals.suspiciousGrowthSpikes` | proxy ratio comentarios/likes + curva de crecimiento | Autenticidad |
| `signals.verticalMatchShare` (0-1), `signals.adLibraryChecked`, `signals.competitorPromos[]`, `signals.activeConflict` | clasificación de contenido + ad-library | Sector fit & track record |
| `signals.spanishAudiencePct`, `signals.cetAlignmentPct` | proxy idioma de comentarios + horarios | Audiencia ES |
| `signals.postsPerWeek`, `signals.longGapsLast6Months` | cadencia del perfil | Consistencia |

**Output — `QualityScoreResult`** (lo que pinta el drawer de SAN-78):

```ts
{
  total: 87,                 // 0-100 entero
  band: "high",              // high ≥85 · medium ≥70 · low (paridad qClass lista)
  tier: "mid", tierLabel: "Mid", erBenchmarkPct: 4.0,
  components: [              // desglose, una fila por componente
    { key: "erVsTier", label: "ER vs tier", score: 92, weight: 0.2, note: "ER 4.8% frente a benchmark 4% del tier Mid…", missingData: false },
    // authenticity · sectorFit · audienceEs · consistency
  ],
  missingSignals: []         // p.ej. ["adLibrary"] si no se consultó
}
```

**Componentes y reglas (pesos default 0.2 cada uno, configurables y normalizados):**

| Componente | Regla |
|---|---|
| ⚡ ER vs tier | ratio ER/benchmark del tier: 75 en el benchmark, +85/unidad por encima (cap 100), lineal a 0 por debajo. ER 0 → 0 (señal real). |
| 🛡️ Autenticidad | `100 − 2×fake%` − 15 si picos sospechosos. |
| 🎯 Sector fit & track record | `match×70` + repeat de competidores (≥2 promos misma marca, ad-library = *revealed preference*) +25 · 1 promo +12 · **conflicto activo −30**. Sin ad-library → sin bonus + señal ausente. |
| 🇪🇸 Audiencia ES | `0.7×idioma% + 0.3×alineación CET`. |
| 📆 Consistencia | `min(90, posts/semana×30) − 7×parones(10+ días/6 meses)`. |

**Triaje (lo aplica SAN-77, no este paquete):** el score es información, no decisión. `config.qualification = { defaultMode: "hybrid", threshold: 40 }` → en auto/hybrid, `isBelowQualificationThreshold(total)` ⇒ `Disqualified` automático con nota "auto" (reversible).

## Config sembrada (`DEFAULT_CREATOR_MODEL_CONFIG`)

Espejo de `settings.html` (hardcode v1 — **SAN-76** la hará editable; todos los tipos exportados):

- **Tiers** (límite superior exclusivo): Nano <25K · Micro 25-100K · Mid 100-250K · Macro >250K, con ER benchmark 8.0 / 5.5 / 4.0 / 2.5.
- **Verticals**: finanzas personales · inversión · ahorro · fintech. **Formats**: reel · post · story · video largo · carrusel.
- **`breakEven`** (semillas Ola 2): CAC objetivo 80€ · click 15% · funnel 8/60/70 · multiplicadores ×1/1.5/2/3 · veredicto verde ≥1 / ámbar ≥0.6.

## Seeds (`SEED_CREATORS`)

Los 7 creators canónicos del mockup `contactos-lista.html` (+2 descartados), con señales calibradas: el motor reproduce **exactamente** la columna quality del mockup (91, 88, 87, 82, 79, 74, 58, 52, 31) y el desglose del drawer de @finanzasconlucia (92/88/95/84/76 → 87). Sirven para sembrar la UI (SAN-78) antes del discovery real.

## Break-even (SAN-75b · Ola 2 — pendiente)

Vivirá en `./break-even.ts` y se exportará desde `index.ts`. Contrato previsto (issue SAN-75):

- Solo fijo: `necesita ≥ fee / CAC_objetivo` · Fijo+variable: `necesita ≥ fee / (CAC_objetivo − CPA_variable)`.
- Multiplicador de incentivo ×1/1.5/2/3 del lado de lo **alcanzable** (audiencia engaged × click × funnel).
- Deal editable (nº posts × formato, precio total/€·post) y veredicto verde/ámbar/rojo vs calidad/alcance.
- Sin rate-card de mercado: ancla = retorno + calidad + histórico propio.

## Paridad UI = chat = MCP (consumidores)

Este paquete es la única fuente de la lógica; las tres superficies la llaman vía el mismo endpoint:

- **SAN-77**: `/api/qualify` (proxy Sancho→Yalc) llama `computeQualityScore` y persiste `total` + `components` en el Lead; expone la tool MCP `yalc_qualify_lead` en `src/lib/mcp/server.ts`.
- **SAN-79**: qualify-enrich del discovery runner construye `CreatorMetrics` (ScrapeCreators + ad-library) y puntúa con esto.
- **SAN-78**: drawer pinta `components[]` tal cual (score + note por fila).
- **SAN-75b**: añadirá `yalc_breakeven` junto al motor.

## Tests

```bash
npm run test:calc   # solo este paquete
npm run test:lib    # toda la suite de src/lib
```

Cubren: paridad drawer/mockup (totales exactos + ranking relativo de los 9 seeds), límites de tier, umbrales del componente ER, sin ad-library, conflicto activo, ER 0, tier desconocido, métricas vacías, clamps y pesos personalizados/degenerados.
