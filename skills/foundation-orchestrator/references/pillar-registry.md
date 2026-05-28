# Pillar Registry v3.0
<!-- Fuente de verdad para pilares, skills, dependencias y criterios -->
<!-- Alineado con Mission Control threads y Discord threads (foundation-threads v3.0) -->

---

## FAST FOUNDATION (1 skill, 1 thread, ~30 min)

### fast-foundation
**Skill**: `fast-foundation`
**Thread**: `{slug}:fast-foundation`
**Output**: 5 docs lite:
- `brand/{slug}/company-brief/current.md` — Company Brief (identidad + business model + budget)
- `brand/{slug}/market-and-us/self/current.md` — Self Intelligence L1 (autopercepción)
- `brand/{slug}/market-and-us/market/current.md` — Market Intelligence L1 (datos básicos)
- `brand/{slug}/brand-voice/current.md` — Brand Voice Snapshot (quick)
- `brand/{slug}/go-to-market/ecps/current.md` — Niche Discovery básico (ECPs preliminares)
**requires**: — (es el primer paso)
**Skip**: nunca
**Modo URL**: scrape web + sociales → pre-fill → validar → completar gaps
**Modo manual**: 6 preguntas conversacionales (sin URL)
**Done**: Los 5 docs lite generados y validados por el usuario

---

## FULL FOUNDATION — LAYER 1: RESEARCH

### market-analysis
**Skill**: `market-intelligence`
**Thread**: `{slug}:market-analysis`
**Output**: `brand/{slug}/market-and-us/market/current.md`
**requires**: —
**enriches_with**: fast-foundation, competitor-analysis, self-analysis
**Hydration**: si fast-foundation está `approved`, hidrata con su doc lite (market L1). Si no, arranca standalone desde el input del cliente. Fast Foundation **no es prerequisito**.
**Lite done**: Sector + TAM/SAM estimado + tendencias principales
**Deep done**: Lite + regulación + 3+ tendencias + tasa crecimiento + características mercado

### competitor-analysis
**Skill**: `competitor-intelligence`
**Thread**: `{slug}:competitor-analysis`
**Output**:
- `brand/{slug}/market-and-us/competitors/current.md` (roll-up: landscape + lista, generado desde subdirs)
- `brand/{slug}/market-and-us/competitors/{nombre}/current.md` (deep-dive 3-lens, 1 por competidor)
**requires**: —
**enriches_with**: fast-foundation, market-analysis, self-analysis
**Lite done**: Top 3 competidores directos + Lens 1 (qué dicen de sí mismos)
**Deep done**: 3+ directos con 3 lenses + 2+ alternativas indirectas + growth model por competidor

### self-analysis
**Skill**: `self-intelligence`
**Thread**: `{slug}:self-analysis`
**Output**: `brand/{slug}/market-and-us/self/current.md`
**requires**: —
**enriches_with**: fast-foundation, market-analysis, competitor-analysis
**Hydration**: si fast-foundation está `approved`, hidrata con su doc lite (Self L1) y añade Lens 2 + Lens 3. Si no, ejecuta las 3 lenses standalone. Fast Foundation **no es prerequisito**.
**Skip**: si es marca nueva sin track record
**Lite done**: Lens 1 (qué decimos) para homepage + 2 redes sociales top
**Deep done**: 3 lentes completas: homepage, 2 redes sociales, 2 plataformas de reviews

---

## FULL FOUNDATION — LAYER 2: SYNTHESIS

### market-synthesis
**Skill**: `market-synthesis`
**Thread**: `{slug}:market-synthesis`
**Output**:
- `brand/{slug}/market-and-us/swot/current.md` — SWOT + TOWS + ICE
- `brand/{slug}/market-and-us/summary/current.md` — Market Summary (1-2 pág)
- `brand/{slug}/market-and-us/ope-canvas/current.md` — OPE Canvas (14 secciones)
- `brand/{slug}/presentations/foundation-report.html` — Presentación HTML
**requires**: market-analysis, competitor-analysis, self-analysis
**Skip**: nunca
**Done**: 4 outputs generados, SWOT validado por usuario, presentación renderizable

---

## FULL FOUNDATION — LAYER 3: CUSTOMER DISCOVERY

### niche-discovery
**Skill**: `niche-discovery-100x`
**Thread**: `{slug}:niche-discovery`
**Output**: `brand/{slug}/go-to-market/ecps/current.md` (JTBD integrado por segmento)
**requires**: market-synthesis (swot)
**enriches_with**: existing-customer-data
**Hydration**: lee doc lite de Fast Foundation (ECPs básicos) y valida con research
**Lite done**: 50+ problemas, Triple Filter, 3-7 ECPs scored
**Deep done**: 100+ problemas, 5+ tipos fuente, TAM/SAM por ECP, datos clientes integrados

### existing-customer-data (OPCIONAL)
**Skill**: `existing-customer-data`
**Thread**: `{slug}:existing-customer-data` (solo si se activa)
**Output**: `brand/{slug}/go-to-market/existing-customer-data/current.md`
**requires**: —
**enriches_with**: fast-foundation, niche-discovery
**Skip**: si pre-launch sin clientes

---

## FULL FOUNDATION — LAYER 4: ACTIVATION

### positioning
**Skill**: `positioning-messaging`
**Thread**: `{slug}:positioning`
**Output**: `brand/{slug}/go-to-market/positioning/{ecp-slug}/current.md` (1 por ECP)
**requires**: niche-discovery
**Lite done**: Messaging básico para top ECP
**Deep done**: Por ECP: value criteria ranked, competitor scoring, 3+ assets con proof, messaging framework
**Nota**: genera messaging-summary.md automáticamente como subproducto

### pricing
**Skill**: `pricing-strategy`
**Thread**: `{slug}:pricing`
**Output**: `brand/{slug}/go-to-market/pricing/current.md`
**requires**: niche-discovery, positioning
**Nota**: En tasks.json pricing depende explícitamente de positioning (secuencial). El registry marca positioning como enriches_with pero en la práctica siempre se ejecuta después.
**Skip**: si pricing es fijo/no negociable
**Lite done**: Pricing actual documentado + 1 hook por top ECP
**Deep done**: Pricing competidores comparado + estrategia + 3+ hooks por ECP con proof

### ecp-validation (OPCIONAL)
**Skill**: `ecp-validation`
**Thread**: `{slug}:ecp-validation` (solo si se activa)
**requires**: niche-discovery
**Skip**: si timeline muy corto

---

## FULL FOUNDATION — LAYER 5: BRAND IDENTITY

### brand-voice
**Skill**: `brand-voice`
**Thread**: `{slug}:brand-voice`
**Output**: `brand/{slug}/brand-voice/current.md`
**requires**: positioning
**Hydration**: lee doc lite de Fast Foundation (Brand Voice Snapshot) y genera Full Guide
**Done**: Voice guide completa + AI Brand Kit + Per-ECP/Channel adaptation

### visual-identity
**Skill**: `visual-identity`
**Thread**: `{slug}:visual-identity`
**Output**: `brand/{slug}/brand-identity/visual-identity/current.md`
**requires**: brand-voice
**Done**: Sistema visual completo: paleta, tipografía, guidelines de uso

---

## MÉTRICAS Y CONEXIONES (Post-Foundation)

### metrics-setup
**Skill**: `metrics-setup`
**Thread**: `{slug}:metrics-setup`
**Output**: `brand/{slug}/go-to-market/metrics-plan/current.md` + `metrics-plan.json` + `integrations.json`
**requires**: positioning, pricing (para determinar arquetipo y funnel)
**Done**: Plan de métricas + integraciones conectadas + dashboard generado

---

## STRATEGIC PLAN (Post-Métricas)

### strategic-plan
**Skill**: `strategic-plan`
**Thread**: `{slug}:strategic-plan`
**Output**: `brand/{slug}/strategic-plan/current.md`
**requires**: Full Foundation completada + metrics-setup
**Done**: Roadmap con estrategias GTM seleccionadas, proyectos definidos, fases y KPIs

---

## Quick Reference: Flujo de Desbloqueo

```
fast-foundation
  ├── market-analysis ─┐
  ├── competitor-analysis ├── market-synthesis
  └── self-analysis ───┘       │
                               └── niche-discovery
                                     ├── positioning ── brand-voice ── visual-identity
                                     └── pricing
                                              └── metrics-setup ── strategic-plan
```

## Quick Reference: Impacto de Desbloqueo

| Pilar | Desbloquea | Downstream |
|-------|-----------|------------|
| fast-foundation | Todo Layer 1+ | 11+ |
| market-analysis | market-synthesis → discovery → activation → brand | 8+ |
| competitor-analysis | market-synthesis → discovery → activation → brand | 8+ |
| self-analysis | market-synthesis → discovery → activation → brand | 8+ |
| market-synthesis | niche-discovery → activation → brand | 6+ |
| niche-discovery | positioning + pricing + ecp-validation + brand | 5+ |
| positioning | brand-voice + visual-identity + messaging-summary | 3 |
| pricing | metrics-setup | 2 |
| metrics-setup | strategic-plan | 1 |
