#!/usr/bin/env python3
"""
Export a Markdown table to CSV format.

Usage:
    python export_csv.py --input niches.md --output niches.csv
"""

import argparse
import csv
import re
import sys
from pathlib import Path


def parse_markdown_table(text: str) -> list[list[str]]:
    """Parse a Markdown table into rows of cells."""
    rows = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        # Skip separator rows (|---|---|...)
        if re.match(r"^\|[\s\-:|]+\|$", line):
            continue
        cells = [c.strip() for c in line.split("|")]
        # Remove empty first/last from leading/trailing pipes
        if cells and cells[0] == "":
            cells = cells[1:]
        if cells and cells[-1] == "":
            cells = cells[:-1]
        if cells:
            rows.append(cells)
    return rows


def main():
    parser = argparse.ArgumentParser(description="Convert Markdown table to CSV")
    parser.add_argument("--input", required=True, help="Input Markdown file")
    parser.add_argument("--output", required=True, help="Output CSV file")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    text = input_path.read_text(encoding="utf-8")
    rows = parse_markdown_table(text)

    if not rows:
        print("Error: No Markdown table found in input file", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)

    print(f"Exported {len(rows)} rows (including header) to {output_path}")


if __name__ == "__main__":
    main()
