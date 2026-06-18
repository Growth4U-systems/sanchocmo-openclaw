# Engineering Standards — sanchocmo-openclaw

The single source of truth for **how code should be designed here**. Skills, git
hooks, and CI all point back to this file so the rules never drift across places.

This repo is operated **through Claude Code, often by someone who is not a
developer**. That person cannot be the one who catches a design mistake in
review. So our standards are enforced in **layers (defense in depth)**, and each
rule lives at the strongest layer its nature allows:

| Layer | Catches | Examples | Can a non-dev rely on it? |
|---|---|---|---|
| **Hooks + CI** (deterministic) | Mechanical violations | secret committed, hardcoded path, storage change with no migration | Yes — a machine blocks it, no judgment needed |
| **Skills** (model judgment) | Things needing understanding | SOLID, "improve what you touch" | Mostly — the agent applies them while writing |
| **This doc** (source of truth) | "What is good here" + "where we're migrating to" | the debt register below | It's the reference the other two cite |
| **CLAUDE.md** (always loaded) | Short always-on pointers | the 3 non-negotiables | Yes — always in context |

The bar is **the published practice of elite engineering orgs** (Google
[Engineering Practices](https://google.github.io/eng-practices/), Apple
[API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)
& [HIG](https://developer.apple.com/design/human-interface-guidelines/)), plus
industry bodies: [SOLID](https://en.wikipedia.org/wiki/SOLID),
[The Twelve-Factor App](https://12factor.net/),
[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/). Adapt the principle; don't cargo-cult
the ceremony.

---

## The three non-negotiables

These are always on. The first two are also enforced by a machine (see
[Enforcement](#enforcement)); the third is a design principle the skills apply.

1. **A change to how data is stored ships with its migration + an application
   plan.** If you change the shape of stored data — DB schema, on-disk brand
   files, or a JSON document shape — you also ship the script that brings
   *existing* data forward, and you record **how it gets applied** in
   [`runbooks/storage-structure-change.md`](runbooks/storage-structure-change.md).
   A schema change with no migration leaves every existing brand broken. See
   [Data & storage changes](#data--storage-changes).
2. **Never commit a secret.** No API keys, tokens, passwords, connection strings,
   or device keys in tracked files — ever. Secrets live in `.env` (untracked) and
   are surfaced via environment variables. See [Security](#security).
3. **Follow SOLID.** New code is designed for change, not just to pass today. See
   [Design principles](#design-principles).

---

## Design principles

Write code the way a senior engineer at a top org would: optimized for the next
person who has to change it, not for cleverness now.

### SOLID — and *why* each letter matters

- **S — Single Responsibility.** A module has one reason to change. In this repo
  that shows up as *pure validators separate from I/O*: `validateX()` functions
  never touch the DB or filesystem, so they're unit-testable in isolation (see
  `src/lib/comments.ts`, `src/lib/feedback-insights.ts`). Mixing the two means a
  schema tweak and a validation tweak fight over the same file.
- **O — Open/Closed.** Extend without editing the core. Our API handlers compose
  behavior with higher-order wrappers (`compose(withErrorHandler, withAuth)` in
  `src/lib/api-middleware.ts`) instead of each route re-implementing auth and
  error handling. New cross-cutting behavior = a new wrapper, not edits to 245
  routes.
- **L — Liskov Substitution.** A subtype must honor the contract of its base. If
  two implementations sit behind one interface (e.g. JSON vs Neon task backends),
  callers must not need to know which one they got.
- **I — Interface Segregation.** Don't force callers to depend on methods they
  don't use. Prefer small focused functions exported by name over a god-object.
- **D — Dependency Inversion.** Depend on abstractions, not concretions. App code
  talks to `openclaw` through typed wrappers (`src/lib/data/openclaw-*.ts`), never
  by reaching into its internals — which is also why we **never fork openclaw**.

### Beyond SOLID

- **Composition over inheritance.** The middleware HOFs are the house style. Reach
  for a class hierarchy only when it genuinely models the domain.
- **Pure core, imperative shell.** Keep decision logic pure (no I/O) and push side
  effects to the edges. It's why our tests target pure functions (see
  [Testing](#repo-target-patterns)).
- **Explicit over implicit (least surprise).** Validate HTTP method at the top of
  a handler, cast `req.query`/`req.body` deliberately, return `res.status(n).json()`
  with intent. A reader should never have to guess control flow.
- **Twelve-Factor config.** Everything environment-specific comes from env vars,
  never from committed files. Config that differs per deploy (secrets, URLs,
  feature flags) is read from `process.env`; code stays identical across envs.

---

## Security

Aligned with [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
V6 (stored secrets) and V14 (config).

- **Secrets never enter the repo.** This already cost us once
  (SAN-233: secrets leaked when the repo went public). The rule is absolute:
  nothing secret in a tracked file.
- **Where secrets live:** `.env` / `.env.local` (both untracked), surfaced as env
  vars. `*.example` templates are the only committed env artifact and must contain
  no real values.
- **Never migrate or log secrets.** Backfill scripts, data syncs, and `console.*`
  calls must exclude `.env`, auth/session state, and tokens (the data-sync runbook
  already encodes this).
- **Enforcement is mechanical:** a `gitleaks` scan blocks the commit (pre-push) and
  the PR (CI). You should never be in a position where a human had to spot the key.

---

## Data & storage changes

The first non-negotiable, expanded. "Storage structure" spans **three backends**,
and each has a required migration artifact. If your change touches any of them,
the [storage-change skill](#related) walks you through it and the
[`lint:storage`](#enforcement) guard blocks the push until the artifact exists.

| Backend | What "structure change" means | Required artifact | Reuse |
|---|---|---|---|
| **Neon / Postgres** | Editing `src/db/schema.ts` or adding `src/db/migrations/*.sql` | A Drizzle migration (`drizzle-kit generate`) + a verification step | `npm run db:verify` (`scripts/verify-migration.ts`) |
| **On-disk brand files** | Changing the layout/contents the writers in `src/lib/data/*` produce under `brand/{slug}/` | A backfill script that walks existing brands and migrates them, with `--dry-run` and `--apply` | pattern of `scripts/migrate-projects-to-db.ts` (`db:sync-tasks:dry` / `db:sync-tasks`) |
| **JSON document shape** | Changing the shape of a stored JSON (`foundation-state.json`, `instance.json`, chat schema, etc.) | A migration that rewrites existing files to the new shape, idempotent | pattern of `scripts/audit-doc-paths.mts` (`--check` / `--fix`) |

**The application plan is mandatory and lives in a runbook.** Every storage change
adds an entry to
[`runbooks/storage-structure-change.md`](runbooks/storage-structure-change.md)
stating exactly how it is applied: which command, in which order, in which
environments (local → staging → prod), idempotency, and rollback. Production Neon
migrations are applied **separately** from the code deploy (via
`RUN_DB_MIGRATIONS=1`), so "it'll just run" is never an acceptable plan — write it
down.

---

## Repo target patterns

These are the de-facto conventions worth keeping — new code should match them.
(They were extracted from the existing codebase; they're "good," not debt.)

- **API routes:** `async function handler(req, res)` + compose middleware
  (`withErrorHandler`, `withAuth`, `withMethod`) from `src/lib/api-middleware.ts`.
  Validate the HTTP method first; respond with `res.status(n).json()`.
- **Validation:** imperative `validateX()` functions that throw a named custom
  error (`class XValidationError extends Error`), kept **pure** (no I/O). We do
  **not** use Zod here — match the existing style.
- **Testing:** Node's built-in test runner (`import { test } from "node:test"` +
  `node:assert/strict`), files named `*.test.mts`, colocated in `__tests__/`. Test
  **pure functions**; I/O (DB, filesystem) is intentionally not unit-tested.
- **Types:** `strict` TypeScript, no explicit `any` (use `unknown` + type guards),
  path alias `@/*`, `import type` for type-only imports, named exports (only route
  handlers use `export default`).
- **Paths:** never hardcode `workspace-sancho/`; derive from `BASE` in
  `src/lib/data/paths.ts`. Guarded by `npm run lint:paths`.
- **openclaw boundary:** consume via the typed `openclaw-*.ts` wrappers (CLI +
  JSON files). Never import openclaw internals, never fork it.
- **Logging:** tag `console.*` with a `[module-name]` prefix so prod logs are
  filterable; truncate large payloads before logging.
- **UI:** components follow [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) — text
  contrast ≥ 4.5:1, keyboard-operable, labelled controls. The app is ES/EN via
  `next-intl`; user-facing strings go through messages, not hardcoded.

---

## Debt register — what we're migrating *away from*

"Improve as you go" only means something if "better" has a direction. When you
touch code near one of these, nudge it toward the target **within your task's
scope** — and if the larger cleanup is out of scope, file a Linear issue rather
than ballooning your diff (see the `improve-as-you-go` skill).

| Anti-pattern (away) | Target (toward) | Where |
|---|---|---|
| Hardcoded `workspace-sancho/` paths | `BASE`-derived paths via `paths.ts` | scattered in `src/lib/data/*` |
| Legacy doc paths (`doc.md`) | Canonical `*.current.md` per `pillar-manifest` | `src/lib/doc-paths.ts`, brand files |
| Tasks/projects stored as JSON | Neon-backed via Drizzle | `src/lib/data/tasks.ts` (dual-backend in transition) |
| Mixed `PascalCase`/`kebab-case` component files | One convention per directory | `src/components/*` |
| Untyped/loose `req.query`/`req.body` reads | Deliberate casts + validation | some older API routes |
| `console.*` without a `[module]` tag | Tagged, filterable logs | older handlers |

This table is living — add rows as new debt is identified, remove them as
directions are fully migrated.

---

## Enforcement

Where each rule is actually checked (see CLAUDE.md for the short version):

| Rule | Hook (local) | CI | Skill |
|---|---|---|---|
| Conventional Commits | `commit-msg` (commitlint) | — | `git-workflow` |
| Typecheck / build | `pre-push` | `ci.yml` | — |
| No hardcoded paths | `pre-push` (`lint:paths --strict`) | — | `engineering-standards` |
| **No secrets** | `pre-push` (`gitleaks`) | `ci.yml` (`secret-scan`) | `engineering-standards` |
| **Storage change → migration + runbook** | `pre-push` (`lint:storage`) | `ci.yml` | `storage-change` |
| SOLID / design | — | — | `engineering-standards` |
| Improve what you touch | — | — | `improve-as-you-go` |

## Related

- Skills: `engineering-standards`, `improve-as-you-go`, `storage-change` (in
  `.claude/skills/`); verification reuses the `code-review` skill.
- [`runbooks/storage-structure-change.md`](runbooks/storage-structure-change.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch/commit/release flow.
