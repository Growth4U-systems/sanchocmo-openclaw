# Validation Criteria — Decision Maker Finder

> Como validar que un contacto encontrado es el decision maker CORRECTO.

---

## Profile Quality Signals (LinkedIn)

### High-Quality Profile Indicators

| Signal | Weight | Why It Matters |
|--------|--------|----------------|
| Has profile photo | +1 | 90%+ of legit professionals have one |
| 500+ connections | +1 | Active networker, reachable |
| Recent activity (posted/engaged < 90 days) | +2 | Active on platform, will see messages |
| Complete work history | +1 | Serious professional, data is accurate |
| Skills endorsed (10+) | +1 | Validated by peers |
| Recommendations received | +1 | Trusted by colleagues |
| Custom headline (not default) | +1 | Invested in their presence |
| Creator/newsletter activity | +1 | Very active, content-aware |

**Profile Quality Score (0-9):**
- **8-9**: Excellent (photo + 500+ connections + recent activity + complete history + endorsed)
- **6-7**: Good (most signals present, may be less active)
- **4-5**: Acceptable (basic profile, limited activity)
- **0-3**: Poor (incomplete, inactive, possibly fake)

**Minimum threshold:** 4+ to proceed. Below 4, flag and search for alternatives.

---

## Relevance Scoring (1-10)

### Scoring Matrix

| Criterion | Points | How to Evaluate |
|-----------|--------|-----------------|
| **Title exact match** | +3 | Title matches target role exactly ("VP Marketing" when searching VP Marketing) |
| **Title keyword match** | +2 | Title contains key terms but not exact ("Head of Growth Marketing" when searching VP Growth) |
| **Department match** | +2 | Works in the correct department (Marketing, Sales, Engineering, etc.) |
| **Seniority match** | +2 | Correct level (C-Level, VP, Director, Manager) for our deal size |
| **Active profile** | +1 | Posted or engaged on LinkedIn in last 90 days |

**Score interpretation:**

| Score | Interpretation | Action |
|-------|---------------|--------|
| **9-10** | Perfect match | Primary contact. Proceed immediately. |
| **7-8** | Strong match | Primary or strong backup. Proceed. |
| **5-6** | Partial match | Backup contact. Use if primary unavailable. |
| **3-4** | Weak match | Only if no better options exist. Verify role. |
| **1-2** | Poor match | Skip. Wrong person. |

**Minimum relevance to include:** 5+ for primary, 3+ for backup.

---

## Red Flags

### Disqualifying Red Flags (Skip This Contact)

| Red Flag | Why | Action |
|----------|-----|--------|
| No profile photo + <100 connections | Likely fake or abandoned account | **SKIP** — search for alternative |
| Past position listed as current | Stale data, person has moved on | **SKIP** — verify on company website |
| Title says "Former" or "Ex-" | No longer at the company | **SKIP** — find current person in that role |
| Company name doesn't match | Wrong company or subsidiary | **VERIFY** — might be parent company or DBA |
| Profile is private / restricted | Can't verify anything | **FLAG** — try Apollo or other sources |

### Warning Flags (Flag, Don't Disqualify)

| Warning Flag | Why | Action |
|-------------|-----|--------|
| "Open to Work" badge | May be leaving the company | **FLAG** — still decision maker today, but timeline risk. Note in output. |
| Multiple current positions | Could be consultant, advisor, or part-time | **VERIFY** — check if primary role is at target company |
| Very new to role (<3 months) | May not have full authority yet | **FLAG** — good for relationship building, but may need boss sign-off |
| No recent activity (90+ days) | May not see LinkedIn messages | **FLAG** — try email channel instead |
| Title inflation (CEO of 5-person company) | Common in startups | **ADJUST** — treat as Manager-level authority regardless of title |

---

## Warm Path Assessment

### Connection Proximity Score

| Path | Score | Value |
|------|-------|-------|
| **1st degree connection** | +3 | Direct intro possible, highest response rate |
| **2nd degree (shared connection)** | +2 | Warm intro via mutual, good response rate |
| **Shared group / community** | +1 | Common ground for outreach, mention in message |
| **3rd degree or no connection** | +0 | Cold outreach, lowest response rate |

**How to assess:**
1. Check LinkedIn "mutual connections" count
2. Identify the strongest mutual connection (client's network)
3. Check shared LinkedIn groups or Slack communities
4. Note any shared events, conferences, or alumni networks

**Warm path data in output:**
```json
{
  "warm_path": "2nd degree via John Smith (mutual LinkedIn connection)",
  "warm_path_score": 2,
  "shared_groups": ["SaaS Growth Leaders", "Marketing Ops Pros"]
}
```

---

## Company-Level Validation

Before accepting a contact, verify the company context:

| Check | How | Why |
|-------|-----|-----|
| Person appears on company website | Check /about or /team page | Confirms current employment |
| Title matches LinkedIn | Compare website bio vs LinkedIn | Catches stale LinkedIn data |
| Company size matches ICP | Cross-reference with company-finder data | Ensures seniority level is appropriate |
| No recent layoff news | Quick WebSearch "[company] layoffs 2026" | Person might be gone |

---

## Composite Score Calculation

```
COMPOSITE SCORE = Relevance Score (1-10) + Profile Quality Bonus + Warm Path Bonus

Where:
  Relevance Score: 1-10 (title + department + seniority + activity)
  Profile Quality Bonus:
    - Score 8-9: +2
    - Score 6-7: +1
    - Score 4-5: +0
    - Score 0-3: -2
  Warm Path Bonus:
    - 1st degree: +3
    - 2nd degree: +2
    - Shared group: +1
    - No connection: +0

Maximum possible: 10 + 2 + 3 = 15
Minimum to include as primary: 8+
Minimum to include as backup: 5+
```

### Priority Ranking

After scoring all contacts for a company:

1. Sort by Composite Score (descending)
2. Select top contact as **primary** (highest score)
3. Select 1-2 contacts as **backup** (next highest, different seniority if possible)
4. Flag any contacts with warning flags

---

## Validation Checklist (Per Contact)

```
[ ] Title matches target role (exact or alias)?
[ ] Seniority appropriate for deal size?
[ ] Profile photo present?
[ ] 500+ connections?
[ ] Activity in last 90 days?
[ ] No disqualifying red flags?
[ ] Warning flags noted (if any)?
[ ] Warm path assessed?
[ ] Company website cross-check done?
[ ] Relevance score calculated?
[ ] Profile quality score calculated?
[ ] Composite score calculated?
```

---

*Un contacto mal validado desperdicia toda la secuencia de outreach. Mejor 1 contacto bien validado que 5 sin verificar.*
