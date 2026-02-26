---
name: daily-pulse
description: Daily insights from comms and meetings.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-many)
  depends_on: company-context, brand-voice
  chains_to: insight-to-content-mapper, keyword-research, seo-content
context_required:
- brand/company-context.md
- brand/voice-profile.md
- brand/icp.md
- brand/ecps.md
context_writes:
- brand/transitory/daily-pulse/
- brand/learnings.md
---

# Daily Pulse — Convierte Conversaciones en Contenido

> "Tus mejores ideas de contenido ya existen — estan escondidas en tus Slacks, meetings y tickets."
> "El content marketer que escucha gana al que inventa." — Sancho

Este skill escanea comunicaciones del equipo (Slack, Notion, transcripts, input manual), extrae insights accionables, los clasifica por categoria, y genera micro-briefs de contenido listos para ejecutar.

**Diferencia con thief-marketers:**
- **thief-marketers**: Roba ideas de COMPETIDORES (externo)
- **daily-pulse**: Extrae ideas de TUS CONVERSACIONES (interno)

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input:**
- Al menos UNA fuente de datos (Slack, Notion, transcript, o input manual)
- Periodo a escanear (default: ultimas 24h)

**Tools needed:**
- **Slack MCP** (read-only) — para escanear canales
- **Notion MCP** — para leer meeting notes y paginas recientes
- **Google Workspace MCP** — para transcripts en Drive
- WebSearch (fallback para contexto de tendencias)

**Optional context:**
- ./brand/positioning.md (filtrar insights relevantes a nuestra marca)
- ./brand/voice-profile.md (adaptar ideas a nuestro tono)
- ./brand/content-ideas.json (evitar duplicados con ideas existentes)

---

## Workflow

### Step 0: Tool Detection (Automatic)

**Check available MCP tools:**

```
IF Slack MCP + Notion MCP + Google Workspace MCP:
  mode = "FULL" (automated scan, all sources)
  notify = "FULL mode — scanning Slack + Notion + Drive"
ELIF Notion MCP + Google Workspace MCP (no Slack):
  mode = "PARTIAL" (no Slack — manual input for chat)
  notify = "PARTIAL mode — no Slack, paste chat messages manually"
ELIF Google Workspace MCP only:
  mode = "LIGHT" (transcripts only, rest manual)
  notify = "LIGHT mode — transcripts from Drive, paste rest manually"
ELSE:
  mode = "MANUAL" (user provides all input)
  notify = "MANUAL mode — paste all conversations/notes"
```

**Present:**

```
DAILY PULSE — Tool Detection

Mode: FULL
Slack MCP: Connected
Notion MCP: Connected
Google Workspace: Connected
Estimated time: 5-10 min

OR

Mode: MANUAL
No MCP tools detected
Paste your conversations/notes below
Estimated time: 2-3 min (depends on input)

Proceed?
```

---

### Step 1: Configure Sources

**Ask the user:**

```
CONFIGURE SOURCES

Date range:
  Default: Last 24 hours
  Custom: [specify]

Slack channels to scan:
  #clients (recommended)
  #support (recommended)
  #sales (recommended)
  #product (optional)
  #general (optional)
  Custom: [specify]

Notion sources:
  Meeting notes from last 24h
  Client session pages
  Task comments
  Custom: [specify page/DB]

Transcripts:
  Auto-search Drive for recent transcripts
  Skip

Manual input:
  Paste additional text (optional)

Use defaults for everything?
  Yes (recommended for daily pulse)
  Let me customize
```

**If user says "yes" or "defaults"** -> proceed with recommended config.

See [source-config.md](references/source-config.md) for detailed configuration options.

---

### Step 2: Scan Communications

**FULL mode execution:**

1. **Slack scan**
   ```
   For each configured channel:
     - Fetch messages from last 24h
     - Include thread replies
     - Filter: min 50 characters (skip reactions-only, "ok", "thanks")
     - Exclude bot messages
     - Collect: author, timestamp, text, channel, thread context
   ```

2. **Notion scan**
   ```
   Search for recently edited pages:
     - Query: "meeting", "reunion", "sync", "retro", "notes"
     - Filter: last_edited_time > 24h ago
     - For each result: fetch full page content
     - Extract: decisions, action items, client quotes, blockers
   ```

3. **Transcript scan**
   ```
   Search Drive for recent transcripts:
     - Query: "transcript OR transcripcion"
     - Filter: modifiedTime > 24h ago
     - For each result: read content
     - Split by speaker, extract highlights
   ```

4. **Manual input** (if provided)
   ```
   Parse user-provided text:
     - Identify speakers (if attributed)
     - Split into individual statements
     - Tag source as "manual"
   ```

**Present scan summary:**

```
SCAN COMPLETE

Sources scanned:
  Slack: 3 channels, 147 messages
  Notion: 4 meeting notes, 2 client pages
  Transcripts: 1 (Weekly sync with Monzo)
  Manual: 0

Total raw inputs: 153+
Proceeding to insight extraction...
```

---

### Step 3: Extract & Classify Insights

For each raw input, apply classification from [insight-categories.md](references/insight-categories.md):

```
For each message/note/transcript segment:

  1. Does it contain a classifiable insight?
     - YES -> classify
     - NO -> skip (small talk, logistics, greetings)

  2. Classify into ONE category:
     - Pain Point
     - Feature Request
     - Success Story
     - Repeated Question
     - Industry Trend
     - Competitive Intel
     - Internal Friction

  3. Assign confidence:
     - high: direct quote, quantitative data, multiple sources
     - medium: clear inference, single source, qualitative
     - low: vague, indirect, needs more context

  4. Extract:
     - raw_text (original quote or paraphrase)
     - source (channel, page, transcript)
     - extracted_insight (1-sentence summary)
     - timestamp
```

**Deduplication:** If the same insight appears in multiple sources, merge into ONE entry with multiple source references. Increase confidence.

**Present extraction summary:**

```
INSIGHTS EXTRACTED

Total: 12 insights from 153 raw inputs

By category:
  Pain Point: 4
  Feature Request: 2
  Success Story: 1
  Repeated Question: 3
  Industry Trend: 1
  Competitive Intel: 1
  Internal Friction: 0

By confidence:
  High: 3
  Medium: 7
  Low: 2

Proceed to content idea generation?
```

---

### Step 4: Generate Content Ideas

For EACH extracted insight, generate a micro-brief:

```
For each insight:

  1. Title Hook
     - Headline that would work for blog/social
     - Must be specific, not generic
     - Include the tension or surprise

  2. Core Insight
     - One sentence: what's the real takeaway?
     - Frame for the TARGET AUDIENCE (not internal)

  3. Angle
     - How to approach this content
     - What makes OUR perspective unique?
     - Connect to brand positioning (if available)

  4. Content Type
     - Best format for this insight
     - Primary: blog, social, video, FAQ, case-study
     - Channels: LinkedIn, Twitter, blog, newsletter

  5. Priority
     - high: multiple sources, quantifiable, timely
     - medium: single source, clear value, not urgent
     - low: interesting but not actionable yet
```

**Present top ideas (example):**

```
CONTENT IDEAS — 12 from 12 insights

1. [HIGH] "El Coste Oculto de un Pricing Confuso"
   Repeated Question | Blog + LinkedIn | /seo-content

2. [HIGH] "Como [Cliente] Redujo el Churn un 62%"
   Success Story | Case study | /seo-content

3. [HIGH] "5 Senales de que tu Onboarding esta Roto"
   Pain Point | Blog + Twitter | /content-atomizer

4. [MED] "La Regulacion de IA que tu SaaS Necesita Conocer"
   Industry Trend | LinkedIn + newsletter | /seo-content

5. [MED] "Por que Construimos [Feature]"
   Feature Request | Product update | /content-atomizer
```

---

### Step 5: Detect Patterns

Cross-reference ALL insights for recurring themes:

```
PATTERN DETECTION

Analyze across all insights:

  1. Same topic in 2+ sources?
     -> Flag as "recurring theme"
     -> Recommend content SERIES, not single piece

  2. Same category dominant?
     -> If 50%+ are Pain Points: product has UX issues
     -> If 50%+ are Feature Requests: roadmap communication gap
     -> If 50%+ are Repeated Questions: documentation gap

  3. Temporal patterns?
     -> Compare with previous daily-pulse outputs
     -> Is this topic NEW or has it appeared before?
     -> Growing frequency = escalating importance
```

**Present patterns:**

```
PATTERNS DETECTED

1. "Pricing Confusion" (3x) — Slack, Meeting, Support
   Recurring — recommend content SERIES

2. "Onboarding Friction" (2x) — Slack, Transcript
   Emerging — monitor next week
```

---

### Step 6: Write Output

**Save to:** `./brand/daily-pulse-YYYYMMDD.json` (see Output Format below for full schema)

**Append summary to:** `./brand/assets.md` with date, insight count, top patterns, and file path.

---

### Step 7: Present to User

**Final presentation format:**

```
DAILY PULSE — 2026-02-21

Sources: Slack (3 ch), Notion (6 pages), 1 transcript
Raw: 153 | Insights: 12 | Ideas: 12

CATEGORIES: Pain Point (4), Feature Request (2), Success Story (1),
            Repeated Question (3), Trend (1), Competitive (1)

PATTERNS
  "Pricing Confusion" — 3 sources (HIGH)
  "Onboarding Friction" — 2 sources (monitor)

TOP 3 IDEAS
1. [HIGH] El Coste Oculto de un Pricing Confuso
   Blog + LinkedIn | /seo-content
2. [HIGH] Como [Cliente] Redujo el Churn un 62%
   Case study | /seo-content
3. [HIGH] 5 Senales de que tu Onboarding esta Roto
   Blog + Twitter | /content-atomizer

SAVED: ./brand/daily-pulse-20260221.json

NEXT: /seo-content, /content-atomizer, /direct-response-copy
```

---

## Output Format

The daily-pulse JSON schema:

```json
{
  "date": "YYYY-MM-DD",
  "source": "daily-pulse",
  "sources_scanned": {
    "slack_channels": ["string"],
    "notion_pages": 0,
    "transcripts": 0,
    "manual_inputs": 0
  },
  "insights": [
    {
      "id": "insight-NNN",
      "category": "Pain Point | Feature Request | Success Story | Repeated Question | Industry Trend | Competitive Intel | Internal Friction",
      "raw_text": "Original text or paraphrase",
      "source": "Source identifier (channel, page, transcript)",
      "extracted_insight": "One-sentence summary",
      "confidence": "high | medium | low",
      "timestamp": "ISO 8601"
    }
  ],
  "content_ideas": [
    {
      "id": "idea-NNN",
      "from_insight": "insight-NNN",
      "title_hook": "Headline for the content piece",
      "core_insight": "One-sentence takeaway for the audience",
      "angle": "Our unique perspective or approach",
      "content_type": "blog | social | video | FAQ | case-study | newsletter",
      "channels": ["LinkedIn", "blog", "Twitter", "newsletter"],
      "priority": "high | medium | low"
    }
  ],
  "patterns_detected": [
    {
      "theme": "Short theme description",
      "occurrences": 0,
      "sources": ["Source list"],
      "significance": "Why this matters + recommendation"
    }
  ],
  "metadata": {
    "mode": "FULL | PARTIAL | LIGHT | MANUAL",
    "total_raw_inputs": 0,
    "total_insights": 0,
    "total_ideas": 0,
    "total_patterns": 0,
    "processing_time": "X min"
  }
}
```

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| ./brand/positioning.md | Our unique angle | Filter: insights must be relevant to our market |
| ./brand/voice-profile.md | Our tone and style | Adaptation: frame content ideas in our voice |
| ./brand/content-ideas.json | Existing ideas | Deduplication: skip insights already captured |
| ./brand/competitors.json | Competitor names | Detection: flag competitive intel mentions |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| ./brand/daily-pulse-YYYYMMDD.json | Full daily pulse output |
| ./brand/assets.md | Append: daily pulse summary |

### Chains to

- `/insight-to-content-mapper` — Route ideas to specific content skills
- `/keyword-research` — Map insights to SEO keywords
- `/seo-content` — Write articles from high-priority ideas
- `/content-atomizer` — Turn ideas into multi-platform content
- `/direct-response-copy` — Adapt pain points into ad copy

---

## Reference Files

Read these for detailed guidance:

- [insight-categories.md](references/insight-categories.md) — Classification criteria for each insight type
- [source-config.md](references/source-config.md) — How to configure and query each data source

---

## Frequency

**Recommended cadence:**
- **Daily**: Automated via scheduler (morning or EOD)
- **Post-meeting**: Ad-hoc run after important client calls
- **Weekly review**: Compare daily pulses for pattern evolution

**Scheduler integration:**
- Can be added to morning briefing pipeline
- Output feeds into weekly content planning
- Patterns accumulate over time for strategic content decisions

**Why daily matters:**
- Insights are perishable — a pain point mentioned today is content-ready NOW
- Frequency builds pattern detection accuracy
- Daily habit = never run out of content ideas

---

*Escucha primero. Clasifica despues. Crea con datos, no con suposiciones.*
