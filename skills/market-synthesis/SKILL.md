---
name: market-synthesis
description: "Síntesis estratégica completa: SWOT+TOWS con ICE prioritization, Market Summary, OPE Canvas, y Presentación HTML. Ejecutar después de que market-intelligence, competitor-intelligence y self-intelligence estén aprobados. Produce 4 outputs en 1 thread: swot/swot-current.md, summary/summary-current.md, ope-canvas/ope-canvas-current.md, y presentations/foundation-report.html. Absorbe: swot-analysis + orchestrator inline synthesis + frontend-slides (presentación)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Foundation
  pillar: market-synthesis
  layer: '2'
  depends_on: market-intelligence, competitor-intelligence, self-intelligence
  updated: '2026-03-27'
  changes: v1.0 — Merge de swot-analysis + orchestrator synthesis + presentación.
context_required:
- brand/{slug}/market-and-us/self/self-current.md
- brand/{slug}/market-and-us/competitors/competitors-current.md
- brand/{slug}/market-and-us/market/market-current.md
- brand/{slug}/company-brief/company-brief-current.md
context_writes:
- brand/{slug}/market-and-us/swot/swot-current.md
- brand/{slug}/market-and-us/summary/summary-current.md
- brand/{slug}/market-and-us/ope-canvas/ope-canvas-current.md
- brand/{slug}/presentations/foundation-report.html
---

# Market Synthesis — SWOT, Summary, OPE Canvas & Presentación

> Sintetiza toda la inteligencia de mercado en 4 entregables: SWOT estratégico, resumen ejecutivo, canvas de visión, y presentación para el cliente.

**Input**: self-intelligence + competitor-intelligence + market-intelligence + company-brief
**Output**: 4 documentos + 1 presentación HTML
**Thread**: `{slug}:market-synthesis`

---

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [swot-prompt.md](references/swot-prompt.md) | **SIEMPRE** — guía del SWOT | CoT prompt completo para SWOT+TOWS |
| [swot-concepts.md](references/swot-concepts.md) | Si necesitas reglas SWOT/TOWS/ICE | Definiciones, quality bar, edge cases |
| [swot-schema.md](references/swot-schema.md) | Si necesitas schema de campos | Estructura de datos SWOT |
| [ope-canvas-prompt.md](references/ope-canvas-prompt.md) | Para las 14 secciones del canvas | Instrucciones por sección |
| `_system/presentation-summary-protocol.md` | Para generar Presentation Summary | Formato de slides |

---

## Flujo de Ejecución (4 fases secuenciales)

### Fase 1: SWOT + TOWS (~2h)

#### 1.0 Context Hydration
- Leer TODOS los docs en `context_required`
- Pre-rellenar campos según hydration map
- Presentar datos heredados al usuario

#### 1.1 Verificar Prerequisites
- market-intelligence: `approved` ✅
- competitor-intelligence: `approved` ✅
- self-intelligence: `approved` ✅
- Si falta alguno: "No puedo construir un SWOT robusto sin [pilar]. ¿Procedo con baja confianza?"

#### 1.2 Evidence Collection
Extraer datos confirmados de cada fuente:
- **De self-intelligence**: confirmed_strengths, confirmed_weaknesses, top_pros (Lens 3), top_cons (Lens 3), perception_reality_gaps
- **De competitor-intelligence**: vulnerabilities, unmet_needs, unused_positioning_angles, unexploited_channels
- **De market-intelligence**: trends, TAM, regulatory factors, adjacent_markets

#### 1.3 SWOT Population
Cada entrada necesita:
- **Statement**: específico, no vago
- **Evidence source**: qué lens/pilar/dato
- **Impact level**: High / Medium / Low

Reglas:
- **Strengths**: INTERNAL + CONFIRMED por Lens 3 (clientes). No solo claims de la empresa.
- **Weaknesses**: INTERNAL + con EVIDENCIA (reviews malas, gaps, métricas fallidas). No hipotéticas.
- **Opportunities**: EXTERNAL. Factores de mercado/competencia explotables.
- **Threats**: EXTERNAL. Factores de mercado/competencia que nos ponen en riesgo.
- 5-7 ítems por cuadrante. Top 5-7 por impacto si hay más.

#### 1.4 SWOT Validation
Presentar al usuario los 4 cuadrantes. Incorporar feedback.
- Usuario siempre gana en S/W (interno — ellos saben más).
- Para O/T (externo): verificar contra evidencia si el usuario contradice.

#### 1.5 TOWS Matrix
Cruzar cuadrantes:
- **SO (Ofensivo)**: ¿Cómo usar [S] para capturar [O]?
- **ST (Defensivo)**: ¿Cómo usar [S] para neutralizar [T]?
- **WO (Transformador)**: ¿Cómo arreglar [W] para desbloquear [O]?
- **WT (Supervivencia)**: ¿Cómo reducir [W] para evitar [T]?

Mínimo 2 por cuadrante (8 total). Ideal 3-4 por cuadrante (12-16).

#### 1.6 ICE Prioritization
Cada estrategia TOWS recibe:
- Impact (1-10): ¿Cuánto mueve la aguja?
- Confidence (1-10): ¿Qué tan seguros estamos?
- Ease (1-10): ¿Qué tan fácil de ejecutar?
- ICE Score = (I + C + E) / 3

Ranking final → top 3 acciones inmediatas.

#### 1.7 Guardar SWOT
Ruta: `brand/{slug}/market-and-us/swot/swot-current.md`
Incluir `## Presentation Summary` al final (ver protocolo).

---

### Fase 2: Market Summary (~15 min)

Síntesis ejecutiva de 1-2 páginas. Leer:
- `brand/{slug}/market-and-us/market/market-current.md`
- `brand/{slug}/market-and-us/competitors/competitors-current.md` (roll-up)
- `brand/{slug}/market-and-us/self/self-current.md`
- `brand/{slug}/market-and-us/swot/swot-current.md` (recién generado)

Formato:
```markdown
# Market Summary — [Cliente]
<!-- Generated by market-synthesis -->

## Posición en el Mercado
[Resumen de dónde está la empresa respecto al mercado y competidores]

## Ventajas Competitivas
[Top 3-5 fortalezas confirmadas vs competencia]

## Gaps Principales
[Top 3-5 debilidades o ausencias vs mercado]

## Oportunidades Prioritarias
[Top 3 oportunidades del SWOT con evidencia]

## Riesgos a Gestionar
[Top 3 amenazas con plan de mitigación]

## Siguiente Paso
[Qué hacer con esta información — generalmente Niche Discovery o Positioning]
```

Ruta: `brand/{slug}/market-and-us/summary/summary-current.md`

---

### Fase 3: OPE Canvas (~20 min)

One-Page Endgame — síntesis estratégica en 14 secciones.

Leer todo lo anterior + company-brief. Para cada sección:
- Si el dato existe en algún doc → extraer y sintetizar
- Si no existe → marcar como `🔴 DUDA`
- NUNCA inventar datos

**14 Secciones del OPE Canvas:**
1. **Obvious Choice** — ¿Por qué elegirnos a nosotros?
2. **ICP** — Perfil de cliente ideal (de ECPs si existen, o de company-brief)
3. **Core Problem** — El dolor #1 que resolvemos
4. **Core Product** — Producto/servicio principal
5. **Geography** — Mercados geográficos actuales y expansión
6. **Channels** — Canales de adquisición actuales + potenciales
7. **Moats** — Ventajas competitivas sostenibles
8. **Endgame** — Visión a 3-5 años
9. **Core Values** — Valores que guían decisiones
10. **Core Capabilities** — Qué sabemos hacer mejor que nadie
11. **Strategy Choice** — Estrategia elegida (de TOWS top)
12. **Year Picture** — Objetivo a 12 meses
13. **Quarter Picture** — Objetivo a 90 días
14. **Monthly Picture** — Acciones de este mes

Presentar al usuario. Resolver DUDAs en conversación.

Ruta: `brand/{slug}/market-and-us/ope-canvas/ope-canvas-current.md`
Incluir `## Presentation Summary` al final.

---

### Fase 4: Presentación HTML (~10 min)

Generar presentación con frontend-slides:

1. Leer `## Presentation Summary` de swot/swot-current.md y ope-canvas/ope-canvas-current.md
2. Leer visual identity del cliente (`brand-identity/visual-identity/visual-identity-current.md`) si existe → extraer colores
3. Si no hay visual identity → usar estilo base Electric Studio
4. Combinar slides de ambos docs en 1 presentación:
   - Slides contexto (quién es la empresa)
   - Slides SWOT (4 cuadrantes)
   - Slides estrategias (top 3 TOWS)
   - Slides OPE Canvas (visión)
   - Slide siguiente paso
5. Generar HTML con viewport fitting (100vh por slide, clamp() para fonts)
6. Guardar en `brand/{slug}/presentations/foundation-report.html`

**Invocar frontend-slides** con:
- Estilo: Electric Studio (o custom si hay visual identity)
- Fuente: Presentation Summary blocks
- Output: single HTML file, zero dependencies

---

## Self-QA (OBLIGATORIO antes de entregar)

Para cada output:
- [ ] Cada claim del SWOT tiene evidence source citada
- [ ] 0 datos inventados — todo rastreable a docs upstream
- [ ] TOWS: mínimo 8 estrategias (2 por cuadrante)
- [ ] ICE scoring completo para todas las estrategias
- [ ] Top 3 acciones con first_step concreto
- [ ] Summary: coherente con SWOT
- [ ] OPE Canvas: 0 secciones vacías sin justificación
- [ ] Presentation Summary incluido en swot y ope-canvas docs
- [ ] Presentación HTML renderiza correctamente

Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

---

## Almacenamiento

```
brand/{slug}/market-and-us/
├── swot/
│   ├── swot-current.md      ← SWOT + TOWS + ICE + Presentation Summary
│   ├── v1.md
│   └── history.json
├── summary/
│   ├── summary-current.md      ← Market Summary (1-2 pág)
│   └── history.json
├── ope-canvas/
│   ├── ope-canvas-current.md      ← OPE Canvas (14 secciones) + Presentation Summary
│   └── history.json
brand/{slug}/presentations/
└── foundation-report.html  ← Presentación HTML
```

---

## Cross-Pillar Data Flow

```
INPUTS:
  market-intelligence    → O/T del SWOT, datos de mercado
  competitor-intelligence → O/T del SWOT, vulnerabilidades
  self-intelligence      → S/W del SWOT, assets, gaps
  company-brief          → contexto empresa para OPE Canvas

OUTPUTS alimentan:
  niche-discovery-100x  ← SWOT quadrants (Triple Filter)
  positioning-messaging  ← strengths confirmadas, estrategias SO
  brand-voice           ← evidence-backed strengths (qué comunicar)
  strategic-plan        ← top 3 estrategias ICE, OPE Canvas
  pricing-strategy      ← competitive position, value perception
```
