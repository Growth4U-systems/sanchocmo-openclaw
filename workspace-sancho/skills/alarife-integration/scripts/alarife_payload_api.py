#!/usr/bin/env python3
"""Small Alarife Payload API helper for Sancho agents."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://alarife-payload.growth4u.io"
ENV_KEYS = (
    "SANCHOCMO_ALARIFE_PAYLOAD_API_KEY",
    "ALARIFE_PAYLOAD_API_KEY",
    "SANCHOCMO_ALARIFE_API_KEY",
)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_default_env() -> None:
    cwd = Path.cwd()
    script_workspace = Path(__file__).resolve().parents[3]
    candidates = [
        cwd / ".env",
        cwd / "brand" / "sanchocmo" / ".env",
        script_workspace / "brand" / "sanchocmo" / ".env",
        Path.home() / ".openclaw" / "workspace-sancho" / "brand" / "sanchocmo" / ".env",
    ]
    for candidate in candidates:
        load_env_file(candidate)


def api_key() -> str:
    for key in ENV_KEYS:
        value = os.environ.get(key)
        if value:
            return value
    raise SystemExit(
        "Missing API key. Set SANCHOCMO_ALARIFE_PAYLOAD_API_KEY in the shell or brand/sanchocmo/.env."
    )


def base_url() -> str:
    return (
        os.environ.get("SANCHOCMO_ALARIFE_PAYLOAD_BASE_URL")
        or os.environ.get("ALARIFE_PAYLOAD_BASE_URL")
        or DEFAULT_BASE_URL
    ).rstrip("/")


def read_json_file(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def request(method: str, path: str, body: Any | None = None, accept: str = "application/json") -> tuple[int, str, str]:
    data = None
    headers = {
        "Accept": accept,
        "Authorization": f"Bearer {api_key()}",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        f"{base_url()}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.headers.get("content-type", ""), res.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        payload = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {err.code} {method} {path}\n{payload}") from err


def print_response(status: int, content_type: str, text: str) -> None:
    if "application/json" in content_type:
        print(json.dumps(json.loads(text), ensure_ascii=False, indent=2))
    else:
        print(text)
    print(f"[status] {status}", file=sys.stderr)


def command_clients(_: argparse.Namespace) -> None:
    print_response(*request("GET", "/api/clients"))


def command_create_client(args: argparse.Namespace) -> None:
    payload: dict[str, Any] = {"name": args.name, "slug": args.slug}
    if args.domain:
        payload["domain"] = args.domain
    if args.public_url:
        payload["publicUrl"] = args.public_url
    print_response(*request("POST", "/api/clients", payload))


def command_pages(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    print_response(*request("GET", f"/api/clients/{client}/pages"))


def command_create_page(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    print_response(*request("POST", f"/api/clients/{client}/pages", read_json_file(args.json)))


def command_update_page(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    page_id = urllib.parse.quote(args.page_id)
    print_response(*request("PATCH", f"/api/clients/{client}/pages/{page_id}", read_json_file(args.json)))


def command_delete_page(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    page_id = urllib.parse.quote(args.page_id)
    print_response(*request("DELETE", f"/api/clients/{client}/pages/{page_id}"))


def command_preview(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    page_id = urllib.parse.quote(args.page_id)
    status, content_type, text = request(
        "GET",
        f"/api/clients/{client}/pages/{page_id}/preview",
        accept="text/html,application/json",
    )
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(json.dumps({"status": status, "contentType": content_type, "out": args.out}, indent=2))
    else:
        print_response(status, content_type, text)


def command_import_url(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    payload: dict[str, Any] = {"url": args.url, "replace": args.replace}
    if args.target_path:
        payload["targetPath"] = args.target_path
    if args.title:
        payload["title"] = args.title
    print_response(*request("POST", f"/api/clients/{client}/import", payload))


def command_import_save(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    print_response(*request("POST", f"/api/clients/{client}/import/save", read_json_file(args.json)))


def command_crawl(args: argparse.Namespace) -> None:
    client = urllib.parse.quote(args.client)
    payload: dict[str, Any] = {"url": args.url}
    if args.max_pages:
        payload["maxPages"] = args.max_pages
    print_response(*request("POST", f"/api/clients/{client}/import/crawl", payload))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Alarife Payload API helper")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("clients")
    p.set_defaults(func=command_clients)

    p = sub.add_parser("create-client")
    p.add_argument("--name", required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--domain")
    p.add_argument("--public-url")
    p.set_defaults(func=command_create_client)

    p = sub.add_parser("pages")
    p.add_argument("client")
    p.set_defaults(func=command_pages)

    p = sub.add_parser("create-page")
    p.add_argument("client")
    p.add_argument("--json", required=True)
    p.set_defaults(func=command_create_page)

    p = sub.add_parser("update-page")
    p.add_argument("client")
    p.add_argument("page_id")
    p.add_argument("--json", required=True)
    p.set_defaults(func=command_update_page)

    p = sub.add_parser("delete-page")
    p.add_argument("client")
    p.add_argument("page_id")
    p.set_defaults(func=command_delete_page)

    p = sub.add_parser("preview")
    p.add_argument("client")
    p.add_argument("page_id")
    p.add_argument("--out")
    p.set_defaults(func=command_preview)

    p = sub.add_parser("import-url")
    p.add_argument("client")
    p.add_argument("url")
    p.add_argument("--target-path")
    p.add_argument("--title")
    p.add_argument("--replace", action=argparse.BooleanOptionalAction, default=True)
    p.set_defaults(func=command_import_url)

    p = sub.add_parser("import-save")
    p.add_argument("client")
    p.add_argument("--json", required=True)
    p.set_defaults(func=command_import_save)

    p = sub.add_parser("crawl")
    p.add_argument("client")
    p.add_argument("url")
    p.add_argument("--max-pages", type=int)
    p.set_defaults(func=command_crawl)

    return parser


def main() -> None:
    load_default_env()
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
