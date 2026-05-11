#!/usr/bin/env python3
"""
Problem Extractor — Analyzes scraped documents in parallel to extract customer pain points.

Usage:
    python3 extract_problems.py --api-key OPENROUTER_KEY --docs-dir docs/ --output problems.md \
        --industry fintech --product "payment platform" --target "freelancers" \
        --context-type B2B --category "payments" --company "Paymatico"

Output: Markdown file with consolidated problem tables from all documents.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

EXTRACTION_PROMPT = """ROLE
You are a Customer Research Analyst working for a company in the {industry} industry.

CONTEXT
Category: {category}
Product: {product}
Target: {target}
Target Type: {context_type}

Analyze this forum conversation. Extract functional, solvable problems within scope of this product/audience.

STEP 1 — RELEVANCE CHECK
1. Read the entire conversation.
2. Is this problem related to {category} or {product}'s domain?
3. Could {company} reasonably help solve this for {target}?
4. PERSONA FILTER:
   - B2B: Must relate to business/freelancer/SMB/professional activity.
   - B2C: Must relate to individual consumer/household.
   - Both: Accept both.

If irrelevant, output exactly: "IGNORAR"

STEP 2 — EXTRACTION
If relevant, output a Markdown table:

| Problem | Persona | Functional Cause | Emotional Load | Evidence | Alternatives | URLs |
|---------|---------|-------------------|----------------|----------|--------------|------|

- Problem: Functional pain point (actions/tasks, not feelings).
- Persona: User type with business TYPE, SIZE, CONTEXT specifics.
- Functional Cause: Root process/system creating the problem.
- Emotional Load: Stress/confusion explicitly mentioned.
- Evidence: 3+ literal quotes separated by " / ".
- Alternatives: Current workarounds with WHY they fail.
- URLs: Source link.

One row per distinct persona/problem. No text before or after the table.
If no relevant problems: output only IGNORAR."""


def call_openrouter(api_key: str, model: str, system: str, content: str, max_tokens: int = 4096) -> str:
    """Call OpenRouter API."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, data=body)

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                wait = (attempt + 1) * 10
                print(f"    [WARN] Rate limited (429), retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 2:
                wait = (attempt + 1) * 5
                print(f"    [WARN] Timeout, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise


def process_doc(filepath: Path, api_key: str, model: str, prompt: str) -> dict:
    """Process a single document. Returns {filename, status, output, tokens}."""
    try:
        content = filepath.read_text(encoding="utf-8")
        if len(content) < 100:
            return {"filename": filepath.name, "status": "skipped", "output": "", "reason": "too short"}

        result = call_openrouter(api_key, model, prompt, content)
        is_ignored = result.strip().upper().startswith("IGNORAR")

        return {
            "filename": filepath.name,
            "status": "filtered" if is_ignored else "extracted",
            "output": result if not is_ignored else "",
        }
    except Exception as e:
        return {"filename": filepath.name, "status": "error", "output": "", "reason": str(e)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract problems from scraped documents")
    ap.add_argument("--api-key", default=os.environ.get("OPENROUTER_API_KEY", ""), help="OpenRouter API key")
    ap.add_argument("--docs-dir", required=True, help="Directory with markdown documents")
    ap.add_argument("--output", default="problems.md", help="Output markdown file")
    ap.add_argument("--model", default="google/gemini-3.1-pro", help="LLM model")
    ap.add_argument("--concurrency", type=int, default=10, help="Parallel workers")
    ap.add_argument("--industry", required=True)
    ap.add_argument("--product", required=True)
    ap.add_argument("--target", required=True)
    ap.add_argument("--context-type", default="B2B y B2C")
    ap.add_argument("--category", default="")
    ap.add_argument("--company", default="")
    args = ap.parse_args()

    api_key = args.api_key
    if not api_key:
        print("[ERROR] OpenRouter API key required (--api-key or OPENROUTER_API_KEY env)", file=sys.stderr)
        return 1

    # Build prompt
    prompt = EXTRACTION_PROMPT.format(
        industry=args.industry, product=args.product, target=args.target,
        context_type=args.context_type, category=args.category or args.industry,
        company=args.company or "the company",
    )

    # Collect document files
    docs_dir = Path(args.docs_dir)
    doc_files = sorted([f for f in docs_dir.glob("*.md") if f.name != "manifest.json"])
    print(f"Documents to process: {len(doc_files)}")
    print(f"Model: {args.model}")
    print(f"Concurrency: {args.concurrency}")

    results = []
    extracted = 0
    filtered = 0
    errors = 0

    # Process in parallel
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {
            pool.submit(process_doc, f, api_key, args.model, prompt): f
            for f in doc_files
        }

        for i, future in enumerate(as_completed(futures), 1):
            r = future.result()
            results.append(r)

            if r["status"] == "extracted":
                extracted += 1
            elif r["status"] == "filtered":
                filtered += 1
            else:
                errors += 1

            if i % 10 == 0:
                print(f"  [{i}/{len(doc_files)}] extracted: {extracted}, filtered: {filtered}, errors: {errors}")

    # Write consolidated output
    output_parts = [f"# Extracted Problems\n\nDocuments: {len(doc_files)} | Extracted: {extracted} | Filtered: {filtered} | Errors: {errors}\n"]
    for r in results:
        if r["status"] == "extracted" and r["output"]:
            output_parts.append(f"\n---\n\n### Source: {r['filename']}\n\n{r['output']}")

    Path(args.output).write_text("\n".join(output_parts), encoding="utf-8")

    print(f"\nDone. {extracted} extracted, {filtered} filtered, {errors} errors")
    print(f"Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
