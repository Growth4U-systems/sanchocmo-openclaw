# Foundation Architecture v2.0

## DAG — 6 Layers, 15 Pillars

```
L0 INTAKE:     company-brief (3 skills: company-context + business-model + budget → 1 doc, 1 aprobación)
L1 RESEARCH:   market + competitors + self-intelligence (requires: company-brief)
L2 SYNTHESIS:  summary.md + swot.md + ope-canvas.md (auto-generated, requires: L1 completo)
L3 DISCOVERY:  niche-discovery + existing-customer-data (optional)
L4 ACTIVATION: positioning + pricing + ecp-validation (optional) + messaging-summary
L5 BRAND:      brand-voice + visual-identity
```

- `requires` = bloqueante
- `enriches_with` = opcional
- 8 Discord threads (agrupados por sección, vs 15 antes)

## Output Sections

```
Outputs: company-brief/ | market-and-us/ | go-to-market/ | brand-identity/ | operational/
```

## Pillar Order (4 secciones)

### 🏢 LA EMPRESA (4)
1. company-context
2. business-model
3. budget
4. self-intelligence

### 📊 EL MERCADO (3)
5. market
6. competitors
7. swot-analysis

### 👥 LOS CLIENTES (3)
8. niche-discovery-100x
9. ecp-validation (opcional)
10. existing-customer-data (opcional)

### 🎯 LA MARCA (4)
11. positioning
12. pricing
13. brand-voice
14. visual-identity

Este orden aplica a TODOS los clientes.

## Decisiones de Arquitectura Clave

- **Meeting transcripts + summaries colocados** — `meetings/{slug}/summary.md + transcript.md`. Skills leen summary; transcript bajo demanda.
- **Intelligence log como dedup + discovery** — Skills escriben al log tras procesar. MC visualiza.
- **Síntesis inline** (no skills separadas) — summary.md, ope-canvas.md, messaging-summary.md generadas por orchestrator directamente.
- **OPE Canvas demotido a síntesis** — no es pilar bloqueante, es output de Layer 2.
- **Competitors como lista dinámica** — crece desde Company Brief, Market, Niche Discovery.

## Versionado por Pilar

```
brand/{slug}/{pilar}/{pilar}.current.md + v1.md + v2.md... + history.json + qa-log.md
```

## Flujo Post-Aprobación

Cuando el usuario aprueba un pilar en Discord:
1. Sancho actualiza `brand/{slug}/foundation-state.json` → `"status": "approved"`
2. Sancho ejecuta `python3 scripts/regenerate.py` → MC se actualiza
3. Sancho publica mensaje de celebración: 🎉 + progreso + siguiente paso + comando
4. MC y doc viewer reflejan el cambio inmediatamente
