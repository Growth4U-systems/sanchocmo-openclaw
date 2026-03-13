# Eval Notes: email-sequence skill — Diagnostic Query (Open Rate Drop)

## Query
"our email open rates have tanked. used to be 35% now we're at 18%. what's going on and how do we fix our subject lines?"

## Skill Behavior Analysis

### What the skill provided for this diagnostic query:

1. **Brand Memory check** — Skill instructs to read brand context files. None available for this test, noted the gap.

2. **ESP Detection** — Skill instructs to check for ESP integrations. None detected, noted.

3. **Subject Line Strategy** — The skill has a dedicated section with:
   - Character length guidelines (40-60 chars)
   - 5 proven patterns (Question, How-to, Number, Direct, Story tease)
   - Clear > Clever principle
   - Preview text guidelines (90-140 chars, complement don't repeat)

4. **A/B Variant Framework** — Skill mandates 3 variants per email:
   - Variant A (Safe Bet), B (Bold Play), C (Personal Touch)
   - Applied this to the diagnostic recommendations

5. **Testing & Optimization** (from references/copy-guidelines.md):
   - What to test, how to test
   - Benchmark ranges (open rate 20-40%, click 2-5%)
   - Segmentation strategies (by behavior, stage, profile)

6. **Re-engagement Sequence** — Skill includes a re-engagement template (3-4 emails) which was directly relevant to the dormant subscriber recommendation.

### How well the skill handled a diagnostic (non-creation) query:

**Strengths:**
- The skill's Subject Line Strategy section provided concrete, actionable frameworks
- The copy-guidelines reference file had benchmarks and testing methodology
- The re-engagement sequence template was directly applicable as a recovery tactic
- The A/B variant framework (Safe/Bold/Personal) adds structure to subject line testing
- Preview text guidelines addressed a commonly overlooked optimization lever

**Gaps:**
- The skill is primarily designed for *creating* sequences, not *diagnosing* email problems
- No explicit diagnostic workflow or troubleshooting decision tree
- No deliverability guidance (SPF/DKIM/DMARC, sender reputation, inbox placement)
- No list hygiene framework — the skill mentions segmentation but not cleaning
- No guidance on Apple MPP impact on open rate measurement
- The "Task-Specific Questions" section is good but oriented toward sequence creation, not problem diagnosis
- No framework for analyzing historical subject line performance data

**Verdict:**
The skill provided ~40-50% of what was needed for this diagnostic query. The subject line strategy and A/B testing framework were directly useful. But the diagnostic required significant expertise beyond the skill's scope (deliverability, list hygiene, measurement accuracy, recovery planning). The skill would benefit from a "Troubleshooting / Optimization" section for users who come with existing email performance problems rather than new sequence requests.

### Suggestions for skill improvement:
1. Add a "Diagnostic Mode" section for when users report email performance problems
2. Include a deliverability checklist (authentication, reputation, inbox placement)
3. Add list hygiene guidelines and engagement scoring framework
4. Include Apple MPP/privacy impact notes on open rate measurement
5. Add a "Subject Line Audit" workflow for analyzing existing subject line performance
6. Include recovery playbook templates (not just re-engagement sequences)
