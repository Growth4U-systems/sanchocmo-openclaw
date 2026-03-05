# QA Report — Síntesis Market & Us + OPE Canvas

> **Modo:** Deep QA (15 verificaciones)
> **Target:** `market-and-us/summary.md` + `ope-canvas/current.md`
> **Contexto cruzado:** company-brief, self-intelligence, market-intelligence, competitors, SWOT
> **Fecha:** 2026-03-04

---

## Verified ✅ (8 claims)

| # | Claim | Fuente citada | Verificación independiente | Status |
|---|---|---|---|---|
| 1 | 8.580 empresas tech activas (+22% YoY) | TechFundingNews / StartupsReal | ✅ Confirmado — múltiples fuentes coinciden | ✅ |
| 2 | 484 scale-ups en España | Tech ecosystem reports | ✅ Confirmado | ✅ |
| 3 | H1 2025 inversión superó todo 2024 | GoHub / Dealroom | ✅ Confirmado — €1,95B H1 2025 > €1,9B FY2024 | ✅ |
| 4 | CTR orgánico -47% con AI Overviews (8% vs 15%) | Pew Research, marzo 2025, 69.000 búsquedas | ✅ Confirmado exacto — Pew Research Center julio 2025, publicación del estudio de marzo | ✅ |
| 5 | 77% de usuarios ChatGPT lo usan como buscador | Adobe, julio 2025 | ✅ Confirmado — Adobe survey, 77% de users en EE.UU. | ✅ |
| 6 | Trust Engine pricing 7.000€ one-time | Company brief | ✅ Consistente cross-docs | ✅ |
| 7 | Product Hackers: 6M€ revenue, +110 personas | Deep dive + fuentes públicas | ✅ Consistente con competitor-intelligence | ✅ |
| 8 | Snowball: fundador dividido con Voxel | LinkedIn, web_fetch | ✅ Consistente con competitor deep dive | ✅ |

---

## Discrepancies ❌ (4 hallazgos)

### ❌ D1: Bnext 500K vs 250K — Inconsistencia cross-documento (CRÍTICA)

**Lo que dicen los docs:**
- **Self-intelligence**: "Bnext | 2017-2020 | 0 → **250K** usuarios, CAC €50 → €12.40"
- **Company brief**: "Bnext: 0 → **500K** usuarios activos en <30 meses"
- **Summary**: "Alfonso en fintech (Bnext 0→**500K**...)"
- **OPE Canvas**: "Bnext 0→**500K** usuarios (CAC €50→€12.40)"

**Lo que dice la evidencia pública:**
- Oct 2019 (durante Alfonso como CGO): **300K** active customers [Retail Banker International]
- Jul 2020: 400K+ cardholders
- Ago 2022 (2+ años después de Alfonso): **500K** app users [Bnext whitepaper], pero solo 150K cuentas activas
- Sep 2022: 350K active users

**Problema**: Los 500K son descargas/registros totales de la app, alcanzados en 2022 — **2+ años después de que Alfonso dejara Bnext**. Durante su tenure (2017-2020), Bnext llegó a ~300K active customers. La self-intelligence (250K) es más conservadora pero más honesta. Atribuir 500K al trabajo de Alfonso y vincular el CAC de €12.40 a esa cifra es factualmente incorrecto.

**Fix**: Unificar a "0→300K usuarios activos durante su tenure" o "contribuyó al crecimiento que llevó a 500K+ registros totales" — pero NUNCA "0→500K" con el CAC vinculado, porque el CAC era durante los primeros 250-300K.

---

### ❌ D2: "Primera recomendación en Gemini" — Oversimplificación

**Lo que dice el summary:** "GEO first-mover: primera recomendación en Gemini para 'agencia growth fintech españa'"

**Lo que dice el self-intelligence (GEO test real):**
- Query "agencia growth fintech españa" → Primera ✅
- Query genérica "agencia growth España" → Top 2, **tras Flake Agency** ⚠️

**Problema**: El summary selecciona la query más favorable y la presenta como posición absoluta. Un buyer no siempre busca exactamente "agencia growth fintech españa".

**Fix**: Cambiar a "Top 1-2 en recomendaciones IA para queries growth tech España (primera en queries fintech-específicas)".

---

### ❌ D3: "83% prefieren investigar sin hablar con ventas" — Stat conflada

**Lo que dice el market-intelligence (Parte 4.2):** "83% prefieren ordenar online sin sales rep" [Mezzanine Growth]

**Lo que dice la evidencia real:** El 83% se refiere a "managing orders and accounts online" (e-commerce), NO a "investigar sin hablar con ventas". Los stats reales sobre research sin sales son: 70% prefieren investigar online antes de hablar con vendor [múltiples fuentes], 61% prefieren experiencia rep-free (Gartner, 2025), 75% prefieren experiencia completamente rep-free [otra fuente].

**Problema**: El dato de "83% managing orders online" se ha recontextualizado como "83% research without sales" — son cosas diferentes.

**Fix**: Usar "70% prefieren investigar online antes de contactar un vendor" o "61% prefieren experiencia rep-free (Gartner)" con fuente correcta.

---

### ❌ D4: Fractional CMOs "+35% YoY" — Fuente no verificada independientemente

**Lo que citan los docs:** fractional-csuite.com como fuente del +35% YoY.

**Lo que dice la evidencia:** Roles fractional globales se duplicaron de 60K a 120K (2022-2024) — esto sería ~40-50% CAGR. Para Europa específicamente, adopción pasó de ~20% a ~30% de empresas. El +35% es plausible pero la fuente específica (fractional-csuite.com) no fue verificable independientemente.

**Fix**: Añadir ⚠️ al dato o citar una fuente alternativa verificable (Vendux.org, European Business Magazine).

---

## Unverifiable ⚠️ (3 claims)

| # | Claim | Por qué no se puede verificar |
|---|---|---|
| 1 | "Múltiplo (93 leads → 17 clientes)" como único caso propio | Dato interno de Growth4U — correcto si Alfonso lo confirma, pero no hay fuente pública |
| 2 | OPE Canvas: "100 visitas → 10 calls → 4 propuestas → 1-2 clientes" (funnel mensual) | Benchmarks sin fuente — ¿de dónde salen los conversion rates? |
| 3 | "TheGrowtHacker: portfolio ficticio" | Inferido por el análisis (cases = empresas donde el fundador era empleado), pero no hay confirmación pública de "ficticio" |

---

## Missing Elements 🔍

| # | Qué falta | Impacto | Dónde debería estar |
|---|---|---|---|
| 1 | **DUDAs del OPE Canvas no reflejadas en Summary** — 4 preguntas abiertas (Endgame, Core Values, Geografía LP, Capacidad máxima) que afectan la estrategia pero el summary no las menciona | Alto — el lector del summary asume que todo está resuelto | Summary §Implicación |
| 2 | **Nivel de confianza por sección** — Summary presenta todo con la misma certeza, pero market-intel tiene datos con ⚠️ que se "limpian" en la síntesis | Medio — pierde la señal de dónde los datos son sólidos vs estimados | Summary (nueva sección o inline) |
| 3 | **Referencia al QA previo del market analysis** — existe `qa-log-market.md` pero no se menciona en la síntesis | Bajo — trazabilidad de correcciones | Summary §Documentos de referencia |
| 4 | **Capacity constraint** — OPE Canvas dice equipo de 4 personas pero NO cuantifica máximo de clientes simultáneos. Esto es DUDA pero debería tener al menos una hipótesis | Alto — sin esto no se puede validar el Year/Quarter Picture | OPE Canvas §DUDA |
| 5 | **Pricing sensitivity** — OPE Canvas fija 7K€ pero no justifica vs willingness-to-pay del mercado ni elasticidad | Medio — ¿es 7K€ el precio correcto? ¿Basado en qué? | OPE Canvas §Core Product |

---

## Coherencia Cross-Pilar

| Check | Status |
|---|---|
| Summary ↔ Self-Intelligence | ⚠️ Bnext 500K vs 250K (D1) |
| Summary ↔ Market Intelligence | ⚠️ 83% stat conflada (D3) |
| Summary ↔ Competitor Intelligence | ✅ Consistente |
| Summary ↔ SWOT | ✅ Top 5 ICE coinciden |
| OPE Canvas ↔ Company Brief | ⚠️ Bnext 500K vs 250K (D1) |
| OPE Canvas ↔ Self-Intelligence | ⚠️ GEO oversimplificado (D2) |
| OPE Canvas ↔ SWOT | ✅ Consistent |

---

## Action List (Priorizada)

1. **[Crítico]** Unificar cifra Bnext cross-docs: decidir entre 250K (conservative/honest) o 300K (public record) para la contribución de Alfonso. Actualizar summary, OPE canvas, y company brief.
2. **[Crítico]** Corregir stat 83% en market-intelligence: reemplazar por "61-70% prefieren experiencia rep-free/research online" con fuente Gartner o equivalente.
3. **[Importante]** Matizar claim GEO en summary: "Top 1-2 en recomendaciones IA" en vez de "primera recomendación."
4. **[Importante]** Añadir sección "DUDAs pendientes" al summary que refleje las 4 del OPE Canvas.
5. **[Importante]** Añadir ⚠️ al dato de fractional CMOs +35% YoY o buscar fuente verificable.
6. **[Nice to have]** Documentar fuentes de los conversion rates del funnel mensual en OPE Canvas.
7. **[Nice to have]** Añadir confidence levels al summary (alto/medio/bajo por sección).
8. **[Nice to have]** Incluir referencia a qa-log-market.md en sección de documentos del summary.

---

<!-- QA: DEEP | 2026-03-04 | 15 verificaciones | 8✅ 4❌ 3⚠️ | 5 missing elements | 8 action items -->
