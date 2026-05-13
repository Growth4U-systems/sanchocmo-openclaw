# ECP Validation — Prompt (Fuente de verdad del output)

---

## Framework 1: Assumption Mapping (Maja Voje)

1. List ALL assumptions (about ECPs, pain points, willingness to pay, channels)
2. Map en 2 axes: **Importance** × **Evidence**
3. Identificar "leap of faith" assumptions (high importance, low evidence)
4. Design experiments para critical assumptions primero

**Assumption categories:** Target audience, Problem, Product positioning, Pricing, Channels.

---

## Framework 2: Validation Methods

**Spectrum (low → high confidence):**
```
SAY they will:          DO it conditionally:       DO it for real:
├─ Interviews           ├─ Waitlist signups        ├─ Presale
├─ Surveys              ├─ Landing page clicks     ├─ Co-creation contract
└─ Focus groups         └─ Prototype testing       └─ Early access payment
```

---

## Experiment Template

```
Experiment: {name}
Tests assumption: {which one}
Method: {Interview | Landing page | Waitlist | Presale | MVI | Content test}
Success criteria: {measurable outcome}
Time: {days/weeks}
Cost: {€}
Confidence gain: {LOW → MEDIUM or MEDIUM → HIGH}
```

---

## Method Details

### Interviews (15-20 per ECP)
**Script:** Problem validation (10min) → Solution interest (5min) → Pricing (3min) → Channel (2min).
Pattern detection after 15-20. If NO patterns by 20 → segment too broad.

### Landing Page Smoke Test
LP with headline (value prop) + CTA (waitlist). Traffic: organic or paid (€50-200). Target: >5% conversion.

### Waitlist Campaign
Promote via content, outreach, ads. Measure: signup rate, email opens (>30% = strong), referrals.

### Presale (highest confidence)
B2B: pitch deck + 50+ outreach, target 3-5 presales. B2C: LP + payment, target >10 purchases. Full refund policy.

### MVI — Minimum Viable Idea (≠ MVP)
Build with no-code (1-3 days). Test with 10-20 users. Measure: activation, retention, NPS, willingness to pay.
**Concierge MVP:** "Be the AI before building the AI."

### Content Test
Lead magnet targeting ECP's pain. Publish where ECP is. Measure: downloads, shares, comments, signups.

---

## Output Format

```markdown
# ECP Validation Results

## Overview
- ECPs tested: {count}
- Experiments run: {count}
- Timeline: {start} - {end}
- Total cost: €{amount}

## ECP 1: {Name}
**Validation Status:** ✅ VALIDATED | ⚠️ PARTIAL | ❌ FAILED

### Assumptions Tested
| Assumption | Method | Result | Confidence Gain |
|------------|--------|--------|-----------------|

### Experiments
**Experiment 1: {Name}**
- Method, success criteria, actual result, time, cost
- **Insight:** [key learning]

### Go/No-Go Decision
**Verdict:** ✅ GO / ❌ NO-GO
**Confidence:** HIGH/MEDIUM/LOW
**Rationale:** [why]
**Next actions:** [list]

## Summary Recommendations
**Prioritize (validated):** [list]
**Deprioritize (failed):** [list]
**Refine and retest:** [list]
```
