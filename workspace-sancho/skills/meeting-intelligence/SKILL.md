---
name: meeting-intelligence
description: Extract decisions and actions from meetings.
user-invocable: false
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra
  layer: Intelligence
  type: workflow
context_required:
- brand/company-context.md
context_writes:
- intelligence/
- brand/learnings.md
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

---

## Deduplication + Intelligence Log (OBLIGATORIO)

**Before processing ANY meeting:**
1. Read `_system/intelligence-log.json`
2. Check if a meeting with matching `id` (format: `mtg-{slug}`) exists in `entries[]`
3. Skip already-processed meetings (log skip with ⏭️)
4. Only process NEW or UPDATED meetings

**After processing each meeting, append to `_system/intelligence-log.json` → `entries[]`:**
```json
{
  "id": "mtg-{slug}",
  "type": "meeting",
  "client": "{client-slug}",
  "date": "YYYY-MM-DD",
  "title": "Título descriptivo",
  "summary": "Resumen de 1 línea (max 200 chars)",
  "status": "processed",
  "sourceFile": "brand/{slug}/intelligence/meetings/{filename}.md",
  "processedAt": "ISO timestamp",
  "tags": ["meeting"]
}
```

**Guardar transcript (OBLIGATORIO):**
Después de leer el documento de Google Drive con `gog docs cat <docId>`:
1. Crea carpeta `brand/{slug}/intelligence/meetings/{meeting-slug}/`
2. Guarda el contenido COMPLETO en `transcript.md`
3. Procesa y genera el resumen en `summary.md`
3. Añade `"transcriptFile"` al entry del intelligence-log

**Por defecto, usa el resumen** para generar insights. Solo consulta el transcript cuando:
- Un skill lo pida explícitamente (ej: buscar citas textuales, datos exactos)
- El resumen no tenga suficiente detalle para una decisión
- El usuario pida el transcript original

**Never re-report a meeting already in the log unless its source file has been modified.**
