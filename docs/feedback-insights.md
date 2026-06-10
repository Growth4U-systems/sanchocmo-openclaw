# Feedback Insights — Env Prerequisites & Deploy Notes

## Required env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `SANCHO_INTERNAL_API_TOKEN` | MC (Next.js) **and** gateway/agent host | MC exposes the ingest endpoint; Sansón's curl POSTs back using this Bearer token |
| `MC_CHAT_GATEWAY` | MC | URL of the OpenClaw gateway (already used by writer-trigger) |
| `MC_CHAT_SECRET` | MC | Shared secret for `X-MC-Secret` header (already used by writer-trigger) |

## Gateway host setup

The shared skill `skills/_shared/feedback-triage.md` must be synced to `~/.openclaw/skills/_shared/` on the gateway host so Sansón can read it at runtime.

## Database migration

Run migration `0007_feedback_insights.sql` before the first request hits the new endpoints. On staging/prod this runs automatically via `RUN_DB_MIGRATIONS=1` at deploy time. Locally, run `npm run db:migrate` (requires `DATABASE_URL` to be set).

## UI entry point

The review panel is wired into `/dashboard/<slug>/intelligence` under the **Mejoras** tab (`#mejoras`). It lists insights grouped by category (skill / client / form / other) with Aceptar/Descartar actions.

## Trigger flow

1. **Auto**: When a commented content draft reaches the `draft` phase via the content-tasks PATCH, `triggerFeedbackTriage` fires automatically (fire-and-forget, no-ops if no comments).
2. **Manual**: POST `/api/clients/:slug/analyze-feedback` with `{ docPath, skillId? }` to trigger on demand.

Sansón runs `skills/_shared/feedback-triage.md`, classifies comments, and POSTs results back to `/api/clients/:slug/feedback-insights/ingest`. Accepted `skill` insights are appended to `_system/skill-execution-log.jsonl`; `client` insights to `brand/<slug>/client-preferences.md`; `form` insights to `_system/onboarding-form-backlog.md`.
