# Architecture Decision Records (ADR)

Short, normative records of architecture decisions for Mission Control. An ADR
fixes **boundaries, authorities, and the status of components** so that an
implementation — or an independent reviewer — can reason about the system
**without relying on chat history**.

An ADR is not a design essay. The detailed design lives in the planning
material it distills; the ADR states what is *decided* and *normative*.

## Conventions

- One file per decision: `NNNN-kebab-title.md`, zero-padded, monotonic.
- Front-matter fields: **Status**, **Date**, **Deciders**, **Supersedes/Superseded-by**.
- **Status** is one of: `Proposed` · `Accepted` · `Superseded` · `Deprecated`.
  A `Proposed` ADR becomes `Accepted` when its PR is merged to `main` by a human.
- Keep it short. Normative statements use **MUST / MUST NOT / SHOULD**.
- Superseding decisions add a new ADR and mark the old one `Superseded-by`.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-data-platform-boundaries.md) | Data Platform boundaries, authorities & component status | Proposed |
