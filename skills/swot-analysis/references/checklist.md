# SWOT Analysis & TOWS Strategies — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Prerequisites

- [ ] **self-intelligence** at least Lite-done (confirmed strengths/weaknesses)
- [ ] **competitor-intelligence** at least Lite-done (battle cards, vulnerabilities)
- [ ] **market-intelligence** at least Lite-done (trends, regulatory, TAM/SAM)
- [ ] **Missing pillars flagged** al usuario con opciones (proceder baja confianza vs completar)

## Step 1: Evidence Collection

### Strengths (from self-intelligence)
- [ ] **confirmed_strengths** extraídos (multi-source confirmed)
- [ ] **top_pros** de Lens 3 reviews incorporados
- [ ] **Unique assets** que competidores no tienen identificados

### Weaknesses (from self-intelligence)
- [ ] **confirmed_weaknesses** extraídos
- [ ] **top_cons** de Lens 3 reviews incorporados
- [ ] **perception_reality_gaps** documentados
- [ ] **priority_fixes** incluidos

### Opportunities (from competitor + market intel)
- [ ] **Universal claim-reality gaps** de competidores incorporados
- [ ] **Aggregate unmet needs** incluidos
- [ ] **Unused positioning angles** identificados
- [ ] **Unexploited channels** identificados
- [ ] **Market trends (opportunity)** incorporados
- [ ] **Regulatory opportunities** incluidas

### Threats (from competitor + market intel)
- [ ] **Market headwinds** incorporados
- [ ] **Strong competitors** en posiciones dominantes listados
- [ ] **Regulatory constraints** documentados
- [ ] **Market maturity signals** evaluados

## Step 2: SWOT Population

- [ ] **Cada entrada tiene Statement + Evidence Source + Impact** (High/Medium/Low)
- [ ] **Strengths son INTERNOS + CONFIRMADOS** (no autopercepción sin validar)
- [ ] **Weaknesses son INTERNOS + CONFIRMADOS** (backed by evidence)
- [ ] **Opportunities son EXTERNOS** (no capacidades internas)
- [ ] **Threats son EXTERNOS** (no debilidades internas)
- [ ] **Sin duplicados** entre cuadrantes
- [ ] **Sin entries vagas** ("tenemos buen producto" → rechazado)

## Step 3: SWOT Validation

- [ ] **SWOT presentado al usuario** para review
- [ ] **Feedback incorporado** (ítems faltantes, niveles de impacto, cuadrante incorrecto)

## Step 4: TOWS Matrix

- [ ] **SO Strategies** (Strengths × Opportunities): mínimo 2 estrategias
- [ ] **ST Strategies** (Strengths × Threats): mínimo 2 estrategias
- [ ] **WO Strategies** (Weaknesses × Opportunities): mínimo 2 estrategias
- [ ] **WT Strategies** (Weaknesses × Threats): mínimo 2 estrategias
- [ ] **Cada estrategia es**: específica, actionable, conectada a S/W/O/T items, medible
- [ ] **Total 8+ estrategias** (ideal 12-16)

## Step 5: Strategy Prioritization (ICE)

- [ ] **Cada estrategia ICE-scored** (Impact, Confidence, Ease — 1-10 cada uno)
- [ ] **Ranking final** generado por ICE score
- [ ] **Top 3 immediate actions** con pasos concretos + timeline

## Output

- [ ] **Summary generado** (fortaleza #1, debilidad #1, oportunidad #1, amenaza #1, top 3 TOWS)
- [ ] **Lite criteria met**: 4 cuadrantes con evidence + 8 TOWS strategies + top 3

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/swot/swot.current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada SWOT entry tiene fuente** (lens, competitor battle card, market trend)
- [ ] **0 entries sin evidence** — todo rastreable a upstream pillar
- [ ] **Coherencia con brand files** (self-intel, competitor-intel, market-intel)
- [ ] **S/W entries confirmados** por Lens 3 (no solo autopercepción)
- [ ] **Estrategias TOWS son accionables** (convertibles en tarea en 1-2 semanas)
- [ ] **ICE scores justificados** (no arbitrarios)

---

## Flujo de uso

```
1. Verificar prerequisites (upstream pillars)
2. Ejecutar Steps 1-5
3. Al terminar, lee este checklist
4. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — volver a investigar
5. Si hay ❌ → completar antes de entregar
6. Cruzar contra brand files (self-intel, competitor-intel, market-intel)
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
