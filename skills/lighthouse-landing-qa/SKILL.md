---
name: lighthouse-landing-qa
description: Use when building or publishing Alarife landing pages or web pages and you need to verify Lighthouse/PageSpeed scores, enforce an average mobile score of at least 95, run an improvement loop, or handle user-approved waivers for non-scoring Lighthouse rules before publish approval.
---

# Lighthouse Landing QA

Use this skill whenever Alarife creates, edits, previews, or prepares to publish a landing page or web page.

## Gate

Primary target: Lighthouse/PageSpeed mobile average `>= 95`.

Measured categories:

- Performance
- Accessibility
- Best Practices
- SEO

Rules:

- Run the gate against the preview URL before publish approval.
- Treat mobile as mandatory. Desktop is useful supporting evidence but does not replace mobile.
- Keep each mobile category at `>= 90` unless the project owner changes the acceptance policy.
- Do not use waivers to pass a scoring audit or a low category score.
- Publish still requires explicit human approval after the gate and Sanson QA.

## Workflow

1. Build or update the page in draft.
2. Generate a public preview URL.
3. Run PageSpeed/Lighthouse mobile.
4. If the gate passes, attach the report summary and proceed to Sanson QA.
5. If the gate fails, identify the highest-impact fixes and propose them clearly.
6. Apply approved fixes in draft, regenerate preview if needed, and rerun the gate.
7. Repeat until the mobile average is `>= 95`.
8. Ask for publish approval only after the Lighthouse gate and Sanson QA are complete.

## Waivers

Only allow waivers for Lighthouse rules that do not contribute to the category score, such as informative diagnostics or a deliberate product/design choice with zero scoring weight.

Every waiver must record:

- `auditId`
- human-approved reason
- confirmation that the audit has no scoring weight
- accepted tradeoff

If a waived rule has scoring weight, the waiver is invalid and the gate still fails.

## Script

Use the bundled script for deterministic checks:

```bash
node skills/lighthouse-landing-qa/scripts/lighthouse_gate.mjs \
  --url "https://preview.example.com/page" \
  --strategy mobile \
  --out brand/client/web/lighthouse-mobile.json
```

For local fixtures or saved PageSpeed responses:

```bash
node skills/lighthouse-landing-qa/scripts/lighthouse_gate.mjs \
  --input .context/lighthouse-result.json \
  --waive unsized-images="Intentional CMS image treatment; zero score weight"
```

Exit codes:

- `0`: gate passed
- `2`: gate failed
- `1`: script/configuration error

Report the category scores, average, failing categories, and any waiver status back to Sancho.
