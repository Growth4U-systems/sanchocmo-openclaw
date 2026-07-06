# Skill Self-Improvement Protocol

> Observe → Inspect → Amend → Evaluate

## Overview

Skills are living components. Every execution generates signal about quality, gaps, and edge cases. This protocol captures that signal and converts it into actionable improvements.

## 1. Observation: Execution Logging

### When to log
After EVERY skill execution that produces a notable outcome (good or bad):
- Skill produced unexpected output
- User corrected or rejected output
- Skill took significantly longer than expected
- Skill produced excellent results worth noting
- Edge case discovered
- Skill triggered when it shouldn't have (false positive)
- Skill didn't trigger when it should have (false negative)

### How to log
Append to `_system/skill-execution-log.jsonl` (one JSON object per line):

```json
{
  "timestamp": "2026-03-15T17:00:00Z",
  "skill": "skill-name",
  "session_key": "optional-session-id",
  "trigger": "what the user asked",
  "outcome": "success|partial|failure|false-positive|false-negative",
  "quality": 1-5,
  "issues": ["description of issues"],
  "notes": "free-form observations",
  "improvement_hint": "what could be better"
}
```

### Quality scale
- **5**: Perfect output, no corrections needed
- **4**: Good output, minor adjustments
- **3**: Acceptable, notable gaps or inefficiencies
- **2**: Below expectations, significant corrections needed
- **1**: Failed or produced wrong output

## 2. Inspection: Weekly Analysis

Every Sunday (cron), analyze the execution log:

1. **Group by skill** — aggregate quality scores, count executions
2. **Identify patterns** — recurring issues, low average quality, common edge cases
3. **Rank by impact** — `improvement_priority = (5 - avg_quality) × execution_count`
4. **Generate report** — top 5 skills needing improvement

### Analysis output
Written to `_system/skill-improvement-proposals/weekly-YYYY-MM-DD.md`

## 3. Amendment: Improvement Proposals

For each skill flagged for improvement:

### Proposal format
```markdown
# Improvement Proposal: [skill-name]

## Evidence
- Executions: N (period: YYYY-MM-DD to YYYY-MM-DD)
- Avg quality: X.X/5
- Issues found:
  1. [issue] (frequency: N times)
  2. [issue] (frequency: N times)

## Root cause
[Why the skill produces suboptimal output]

## Proposed changes
[Specific diffs or rewrites to SKILL.md]

## Expected impact
[What should improve and how to measure it]

## Test cases
[2-3 prompts that exercise the improvement]
```

### Proposal workflow
1. Generate proposal → `_system/skill-improvement-proposals/[skill-name]-YYYY-MM-DD.md`
2. Present to Alfonso for approval (via Discord thread in #tasks)
3. If approved: apply changes, run test cases via skill-creator eval framework
4. If eval passes: commit changes, archive proposal as `applied`
5. If eval fails: iterate on proposal

## 4. Evaluation: Validate Improvements

Use skill-creator's existing infrastructure:
- `scripts/run_eval.py` — trigger testing
- `scripts/aggregate_benchmark.py` — performance comparison
- `agents/grader.md` — output quality grading

### Before/After comparison
1. Snapshot current skill version
2. Apply proposed changes
3. Run test cases on both versions
4. Compare: quality must improve on target issues WITHOUT regressing on other cases

## 5. Integration Points

### SOUL.md addition
Agents must log notable skill executions to `_system/skill-execution-log.jsonl`.

### Cron: Weekly review
- Schedule: Sundays 10:00 Europe/Madrid
- Task: Analyze log, generate proposals, notify #tasks

### Cron: Monthly deep review
- Schedule: 1st of month, 10:00 Europe/Madrid
- Task: Full skill audit — trigger accuracy + output quality across all active skills

## 6. Metrics

Track in `_system/skill-improvement-metrics.json`:
- Skills improved per week/month
- Average quality trend (rolling 30 days)
- False positive/negative rate trend
- Proposals generated vs applied
