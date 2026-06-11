# calc-creator-core

Motor de la calc de **Partnerships** (SAN-75). Paquete **TS puro**: sin DOM, sin Next, sin DB, sin side-effects — importable desde endpoints, skills, workers y el MCP server.

- **Pasada A (Ola 0):** quality score 0-100 + config sembrada.
- **Pasada B (Ola 2, esta):** break-even + tool MCP `yalc_breakeven`.

```ts
import {
  computeBreakEven,
  computeQualityScore,
  DEFAULT_CREATOR_MODEL_CONFIG,
  isBelowQualificationThreshold,
  SEED_CREATORS,
} from "@/lib/calc-creator-core";
```

> La tool MCP vive en el entrypoint separado `@/lib/calc-creator-core/mcp-tool`
> (importa zod + MCP SDK); el index se mantiene puro para los consumidores de UI/workers.

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
- **`breakEven`** (espejo del `<script>` de drawer-partner): alcance 30%/post · CTR por formato (reel 1.2 / post 0.9 / story 0.6 / video 1.4 / carrusel 1.0, en %) · funnel 8/60/70 · CAC objetivo 80€ · multiplicadores ×1/1.5/2/3 · veredicto verde ≥1 / ámbar ≥0.6. *(La semilla provisional `clickRatePct: 15` de la pasada A se retiró: el mockup final modela reach × CTR.)*

## Seeds (`SEED_CREATORS`)

Los 7 creators canónicos del mockup `contactos-lista.html` (+2 descartados), con señales calibradas: el motor reproduce **exactamente** la columna quality del mockup (91, 88, 87, 82, 79, 74, 58, 52, 31) y el desglose del drawer de @finanzasconlucia (92/88/95/84/76 → 87). Sirven para sembrar la UI (SAN-78) antes del discovery real.

## Break-even (negociación: cuánto debe producir para salir rentable)

```ts
const result = computeBreakEven(deal, funnel /*, config? */);
```

Le da la vuelta a la calc: no predice cuánto traerá, calcula **cuántas first_tx necesita** el deal para salir a tu CAC objetivo, y si son **alcanzables** dada su audiencia. Espejo EXACTO del `<script>` de `drawer-partner.html` (spec de comportamiento).

**Input — `BreakEvenDeal`** (el deal editable de la calc; clamps del mockup: posts ≥1 · fee ≥0 · CAC ≥1 · CPA ≥0):

| Campo | Default | Notas |
|---|---|---|
| `posts`, `format` | — / `"reel"` | CTR por formato configurable; alias aceptados (`vídeo`, `video largo`, `carousel`) — desconocido lanza `TypeError`. |
| `feeEur` | — | Precio total; `€/post` derivado en el eco (`deal.perPostEur`). |
| `structure`, `variableCpaEur` | `"fijo"` / — | `"mixto"` = fijo + CPA variable. |
| `targetCacEur` | 80 (config) | En producción vendrá de Metrics. |
| `incentiveMultiplier` | 1 | Canónicos ×1/×1.5/×2/×3; SOLO empuja el lado alcanzable. |

**Input — `BreakEvenFunnel`**: `followers` (requerido), `engagementRatePct`, `erBenchmarkPct` y overrides de tasas (`reachRatePct`, `clickToSignupPct`, `signupToKycPct`, `kycToFirstTxPct`). Ausencias → neutro + `missingSignals` (nunca NaN).

**Fórmulas (decisión cerrada):**

- Solo fijo: `necesarias = ceil(fee / CAC_objetivo)`.
- Fijo+variable: `necesarias = ceil(fee / (CAC_objetivo − CPA_variable))`; **CPA ≥ CAC → estructura rota** (∞ necesarias, INVIABLE, sin contraoferta).
- Alcanzable: `followers × alcance 30%/post × posts × CTR(formato) × ajuste ER × funnel(8% × 60% × 70%) × multiplicador`.
- Veredicto sobre `ratio = alcanzable / necesarias` (la necesaria YA redondeada, como el mockup): verde ≥1 · ámbar ≥0.6 · rojo <0.6.
- Contraoferta: `floor(alcanzable × (CAC − CPA_var) / 100) × 100` (a la centena).

**Output — `BreakEvenResult`** (todo lo que pinta la calc del drawer): `necesarias`, `alcanzableBase`, `alcanzable`, `ratio`, `veredicto`/`veredictoLabel`/`veredictoColor`, `frase`, `contraofertaEur`+`contraofertaNota`, `formulaNecesarias`, `modelo` (línea funnel-mini) y `funnel[]` (desglose paso a paso audience→reach→clicks→signups→KYC→first_tx→incentivo, con `value`/`rounded`/`detail` por fila).

**Paridad de oro** (test): @finanzasconlucia 142K · ER 4.8 · 3 reels · 3.500€ · CAC 80 · funnel 8/60/70 → **necesita 44 · alcanzable ~52 · VIABLE · contraoferta 4.100€**.

**Ajustes documentados respecto al mockup:**

- El mockup fija el benchmark ER del nicho en 4.8 (= ER de Lucía → ajuste ×1,00). El motor acepta `erBenchmarkPct` explícito; sin él cae al benchmark del tier de la config (Mid 4.0 → ajuste ×1,20 para Lucía).
- `fee 0` → necesarias 0 ⇒ ratio ∞ ⇒ viable (el mockup produce `Infinity` o `NaN` según el caso — artefacto JS normalizado aquí).
- La calc HTML original de `OUTPUTS/g4u-tools` **no existe en disco** (directorio ausente): el test de paridad es el mockup drawer-partner, que es la spec viva.

## Paridad UI = chat = MCP (consumidores)

Este paquete es la única fuente de la lógica; las tres superficies la llaman vía el mismo endpoint:

- **SAN-77**: `/api/qualify` (proxy Sancho→Yalc) llama `computeQualityScore` y persiste `total` + `components` en el Lead; expone la tool MCP `yalc_qualify_lead` en `src/lib/mcp/server.ts`.
- **SAN-79**: qualify-enrich del discovery runner construye `CreatorMetrics` (ScrapeCreators + ad-library) y puntúa con esto.
- **SAN-78**: drawer pinta `components[]` (quality) y `BreakEvenResult` (calc) tal cual.
- **SAN-80**: negotiation-assist (chat) llama `computeBreakEven` sobre cada precio del Inbox.
- **MCP `yalc_breakeven`** (esta rama): registrador exportado en `./mcp-tool.ts` y **registrado en `src/lib/mcp/server.ts`** con scope `yalc:read`. Recibe deal+funnel explícitos **o** `leadId` (lee `followers`/`engagementRate` vía `GET /api/leads` de Yalc — requiere el PR de Yalc de SAN-77 desplegado; hasta entonces, pasar las métricas explícitas). Si otra rama del stack (SAN-80) necesita re-registrarla sobre el server de SAN-77, es una línea: `registerYalcBreakevenTool(server, { assertAccess, run, jsonResult, fetchLeadMetrics })`.

## Tests

```bash
npm run test:calc   # solo este paquete
npm run test:lib    # toda la suite de src/lib
```

- **Quality score**: paridad drawer/mockup (totales exactos + ranking relativo de los 9 seeds), límites de tier, umbrales del componente ER, sin ad-library, conflicto activo, ER 0, tier desconocido, métricas vacías, clamps y pesos personalizados/degenerados.
- **Break-even**: paridad de oro con el mockup (44 / ~52 / VIABLE / 4.100€ + textos espejo + desglose del funnel), solo fijo vs fijo+variable, multiplicadores ×1/×1.5/×2/×3, veredictos en los 3 colores, edges (CPA ≥ CAC, fee 0, ER 0, señales ausentes, formatos/clamps/overrides) y la tool `yalc_breakeven` (oro vía wrapper, leadId con stub, overrides explícitos, errores explicativos).
