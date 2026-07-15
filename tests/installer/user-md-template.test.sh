#!/usr/bin/env bash
# USER.md must ship as an EMPTY template, never with a real person filled in.
#
# Why (SAN-477): workspace-sancho/USER.md and workspace-sanson/USER.md were
# committed with a real person's name, timezone and personal notes. That file is
# baked into the published image at /opt/sancho-seed and init-home.sh seeds it
# into every fresh install — so each new install booted a Sancho that believed
# its human was someone else entirely. Same family as SAN-465 (internal content
# reaching users), but carrying personal data in a distributable artifact.
#
# The invariant is narrow on purpose: the `Name:` field must be empty. It does
# NOT require the 7 files to stay byte-identical — they may legitimately diverge
# — it only forbids shipping a human's identity as the default.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

files="$(git ls-files 'workspace-*/USER.md')"
[ -n "$files" ] || { echo "FAIL: no USER.md tracked — did the glob or cwd break?"; exit 1; }

fails=0
for f in $files; do
  # The template line is exactly "- **Name:**" with nothing after it.
  if grep -qE '^- \*\*Name:\*\*[[:space:]]*\S' "$f"; then
    echo "FAIL: $f ships a filled-in Name — USER.md must be an empty template (SAN-477)"
    grep -nE '^- \*\*Name:\*\*.*' "$f" | sed 's/^/       /'
    fails=1
  fi
done

[ "$fails" -eq 0 ] || exit 1
echo "OK: $(echo "$files" | wc -l) USER.md files ship as empty templates"
