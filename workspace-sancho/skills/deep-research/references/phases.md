# Deep Research - The 7 Phases

Each phase produces an artifact. Never skip a phase. The output of each feeds the next.

```
SCOPE → SOURCES → EXTRACT → FRAMEWORK → DETAIL → QA → DELIVER
  1        2         3          4          5       6      7
```

---

## Phase 1: SCOPE

Define exactly what we're researching before touching any source.

### Inputs to Capture

| Field | Example (Overdrafts) |
|-------|---------------------|
| **Research question** | How do Spanish banks handle overdrafts? Opt-in vs tacit? |
| **For whom** | Mauricio (Monzo Spain GTM) |
| **Entities to cover** | All major retail banks in Spain (ING, BBVA, CaixaBank, N26...) |
| **Data points per entity** | Model type, activation, limits, costs, grace period, sources |
| **"Complete" means** | Every bank with >1M customers in Spain covered |
| **Output format** | Markdown report with executive summary + bank-by-bank breakdown |
| **Client folder** | `01-business/clients/[client]/research/` |

### Rules

- If user hasn't specified scope clearly, ask with `AskUserQuestion` before proceeding.
- Write scope as a 3-5 line brief at the top of the working document.
- **Scope defines the stopping criteria** - without it, research never ends.

---

## Phase 2: SOURCE DISCOVERY

Find ALL relevant sources before extracting any data. See [sources.md](sources.md) for category priorities and A/B/C reliability rating.

### Search Strategy

Run **minimum 5 different search queries** per section, varying:
- **Language** - Spanish + English for Spain topics
- **Angle** - product name, regulatory term, comparison term, consumer forum
- **Source type** - official sites, comparison platforms, regulators, news, forums

### Output

**Source inventory list** (one row per source): URL + what it likely contains + reliability rating (A/B/C).

**Minimum 10 sources** before proceeding. If <10, run more search queries.

### Phase 2b: SOCIAL PULSE (Conditional - `last30days`)

**Activate when** the research topic has social/community dimension, recency matters, or user sentiment is relevant.

| Activate | Skip |
|----------|------|
| Community perception matters | Regulatory/legal research |
| Topic is trending or emergent | Historical analysis |
| Need market buzz beyond official data | Product feature comparison from official docs |
| User sentiment drives the insight | Topic too niche for social media |

**Process:**
1. Run `python3 ~/.claude/skills/last30days/scripts/last30days.py "[research topic]"` via Bash (foreground, 5-min timeout)
2. The script searches Reddit, X (Twitter), YouTube, TikTok, Hacker News, GitHub, Polymarket, web for the last 30 days
3. Integrate findings as a "Social Pulse" source category (Priority 5b) in the source inventory
4. Feed social sentiment data into Phase 3 extraction alongside official sources

**If unsure**, ask: "This topic may benefit from a social pulse check (Reddit, X, YouTube, TikTok last 30 days). Should I run it?"

---

## Phase 3: DATA EXTRACTION

Extract structured data from each source. **Save everything to the raw/ folder.**

### Process

1. **Create `{topic}-raw/` folder** in the research directory
2. Save scope brief to `{topic}-raw/scope.md`
3. Save source inventory to `{topic}-raw/sources-inventory.md`
4. Open each source (`WebFetch` or `WebSearch` for key claims)
5. **Save each extract** to `{topic}-raw/extracts/{source-slug}.md` — include URL, date accessed, and raw extracted content
6. Extract data points matching the scope definition
7. Use **consistent field structure** across all entities
8. Note source URL for EVERY data point
9. Mark confidence: `verified` (official source) / `reported` (secondary) / `inferred` (deduced)

### Rules

- **One claim, one source minimum.** No unsourced claims.
- When sources conflict, note BOTH versions and flag for Phase 6 (QA).
- Extract raw data first — don't synthesize yet.
- For numerical data: always note the date/year.
- **All raw data lives in `{topic}-raw/`.** The final document will synthesize this, not reproduce it.

---

## Phase 4: FRAMEWORK & TAXONOMY

Create the organizing structure that makes the data intelligible.

### Process

1. Review all extracted data
2. Identify natural groupings, patterns, categories
3. Create a taxonomy or framework that explains the landscape
4. Build comparison tables

### Example (from Overdrafts research)

The data revealed **3 models**, not the assumed 2:
1. **Opt-In** (customer activates) - ING, N26, Openbank
2. **Opt-Out** (bank activates, customer can disable) - BBVA
3. **Pure Tacit** (no control) - Santander, Sabadell, etc.

### Output

- Taxonomy diagram or table
- Summary table (entities as rows, key dimensions as columns)
- Key insight: what's the non-obvious finding?

### Rule

The framework should **surprise the reader** with a non-obvious insight. If it just confirms what everyone already knows, dig deeper.

---

## Phase 5: DETAILED ANALYSIS — WRITING THE DOCUMENT

This is where you write the **final analytical document**. See [templates.md](templates.md) for structure and examples.

### Mindset Shift

Phases 1-4 were about COLLECTING and ORGANIZING. Phase 5 is about WRITING FOR A READER.

The output is a **document that explains the topic**, not a log of what you found. Think of it as writing an analyst report, a magazine deep-dive, or a consulting deliverable. The reader doesn't care about your process — they care about understanding the topic.

### Process

1. Save framework notes to `{topic}-raw/framework-notes.md`
2. Write the document following the template in [templates.md](templates.md)
3. Write in **analytical prose**: context → findings → analysis → implications
4. Integrate data INTO the narrative (not as standalone tables/lists)
5. Tables are tools within the prose, not the main content
6. Every section answers "so what?" — not just "what did I find?"

### Rules

- **PROSE FIRST** — The document reads as a coherent narrative, not a data dump.
- Every entity gets the **same depth** of analysis (symmetric coverage).
- Executive summary must be standalone — readable without the detail sections.
- Include a "Recommendations" section with actionable takeaways for the stakeholder.
- **Sources go ONLY in the References section at the end** — cited inline as [N].
- **NEVER include**: list of searches performed, process narration, source inventories as content, raw extracts, internal notes. All that lives in `{topic}-raw/`.

---

## Phase 6: QA VERIFICATION (Mandatory)

**This phase is NOT optional. Every deep research MUST be QA'd.**

### Process

1. Save the analysis document to the client research folder
2. Invoke `qa-bot` on the saved document (Deep QA mode by default)
3. The QA bot will:
   - Extract all factual claims
   - Generate 10-15 verification questions (Deep QA mode)
   - Independently verify each claim via web search
   - Compare against the document
   - Produce a QA Report with confidence score

### After QA - Verdict thresholds

See [quality.md](quality.md) for detailed thresholds.

| QA Verdict | Action |
|------------|--------|
| **PASS** (score ≥9/10) | Proceed to Phase 7 |
| **NEEDS REVISION** (7-8.9/10) | Fix flagged issues, re-run QA on fixes only |
| **MAJOR ISSUES** (<7/10) | Rework affected sections, full QA re-run |

### Rules

- Fix ALL errors and discrepancies before delivering.
- For UNVERIFIABLE claims: either find a source, mark explicitly as "no public data available", or remove the claim.
- Save the QA report alongside the analysis: `QA-REPORT-[filename].md`

---

## Phase 7: DELIVER

### File Outputs

Save to `01-business/clients/[client]/research/` (or `brand/{slug}/{pilar}/current.md` if profundización Foundation):

| File | Content |
|------|---------|
| `[topic]-analysis.md` | The final analytical document (prose, for the reader) |
| `[topic]-raw/` | All raw data, extracts, source inventory, framework notes |
| `QA-REPORT-[topic]-analysis.md` | The QA verification report |

**Verificación final:** antes de entregar, relee el documento como si fueras el lector. Si ves listas de fuentes como contenido principal, narración de pasos, o "busqué X e Y" — reescribe esas secciones como prosa analítica.

### Versionado (caso Foundation)

Si es profundización de un documento Foundation existente:
1. Backup: `current.md` → `v{N+1}.md`
2. Marca al inicio del nuevo `current.md`: `<!-- deep-research: YYYY-MM-DD | fuentes: N | búsquedas: M | qa-score: X/10 -->`
3. Update `history.json` y `brand/{slug}/intelligence/research-log.json`:

```json
{
  "date": "YYYY-MM-DD",
  "document": "file.md",
  "original_version": "file.v1.md",
  "sources_found": 15,
  "searches_executed": 42,
  "qa_score": 9.2,
  "gaps_remaining": ["dato X sin fuente cruzada"],
  "duration_seconds": 600
}
```

### Notion (if requested)

Create a Notion page under the client's workspace with the executive summary + link to full analysis.

### Handoff

Present to the user:
1. Executive summary (inline in chat)
2. Key non-obvious finding
3. QA confidence score
4. File paths where everything is saved
5. Notion link (if created)
