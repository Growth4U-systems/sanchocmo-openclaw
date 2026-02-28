---
name: meeting-intelligence
description: "Extracts structured intelligence from meetings (Notion, Google Drive, Slack): decisions made (what/why/who), action items (owner+deadline), insights (pain points, features, success stories), quotes (verbatim), risks, status changes. UNIVERSAL skill - works for any brand. Saves intelligence/YYYY-MM-DD.json to Context Lake. Automated daily OR manual. Use when analyzing meetings, understanding decisions, tracking action items, extracting insights, keeping Sancho updated. Triggers: analyze meetings, what was decided, extract from meetings, meeting intelligence, scan yesterday. Do NOT use for content ideas (use content-miner) or weekly reports (this is daily intelligence)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: "Encuentra"
  layer: "Intelligence"
  type: "workflow"
---

# Meeting Intelligence

> Sancho learns from meetings: decisions, insights, quotes extracted daily

UNIVERSAL - works for any brand. No configuration needed.

---

## What It Does

Scans meetings/Slack → Extracts intelligence → Saves to Context Lake

**Sources**: Notion + Google Drive + Slack
**Output**: `intelligence/YYYY-MM-DD.json`
**Frequency**: Daily (automated) OR on-demand (manual)

---

## Scan Protocol

### Notion Documents
- Database: Documents (Type=Meeting)
- Filter: Created yesterday (or date range)
- Extract: Full content + transcript

### Google Drive
- Folder: /Meet-Recordings
- Filter: Modified yesterday
- Types: Transcripts (.txt, .pdf), videos (.mp4, .mov), notes (.doc)

### Slack (Optional)
- Channels: All public
- Filter: Messages yesterday with ≥2 relevance keywords
- Keywords: "decidimos", "vamos a", "problema", "feature", "cliente dijo", "logr", "metrics"

**Scope** (from Context Lake `scope_config.json`):
- `hybrid`: G4U + top 3 clientes (default)
- `company_wide`: Solo G4U meetings
- `clients_only`: Solo clientes (all or top N)

---

## Intelligence Extraction

### Decisions
```json
{
  "decision": "What (specific, actionable)",
  "rationale": "Why (reasoning)",
  "owner": "Who decided",
  "alternatives": ["What NOT chosen"],
  "source": "Link"
}
```

**Markers**: "We're going to...", "Approved X", "Let's move forward with..."

### Action Items
```json
{
  "task": "Verb + object",
  "owner": "Person (REQUIRED)",
  "deadline": "YYYY-MM-DD or TBD",
  "context": "Why matters",
  "source": "Link"
}
```

**Markers**: "I will...", "Can you...", "By [date]...", "[Name] to do..."
**Critical**: 85-95% accuracy depends on owner assignment

### Insights
```json
{
  "type": "pain_point|feature|success|trend|process",
  "insight": "What mentioned",
  "context": "Surrounding context",
  "mentioned_by": "Who (customer/team/partner)",
  "source": "Link"
}
```

**Types**:
- Pain Point: Customer problem
- Feature: Functionality requested
- Success: Win, positive outcome
- Trend: Market observation
- Process: Internal friction

### Quotes (Verbatim)
```json
{
  "quote": "Exact words",
  "speaker": "Who",
  "context": "What prompted",
  "source": "Link + timestamp"
}
```

**Rule**: NEVER paraphrase. Preserve exact wording.

### Risks
```json
{
  "type": "risk|blocker|dependency|open_question",
  "description": "Issue/question",
  "impact": "high|medium|low",
  "source": "Link"
}
```

---

## Output Structure

**File**: `Context Lake/intelligence/YYYY-MM-DD.json`

```json
{
  "date": "2026-02-21",
  "sources_scanned": {
    "notion": 3,
    "drive": 2,
    "slack": 15
  },
  "intelligence": {
    "decisions": [{...}],
    "action_items": [{...}],
    "insights": [{...}],
    "quotes": [{...}],
    "risks": [{...}]
  },
  "metadata": {
    "extracted_at": "ISO timestamp",
    "scope": "hybrid",
    "clients_tracked": ["Client A", "Client B"]
  }
}
```

---

## Scheduler Setup

**One-time setup**:
```bash
bash scripts/scheduler-setup.sh
```

Creates launchd job:
- Schedule: Daily 7am
- Command: `claude -p "Run meeting-intelligence for yesterday"`
- Logs: `~/.claude/logs/meeting-intelligence-YYYYMMDD.log`

**Manual override**:
```
/meeting-intelligence
> Date range: "last 3 days" / "this week" / "yesterday"
```

---

## Quality Standards

✅ Exact quotes (verbatim)
✅ Source links always
✅ Owners for action items
✅ Deadlines (or "TBD")
✅ Date stamps

For complete extraction patterns, see [extraction-patterns.md](references/extraction-patterns.md).
