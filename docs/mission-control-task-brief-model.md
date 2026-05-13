# Mission Control Task Brief Model

Status: proposal, pending validation

## Decision

Mission Control should not require five always-visible semantic fields for every task. Agents and humans need a compact execution contract, while skills provide most of the repeatable method.

The current fields:

- description
- objective
- approach
- deliverable
- done_criteria

are too granular as mandatory UI concepts. They should converge into a smaller model.

## Proposed Canonical Model

Every task should have:

1. `brief`
   The master instruction: what this task means, why it exists, and what outcome it should produce.

2. `completion`
   The evidence that the task is done. This can include the expected deliverable, because in most tasks "done" means "the expected deliverable exists and is acceptable".

3. `execution_notes`
   Optional. Only used when the selected skill is not enough or the task has special constraints, caveats, or non-obvious steps.

Plus metadata:

- type
- status
- parent_id
- owner
- skill(s)
- documents/attachments
- timestamps

## Master Sentence

The UI should help humans and agents read/write tasks through a single generated statement:

> Para conseguir [outcome], en el contexto de [context], esta tarea debe producir [completion], usando [skill] y respetando [constraints].

This sentence can be stored directly as `brief`, with structured helpers derived from it when useful.

## Migration Direction

Legacy fields map as:

- `description` + `objective` -> `brief`
- `deliverable` + `done_criteria` -> `completion`
- `approach` -> `execution_notes`

The old columns can remain during migration for backwards compatibility, but the UI should stop treating them as five equal concepts.

## Agent Rule

If a task has a skill, the skill is the default method. `execution_notes` should only override or constrain the skill, not duplicate the skill instructions.

