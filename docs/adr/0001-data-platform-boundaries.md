# ADR-0001 — Data Platform boundaries, authorities & component status

- **Status:** Proposed
- **Date:** 2026-07-24
- **Deciders:** Martín (owner) · Data Platform track
- **Refs:** SAN-490 · SDP-P001
- **Supersedes:** the earlier "pilot without a Data Lake" decision (v2.16)

> Normative distillation of the Data Platform architecture. The detailed design
> lives in the planning material referenced at the bottom; this ADR states only
> what is **decided and normative**, so an implementation or an independent
> reviewer can map every layer to one owner and one durable storage boundary
> **without chat history**. The normative statements are self-contained: they do
> not depend on the (uncommitted) planning docs.

## Context

Mission Control is multi-tenant and brownfield: durable execution control
(`execution_*`), ~13 collectors, versioned contracts and a shadow selector
already exist; the canonical Bronze/Silver/Gold pipeline, a private Data Lake and
a published serving API do **not**. Numbers must be reconstructable, verifiable
and publishable even when a provider API fails, changes, or returns partial data.
This ADR fixes the boundaries that make that possible; it does not build them.

## Decision

### D1 — The pipeline path is fixed (AC-1)

All data — external (provider APIs, webhooks, files) **and** internal (versioned
documents) — MUST enter through **one admission boundary** and flow through these
layers, each with a single system of record:

```
external APIs · webhooks · files ┐
internal versioned documents     ┘
        │  (single admission boundary — same gate, different source type)
        ▼
[RAW / EVIDENCE]  private S3-compatible Object Storage — append-only, content-addressed, encrypted
        ▼
[BRONZE]          Parquet, source-shaped, versioned                 (Object Storage)
        ▼
[SILVER]          canonical domain model — Neon; optional Parquet export for replay
        ▼   transform tier: in-repo versioned/tested transformations
            (dedicated DuckDB/dbt-class engine deferred — see D6)
[GOLD]            reproducible business models                      (Neon / Postgres)
        ▼
[SERVING]         one semantic query API over published models     (Neon)
        ▼
        dashboards  (read published models only)
```

Raw, Bronze, Silver and Gold are **distinct states** and MUST NOT overwrite one
another. Retrying a unit yields the same logical result; a restatement produces a
**new** model run, never a silent rewrite of a published model.

### D2 — Invariants (AC-2)

- **`tenant_id` is an immutable internal UUID.** Every tenant-scoped record uses
  tenant-first composite keys. The application `slug` is resolved to `tenant_id`
  **at the boundary**; `slug` MUST NOT be a storage key.
- **Contracts are provider-neutral.** APIs and webhooks are replaceable
  transports; the canonical model and business contracts MUST NOT depend on a
  specific provider.
- **The frontend performs no provider queries and no business calculations.** It
  MUST read only published models through the serving API — never a provider,
  never request-time math.

### D3 — Component status is explicit (AC-3)

Every component is labelled. "Designed" is never a synonym for "built".

**Status vocabulary:** **Existing** (runs today) · **Reused** (existing, repurposed
for this platform) · **Planned** (designed, not built) · **External** (managed
third-party service).

| Component | Status | Note |
|---|---|---|
| Durable execution control (`execution_*`) | **Existing → Reused** | leases/retries/checkpoints/fencing/receipts (local); repurposed as the initial durable orchestrator (D6) |
| ~13 collectors + legacy pipeline | **Existing** | operational/legacy, known limits |
| Versioned contracts + shadow selector | **Existing (shadow)** | auditable, deliberately **no** serving authority |
| Semantic catalog (48 metrics / 21 bindings) | **Existing (partial)** | first slice: Overview + Pipeline/GHL + Paid |
| Canonical Bronze/Silver/Gold pipeline | **Reused design → Planned** | design carried from the prior plan; not built |
| Private Evidence Lake / replay | **Planned (absent)** | manifests proposed; no landing yet |
| Serving API v2 + published Gold tables | **Planned (absent)** | not built |
| Private S3-compatible Object Storage | **External (managed)** | net-new bucket, isolated from the app's media store (Cloudflare R2); **vendor/region pending** — candidate Hetzner (see D5) |
| Neon / Postgres | **External (managed) → Reused** | existing managed DB, repurposed for control, catalog, canonical Silver, Gold, serving |
| Transform engine (DuckDB/dbt) · data orchestrator | **Planned (selection deferred)** | separate build/buy spike (D6 / NG-2) |

### D4 — Internal artifacts are versioned data sources (AC-4)

North Star, Foundation and Trust outputs are **versioned data sources** subject to
the same admission, lineage and quality discipline as an external API, even though
they do not arrive from one. A metric that depends on such an artifact MUST stay
`blocked` until **both** the approved business context (definition, target, owner,
validity) **and** its data contract exist. **Authority is never inferred from
prose.**

### D5 — Deployment topology (AC-5), recorded separately from the control plane

- The Data Platform is intended to run on the existing **Hetzner** compute +
  **Neon/Postgres** footprint (control, canonical model, Gold, serving), plus a
  **private, isolated S3-compatible object-storage bucket** for the Evidence Lake.
- That bucket is **net-new and unprovisioned.** Today the app's only object
  storage is **Cloudflare R2** (media uploads), which this platform MUST NOT
  reuse. The object-storage **vendor and data region are a pending human decision**
  behind the security + cost gate (D6): **Hetzner Object Storage is the candidate
  baseline, not a settled choice.** AWS is not required.
- `docs/DEPLOY.md` backs **Hetzner compute + a block-storage volume + Neon** — it
  does **not** establish a Hetzner *object-storage* baseline.
- This topology is **distinct from the autonomous-delivery control plane** (the
  loop: spec → build → review → merge). That system is a separate concern with its
  own deployment decision and is **out of scope** for this ADR. The two MUST NOT
  share buckets, credentials or trust boundaries.

### D6 — Tooling baseline, engine & vendor selection deferred

Baseline (subject to a security + cost gate): private S3-compatible Object Storage
for landing/evidence; Parquet for Bronze and Silver exports; Neon/Postgres for
control, queryable Silver, Gold and serving; `execution_*` as the initial durable
orchestrator; transformations versioned and tested in this repository. Adopting a
dedicated transform engine (DuckDB/dbt), table format (Iceberg), managed ELT or a
separate warehouse is **deferred to a measured trigger**, not chosen here. The
object-storage **vendor and data region** likewise remain a pending human decision
(see D5).

## Authorities — one owner, one durable boundary per layer

| Layer | System of record | Durable storage boundary | Owner (role) | Mutability |
|---|---|---|---|---|
| Raw / Evidence | Private S3-compatible Object Storage | `landing/raw` zone — content-addressed, encrypted | data-plane **writer** | append-only |
| Bronze | Object Storage (Parquet) | `bronze` zone | **transformer** | versioned / append |
| Silver (canonical) | Neon / Postgres | `metrics.*` canonical tables | **transformer** | versioned; optional non-authoritative `silver` Parquet export in Object Storage for replay |
| Gold | Neon / Postgres | `metrics.*` Gold tables | **transformer** | new `model_run` per restatement |
| Publication / Serving | Neon (published models only) | `model_publications` pointer (atomic CAS) + semantic query API | **publisher / serving API** | read-only publish-pointer move |
| Control / metadata | Neon / Postgres | `execution_*` + `metrics.*` control | **orchestrator / control** | operational |

A failed source degrades only the metrics that depend on it (`available`,
`partial`, `stale`, `blocked`, `not_applicable`, `error`) — never the last valid
published model, unless a global publication invariant is violated.

## Non-goals (this ADR)

- **NG-1** — No runtime code, schemas, migrations or infrastructure. Decision only.
- **NG-2** — Does **not** select the data-workflow orchestrator; that is a
  separate build/buy spike.
- **NG-3** — Changes no existing dashboard or collector behavior.

## Consequences

- **Unblocks:** the platform foundation (private bucket + control schema +
  idempotent writer + quarantine + replay) and shadow ingestion of the
  decision-independent direct metrics can start against fixed boundaries.
- **Stays blocked (by business decisions, not this ADR):** funnel, `won`, CAC,
  attribution, blended economics and North Star — pending the tenant decision
  pack. Their absence does not stall the technical foundation.
- **Open decision surfaced for the human:** the object-storage **vendor/region**
  (Hetzner candidate) is not settled and must clear the security + cost gate
  before provisioning.
- **Cost:** enforcing the single-admission boundary and provider-neutral
  contracts is more work up front than letting adapters write derived numbers
  directly — accepted, because it is what makes replay and reconciliation possible.

## Sources

Normative statements above are **self-contained**; the planning material below is
external/non-authoritative and may not exist in the committed tree.

- Master architecture (planning; not committed): `.context/plans/arquitectura-data-platform-growth4u-v1.md`
- Product contract (planning; not committed): `tasks/prd-sancho-data-platform-metrics.md`
- Deployment baseline (committed): [`docs/DEPLOY.md`](../DEPLOY.md) — Hetzner compute + block volume + Neon; app object storage is Cloudflare R2
- Spec (committed): [`docs/loop/specs/SDP-P001-data-platform-adr.md`](../loop/specs/SDP-P001-data-platform-adr.md)
