#!/usr/bin/env python3
"""
LLM Step Runner — Executes a single LLM step (clean/filter, scoring, or consolidation).

Generic runner for Steps 2-4 that takes an input file, a prompt, and produces output.

Usage:
    python3 llm_step.py --api-key KEY --input problems.md --output niches.md \
        --prompt-file prompts/clean-filter.md --model openai/gpt-4o-mini

    python3 llm_step.py --api-key KEY --input niches.md --output scored.md \
        --prompt-file prompts/scoring.md --model google/gemini-3.1-pro

    python3 llm_step.py --api-key KEY --input "niches.md,scored.md" --output final.md \
        --prompt-file prompts/consolidate.md --model openai/gpt-4o-mini
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path


def call_openrouter(api_key: str, model: str, prompt: str, content: str,
                    temperature: float = 0.5, max_tokens: int = 16384) -> str:
    """Call OpenRouter API with system prompt and content."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    req = urllib.request.Request(url, method="POST", headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, data=body)

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                usage = data.get("usage", {})
                input_tokens = usage.get("prompt_tokens", 0)
                output_tokens = usage.get("completion_tokens", 0)
                print(f"  Tokens — input: {input_tokens:,}, output: {output_tokens:,}")
                return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                wait = (attempt + 1) * 15
                print(f"  [WARN] Rate limited (429), retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            payload = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OpenRouter API error ({e.code}): {payload[:500]}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 2:
                wait = (attempt + 1) * 10
                print(f"  [WARN] Timeout/network error, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"OpenRouter connection failed after 3 attempts: {e}") from e
    raise RuntimeError("OpenRouter call failed after 3 attempts")


def main() -> int:
    ap = argparse.ArgumentParser(description="Run a single LLM analysis step")
    ap.add_argument("--api-key", default=os.environ.get("OPENROUTER_API_KEY", ""), help="OpenRouter API key")
    ap.add_argument("--input", required=True, help="Input file(s), comma-separated for multiple")
    ap.add_argument("--output", required=True, help="Output file path")
    ap.add_argument("--prompt-file", required=True, help="File containing the system prompt")
    ap.add_argument("--model", default="openai/gpt-4o-mini", help="LLM model")
    ap.add_argument("--temperature", type=float, default=0.5)
    ap.add_argument("--max-tokens", type=int, default=16384)
    # Variable substitution
    ap.add_argument("--var", action="append", default=[], help="Variable substitution: key=value")
    args = ap.parse_args()

    api_key = args.api_key
    if not api_key:
        print("[ERROR] OpenRouter API key required", file=sys.stderr)
        return 1

    # Read prompt
    prompt = Path(args.prompt_file).read_text(encoding="utf-8")

    # Apply variable substitutions
    for v in args.var:
        key, _, value = v.partition("=")
        prompt = prompt.replace(f"{{{{{key}}}}}", value)

    # Read input(s)
    input_files = [f.strip() for f in args.input.split(",")]
    content_parts = []
    for f in input_files:
        p = Path(f)
        if not p.exists():
            print(f"[ERROR] Input file not found: {f}", file=sys.stderr)
            return 1
        text = p.read_text(encoding="utf-8")
        content_parts.append(f"## Input: {p.name}\n\n{text}")
        print(f"  Input: {p.name} ({len(text):,} chars)")

    content = "\n\n---\n\n".join(content_parts)

    print(f"Model: {args.model}")
    print(f"Temperature: {args.temperature}")
    print(f"Prompt: {args.prompt_file} ({len(prompt):,} chars)")
    print(f"Total input: {len(content):,} chars")
    print("Calling LLM...")

    result = call_openrouter(
        api_key, args.model, prompt, content,
        temperature=args.temperature, max_tokens=args.max_tokens,
    )

    Path(args.output).write_text(result, encoding="utf-8")
    print(f"\nDone. Output: {args.output} ({len(result):,} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
