# SDP-P001 — Normative data-platform ADR

- **Status:** Approved (build target for SAN-490)
- **Produces:** [`docs/adr/0001-data-platform-boundaries.md`](../../adr/0001-data-platform-boundaries.md)
- **Batch:** metrics foundation pilot (P001…P005). P002–P005 remain drafts in the
  planning workspace (`.context/plans/metrics-loop-pilot/`) until scheduled.

## Problem

The metrics PRD defines the target architecture, but implementations need one
short normative decision that fixes boundaries, authorities and the status of
each component.

## Acceptance Criteria

- [x] AC-1 — The ADR fixes the path from external and internal sources through a
  private S3-compatible Object Storage Raw zone, Parquet Bronze/Silver, a transform
  tier, Neon Gold and the semantic API. *(Amended from the pilot draft: the
  object-storage vendor — Hetzner candidate — and the transform engine — DuckDB/dbt
  — are named as candidates and deferred, not settled, because the master
  architecture the ADR distills is itself vendor-neutral and defers dbt. See ADR
  D5/D6.)*
- [x] AC-2 — It makes immutable `tenant_id`, provider-neutral contracts and no
  provider queries or business calculations in the frontend normative.
- [x] AC-3 — It distinguishes components already present, components being
  reused, components designed but absent, and external managed services.
- [x] AC-4 — It states that North Star, Foundation and Trust outputs are
  versioned data sources even when they do not come from an external API.
- [x] AC-5 — It records the chosen deployment topology separately from the
  autonomous-delivery control plane.

## Non-goals

- NG-1 — Do not implement runtime code, schemas, migrations or infrastructure.
- NG-2 — Do not select the data-workflow orchestrator; that remains a separate
  build/buy spike.
- NG-3 — Do not change any existing dashboard or collector behavior.

## Relevant files

- `tasks/prd-sancho-data-platform-metrics.md` — source product contract (planning; not committed to the repo).
- `.context/plans/arquitectura-data-platform-growth4u-v1.md` — master architecture
  distilled by the ADR (planning; not committed to the repo).
- `docs/DEPLOY.md` — Hetzner compute + Neon deployment baseline (committed).
- `docs/adr/` — committed location for the normative ADR.

> Packet scope note: SAN-490 also lands the loop skeleton (`docs/loop/README.md`
> and this spec under `docs/loop/specs/`) alongside the ADR — the assisted loop
> has to house its own process doc and first spec. Those additive files are
> intended in this PR and are beyond the ADR's own `docs/adr/` surface.

## Test expectations

- No source or CI-required check regresses (`typecheck` stays green; the ADR is
  docs-only and changes no code paths).
- An independent reviewer can map every target layer to one owner and one durable
  storage boundary without relying on chat history.

## How to verify

1. Open the ADR and identify the system of record for Raw, Bronze/Silver, Gold
   and serving (see its **Authorities** table).
2. Confirm that external APIs and internal documents use the same admission
   boundary without being modeled as the same source type (D1, D4).
3. Confirm the document labels every component as existing, reused, planned or
   external (D3).
4. Repository doc scripts do not lint free-form ADR prose; the builder names the
   doc-related scripts (`npm run audit:docs`, `npm run lint:paths`,
   `npm run test:doc-paths`) and confirms none regress, and runs
   `npm run typecheck`. The independent review is the substantive gate.
