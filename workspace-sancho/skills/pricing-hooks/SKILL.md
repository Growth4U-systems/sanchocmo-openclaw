---
name: pricing-hooks
description: "Pricing strategy and hooks for client services/products. Use when: defining pricing tiers, psychological hooks, competitive pricing positioning, and value-based pricing for the client. Runs AFTER market + competitors analysis. Produces pricing framework with hooks, tier structure, competitive comparison, and implementation plan. NOT for: general market research (use market-intelligence), brand messaging (use positioning-messaging)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: pricing
  layer: '4'
  depends_on: market, competitors
  updated: '2026-03-01'
context_required:
- brand/{slug}/company-context/current.md
- brand/{slug}/business-model/current.md
- brand/{slug}/budget/current.md
- brand/{slug}/market/current.md
- brand/{slug}/competitors/current.md
- brand/{slug}/positioning/current.md
- brand/{slug}/swot-analysis/current.md
context_writes:
- brand/{slug}/pricing/current.md
user-invocable: true
---

# Pricing Hooks

> Estrategia de precios con hooks psicológicos y posicionamiento competitivo. Precio como herramienta de marketing, no solo como número.

**Input**: Market intel + competitors + positioning + business model + budget
**Output**: Pricing Framework → `brand/{slug}/pricing/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [prompt.md](references/prompt.md) | **SIEMPRE** — prompts detallados | 6 prompts por step |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems de validación |
| [concepts.md](references/concepts.md) | Si necesitas frameworks teóricos | Value metrics, Van Westendorp, hooks psicológicos |

---

## Flujo de Ejecución (6 Steps)

### 1. Auditoría de Precios Actual (~15 min)
- Leer docs del cliente: business-model, budget, company-context
- Documentar pricing actual del cliente (si existe)
- Identificar: modelo actual, márgenes, percepción del cliente
- Si no hay pricing actual → documentar como `🔴 DUDA: No se conoce pricing actual`
- **NO inventar datos** — preguntar al usuario si falta info crítica

### 2. Análisis Competitivo de Precios (~20 min)
- Leer `competitors/current.md` — extraer precios de competidores
- **Usar herramientas reales** (web_search, web_fetch, Apify si es necesario)
- Tabla comparativa: competidor | servicio | precio | modelo | diferenciador
- Identificar: rango de mercado, precio medio, outliers
- **Cada dato con fuente inline** `[Fuente: Nombre](URL)`

### 3. Mapeo de Valor (~15 min)
- Leer positioning + swot-analysis
- Identificar: qué valor percibe el cliente, qué justifica el precio
- Value Metric: ¿por qué cobra? (por sesión, por resultado, por paquete, por mes)
- Mapear assets/diferenciadores → justificación de precio

### 4. Estructura de Tiers/Paquetes (~20 min)
- Proponer estructura de precios (puede ser tiers, paquetes, o pricing único)
- Para cada tier/paquete:
  - Nombre descriptivo (no "Basic/Pro/Enterprise" genérico)
  - Qué incluye (servicios, garantías, extras)
  - Precio recomendado con rango (mínimo-óptimo-máximo)
  - A quién va dirigido (ECP/niche)
  - Justificación del precio vs. valor entregado
- Considerar: ¿pricing público o privado? ¿por qué?

### 5. Hooks Psicológicos de Precio (~15 min)
- Aplicar mínimo 5 hooks relevantes al negocio del cliente:
  - **Anclaje**: precio alto de referencia → oferta parece mejor
  - **Decoy**: opción intermedia que empuja al tier deseado
  - **Precio charm**: €4.997 vs €5.000
  - **Bundling**: paquetes que aumentan ticket medio
  - **Urgencia temporal**: precios early-bird, promociones limitadas
  - **Garantía**: reducir riesgo percibido (satisfacción, resultados)
  - **Fraccionamiento**: "solo X€/día" en lugar de Y€/mes
  - **Social proof pricing**: "el más elegido", "recomendado"
  - **Price-to-value framing**: coste vs. beneficio cuantificado
  - **Loss aversion**: qué pierde si no compra
- Para cada hook: ejemplo concreto aplicado al cliente

### 6. Plan de Implementación (~10 min)
- Cronograma: cuándo y cómo implementar cambios
- Testing: qué A/B tests recomiendas
- Métricas: qué medir para validar (conversión, ticket medio, margen)
- Quick wins vs. cambios estructurales

### 7. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **0 ❌** antes de entregar
- Verificar que todos los precios competitivos tienen fuente
- Verificar coherencia con positioning y business-model
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 8. Guardar con versionado
- Ruta: `brand/{slug}/pricing/current.md`
- Backup + versionado + history.json

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Estructura de tiers | Phase 2 landing pages (pricing page) |
| Hooks psicológicos | copywriting, ad copy, landing pages |
| Precio vs. competencia | sales enablement, objection handling |
| Value metric | brand-voice (cómo comunicar precio) |
| Garantías/ofertas | campaigns, paid-ads copy |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
→ Escribe **"profundizar"** para lanzar deep-research sobre pricing de tu sector.
```

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/pricing/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt: `[CLIENTE: ... | slug: ...]`
2. Si existe `current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/pricing/current.md`
