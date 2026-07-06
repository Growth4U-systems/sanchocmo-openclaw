#!/usr/bin/env python3
"""
SERP Search — Searches forums via Serper.dev API using a grid of life_contexts × product_words × sources.

Usage:
    python3 serp_search.py --api-key SERPER_KEY --config config.json --output urls.json

Config JSON format:
{
  "life_contexts": ["autónomo", "startup"],
  "product_words": ["factura", "pagos"],
  "sources": {
    "reddit_subreddits": ["r/spain", "r/autonomos"],
    "thematic_forums": ["rankia.com", "infoautonomos.com"],
    "general_forums": ["forocoches.com", "burbuja.info"]
  },
  "serp_pages": 3,
  "country": "es"
}

Output: JSON array of {url, title, snippet, life_context, product_word, source, position}
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


def serper_search(api_key: str, query: str, page: int = 1, country: str = "es") -> list[dict]:
    """Execute a single SERP search via Serper.dev."""
    url = "https://google.serper.dev/search"
    body = json.dumps({
        "q": query,
        "gl": country,
        "hl": "es",
        "page": page,
        "num": 10,
    }).encode("utf-8")

    req = urllib.request.Request(url, method="POST", headers={
        "X-API-KEY": api_key,
        "Content-Type": "application/json",
    }, data=body)

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("organic", [])
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                wait = (attempt + 1) * 5
                print(f"  [WARN] Rate limited (429), retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"  [ERROR] Serper API {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
            return []
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 2:
                wait = (attempt + 1) * 3
                print(f"  [WARN] Timeout/network error, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"  [ERROR] Serper connection failed: {e}", file=sys.stderr)
            return []
    return []


def build_queries(config: dict) -> list[dict]:
    """Build search query combinations from config."""
    queries = []
    contexts = config.get("life_contexts", [])
    words = config.get("product_words", [])
    sources = config.get("sources", {})

    all_sources = []
    for sub in sources.get("reddit_subreddits", []):
        all_sources.append(("reddit", f"reddit.com/{sub}"))
    for forum in sources.get("thematic_forums", []):
        all_sources.append(("thematic", forum))
    for forum in sources.get("general_forums", []):
        all_sources.append(("general", forum))

    for ctx in contexts:
        for word in words:
            for source_type, source_domain in all_sources:
                query = f'site:{source_domain} "{ctx}" "{word}"'
                queries.append({
                    "query": query,
                    "life_context": ctx,
                    "product_word": word,
                    "source_type": source_type,
                    "source_domain": source_domain,
                })
    return queries


def main() -> int:
    ap = argparse.ArgumentParser(description="SERP search for niche discovery")
    ap.add_argument("--api-key", default=os.environ.get("SERPER_API_KEY", ""), help="Serper.dev API key")
    ap.add_argument("--config", required=True, help="Path to search config JSON")
    ap.add_argument("--output", default="urls.json", help="Output file path")
    ap.add_argument("--max-pages", type=int, default=3, help="SERP pages per query")
    ap.add_argument("--delay", type=float, default=0.1, help="Delay between requests (seconds)")
    args = ap.parse_args()

    api_key = args.api_key
    if not api_key:
        print("[ERROR] Serper API key required (--api-key or SERPER_API_KEY env)", file=sys.stderr)
        return 1

    config = json.loads(Path(args.config).read_text())
    queries = build_queries(config)
    country = config.get("country", "es")
    max_pages = args.max_pages

    print(f"Total query combinations: {len(queries)}")
    print(f"Pages per query: {max_pages}")
    print(f"Estimated searches: {len(queries) * max_pages}")

    seen_urls = set()
    all_results = []
    total_searches = 0

    for i, q in enumerate(queries, 1):
        for page in range(1, max_pages + 1):
            total_searches += 1
            results = serper_search(api_key, q["query"], page, country)

            new_count = 0
            for r in results:
                url = r.get("link", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    all_results.append({
                        "url": url,
                        "title": r.get("title", ""),
                        "snippet": r.get("snippet", ""),
                        "life_context": q["life_context"],
                        "product_word": q["product_word"],
                        "source_type": q["source_type"],
                        "source_domain": q["source_domain"],
                        "position": r.get("position", 0),
                    })
                    new_count += 1

            if new_count == 0 and page > 1:
                break  # No more results for this query

            time.sleep(args.delay)

        if i % 10 == 0:
            print(f"  [{i}/{len(queries)}] searches: {total_searches}, unique URLs: {len(all_results)}")

    # Write output
    Path(args.output).write_text(json.dumps(all_results, indent=2, ensure_ascii=False))
    cost = total_searches * 0.001

    print(f"\nDone. {total_searches} searches, {len(all_results)} unique URLs")
    print(f"Estimated cost: ${cost:.2f}")
    print(f"Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
