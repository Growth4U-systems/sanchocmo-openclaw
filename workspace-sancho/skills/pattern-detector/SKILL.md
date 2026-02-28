---
name: pattern-detector
description: Find patterns across channels and data.
user-invocable: false
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (Learning)
  type: analysis
context_required:
- intelligence/
context_writes:
- patterns/
- brand/learnings.md
---

# Pattern Detector

> Recurring themes detector - what topics keep appearing?

UNIVERSAL - simple frequency analysis (topic ≥3 mentions → pattern).

---

## What It Does

**Input**: All `intelligence/*.json` (last 30 days)
**Process**: Frequency analysis → detect themes ≥3 mentions
**Output**: `patterns/recurring.md` (append-only log)

---

## How It Works

1. **Load intelligence** (last 30 days)
2. **Extract topics** from:
   - Decisions (what was decided about)
   - Insights (what pain/feature/trend)
   - Quotes (key themes mentioned)
3. **Count frequency** (how many times each topic appears)
4. **Filter**: Topics ≥3 mentions = pattern
5. **Save**: Append to `patterns/recurring.md`

---

## Output

**File**: `Context Lake/patterns/recurring.md`

```markdown
# Recurring Patterns

## 2026-02-21: Pricing Confusion (4 mentions, last 7 days)
- Mentioned in: 4 meetings (2026-02-15, 02-17, 02-19, 02-21)
- Pattern: Customers repeatedly confused by pricing tiers
- Insight: Need clearer pricing page / FAQ / comparison guide
- Recommended action: Create pricing guide content

## 2026-02-20: Mobile Performance (3 mentions, last 10 days)
- Mentioned in: 3 meetings + 2 Slack threads
- Pattern: Mobile app slow on Android
- Insight: Product issue affecting retention
- Recommended action: Prioritize mobile optimization
```

**Threshold**: ≥3 mentions (configurable)

---

## Manual Use

```
/pattern-detector
> Analyze last: "30 days" / "this month" / "this quarter"
> Threshold: 3 (default) / custom number
```

---

## Integration

**Reads**: intelligence/*.json (from meeting-intelligence)
**Writes**: patterns/recurring.md (Context Lake)
**Feeds**: Proactive suggestions (sancho-start uses patterns)
