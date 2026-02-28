---
name: content-miner
description: "Classifies meeting intelligence for ONE-TO-MANY content ideas and research tasks. Detects 7 content signals (aha moments, conflicts, contrarian opinions, systems, milestones, vulnerability, metrics), classifies by Pilar/Pain/Owner/Type/Level, generates micro-briefs. CONFIGURABLE - Pilares from positioning-messaging, Pains from Context Lake, Owners from team, Types universal. Input: intelligence JSON from meeting-intelligence. Output: content-ideas JSON + research tasks. Use after meeting-intelligence runs, when need content ideas from meetings, classify insights for content, ONE-TO-MANY content planning. Triggers: mine content from meetings, classify for content, generate content ideas, content from intelligence. Do NOT use for outreach ideas (ONE-TO-ONE), extraction (use meeting-intelligence), or pattern detection (use pattern-detector)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: "Encuentra → Decide bridge"
  layer: "Content Strategy"
  type: "workflow"
  configurable: true
---

# Content Miner

> ONE-TO-MANY: Clasifica intelligence → content ideas + research tasks

CONFIGURABLE - adapts to each brand's foundation (Pilares, Pains from positioning/context).

---

## What It Does

**Input**: `intelligence/YYYY-MM-DD.json` (from meeting-intelligence)
**Process**: Detect signals → Classify → Generate micro-briefs
**Output**: `content-ideas/YYYY-MM-DD.json` + research tasks

### 7 Content Signals (Universal)

1. **Aha Moments**: Sudden insights, realizations
2. **Conflicts**: Problems solved, before/after
3. **Contrarian**: Challenges norms, unpopular opinions
4. **Systems**: Processes, frameworks described
5. **Milestones**: Wins, metrics, quantitative achievements
6. **Vulnerability**: Struggles, doubts, failures
7. **Metrics**: Before/after numbers, comparisons

### Classification (5 Dimensions)

Each content idea classified with:
1. **Pilar** (from foundation - positioning angles)
2. **Pain** (from config - customer pain points)
3. **Owner** (from team - who publishes)
4. **Type** (universal - Value/Storytelling/Results/Belief)
5. **Conversion Level** (L0/L1/L2/L3)

---

## Configuration Sources

**Pilares** (from foundation):
- Load: `positioning-messaging` output (positioning angles)
- Fallback: `brand-voice` personality traits
- Example (G4U): Sistemas, IA, BIP, Fintech, Ops, Casos

**Pains** (client-specific):
- Load: `Context Lake/pains.json`
- Configured during: foundation OR sancho-start
- Example (G4U): P1 CAC, P2 Trust, P3 Growth, etc.

**Owners** (from team):
- Load: `Context Lake/team.json` (sancho-start Pregunta 3)
- Assign by: Pilar ownership (who leads each angle)
- Example (G4U): Alfonso (strategy), Martín (tactics)

**Types** (UNIVERSAL - hardcoded):
- Value Post
- Storytelling
- Results
- Belief Shifting

**Conversion Levels** (default, adjustable):
- L0: 50% (Engagement)
- L1: 30% (Lead Magnet)
- L2: 15% (Long content)
- L3: 5% (Direct sale)

---

## Process

### Step 1: Load Configuration

```
1. Load Context Lake/pains.json → customer pain points
2. Load Context Lake/team.json → owners + pilar assignments
3. Load positioning-messaging → pilares (angles)
4. Fallback brand-voice → if positioning not complete
```

### Step 2: Load Intelligence

```
Read: intelligence/YYYY-MM-DD.json
Filter: content-rich items (≥2 signals detected)
```

### Step 3: Signal Detection

For each intelligence item (decision, insight, quote):
- Scan for 7 signal types
- If ≥1 signal → content-mineable
- Extract verbatim quote + context

### Step 4: Classification

For each content-mineable item:
```
1. Map to Pilar (which positioning angle?)
2. Map to Pain (which customer pain does this address?)
3. Assign Owner (based on Pilar ownership from team config)
4. Determine Type (Value/Story/Results/Belief based on signal)
5. Assign Level (L0-L3 based on Pilar ratio)
6. Add Lead Magnet (if L1, from pilar LM map)
```

### Step 5: Generate Micro-Brief

```
{
  "title_hook": "80 char max hook",
  "core_insight": "What makes this valuable",
  "angle": "How to position (from pilares)",
  "type": "Value Post",
  "pilar": "Sistemas",
  "pain": "P1 CAC",
  "owner": "Alfonso",
  "level": "L0",
  "quote": "Verbatim from source",
  "source": "Link to meeting"
}
```

### Step 6: Research Tasks (If needed)

If insight requires more research:
```
{
  "task": "Research [topic] for content piece",
  "why": "Need data/examples to support angle",
  "assignee": "[Owner] or research team",
  "priority": "high|medium|low"
}
```

### Step 7: Save Output

```
Save: content-ideas/YYYY-MM-DD.json
{
  "date": "2026-02-21",
  "ideas": [...],
  "research_tasks": [...],
  "signals_detected": {...},
  "config_used": {
    "pilares": [...],
    "pains": [...],
    "owners": [...]
  }
}
```

---

## Output Uses

**content-ideas** feed into:
- seo-content (write blog posts)
- social-content (LinkedIn, Twitter posts)
- newsletter (weekly editions)
- lead-magnet (expand into magnets)

**research-tasks** feed into:
- deep-research (Gemini research)
- competitor analysis
- market data gathering

---

## For Complete Details

- [content-signals.md](references/content-signals.md) - 7 signal types (universal)
- [types-taxonomy.md](references/types-taxonomy.md) - 4 Types (universal)
- [configuration-guide.md](references/configuration-guide.md) - How to configure per brand
