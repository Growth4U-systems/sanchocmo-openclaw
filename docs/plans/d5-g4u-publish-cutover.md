# D5 — G4U publish cutover (runtime, post-merge)

> This is a **runtime** runbook, executed by SSH on staging then prod **after** the D5 code merges.
> It is NOT part of the PR. The code ships Slack as the default publish path; G4U's existing crons still
> carry Discord assumptions baked into runtime data (`cron/jobs.json` in the volume + per-brand
> `client-config.json`), so they need a config + prompt cutover.

## Deploy safety (no hard regression)

Merging + deploying does **not** break crons: a publishing cron with no Slack channel
configured now **skips publishing and logs it** (`skipped: no_publish_channel`) instead of
erroring — its data work still runs. So this cutover can be done calmly after deploy, not as a
blocking gate. Find what's pending two ways:

- **UI**: Recurring Tasks shows an amber `⚠️ Sin canal` badge on each publishing cron without a channel.
- **Script**: `node scripts/audit-publish-channels.mjs` (set `MC_WORKSPACE` or `--workspace`) lists,
  per brand, publishing crons missing a Slack channel or still holding a Discord id.

A cron whose channel IS set but fails to post (bad token, channel_not_found) still errors loudly.

## Background

- D5 made cron publishing config-driven: skills/templates now `POST /api/integrations/publish` with a
  `cronKey`; the endpoint resolves transport+channel from `brand/<slug>/client-config.json`
  (`crons.<cronKey>.publish_transport` / `publish_channel`, Slack default) via the transport registry
  (`src/lib/publish/registry.ts`, only `slack` registered).
- G4U's active `cron/jobs.json` prompts (runtime data, not repo) still say "publica en Discord
  #intelligence" with the old `message(channel=discord, …)` thread pattern, and `client-config.json`
  cron entries use Discord friendly-name channels.

## Steps (staging first, then prod)

1. **Set per-cron Slack channels in each active brand's `client-config.json`.**
   For `brand/<slug>/client-config.json`, add `publish.default_transport: "slack"` and, per cron under
   `crons`, set `publish_transport: "slack"` + `publish_channel: "<Slack channel id>"`.

   Map G4U's destinations to Slack channels (confirm ids with `GET /api/integrations/slack/list-channels`
   or the Slack UI):

   | cronKey | old Discord dest | new Slack channel |
   |---|---|---|
   | `daily_pulse` | #intelligence | `C…` (TBD by user) |
   | `weekly_synthesis` | #learning | `C…` |
   | `morning_metrics` | #intelligence/insights | `C…` |
   | `performance_analysis_weekly` | #intelligence | `C…` |
   | `meeting_intelligence` | #intelligence | `C…` |
   | `idea_generation` | #intelligence | `C…` |
   | `lead_intelligence` | #intelligence | `C…` |
   | `sales_call_prep` | #intelligence | `C…` |

2. **Re-seed / edit the free-form job prompts** in the runtime `cron/jobs.json` so the PASO PUBLICAR
   uses the endpoint (matching the updated `_system/cron-templates.json`). Either:
   - re-run the seeding (`workspace-sancho/scripts/create-client-crons.sh <slug>`) for crons sourced from
     `cron-templates.json`, or
   - hand-edit the baked prompts of the Nightly jobs (Lead Intelligence Hub, Sales Call Prep) to call
     `POST /api/integrations/publish` with their `cronKey`.

3. **Verify one cron end-to-end:** trigger a cron (or run its skill manually) and confirm the summary
   lands in the configured Slack channel (root message + threaded body) and an activity-log `publish`
   event is written. Repeat for prod once staging is confirmed.

## Rollback

Set `publish_transport` back per cron only matters once a non-Slack transport exists; today Slack is the
only registered transport. To pause publishing for a cron during cutover, set its `publish_channel` to an
empty string (the endpoint returns a 400 the skill reports) or disable the cron.
