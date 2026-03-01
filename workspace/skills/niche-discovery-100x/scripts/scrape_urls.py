#!/usr/bin/env python3
"""
URL Scraper — Extracts content from URLs via Firecrawl API and Reddit JSON API.

Usage:
    python3 scrape_urls.py --api-key FIRECRAWL_KEY --input urls.json --output docs/

Input: JSON array of {url, title, ...} from serp_search.py
Output: One markdown file per URL in output directory + manifest.json
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


def scrape_firecrawl(api_key: str, url: str) -> str | None:
    """Scrape a URL via Firecrawl API, return markdown content."""
    endpoint = "https://api.firecrawl.dev/v1/scrape"
    body = json.dumps({
        "url": url,
        "formats": ["markdown"],
        "onlyMainContent": True,
    }).encode("utf-8")

    req = urllib.request.Request(endpoint, method="POST", headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, data=body)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("data", {}).get("markdown", "")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"    Rate limited, waiting 5s...", file=sys.stderr)
            time.sleep(5)
            return scrape_firecrawl(api_key, url)  # Retry once
        print(f"    [ERROR] Firecrawl {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"    [ERROR] {e}", file=sys.stderr)
        return None


def scrape_reddit(url: str) -> str | None:
    """Scrape Reddit via old.reddit.com JSON API (bypasses 403)."""
    match = re.search(r"reddit\.com/r/(\w+)/comments/(\w+)", url)
    if not match:
        return None

    subreddit, post_id = match.group(1), match.group(2)
    json_url = f"https://old.reddit.com/r/{subreddit}/comments/{post_id}.json"

    req = urllib.request.Request(json_url, headers={
        "User-Agent": "Mozilla/5.0 (niche-research-bot)"
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        # Parse post
        post = data[0]["data"]["children"][0]["data"]
        title = post.get("title", "")
        selftext = post.get("selftext", "")
        score = post.get("score", 0)
        sub = post.get("subreddit", subreddit)

        # Parse top comments
        comments = data[1]["data"]["children"][:20]
        comment_texts = []
        for c in comments:
            if c.get("kind") != "t1":
                continue
            body = c["data"].get("body", "")
            c_score = c["data"].get("score", 0)
            if body:
                comment_texts.append(f"**[{c_score} pts]** {body}")

        # Build markdown
        md = f"# {title}\n\n**r/{sub}** | Score: {score}\n\n{selftext}\n\n---\n\n## Comments\n\n"
        md += "\n\n---\n\n".join(comment_texts)
        return md

    except Exception as e:
        print(f"    [ERROR] Reddit: {e}", file=sys.stderr)
        return None


def slugify(text: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", text.lower().strip())
    return re.sub(r"-{2,}", "-", text).strip("-")[:60]


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape URLs for niche discovery")
    ap.add_argument("--api-key", default=os.environ.get("FIRECRAWL_API_KEY", ""), help="Firecrawl API key")
    ap.add_argument("--input", required=True, help="Input JSON (from serp_search.py)")
    ap.add_argument("--output", default="docs", help="Output directory for markdown files")
    ap.add_argument("--delay", type=float, default=0.6, help="Delay between Firecrawl requests")
    ap.add_argument("--batch-size", type=int, default=5, help="Concurrent batch size")
    args = ap.parse_args()

    api_key = args.api_key
    if not api_key:
        print("[ERROR] Firecrawl API key required (--api-key or FIRECRAWL_API_KEY env)", file=sys.stderr)
        return 1

    urls = json.loads(Path(args.input).read_text())
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"URLs to scrape: {len(urls)}")

    manifest = []
    scraped = 0
    failed = 0

    for i, entry in enumerate(urls, 1):
        url = entry["url"]
        is_reddit = "reddit.com" in url

        print(f"  [{i}/{len(urls)}] {'Reddit' if is_reddit else 'Firecrawl'}: {url[:80]}...")

        if is_reddit:
            content = scrape_reddit(url)
        else:
            content = scrape_firecrawl(api_key, url)
            time.sleep(args.delay)

        if content and len(content) > 100:
            filename = f"{i:04d}-{slugify(entry.get('title', 'doc'))}.md"
            filepath = out_dir / filename
            filepath.write_text(content, encoding="utf-8")
            manifest.append({
                **entry,
                "filename": filename,
                "status": "scraped",
                "chars": len(content),
            })
            scraped += 1
        else:
            manifest.append({**entry, "filename": None, "status": "failed"})
            failed += 1

        if i % 20 == 0:
            print(f"  Progress: {scraped} scraped, {failed} failed, {len(urls) - i} remaining")

    # Write manifest
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    cost = scraped * 0.001

    print(f"\nDone. {scraped} scraped, {failed} failed")
    print(f"Estimated cost: ${cost:.3f}")
    print(f"Output: {out_dir}/ ({scraped} files + manifest.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
