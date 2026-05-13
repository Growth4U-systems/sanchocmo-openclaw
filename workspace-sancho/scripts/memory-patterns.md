# Memory Pattern Detection — Prompt Template

> Used by the weekly cron job. Agent reads this + recent daily notes, extracts patterns.

## Instructions

1. Read `memory/YYYY-MM-DD.md` (flat daily notes) from the last 7 days
2. Read `MEMORY.md` (current core memory)
3. Read `brand/*/memory.md` (all client memories)

## Extract these pattern types:

### 🔁 Recurring Patterns
- Actions that repeat across days/clients (e.g., "always needs follow-up on X")
- User preferences that appear multiple times

### 📈 Trends
- Things getting better or worse over time
- Increasing/decreasing frequency of certain activities

### 💡 Insights
- Connections between events that weren't obvious at the time
- Cause-effect relationships

### ⚠️ Risks
- Things mentioned but never resolved
- Growing gaps or debt (technical, strategic, operational)

## Output

1. **Update `memory/patterns.md`** with findings (append new, mark resolved)
2. **Update relevant `brand/{slug}/memory.md`** if pattern is client-specific
3. **Update `MEMORY.md`** if pattern is system-wide learning

## Format for patterns.md

```markdown
## Pattern: [Name]
- **Type**: recurring | trend | insight | risk
- **First seen**: YYYY-MM-DD
- **Last seen**: YYYY-MM-DD
- **Evidence**: [bullet list of daily note references]
- **Action**: [what to do about it, or "monitoring"]
- **Status**: active | resolved | monitoring
```
