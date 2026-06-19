---
name: keyword-antenna
description: Recurring SEO keyword antenna for the Blog channel. Discovers NEW keyword opportunities against the validated content pillars and drops them as enriched `seo` Ideas in the queue. The last step of the blog SEO lifecycle; seeded by keyword-research (keyword-plan.md + keyword-clusters.json).
metadata:
  source: SanchoCMO
  system: SanchoCMO
  phase: antenna
  origin: SAN-260
agent: dulcinea
context_required:
- brand/{slug}/content/content-pillars.md
- brand/{slug}/go-to-market/keyword-plan.md
- brand/{slug}/go-to-market/keyword-clusters.json
- brand/{slug}/market-and-us/competitors/competitors.current.md
context_writes:
- brand/{slug}/content/idea-queue.json
- brand/{slug}/content/research-signals/{date}-keywords.json
- brand/{slug}/recurring-tasks/content-keyword-research/{date}.json
---

# /keyword-antenna -- recurring SEO keyword discovery for the Blog

The antenna is the **last step** of the blog SEO lifecycle: it runs on a cron,
finds **new** keyword opportunities against the **already-validated content
pillars**, and leaves them as enriched `seo` Ideas in the queue → approve → draft
→ publish. It does NOT invent strategy: it works against `keyword-plan.md` +
`keyword-clusters.json` (produced by `/keyword-research`).

**Scoring + writing are NOT your job** — the shared data layer does both. You run
discovery and POST candidates; the endpoint scores them (priority = businessValue
× winnability × demand × strategicFit; AEO `aiOpportunity` separate; anti-thin
guardrail) and writes the enriched `seo` Ideas. If you have a strong brand POV
angle, include `angleDraft`; otherwise the endpoint generates a deterministic SEO
angle so approvals never create blank drafts. One implementation, two surfaces
(the MCP tool `sancho_run_keyword_antenna` does the same in-process).

> **cwd warning (cron):** the cron runs with cwd at `~/.openclaw`, not
> `workspace-sancho/`. The `brand/{slug}/...` paths below are resolved correctly by
> your file-read/-write tools — use them as-is. Do NOT run shell (`jq`, `cat`,
> `ls`) against those relative paths; the shell won't find them and the cron will
> log a failure even when the file was written fine. Verify with the file-read
> tool, not shell.

## PASO 1 — Read the validated strategy
- `brand/{slug}/content/content-pillars.md` — the pillars (TEMAS, pain/BOFU) + spokes.
- `brand/{slug}/go-to-market/keyword-plan.md` + `keyword-clusters.json` — the validated clusters (pillar keys P1/P2…, intent, content_type, priority). If these don't exist yet, note it and run with pillars + declared targets only (lower confidence).
- `brand/{slug}/market-and-us/competitors/competitors.current.md` — named competitors.
- The declared SEO targets (from the antenna config / Foundation), e.g. "mejores agencias de growth", "best open-source CMO".

## PASO 2 — Discover NEW candidates (native modes + consumed signals)
Map every candidate onto an **existing pillar** (`pillarId: "P1"…`). A keyword seen via ≥2 modes is stronger.

**Native (no paid data — always available):**
- **① Identity** — declared targets + pillar spokes not yet covered → set `strategicFlag: true`, `discoveredBy: ["identity"]`.
- **③ 6-Circles / autocomplete** — expand around the pillars via WebSearch (autocomplete, "People Also Ask", related searches). `discoveredBy: ["six-circles"]`.

**Consumed from Intelligence & Metrics (only if connected — do NOT fabricate):**
- **competitor-gap** — keywords competitors rank for and we don't (`discoveredBy: ["competitor-gap"]`).
- **gsc-nearmiss** — page-2 near-misses from GSC (`winnability.currentRank` 8–20; `discoveredBy: ["gsc-nearmiss"]`).
- **AEO** — `aiCitability: { aiOverviewPresent, citedNow, shareOfVoice }`.

If DataForSEO / GSC / AEO signals are unavailable, **skip those modes** and leave their fields out (the scorer treats missing demand/winnability/AEO as unknown, not zero). Never invent volumes or rankings. Dedupe before sending; cap ~20 new candidates per run.
When possible, include `angleDraft`: one concise editorial angle from the brand POV.

## PASO 3 — Promote (same rail as the antennas)
POST the candidates to the shared endpoint — it scores + writes the enriched `seo` Ideas (lossless).
The endpoint requires **admin auth** (same rail as Editorial Dispatch): read `adminToken` from the
**root** of `~/.openclaw/workspace-sancho/clients.json` (file-read tool, **not** shell — it sits at the
same level as `clients`, not inside any client entry) and pass it as the `x-admin-token` header. A
`403` means the token wasn't read correctly — re-read `clients.json`.

```bash
curl -fsS -X POST "$MC_BASE/api/content-engine/keyword-antenna" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: <adminToken de la raíz de clients.json>" \
  -d '{"slug":"{slug}","action":"promote","candidates":[
        {"keyword":"mejores agencias de growth","pillarId":"P1","discoveredBy":["identity","competitor-gap"],
         "intent":"commercial","bofuCategory":"best-of","strategicFlag":true,
         "demand":{"volume":1300,"trend":"up"},"winnability":{"kdGap":12,"currentRank":14,"serpPageType":"listicle"},
         "aiCitability":{"aiOverviewPresent":true,"citedNow":false,"shareOfVoice":0},"recommendedPageType":"comparison",
         "angleDraft":"Responder desde el POV de marca: que hace que una agencia sea realmente de growth y que senales separan sistema de ruido."}
      ]}'
```
The response is `{ ok, action:"promote", created:[...], skipped:[...], total }`. Each created Idea carries top-level `pillar_id`, `angle_draft`, `source:"keyword-antenna"`, the enriched `seo` block, and `source_signals:["kw-…"]` (which lights up the **🔑 Keywords** filter in the Ideas tab). Append-only and deduped by keyword — re-running is safe.

## PASO 4 — Audit log + recurring-task (fills the blog antenna slot)
1. Audit log → `brand/{slug}/content/research-signals/{YYYY-MM-DD}-keywords.json` (the raw candidates you sent, for traceability — nothing else reads it).
2. Recurring-task → `brand/{slug}/recurring-tasks/content-keyword-research/{YYYY-MM-DD}.json` (this is what populates the **"Keyword Research"** antenna card on the Blog channel loop):
```json
{
  "cronName": "Content: Keyword Research — {NAME}",
  "slug": "{slug}",
  "date": "{YYYY-MM-DD}",
  "runAtMs": 0,
  "status": "ok",
  "last_finding": "<1-2 frases: N ideas SEO nuevas; highlight la de mayor prioridad>",
  "ideas_created": 0,
  "signals_count": 0,
  "per_pillar": { "P1": 0, "P2": 0 }
}
```
Set `signals_count` = `ideas_created` (the channel-loop reader uses `signals_count`). If DataForSEO/GSC weren't available, set `status:"degraded"` and say which modes ran in `last_finding`. If the discovery step fails entirely, `status:"error"`, `ideas_created:0`, and the reason in `last_finding`.
