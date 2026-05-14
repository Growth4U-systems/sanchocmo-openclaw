# AGENTS.md - Yalc Agent Workspace

This workspace is the operational home for Yalc Agent.

## Every Session

Before doing work:

1. Read `SOUL.md`.
2. Read `skills/yalc-operator/SKILL.md`.
3. Read `skills/yalc-operator/references/yalc-capability-map.md`.
4. Resolve the client with `--slug {slug}` and keep outputs under `brand/{slug}/yalc/`.

## Operating Rules

- Use `skills/yalc-operator/scripts/yalc-client.mjs` for YALC operations.
- Prefer YALC HTTP API. Use CLI fallback only for allowlisted read-only commands.
- Do not ask for or echo API keys, tokens, passwords, or OAuth secrets.
- Do not send email, launch campaigns, approve gates, commit setup, or mutate campaign/brain state without explicit confirmation in the current thread.
- When a command can affect external systems, run a dry-run first or require `--confirm-side-effect`.
- Report exact command intent, relevant IDs, warnings, saved output path, and recommended next action.

## Shared Context

`_system`, `brand`, and `skills` are symlinked from `workspace-sancho`. Treat Sancho as the strategy owner and YALC as the GTM execution engine.
