# Draft File Format (STRICT)

System spec for any skill that writes a draft file at:

```
brand/{slug}/content/drafts/{ideaId}/{channel}.md
```

These files are read by Mission Control and rendered into channel-native
previews. The renderer is defensive (it strips obvious junk), but **the
file on disk must be clean** — what's not on disk doesn't need to be
filtered, and a clean file makes diffs, search, and human edits sane.

## File anatomy

Every draft file has exactly two parts:

1. **Frontmatter (YAML)** — operational metadata.
2. **Body** — the publishable content of the post / article / email,
   and **nothing else**.

## What the body is

The body is what the user would copy-paste into the destination platform.
If a sentence wouldn't appear in the published post, it doesn't belong
in the body. Period.

## Hard prohibitions in the body

These apply to **every** channel:

- **No HTML comments** (`<!-- ... -->`). The renderer treats them as
  visible text. Self-QA, scratch notes, TODOs — none of them go in the
  body.
- **No trailing `---` decorative separators.** They look like horizontal
  rules in the preview and add nothing.
- **No "Tweet 1 (hook)"-style scaffolding labels** on a Twitter thread —
  use `1/n` numbering (see channel rules below).
- **No frontmatter-duplicating preamble** (e.g. a `Channel: linkedin`
  line at the top of the body — that data lives in YAML).

## Heading rules per channel

H1 (`#`) discipline depends on the channel:

| Channel | H1 in body? | Why |
|---|---|---|
| `linkedin` | **No** | LinkedIn renders no title. The task page already shows it. |
| `twitter` / `x` | **No** | Tweets have no title. |
| `instagram` | **No** | IG captions have no title. |
| `blog` / `seo` | **Yes — required** | The H1 is the article title; the renderer extracts it for the hero. |
| `email` / `newsletter` | **Yes** | The H1 is the subject line / hero header. |

H2/H3 are fine in any long-form channel (blog, email, articles) — the
renderer splits blog previews into per-section cards. Sociales (linkedin,
twitter, instagram) typically have no headings inside the body.

## Self-QA goes in the frontmatter, never inline

If the writer self-validates the draft, write the verdict and checklist
as YAML fields:

```yaml
self_qa: PASS  # or FAIL
self_qa_notes:
  - "Hook con dato concreto: ✅"
  - "Estructura Dolor → Diagnóstico → Puente: ✅"
  - "Cifras concretas ancladas: ✅"
```

The Mission Control UI shows a Self-QA panel under the channel preview
when `self_qa` is set. Notes are optional but useful. If the verdict is
`FAIL`, list what failed and let the human decide whether to re-spin.

## Updating an existing draft

When you re-write an existing draft (iteration > 1):

- Bump `iteration` and `updated_at` in the frontmatter.
- Replace the body cleanly — do not append the new version below the
  old one separated by `---`.
- If you add a new Self-QA, replace the existing `self_qa` and
  `self_qa_notes`, don't accumulate.

## Migration note

Drafts created before these rules existed may contain H1 labels and
inline `<!-- Self-QA -->` blocks. The renderer hides them in the UI, but
they should be migrated to clean form. Run:

```
tsx scripts/migrate-drafts.mts --dry-run
tsx scripts/migrate-drafts.mts
```

The migration is idempotent.
