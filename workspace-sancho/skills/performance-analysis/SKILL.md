---
name: performance-analysis
description: "Weekly performance analysis — reads existing metrics data, detects anomalies and trends, correlates with active projects, evaluates NSM progress, and generates actionable recommendations with optional web research for persistent underperformance."
context_required:
- brand/{slug}/metrics/metrics-data.json
- brand/{slug}/metrics-plan.json
- brand/{slug}/integrations.json
- brand/{slug}/operational/metrics/*.json
- brand/{slug}/strategic-plan/current.md
- brand/{slug}/projects/*/project.json
- brand/{slug}/operational/learnings.md
context_writes:
- brand/{slug}/monitoring/weekly/YYYY-MM-DD.json
- brand/{slug}/monitoring/pending-recommendations.json
- brand/{slug}/monitoring/health-score.json
- brand/{slug}/operational/learnings.md
---

# Performance Analysis — Weekly Intelligence Layer

> Lee las metricas que ya se recogen. Detecta que va bien y que va mal. Recomienda acciones.

Read ./brand/ per `_system/brand-memory.md`

---

## Core Job

This skill does NOT collect metrics — that's already handled by `metrics-collector` and `morning-metrics`. Instead, it:

1. Reads all existing metrics data (daily snapshots + rolling 90-day archive)
2. Calculates baselines (7-day and 30-day averages) per KPI
3. Detects anomalies (spikes, drops, stagnation) and opportunities
4. Correlates metric changes with active projects by timeline
5. Evaluates progress toward the North Star Metric (NSM)
6. Generates specific, actionable recommendations linked to projects
7. Searches web for best practices when a metric underperforms 2+ weeks

---

## Data Sources (all pre-existing)

| Source | Path | What it contains |
|--------|------|-----------------|
| Daily snapshots | `brand/{slug}/operational/metrics/YYYY-MM-DD.json` | Meta Ads 7d summary, GHL contacts/appointments, alerts |
| Rolling archive | `brand/{slug}/metrics/metrics-data.json` | 90-day window: GA4, GSC, Meta Ads, GHL, Metricool per day |
| KPI definitions | `brand/{slug}/metrics-plan.json` | KPI names, sources, formulas, categories, funnel steps |
| Strategic plan | `brand/{slug}/strategic-plan/current.md` | Active strategy, NSM, priorities |
| Projects | `brand/{slug}/projects/*/project.json` | Active projects with tasks and status |
| Learnings | `brand/{slug}/operational/learnings.md` | Accumulated insights from weekly synthesis |

---

## Workflow (8 Steps)

### Step 0: Load Data
1. Read `metrics-plan.json` to know which KPIs to analyze and the primary KPI (NSM)
2. Read `metrics-data.json` (rolling 90 days) for baseline calculations
3. Read daily snapshots from `operational/metrics/` for the last 7 days
4. Read `strategic-plan/current.md` for context
5. Read all `projects/*/project.json` for active project data
6. Read `operational/learnings.md` for accumulated context
7. Read `monitoring/pending-recommendations.json` if it exists (previous recommendations)

### Step 1: Calculate Baselines
For each KPI defined in `metrics-plan.json`:
- Extract values from `metrics-data.json` for the last 7 and 30 days
- Calculate: mean_7d, mean_30d, stdev_7d, stdev_30d
- Determine trend: 3+ consecutive days above/below average = trending up/down
- For formula-based KPIs (e.g., CPL = spend/contacts): compute from component metrics

### Step 2: Detect Anomalies
Thresholds:
- **RED**: current > 2x mean_7d OR current < 0.5x mean_7d
- **YELLOW**: current > 1.5x mean_7d OR current < 0.75x mean_7d
- **Stagnation YELLOW**: variance < 5% over 7+ days (no meaningful change)

For **inverted metrics** (where higher = worse): CPC, bounce rate, avg position
- Invert the logic: a spike in CPC is BAD (red), a drop is GOOD

### Step 3: Identify Opportunities
- Metric consistently above mean_30d for 3+ consecutive days = opportunity
- Flag with potential action suggestion

### Step 4: Calculate Health Score

```
Per KPI:
  >= 110% of 30d avg  → score 90-100 (above trend)
  within 10% of avg   → score 70-89  (on track)
  50-90% of avg       → score 40-69  (below trend)
  < 50% of avg        → score 0-39   (critical)

Adjustments:
  +5 if trending up 3+ consecutive days
  -5 if trending down 3+ consecutive days
  -10 if stagnant 7+ days

Category weights:
  funnel:     35%  (closest to revenue)
  paid:       25%  (direct spend efficiency)
  traffic:    20%  (volume)
  seo:        10%  (organic growth)
  social:     10%  (brand awareness)
  crm:        included in funnel weight
  efficiency: included in paid weight

Overall = weighted average of category scores
```

### Step 5: Correlate with Projects
For each active project (status != "blocked"):
1. Calculate weeks since project started (from first completed task or creation date)
2. Identify related metrics by project type:
   - P04 meta-ads → meta-ads.* KPIs
   - P02 linkedin-pipeline → social.* KPIs
   - P03 cold-email → outbound KPIs
   - P06 free-media → traffic.* KPIs
3. Compare trend of related metrics since project started
4. Assign confidence: high (>30% change + >3 weeks data), medium (10-30%), low (<10% or <2 weeks)

### Step 6: Evaluate NSM Progress
- Read `primaryKPI` from metrics-plan.json (e.g., "Meetings")
- Calculate: this week total, last week total, monthly total vs target
- Determine: on_track (true/false)
- Calculate funnel bottleneck: step with worst conversion rate relative to benchmarks

### Step 7: Generate Recommendations
For each anomaly, underperformance, or opportunity:
1. Generate specific recommendation tied to client context
2. Link to existing project if applicable
3. Assign type:
   - **optimize**: improve something running (e.g., "refresh ad creatives")
   - **investigate**: understand root cause (e.g., "CTR dropped, check audience overlap")
   - **launch**: start something new (e.g., "organic traffic strong, invest in SEO content")
   - **pause**: stop something inefficient (e.g., "campaign X has 3x CPC, pause and restructure")
   - **escalate**: needs human decision (e.g., "budget allocation change")
4. Assign priority: high / medium / low
5. If metric has underperformed for 2+ consecutive weeks:
   - Use WebSearch to find current best practices (max 2 searches per run)
   - Include findings in recommendation

Clean up previous recommendations:
- Read pending-recommendations.json
- If a previous recommendation's metric has normalized → mark as auto_resolved, exclude from new file

### Step 8: Save and Publish
1. Save `brand/{slug}/monitoring/weekly/YYYY-MM-DD.json` (full report per schema)
2. Save `brand/{slug}/monitoring/pending-recommendations.json` (active recommendations only)
3. Save `brand/{slug}/monitoring/health-score.json` (lightweight, for MC dashboard)
4. Append key insights to `brand/{slug}/operational/learnings.md`
5. Execute: `python3 ~/.openclaw/workspace-sancho/scripts/regenerate.py`
6. Publish to Discord #intelligence with thread pattern

---

## Output Schemas

See `./schemas/` directory:
- `weekly-report.schema.json` — full weekly analysis report
- `health-score.schema.json` — lightweight dashboard file
- `recommendation.schema.json` — pending recommendations format

---

## Inverted Metrics Reference

These KPIs are "lower is better" — a spike means BAD:
- `cpc` (Cost Per Click)
- `bounceRate`
- `position` (SEO average position — lower rank number = better)
- Any metric with `cost` or `cpl` in the name
