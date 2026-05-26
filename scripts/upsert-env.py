#!/usr/bin/env python3
"""Upsert env vars into a .env file.

Used by .github/workflows/deploy-{staging,prod}.yml to apply
GitHub Environment secrets to the VPS's ~/.openclaw/.env on every deploy.

The CLI reads a base64-encoded JSON dict from stdin and writes its keys
to the target .env, preserving comments, blanks, and unrelated keys.
Empty values are skipped (safe default — lets unset GitHub secrets be no-ops).
Multi-line values are rejected (current consumers expect one-line-per-key).

Usage:
    echo '{"FOO":"bar"}' | base64 | python3 scripts/upsert-env.py /path/to/.env

Exit codes:
    0: success
    1: invalid input (bad JSON, multi-line value, etc.)
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def upsert(env_path: Path, updates: dict, preserve_existing: set[str] | None = None) -> dict:
    """Apply `updates` to `env_path`. Returns per-key action report.

    Action values: "added" | "updated" | "unchanged" | "skipped_empty" |
    "preserved_existing".
    """
    report: dict = {}
    preserve_existing = preserve_existing or set()
    lines = env_path.read_text().splitlines() if env_path.exists() else []

    for key, value in updates.items():
        if value == "":
            report[key] = "skipped_empty"
            continue
        if "\n" in value or "\r" in value:
            raise ValueError(
                f"Multi-line value for {key} is not supported "
                f"(found newline). Use a single-line token."
            )

        new_line = f"{key}={value}"
        found = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                if key in preserve_existing and line.split("=", 1)[1]:
                    report[key] = "preserved_existing"
                    found = True
                    break
                if line == new_line:
                    report[key] = "unchanged"
                else:
                    lines[i] = new_line
                    report[key] = "updated"
                found = True
                break
        if not found:
            lines.append(new_line)
            report[key] = "added"

    env_path.write_text("\n".join(lines) + ("\n" if lines else ""))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Upsert env vars into a .env file.")
    parser.add_argument("env_path", type=Path, help="Path to .env file")
    parser.add_argument(
        "--preserve-existing",
        action="append",
        default=[],
        help="Do not overwrite this key when it already has a non-empty value in the target .env.",
    )
    args = parser.parse_args()

    payload_b64 = sys.stdin.read().strip()
    if not payload_b64:
        print("error: stdin is empty (expected base64-encoded JSON)", file=sys.stderr)
        return 1

    try:
        updates = json.loads(base64.b64decode(payload_b64).decode())
    except (ValueError, UnicodeDecodeError) as exc:
        print(f"error: invalid stdin payload: {exc}", file=sys.stderr)
        return 1

    if not isinstance(updates, dict):
        print("error: payload must decode to a JSON object", file=sys.stderr)
        return 1

    try:
        report = upsert(
            args.env_path,
            {str(k): str(v) for k, v in updates.items()},
            preserve_existing=set(args.preserve_existing),
        )
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    counts = {"added": 0, "updated": 0, "unchanged": 0, "skipped_empty": 0, "preserved_existing": 0}
    for action in report.values():
        counts[action] = counts.get(action, 0) + 1
    summary = " ".join(f"{k}={v}" for k, v in counts.items())
    keys_changed = [k for k, a in report.items() if a in ("added", "updated")]
    print(f"[upsert-env] {summary} | changed: {','.join(keys_changed) or '(none)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
