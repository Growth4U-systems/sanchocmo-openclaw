---
name: existing-customer-data
description: "Analyze existing customer/CRM data: RFM segmentation, behavioral clustering, churn patterns, LTV analysis, upgrade patterns. OPTIONAL pillar — skip if pre-launch, no CRM access, or <50 customers. Use when: client has >50 customers with CRM data available and wants data-driven ICP refinement, churn reduction, or segment optimization. Produces Champions profile, RFM segments, churn patterns, LTV by segment, and actionable recommendations for ICP/positioning/content. NOT for: pre-launch companies, assumption-based ICP (use niche-discovery-100x), or general market research (use market-intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: '1'
  pillar: '7'
  optional: true
  skip_if: pre-launch OR no CRM access OR < 50 customers
  updated: '2026-02-27'
  changes: v2 — Restructured per skill-creator principles. SKILL.md lean (~110 lines). References created.
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/ecps.md
context_writes:
- brand/{slug}/go-to-market/existing-customer-data.md
---

# Existing Customer Data — Customer Intelligence (OPTIONAL)

> **OPTIONAL** — Skip if pre-launch or no CRM. Analiza customer data para identificar best customers, segments, churn patterns, y upgrade triggers.

**Input**: CRM export / API / manual summary (>50 customers)
**Output**: Customer intelligence → `brand/{slug}/customer-data/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad | Template de output completo |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Ítems de verificación |
| [concepts.md](references/concepts.md) | Si necesitas RFM, clustering, churn methodology | Métodos, skip conditions, edge cases |
| [schema.md](references/schema.md) | Si necesitas el schema de campos | Estructura de datos |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 1. Check Prerequisites
- Customer count > 50, CRM access, minimum fields (email, signup, plan, MRR)
- Si NO se cumplen → mark as `skipped`, proceed without this pillar

### 2. Obtain Data
- **Option A**: CRM Export (CSV) — user provides
- **Option B**: CRM API (HubSpot/Salesforce/Pipedrive)
- **Option C**: Manual Summary — limited analysis

### 3. Execute Analysis (ver `references/concepts.md` para detalles)
- **RFM Segmentation**: Classify into Champions, Loyal, At Risk, Lost, New
- **Best Customer Profile**: Identify Champions characteristics (tier, size, industry, use case)
- **Behavioral Clustering**: 3-5 clusters by usage patterns
- **Churn Patterns**: When, why, who, triggers, early warning signals
- **LTV Analysis**: Per segment, payback period
- **Upgrade Patterns**: Free→paid conversion, tier progression triggers

### 4. Generate Recommendations
- **ICP refinement**: Focus on Champions segment characteristics
- **Positioning**: What Champions value → use in messaging
- **Content strategy**: Address churn triggers
- **Outreach**: Target lookalikes of Champions

### 5. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- **Privacy check**: 0 PII in output (aggregated only)
- **0 ❌** antes de entregar
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 6. Guardar con versionado
- Ruta: `brand/{slug}/customer-data/current.md`
- Backup + versionado + history.json
- Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/customer-data/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Champions profile | niche-discovery-100x (ICP criteria) |
| Segment characteristics | positioning-messaging (proof points) |
| Churn triggers | content strategy (topics), email-sequences |
| LTV by segment | budget-constraints (pricing tiers) |
| Upgrade patterns | funnel design (activation triggers) |

---

## 🔬 Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
→ Escribe **"profundizar"** para continuar.
```

---

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/customer-data/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt
2. Si existe `current.md` → backup como `v{N+1}.md`
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `https://sancho-cmo.taild48df2.ts.net/mc/docs/brand/{slug}/customer-data/current.md`
