---
name: performance-analysis
description: "Weekly performance analysis — reads existing metrics data, detects anomalies and trends, correlates with active projects, evaluates NSM progress, and generates actionable recommendations with optional web research for persistent underperformance."
context_required:
- brand/{slug}/metrics/metrics-data.json
- brand/{slug}/metrics-plan.json
- brand/{slug}/integrations.json
- brand/{slug}/operational/metrics/*.json
- brand/{slug}/strategic-plan/strategic-plan.current.md
- brand/{slug}/projects/*/project.json
- brand/{slug}/operational/learnings.md
- brand/{slug}/content-playbook/hooks.md
context_writes:
- brand/{slug}/monitoring/weekly/YYYY-MM-DD.json
- brand/{slug}/monitoring/pending-recommendations.json
- brand/{slug}/monitoring/health-score.json
- brand/{slug}/operational/learnings.md
- brand/{slug}/content-playbook/hooks.md
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
| Strategic plan | `brand/{slug}/strategic-plan/strategic-plan.current.md` | Active strategy, NSM, priorities |
| Projects | `brand/{slug}/projects/*/project.json` | Active projects with tasks and status |
| Learnings | `brand/{slug}/operational/learnings.md` | Accumulated insights from weekly synthesis |

---

## Workflow (8 Steps)

### Step 0: Load Data
1. Read `metrics-plan.json` to know which KPIs to analyze and the primary KPI (NSM)
2. Read `metrics-data.json` (rolling 90 days) for baseline calculations
3. Read daily snapshots from `operational/metrics/` for the last 7 days
4. Read `strategic-plan/strategic-plan.current.md` for context
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

### Step 7b: Content Performance Analysis (Optional — requires Metricool)

> Analiza rendimiento de contenido a nivel de post. Solo se ejecuta si Metricool esta conectado.

**Gate check**: Read `brand/{slug}/integrations.json`. If `metricool` is not present or `enabled: false`, skip this entire step. Log "Metricool not connected — skipping content analysis" and move on.

**If Metricool is connected:**

1. **Extract post-level data** from `metrics-data.json` (metricool section):
   - For each post in the last 14 days: platform, format (reel/carousel/static/story/text), hook text (first line), publish date, and metrics
   - **Resonance metrics** (primary): replies, saves, shares, DMs attributed
   - **Reach metrics** (secondary): impressions, reach, likes
   - Calculate `resonance_rate = (replies + saves + shares) / reach` per post
   - Calculate `vanity_ratio = likes / (replies + saves + shares)` — flag posts where ratio > 10x as "vanity-heavy"

2. **Categorize by hook type**:
   - Extract first line of each post as the hook
   - Classify hooks: question, bold-claim, statistic, story-opener, how-to, contrarian, pain-point, other
   - Group resonance_rate by hook type and platform
   - Identify top 3 hook types per platform by avg resonance_rate

3. **Track format performance**:
   - Group by format (reel, carousel, static, story, text post)
   - Calculate avg resonance_rate and avg reach per format per platform
   - Flag format with highest resonance_rate as "best performing format"

4. **Update hooks.md**:
   - Read `brand/{slug}/content-playbook/hooks.md`
   - Append or update a `## Performance Tracking` section at the end with:
     - Date of analysis
     - Top 3 hooks by platform with resonance_rate
     - Worst performing hook types to avoid
     - Best format per platform
   - Keep only the last 4 weeks of performance data (rolling window)

5. **Content health score** (feeds into social category in Step 4):
   - avg resonance_rate >= 3%  → score 90-100
   - avg resonance_rate 1-3%  → score 70-89
   - avg resonance_rate 0.5-1% → score 40-69
   - avg resonance_rate < 0.5% → score 0-39
   - Blend into the `social` category weight (50% existing social score + 50% content score)

6. **Write content learnings** to `brand/{slug}/operational/learnings.md`:
   - Best performing post of the period (link/summary + why it worked)
   - Hook patterns trending up or down
   - Format shifts worth noting

---

### Step 8: Save and Publish
1. Save `brand/{slug}/monitoring/weekly/YYYY-MM-DD.json` (full report per schema)
2. Save `brand/{slug}/monitoring/pending-recommendations.json` (active recommendations only)
3. Save `brand/{slug}/monitoring/health-score.json` (lightweight, for MC dashboard)
4. Append key insights to `brand/{slug}/operational/learnings.md`
5. Execute: `python3 ~/.openclaw/workspace-sancho/scripts/regenerate.py`
6. Publish the summary via `POST /api/integrations/publish` (cronKey `performance_analysis_weekly`; transport+channel resolved from `client-config.json`, Slack default — no hardcoded channel/Discord). `title` = root line, `body` = full report.

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
