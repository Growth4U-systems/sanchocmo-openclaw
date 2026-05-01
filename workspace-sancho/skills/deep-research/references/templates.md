# Deep Research — Templates

Used in Phase 5 (DETAILED ANALYSIS).

---

## Per-Entity Template

Use a **consistent template** across all entities. Same structure, same dimensions, no asymmetric coverage.

```markdown
### [Entity Name] — [Product Name]

**Type:** [Category from taxonomy]

**How it Works:**
- [Step-by-step user journey]

**Key Data:**
| Feature | Detail |
|---------|--------|
| [Dimension 1] | [Value] |
| [Dimension 2] | [Value] |

**Confidence:**
- [Dimension 1]: verified / reported / inferred
- [Dimension 2]: verified / reported / inferred

**Sources:**
- [Source 1](URL)
- [Source 2](URL)
```

---

## Full Document Structure

```markdown
# [Research Title]

**Date:** YYYY-MM-DD
**For:** [Stakeholder name and role]
**Research by:** Alfonso Sainz de Baranda (Growth4U)
**QA Score:** [filled after Phase 6]

---

## Scope Brief

[3-5 line scope from Phase 1: research question + entities + completion criteria]

---

## Executive Summary

[Key findings table + 2-3 paragraph narrative. Standalone — readable without detail sections.]

---

## [Taxonomy / Framework Section]

[Models, categories, comparison tables from Phase 4]

---

## Detailed Analysis

### Category A: [Name]
#### 1. [Entity] — [Product]
#### 2. [Entity] — [Product]

### Category B: [Name]
#### 1. ...
#### 2. ...

---

## Key Non-Obvious Finding

[What does the framework reveal that the reader didn't expect?]

---

## Recommendations

[Actionable next steps for the stakeholder]

---

## Sources Index

[All sources cited, grouped by category — see sources.md priorities]

### Priority 1: Official
- [1] ...
- [2] ...

### Priority 2: Comparison platforms
- [3] ...

### Priority 3: News
- [4] ...

### Priority 4: Legal / Regulatory
...

### Priority 5: Community
...

### Priority 5b: Social Pulse (last30days)
...
```

---

## Citation Format

**Inline (within prose):**
```
dato relevante [1]
```
or
```
dato relevante [Fuente: Título](url)
```

**In data tables**: include URL inline in the cell when feasible, otherwise cite via footnote `[N]`.

**Sin fuente verificada:** `⚠️ Estimación sin fuente verificada: dato`

**Fuente única (no cross-validated):** `⚠️ Fuente única [N]: dato`

**Conflicting sources:** `dato (rango: X-Y) [N1][N2]` con nota explicando la discrepancia.

---

## Sources Index Format

```markdown
[1] Título completo del artículo o página — Organización (YYYY-MM). https://url
[2] ...
```
