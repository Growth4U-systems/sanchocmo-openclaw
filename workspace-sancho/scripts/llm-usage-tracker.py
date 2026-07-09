#!/usr/bin/env python3
"""
LLM Usage Tracker for Sancho.

This tracker complements cost-tracker.py:
- cost-tracker.py aggregates token/cost data reported by OpenClaw transcripts.
- this script counts actual model calls and tool calls per day, even when the
  provider reports zero local token usage.
- when FIREWORKS_ACCOUNT_ID + FIREWORKS_API_KEY are present, it also pulls
  Fireworks billingUsage token totals by API key and model.

Output:
  workspace-sancho/memory/costs/llm-usage-daily.json
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - Python < 3.9 fallback
    ZoneInfo = None


OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw")))
WORKSPACE = Path(os.environ.get("SANCHO_WORKSPACE", str(OPENCLAW_HOME / "workspace-sancho")))
DEFAULT_OUTPUT = WORKSPACE / "memory" / "costs" / "llm-usage-daily.json"

# Fireworks billingUsage generally returns billed tokens, not dollar amounts.
# Keep pricing configurable, but ship the active GLM-5.2 serverless standard
# pricing so the daily report shows spend by default.
DEFAULT_FIREWORKS_PRICING = {
    "accounts/fireworks/models/glm-5p2": {
        "input_per_mtok": 1.40,
        "output_per_mtok": 4.40,
        "cached_input_per_mtok": 0.14,
        "source": "fireworks_serverless_pricing",
    },
    "glm-5p2": {
        "input_per_mtok": 1.40,
        "output_per_mtok": 4.40,
        "cached_input_per_mtok": 0.14,
        "source": "fireworks_serverless_pricing",
    },
}


def utc_now():
    return datetime.now(timezone.utc)


def parse_iso_ts(value):
    if not value:
        return None
    if isinstance(value, (int, float)):
        # OpenClaw message.timestamp is epoch millis.
        if value > 10_000_000_000:
            value = value / 1000
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if not isinstance(value, str):
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def date_key_for(dt, tz):
    return dt.astimezone(tz).date().isoformat()


def to_int(value):
    try:
        return int(value or 0)
    except Exception:
        return 0


def to_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def usd_to_eur_rate():
    for key in ("LLM_USAGE_USD_TO_EUR", "USD_TO_EUR"):
        raw = os.environ.get(key)
        if raw:
            rate = to_float(str(raw).replace(",", "."))
            if rate > 0:
                return rate, key
    return 0.92, "default"


def add_eur_fields(value, rate):
    if isinstance(value, list):
        for item in value:
            add_eur_fields(item, rate)
        return value
    if not isinstance(value, dict):
        return value
    for key, raw in list(value.items()):
        if isinstance(raw, (dict, list)):
            add_eur_fields(raw, rate)
        elif key.endswith("_usd") and isinstance(raw, (int, float)):
            value[f"{key[:-4]}_eur"] = round(to_float(raw) * rate, 4)
    return value


def apply_currency(report):
    rate, source = usd_to_eur_rate()
    report["currency"] = {
        "billing": "USD",
        "display": "EUR",
        "usd_to_eur_rate": rate,
        "source": source,
    }
    add_eur_fields(report, rate)
    return report


def empty_usage():
    return {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "total": 0}


def add_usage(dst, usage):
    dst["input"] += to_int(usage.get("input"))
    dst["output"] += to_int(usage.get("output"))
    dst["cache_read"] += to_int(usage.get("cacheRead", usage.get("cache_read")))
    dst["cache_write"] += to_int(usage.get("cacheWrite", usage.get("cache_write")))
    dst["total"] += to_int(usage.get("totalTokens", usage.get("total")))


def usage_cost_usd(usage):
    cost = usage.get("cost") if isinstance(usage, dict) else None
    if isinstance(cost, dict):
        for key in ("total", "usd", "amount"):
            if key in cost:
                return to_float(cost.get(key))
    if cost is not None:
        return to_float(cost)
    return 0.0


def get_agent_sessions_dirs():
    """Map agent_id -> sessions dir using OpenClaw first, filesystem fallback."""
    dirs = {}
    try:
        result = subprocess.run(
            ["openclaw", "sessions", "--all-agents", "--json"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            for store in data.get("stores", []):
                agent_id = store.get("agentId")
                store_path = store.get("path")
                if agent_id and store_path:
                    dirs[agent_id] = Path(store_path).parent
    except Exception:
        pass

    for candidate in (OPENCLAW_HOME / ".openclaw" / "agents", OPENCLAW_HOME / "agents"):
        if candidate.exists():
            for p in candidate.iterdir():
                sessions_dir = p / "sessions"
                if not p.is_dir() or not sessions_dir.exists():
                    continue
                current = dirs.get(p.name)
                current_has_transcripts = bool(current and any(current.glob("*.jsonl")))
                fallback_has_transcripts = any(sessions_dir.glob("*.jsonl"))
                if not current or (fallback_has_transcripts and not current_has_transcripts):
                    dirs[p.name] = sessions_dir
    return dirs


def transcript_files(sessions_dir):
    for jsonl_file in sessions_dir.glob("*.jsonl"):
        if jsonl_file.name.endswith(".trajectory.jsonl"):
            continue
        yield jsonl_file


def session_id_from_file(jsonl_file):
    name = jsonl_file.stem
    if "_" in name:
        return name.split("_", 1)[1]
    if "-topic-" in name:
        return name.split("-topic-")[0]
    return name


def load_session_index(agent_dirs):
    result = {}
    for agent_id, sessions_dir in agent_dirs.items():
        store = sessions_dir / "sessions.json"
        if not store.exists():
            continue
        try:
            data = json.loads(store.read_text())
        except Exception:
            continue
        for key, entry in (data.items() if isinstance(data, dict) else []):
            if not isinstance(entry, dict):
                continue
            sid = entry.get("sessionId")
            if sid:
                result[sid] = {"key": key, "agent_id": agent_id, **entry}
    return result


def read_trajectory_header(jsonl_file):
    sidecar = jsonl_file.with_name(f"{jsonl_file.stem}.trajectory.jsonl")
    if not sidecar.exists():
        return {}
    header = {}
    try:
        with open(sidecar) as fh:
            for line_no, line in enumerate(fh):
                if line_no > 25:
                    break
                try:
                    entry = json.loads(line)
                except Exception:
                    continue
                if entry.get("sessionKey") and not header.get("key"):
                    header["key"] = entry.get("sessionKey")
                if entry.get("provider") and not header.get("provider"):
                    header["provider"] = entry.get("provider")
                if entry.get("modelId") and not header.get("model"):
                    header["model"] = entry.get("modelId")
                data = entry.get("data") if isinstance(entry.get("data"), dict) else {}
                if data.get("trigger") and not header.get("trigger"):
                    header["trigger"] = data.get("trigger")
                if header.get("key") and header.get("provider") and header.get("model"):
                    break
    except Exception:
        return {}
    return header


def known_slugs():
    try:
        data = json.loads((WORKSPACE / "clients.json").read_text())
        return {c["slug"] for c in data.get("clients", []) if c.get("slug")}
    except Exception:
        return set()


def classify_session_key(key, agent_id, valid_slugs):
    meta = {
        "agent": agent_id or "unknown",
        "model_session_slug": None,
        "client": "_unclassified",
        "thread": None,
        "source": "unknown",
    }
    if not key:
        return meta

    m = re.match(r"^agent:([^:]+):", key)
    if m:
        meta["agent"] = m.group(1)

    m = re.match(r"^agent:[^:]+:model:([^:]+):", key)
    if m:
        meta["model_session_slug"] = m.group(1)

    if ":mc-chat:" in key:
        meta["source"] = "mc-chat"
        tail = key.split(":mc-chat:", 1)[1]
        parts = tail.split(":", 1)
        slug = parts[0]
        meta["client"] = slug if slug in valid_slugs else "_unclassified"
        meta["thread"] = parts[1] if len(parts) > 1 else None
        return meta

    if ":cron:" in key:
        meta["source"] = "cron"
        meta["client"] = "_system"
        m = re.search(r":cron:([^:]+)", key)
        meta["thread"] = m.group(1) if m else None
        return meta

    if ":discord:channel:" in key:
        meta["source"] = "discord"
        meta["thread"] = key.split(":discord:channel:", 1)[1]
        return meta

    if ":heartbeat" in key or key.endswith(":main") or ":subagent:" in key:
        meta["source"] = "system"
        meta["client"] = "_system"
        return meta

    return meta


def counter_entry():
    return {
        "model_calls": 0,
        "fireworks_calls": 0,
        "tool_calls": 0,
        "reported_usage": empty_usage(),
        "reported_cost_usd": 0.0,
    }


def increment_group(day, group_name, group_key, amount_key, amount=1, usage=None, is_fireworks=False):
    if not group_key:
        group_key = "unknown"
    group = day[group_name].setdefault(group_key, counter_entry())
    group[amount_key] += amount
    if amount_key == "model_calls" and is_fireworks:
        group["fireworks_calls"] += amount
    if usage:
        add_usage(group["reported_usage"], usage)
        group["reported_cost_usd"] += usage_cost_usd(usage)


def ensure_day(days, day_key):
    return days.setdefault(
        day_key,
        {
            "model_calls": 0,
            "fireworks_calls": 0,
            "zero_prompt_fireworks_calls": 0,
            "tool_calls": 0,
            "sessions": set(),
            "reported_usage": empty_usage(),
            "fireworks_reported_usage": empty_usage(),
            "reported_cost_usd": 0.0,
            "fireworks_reported_cost_usd": 0.0,
            "by_agent": {},
            "by_client": {},
            "by_model": {},
            "by_provider": {},
            "by_source": {},
            "by_thread": {},
            "tools": {},
        },
    )


def is_fireworks_call(provider, model):
    provider = (provider or "").lower()
    model = (model or "").lower()
    return provider == "fireworks" or "fireworks" in model or "glm-5" in model or "glm5" in model


def scan_transcript(jsonl_file, agent_id, session_index, valid_slugs, start_utc, end_utc, tz, days):
    session_id = session_id_from_file(jsonl_file)
    index_info = session_index.get(session_id, {})
    trajectory = read_trajectory_header(jsonl_file)
    session_key = index_info.get("key") or trajectory.get("key") or ""
    session_meta = classify_session_key(session_key, agent_id, valid_slugs)

    current_provider = trajectory.get("provider")
    current_model = trajectory.get("model")
    session_seen = False
    model_calls = 0

    try:
        with open(jsonl_file) as fh:
            for raw in fh:
                try:
                    entry = json.loads(raw)
                except Exception:
                    continue

                ts = parse_iso_ts(entry.get("timestamp") or entry.get("ts"))
                if ts and (ts < start_utc or ts >= end_utc):
                    continue
                if not ts:
                    continue

                if entry.get("type") == "session" and entry.get("id"):
                    session_id = entry.get("id")

                if entry.get("type") == "model_change":
                    current_provider = entry.get("provider") or current_provider
                    current_model = entry.get("modelId") or current_model

                if entry.get("type") != "message":
                    continue

                msg = entry.get("message") if isinstance(entry.get("message"), dict) else {}
                if msg.get("role") != "assistant":
                    continue

                provider = msg.get("provider") or current_provider or "unknown"
                model = msg.get("model") or current_model or "unknown"
                usage = msg.get("usage") if isinstance(msg.get("usage"), dict) else {}
                day_key = date_key_for(ts, tz)
                day = ensure_day(days, day_key)
                day["sessions"].add(session_id)

                call_is_fireworks = is_fireworks_call(provider, model)
                day["model_calls"] += 1
                model_calls += 1
                if call_is_fireworks:
                    day["fireworks_calls"] += 1
                    add_usage(day["fireworks_reported_usage"], usage)
                    day["fireworks_reported_cost_usd"] += usage_cost_usd(usage)
                    prompt_like = to_int(usage.get("input")) + to_int(usage.get("cacheRead"))
                    if prompt_like == 0:
                        day["zero_prompt_fireworks_calls"] += 1
                add_usage(day["reported_usage"], usage)
                day["reported_cost_usd"] += usage_cost_usd(usage)

                increment_group(day, "by_agent", session_meta["agent"], "model_calls", usage=usage, is_fireworks=call_is_fireworks)
                increment_group(day, "by_client", session_meta["client"], "model_calls", usage=usage, is_fireworks=call_is_fireworks)
                increment_group(day, "by_model", model, "model_calls", usage=usage, is_fireworks=call_is_fireworks)
                increment_group(day, "by_provider", provider, "model_calls", usage=usage, is_fireworks=call_is_fireworks)
                increment_group(day, "by_source", session_meta["source"], "model_calls", usage=usage, is_fireworks=call_is_fireworks)

                thread_key = "|".join(
                    [
                        session_meta["client"] or "_unclassified",
                        session_meta["agent"] or agent_id or "unknown",
                        session_meta["thread"] or session_id,
                    ]
                )
                thread_entry = day["by_thread"].setdefault(
                    thread_key,
                    {
                        "client": session_meta["client"],
                        "agent": session_meta["agent"],
                        "thread": session_meta["thread"],
                        "session_id": session_id,
                        "session_key": session_key,
                        "source": session_meta["source"],
                        "provider": provider,
                        "model": model,
                        "model_calls": 0,
                        "fireworks_calls": 0,
                        "tool_calls": 0,
                        "reported_usage": empty_usage(),
                        "reported_cost_usd": 0.0,
                    },
                )
                thread_entry["model_calls"] += 1
                if call_is_fireworks:
                    thread_entry["fireworks_calls"] += 1
                add_usage(thread_entry["reported_usage"], usage)
                thread_entry["reported_cost_usd"] += usage_cost_usd(usage)

                for item in msg.get("content", []) if isinstance(msg.get("content"), list) else []:
                    if not isinstance(item, dict) or item.get("type") != "toolCall":
                        continue
                    tool_name = item.get("name") or "unknown"
                    day["tool_calls"] += 1
                    thread_entry["tool_calls"] += 1
                    tool_entry = day["tools"].setdefault(tool_name, {"calls": 0})
                    tool_entry["calls"] += 1
                    increment_group(day, "by_agent", session_meta["agent"], "tool_calls")
                    increment_group(day, "by_client", session_meta["client"], "tool_calls")
                    increment_group(day, "by_source", session_meta["source"], "tool_calls")
                session_seen = True
    except Exception as exc:
        return {"session_id": session_id, "file": str(jsonl_file), "error": str(exc)}

    if not session_seen:
        return None
    return {"session_id": session_id, "model_calls": model_calls, "file": str(jsonl_file)}


def finalize_group(group, limit=None):
    items = []
    for key, data in group.items():
        item = {"name": key, **data}
        if "reported_cost_usd" in item:
            item["reported_cost_usd"] = round(item["reported_cost_usd"], 4)
        items.append(item)
    items.sort(
        key=lambda x: (
            x.get("reported_cost_usd", 0),
            x.get("fireworks_calls", 0),
            x.get("model_calls", 0),
            x.get("tool_calls", 0),
        ),
        reverse=True,
    )
    if limit:
        items = items[:limit]
    return items


def finalize_days(days, top_limit):
    final = {}
    for day_key in sorted(days.keys()):
        day = days[day_key]
        final[day_key] = {
            "model_calls": day["model_calls"],
            "fireworks_calls": day["fireworks_calls"],
            "zero_prompt_fireworks_calls": day["zero_prompt_fireworks_calls"],
            "tool_calls": day["tool_calls"],
            "sessions": len(day["sessions"]),
            "reported_usage": day["reported_usage"],
            "fireworks_reported_usage": day["fireworks_reported_usage"],
            "reported_cost_usd": round(day["reported_cost_usd"], 4),
            "fireworks_reported_cost_usd": round(day["fireworks_reported_cost_usd"], 4),
            "by_agent": finalize_group(day["by_agent"], top_limit),
            "by_client": finalize_group(day["by_client"], top_limit),
            "by_model": finalize_group(day["by_model"], top_limit),
            "by_provider": finalize_group(day["by_provider"], top_limit),
            "by_source": finalize_group(day["by_source"], top_limit),
            "top_threads": finalize_group(day["by_thread"], top_limit),
            "tools": sorted(
                [{"name": k, **v} for k, v in day["tools"].items()],
                key=lambda x: x.get("calls", 0),
                reverse=True,
            )[:top_limit],
        }
    return final


def aggregate_totals(final_days):
    totals = {
        "model_calls": 0,
        "fireworks_calls": 0,
        "zero_prompt_fireworks_calls": 0,
        "tool_calls": 0,
        "sessions": 0,
        "reported_usage": empty_usage(),
        "fireworks_reported_usage": empty_usage(),
        "reported_cost_usd": 0.0,
        "fireworks_reported_cost_usd": 0.0,
    }
    for day in final_days.values():
        totals["model_calls"] += day.get("model_calls", 0)
        totals["fireworks_calls"] += day.get("fireworks_calls", 0)
        totals["zero_prompt_fireworks_calls"] += day.get("zero_prompt_fireworks_calls", 0)
        totals["tool_calls"] += day.get("tool_calls", 0)
        totals["sessions"] += day.get("sessions", 0)
        totals["reported_cost_usd"] += to_float(day.get("reported_cost_usd"))
        totals["fireworks_reported_cost_usd"] += to_float(day.get("fireworks_reported_cost_usd"))
        for key in totals["reported_usage"]:
            totals["reported_usage"][key] += day.get("reported_usage", {}).get(key, 0)
            totals["fireworks_reported_usage"][key] += day.get("fireworks_reported_usage", {}).get(key, 0)
    totals["reported_cost_usd"] = round(totals["reported_cost_usd"], 4)
    totals["fireworks_reported_cost_usd"] = round(totals["fireworks_reported_cost_usd"], 4)
    return totals


def fetch_fireworks_billing_usage(account_id, api_key, start_utc, end_utc, tz_name):
    account_slug = str(account_id or "").strip().strip("/")
    if account_slug.startswith("accounts/"):
        account_slug = account_slug.split("/", 1)[1]
    params = [
        ("startTime", start_utc.isoformat().replace("+00:00", "Z")),
        ("endTime", end_utc.isoformat().replace("+00:00", "Z")),
        ("usageType", "SERVERLESS"),
        ("groupBy", "api_key_id"),
        ("groupBy", "api_key_name"),
        ("groupBy", "model_name"),
        ("timezone", tz_name),
    ]
    url = (
        "https://api.fireworks.ai/v1/accounts/"
        + urllib.parse.quote(account_slug, safe="")
        + "/billingUsage?"
        + urllib.parse.urlencode(params)
    )
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": "SanchoCMO-cost-tracker/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fireworks_pricing_table():
    table = dict(DEFAULT_FIREWORKS_PRICING)
    raw = os.environ.get("FIREWORKS_PRICING_JSON")
    if raw:
        try:
            overrides = json.loads(raw)
            if isinstance(overrides, dict):
                for model, pricing in overrides.items():
                    if isinstance(pricing, dict):
                        key = str(model).lower()
                        table[key] = {**table.get(key, {}), **pricing, "source": "FIREWORKS_PRICING_JSON"}
        except Exception:
            pass
    if os.environ.get("FIREWORKS_GLM52_INPUT_PER_MTOK") or os.environ.get("FIREWORKS_GLM52_OUTPUT_PER_MTOK"):
        glm52 = {
            **table["accounts/fireworks/models/glm-5p2"],
            "input_per_mtok": to_float(os.environ.get("FIREWORKS_GLM52_INPUT_PER_MTOK")) or 1.40,
            "output_per_mtok": to_float(os.environ.get("FIREWORKS_GLM52_OUTPUT_PER_MTOK")) or 4.40,
            "cached_input_per_mtok": to_float(os.environ.get("FIREWORKS_GLM52_CACHED_INPUT_PER_MTOK")) or 0.14,
            "source": "FIREWORKS_GLM52_*_PER_MTOK",
        }
        table["accounts/fireworks/models/glm-5p2"] = glm52
        table["glm-5p2"] = glm52
    return table


def pricing_for_model(model, pricing_table):
    key = str(model or "").lower()
    if key in pricing_table:
        return pricing_table[key]
    tail = key.rsplit("/", 1)[-1]
    if tail in pricing_table:
        return pricing_table[tail]
    return None


def explicit_cost_usd(row):
    for key in ("costUsd", "costUSD", "totalCostUsd", "totalCostUSD", "amountUsd", "amountUSD"):
        if key in row:
            return to_float(row.get(key))
    cost = row.get("cost")
    if isinstance(cost, dict):
        for key in ("total", "usd", "amount"):
            if key in cost:
                return to_float(cost.get(key))
    elif cost is not None:
        return to_float(cost)
    return None


def cached_token_count(row):
    for key in (
        "cachedPromptTokens",
        "cachedInputTokens",
        "cacheReadTokens",
        "cached_tokens",
        "cachedTokens",
    ):
        if key in row:
            return to_int(row.get(key))
    return 0


def calculated_cost_usd(model, prompt_tokens, completion_tokens, pricing_table, cached_tokens=0):
    pricing = pricing_for_model(model, pricing_table)
    if not pricing:
        return 0.0, "unpriced", None
    input_per_mtok = to_float(pricing.get("input_per_mtok"))
    output_per_mtok = to_float(pricing.get("output_per_mtok"))
    cached_input_per_mtok = to_float(pricing.get("cached_input_per_mtok"))
    billable_prompt_tokens = max(prompt_tokens - cached_tokens, 0)
    cost = (
        (billable_prompt_tokens / 1_000_000 * input_per_mtok)
        + (cached_tokens / 1_000_000 * cached_input_per_mtok)
        + (completion_tokens / 1_000_000 * output_per_mtok)
    )
    return cost, pricing.get("source") or "pricing_table", pricing


def row_cost_usd(row, model, prompt_tokens, completion_tokens, pricing_table):
    explicit = explicit_cost_usd(row)
    estimated, estimate_source, pricing = calculated_cost_usd(
        model,
        prompt_tokens,
        completion_tokens,
        pricing_table,
        cached_token_count(row),
    )
    if explicit is not None:
        return explicit, estimated, "fireworks_explicit", pricing
    return 0.0, estimated, "usage_tokens_only", pricing


def add_cost_source(bucket, source):
    sources = bucket.setdefault("cost_sources", {})
    sources[source] = sources.get(source, 0) + 1


def summarize_fireworks_usage(raw, tz):
    rows = raw.get("serverlessCosts", []) if isinstance(raw, dict) else []
    days = {}
    pricing_table = fireworks_pricing_table()
    totals = {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0, "audio_input_seconds": 0, "cost_usd": 0.0, "estimated_cost_usd": 0.0, "priced_rows": 0, "unpriced_rows": 0}
    by_api_key = defaultdict(lambda: {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "estimated_cost_usd": 0.0, "priced_rows": 0, "unpriced_rows": 0})
    by_model = defaultdict(lambda: {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "estimated_cost_usd": 0.0, "priced_rows": 0, "unpriced_rows": 0})

    for row in rows:
        start_dt = parse_iso_ts(row.get("startTime"))
        day_key = date_key_for(start_dt, tz) if start_dt else (str(row.get("startTime", "unknown"))[:10] or "unknown")
        group = row.get("group") if isinstance(row.get("group"), dict) else {}
        api_key_id = group.get("api_key_id") or row.get("apiKeyId") or "unknown"
        api_key_name = group.get("api_key_name") or "unknown"
        api_key_label = f"{api_key_name} ({api_key_id})" if api_key_name != "unknown" else api_key_id
        model = group.get("model_name") or row.get("modelName") or "unknown"
        prompt = to_int(row.get("promptTokens"))
        completion = to_int(row.get("completionTokens"))
        audio = to_int(row.get("audioInputSeconds"))
        cost_usd, estimated_cost_usd, cost_source, pricing = row_cost_usd(row, model, prompt, completion, pricing_table)
        priced = cost_source == "fireworks_explicit"

        day = days.setdefault(
            day_key,
            {
                "rows": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "audio_input_seconds": 0,
                "cost_usd": 0.0,
                "estimated_cost_usd": 0.0,
                "priced_rows": 0,
                "unpriced_rows": 0,
                "by_api_key": defaultdict(lambda: {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "estimated_cost_usd": 0.0, "priced_rows": 0, "unpriced_rows": 0}),
                "by_model": defaultdict(lambda: {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "estimated_cost_usd": 0.0, "priced_rows": 0, "unpriced_rows": 0}),
            },
        )
        for bucket in (totals, day):
            bucket["rows"] += 1
            bucket["prompt_tokens"] += prompt
            bucket["completion_tokens"] += completion
            bucket["audio_input_seconds"] += audio
            bucket["cost_usd"] += cost_usd
            bucket["estimated_cost_usd"] += estimated_cost_usd
            bucket["priced_rows" if priced else "unpriced_rows"] += 1
            add_cost_source(bucket, cost_source)
        for bucket in (by_api_key[api_key_label], day["by_api_key"][api_key_label]):
            bucket["rows"] += 1
            bucket["prompt_tokens"] += prompt
            bucket["completion_tokens"] += completion
            bucket["cost_usd"] += cost_usd
            bucket["estimated_cost_usd"] += estimated_cost_usd
            bucket["priced_rows" if priced else "unpriced_rows"] += 1
            add_cost_source(bucket, cost_source)
        for bucket in (by_model[model], day["by_model"][model]):
            bucket["rows"] += 1
            bucket["prompt_tokens"] += prompt
            bucket["completion_tokens"] += completion
            bucket["cost_usd"] += cost_usd
            bucket["estimated_cost_usd"] += estimated_cost_usd
            bucket["priced_rows" if priced else "unpriced_rows"] += 1
            add_cost_source(bucket, cost_source)
            if pricing:
                bucket["pricing"] = {
                    "input_per_mtok": to_float(pricing.get("input_per_mtok")),
                    "output_per_mtok": to_float(pricing.get("output_per_mtok")),
                    "cached_input_per_mtok": to_float(pricing.get("cached_input_per_mtok")),
                    "source": pricing.get("source") or "pricing_table",
                }

    final_days = {}
    for day_key, day in sorted(days.items()):
        final_days[day_key] = {
            "rows": day["rows"],
            "prompt_tokens": day["prompt_tokens"],
            "completion_tokens": day["completion_tokens"],
            "audio_input_seconds": day["audio_input_seconds"],
            "cost_usd": round(day["cost_usd"], 4),
            "estimated_cost_usd": round(day["estimated_cost_usd"], 4),
            "priced_rows": day["priced_rows"],
            "unpriced_rows": day["unpriced_rows"],
            "cost_sources": day.get("cost_sources", {}),
            "by_api_key": sorted(
                [{"name": k, **{**v, "cost_usd": round(v["cost_usd"], 4), "estimated_cost_usd": round(v["estimated_cost_usd"], 4)}} for k, v in day["by_api_key"].items()],
                key=lambda x: (x["cost_usd"], x["estimated_cost_usd"]),
                reverse=True,
            ),
            "by_model": sorted(
                [{"name": k, **{**v, "cost_usd": round(v["cost_usd"], 4), "estimated_cost_usd": round(v["estimated_cost_usd"], 4)}} for k, v in day["by_model"].items()],
                key=lambda x: (x["cost_usd"], x["estimated_cost_usd"]),
                reverse=True,
            ),
        }

    return {
        "status": "ok",
        "note": "Fireworks billingUsage returns metered usage rows and tokens. cost_usd is populated only when Fireworks returns an explicit dollar cost; estimated_cost_usd is local pricing math and is not treated as invoice truth.",
        "pricing": {
            "source": "configured_pricing_for_estimates_only",
            "models": pricing_table,
        },
        "totals": {**totals, "cost_usd": round(totals["cost_usd"], 4), "estimated_cost_usd": round(totals["estimated_cost_usd"], 4)},
        "by_api_key": sorted(
            [{"name": k, **{**v, "cost_usd": round(v["cost_usd"], 4), "estimated_cost_usd": round(v["estimated_cost_usd"], 4)}} for k, v in by_api_key.items()],
            key=lambda x: (x["cost_usd"], x["estimated_cost_usd"]),
            reverse=True,
        ),
        "by_model": sorted(
            [{"name": k, **{**v, "cost_usd": round(v["cost_usd"], 4), "estimated_cost_usd": round(v["estimated_cost_usd"], 4)}} for k, v in by_model.items()],
            key=lambda x: (x["cost_usd"], x["estimated_cost_usd"]),
            reverse=True,
        ),
        "days": final_days,
    }


def money_to_float(value):
    if isinstance(value, dict):
        units = to_float(value.get("units"))
        nanos = to_float(value.get("nanos"))
        return units + nanos / 1_000_000_000
    return to_float(value)


def fetch_fireworks_actual_costs(account_id, api_key, day_keys, tz_name):
    firectl = shutil.which("firectl")
    if not firectl:
        return {"status": "not_available", "reason": "firectl not installed"}
    account_slug = str(account_id or "").strip().strip("/")
    result = {"status": "ok", "source": "firectl billing get-usage --account-costs-only", "days": {}}
    for day_key in sorted(day_keys):
        try:
            start = datetime.fromisoformat(day_key).date()
            end = start + timedelta(days=1)
        except Exception:
            continue
        cmd = [
            firectl,
            "billing",
            "get-usage",
            "--account-id",
            account_slug,
            "--api-key",
            api_key,
            "--start-time",
            start.isoformat(),
            "--end-time",
            end.isoformat(),
            "--timezone",
            tz_name,
            "--usage-type",
            "serverless",
            "--account-costs-only",
            "-o",
            "json",
        ]
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        if completed.returncode != 0:
            result.setdefault("errors", {})[day_key] = completed.stderr.strip()[-500:]
            continue
        try:
            payload = json.loads(completed.stdout)
        except Exception:
            result.setdefault("errors", {})[day_key] = "invalid firectl json output"
            continue
        items = (((payload.get("account_costs") or {}).get("cost_data_items")) or [])
        total = 0.0
        for item in items:
            total += money_to_float(item.get("total") or item.get("usage_total") or item.get("subtotal"))
        result["days"][day_key] = {
            "cost_usd": round(total, 4),
            "rows": len(items),
        }
    if not result["days"]:
        result["status"] = "error"
        result["reason"] = "firectl returned no daily account costs"
    return result


def apply_fireworks_actual_costs(billing_source, actual_source):
    if not isinstance(billing_source, dict) or not isinstance(actual_source, dict):
        return billing_source
    billing_source["actual_costs"] = actual_source
    if actual_source.get("status") != "ok":
        return billing_source
    billing_days = billing_source.get("days") if isinstance(billing_source.get("days"), dict) else {}
    for day_key, actual_day in (actual_source.get("days") or {}).items():
        day = billing_days.setdefault(day_key, {"rows": 0, "prompt_tokens": 0, "completion_tokens": 0})
        day["cost_usd"] = round(to_float(actual_day.get("cost_usd")), 4)
        day["actual_cost_source"] = actual_source.get("source")
        allocate_actual_cost_to_billing_breakdowns(day, day["cost_usd"])
        sources = day.setdefault("cost_sources", {})
        sources["firectl_account_costs"] = sources.get("firectl_account_costs", 0) + 1
    billing_source["days"] = billing_days
    totals = billing_source.setdefault("totals", {})
    totals["cost_usd"] = round(sum(to_float(day.get("cost_usd")) for day in billing_days.values()), 4)
    totals["actual_cost_source"] = actual_source.get("source")
    return billing_source


def allocation_weight(item):
    estimated = to_float(item.get("estimated_cost_usd"))
    if estimated > 0:
        return estimated
    tokens = to_int(item.get("prompt_tokens")) + to_int(item.get("completion_tokens"))
    if tokens > 0:
        return tokens
    return to_int(item.get("rows")) or to_int(item.get("fireworks_calls"))


def allocate_amounts(items, total_amount, weight_fn):
    eligible = [(item, to_float(weight_fn(item))) for item in items if to_float(weight_fn(item)) > 0]
    total_weight = sum(weight for _, weight in eligible)
    if total_amount <= 0 or total_weight <= 0:
        return []
    allocations = []
    allocated = 0.0
    for idx, (item, weight) in enumerate(eligible):
        if idx == len(eligible) - 1:
            amount = round(total_amount - allocated, 4)
        else:
            amount = round(total_amount * weight / total_weight, 4)
            allocated += amount
        allocations.append((item, max(amount, 0.0)))
    return allocations


def allocate_actual_cost_to_billing_breakdowns(day, actual_cost_usd):
    if not isinstance(day, dict) or actual_cost_usd <= 0:
        return
    for group_name in ("by_model", "by_api_key"):
        items = day.get(group_name)
        if not isinstance(items, list) or not items:
            continue
        for item, amount in allocate_amounts(items, actual_cost_usd, allocation_weight):
            item["cost_usd"] = round(amount, 4)
            item["actual_cost_allocated"] = True
            item["cost_basis"] = "fireworks_account_daily_actual_allocated_by_estimated_cost_or_tokens"


def allocate_actual_cost_to_local_groups(day, actual_cost_usd):
    if not isinstance(day, dict) or actual_cost_usd <= 0:
        return
    for group_name in ("by_agent", "by_client", "by_model", "by_provider", "by_source", "top_threads"):
        items = day.get(group_name)
        if not isinstance(items, list) or not items:
            continue
        for item in items:
            reported = to_float(item.get("reported_cost_usd"))
            item["total_cost_usd"] = round(reported, 4)
        for item, amount in allocate_amounts(items, actual_cost_usd, lambda x: to_int(x.get("fireworks_calls"))):
            item["fireworks_actual_cost_usd"] = round(amount, 4)
            item["total_cost_usd"] = round(to_float(item.get("reported_cost_usd")) + amount, 4)
            item["cost_basis"] = "reported_cost_plus_fireworks_actual_allocated_by_fireworks_calls"


def reconcile_sancho_costs(report):
    """Expose one Sancho-wide cost while keeping provider sources auditable."""
    billing_source = ((report.get("sources") or {}).get("fireworks_billing_usage") or {})
    billing_ok = billing_source.get("status") == "ok"
    billing_days = billing_source.get("days") if isinstance(billing_source.get("days"), dict) else {}
    days = report.get("days") if isinstance(report.get("days"), dict) else {}

    total_sancho = 0.0
    total_reported = 0.0
    total_local_fireworks = 0.0
    total_fireworks_billing = 0.0
    total_fireworks_estimated = 0.0

    for day_key, day in days.items():
        reported_cost = to_float(day.get("reported_cost_usd"))
        local_fireworks_cost = to_float(day.get("fireworks_reported_cost_usd"))
        billing_day = billing_days.get(day_key) if isinstance(billing_days, dict) else None
        billing_cost = to_float((billing_day or {}).get("cost_usd")) if billing_ok else 0.0
        estimated_cost = to_float((billing_day or {}).get("estimated_cost_usd")) if billing_ok else 0.0
        has_actual_fireworks_cost = billing_cost > 0

        if has_actual_fireworks_cost:
            sancho_cost = max(reported_cost - local_fireworks_cost + billing_cost, 0.0)
            basis = "reported_cost_minus_local_fireworks_plus_fireworks_actual"
        else:
            sancho_cost = max(reported_cost - local_fireworks_cost, 0.0)
            basis = "confirmed_reported_cost_excluding_fireworks_estimate"

        day["fireworks_actual_cost_usd"] = round(billing_cost, 4)
        day["fireworks_estimated_cost_usd"] = round(estimated_cost, 4)
        day["fireworks_billing_cost_usd"] = round(billing_cost, 4)
        day["fireworks_cost_status"] = "actual" if has_actual_fireworks_cost else ("estimated_only" if estimated_cost > 0 else "missing")
        day["sancho_total_cost_usd"] = round(sancho_cost, 4)
        day["sancho_cost_basis"] = basis
        day["sancho_cost_complete"] = bool(has_actual_fireworks_cost or day.get("fireworks_calls", 0) == 0)
        if has_actual_fireworks_cost:
            allocate_actual_cost_to_local_groups(day, billing_cost)

        total_sancho += sancho_cost
        total_reported += reported_cost
        total_local_fireworks += local_fireworks_cost
        total_fireworks_billing += billing_cost
        total_fireworks_estimated += estimated_cost

    totals = report.setdefault("totals", {})
    totals["reported_cost_usd"] = round(total_reported, 4)
    totals["fireworks_reported_cost_usd"] = round(total_local_fireworks, 4)
    totals["fireworks_billing_cost_usd"] = round(total_fireworks_billing, 4)
    totals["fireworks_actual_cost_usd"] = round(total_fireworks_billing, 4)
    totals["fireworks_estimated_cost_usd"] = round(total_fireworks_estimated, 4)
    totals["sancho_total_cost_usd"] = round(total_sancho, 4)
    totals["sancho_cost_basis"] = "confirmed_cost_only_fireworks_estimates_excluded"
    totals["sancho_cost_complete"] = all(day.get("sancho_cost_complete") for day in days.values())
    report["cost_note"] = (
        "sancho_total_cost_usd is confirmed cost only. Fireworks billingUsage token-derived estimates "
        "are exposed as fireworks_estimated_cost_usd but excluded unless Fireworks returns explicit dollars "
        "or another actual billing source is wired in. Fireworks bills in USD; *_eur fields are display "
        "conversions using currency.usd_to_eur_rate."
    )
    return report


def build_report(args):
    tz_name = args.timezone or os.environ.get("LLM_USAGE_TRACKER_TIMEZONE") or os.environ.get("TZ") or "Europe/Madrid"
    try:
        tz = ZoneInfo(tz_name) if ZoneInfo else timezone.utc
    except Exception:
        tz_name = "UTC"
        tz = timezone.utc

    now = utc_now()
    local_today = now.astimezone(tz).date()
    start_local = local_today - timedelta(days=args.days - 1)
    start_utc = datetime.combine(start_local, datetime.min.time(), tzinfo=tz).astimezone(timezone.utc)
    end_utc = now

    agent_dirs = get_agent_sessions_dirs()
    session_index = load_session_index(agent_dirs)
    valid_slugs = known_slugs()
    days = {}
    scan_errors = []
    scanned_files = 0
    scanned_sessions = 0

    for agent_id, sessions_dir in sorted(agent_dirs.items()):
        if not sessions_dir.exists():
            continue
        for jsonl_file in transcript_files(sessions_dir):
            try:
                if datetime.fromtimestamp(jsonl_file.stat().st_mtime, tz=timezone.utc) < start_utc:
                    continue
            except Exception:
                pass
            scanned_files += 1
            result = scan_transcript(jsonl_file, agent_id, session_index, valid_slugs, start_utc, end_utc, tz, days)
            if result and result.get("error"):
                scan_errors.append(result)
            elif result:
                scanned_sessions += 1

    final_days = finalize_days(days, args.top_limit)
    report = {
        "schema": "sancho.llm_usage_daily.v1",
        "updated_at": now.isoformat().replace("+00:00", "Z"),
        "window": {
            "timezone": tz_name,
            "days": args.days,
            "start": start_utc.isoformat().replace("+00:00", "Z"),
            "end": end_utc.isoformat().replace("+00:00", "Z"),
        },
        "sources": {
            "local_transcripts": {
                "status": "ok",
                "agent_session_dirs": {agent: str(path) for agent, path in sorted(agent_dirs.items())},
                "scanned_files": scanned_files,
                "scanned_sessions_with_usage": scanned_sessions,
                "errors": scan_errors[:20],
            },
            "fireworks_billing_usage": {"status": "not_configured"},
        },
        "totals": aggregate_totals(final_days),
        "days": final_days,
    }

    account_id = args.fireworks_account_id or os.environ.get("FIREWORKS_ACCOUNT_ID")
    api_key = os.environ.get("FIREWORKS_API_KEY")
    if account_id and api_key and not args.skip_fireworks:
        try:
            raw = fetch_fireworks_billing_usage(account_id, api_key, start_utc, end_utc, tz_name)
            report["sources"]["fireworks_billing_usage"] = summarize_fireworks_usage(raw, tz)
            actual = fetch_fireworks_actual_costs(account_id, api_key, final_days.keys(), tz_name)
            apply_fireworks_actual_costs(report["sources"]["fireworks_billing_usage"], actual)
        except Exception as exc:
            report["sources"]["fireworks_billing_usage"] = {
                "status": "error",
                "error": str(exc),
            }
    elif not account_id:
        report["sources"]["fireworks_billing_usage"] = {
            "status": "not_configured",
            "reason": "Set FIREWORKS_ACCOUNT_ID to enable provider-side usage tracking.",
        }
    elif not api_key:
        report["sources"]["fireworks_billing_usage"] = {
            "status": "not_configured",
            "reason": "Set FIREWORKS_API_KEY to enable provider-side usage tracking.",
        }

    reconcile_sancho_costs(report)
    apply_currency(report)
    return report


def main():
    parser = argparse.ArgumentParser(description="Track Sancho LLM calls and Fireworks usage.")
    parser.add_argument("--days", type=int, default=to_int(os.environ.get("LLM_USAGE_TRACKER_DAYS")) or 7)
    parser.add_argument("--top-limit", type=int, default=to_int(os.environ.get("LLM_USAGE_TRACKER_TOP_LIMIT")) or 20)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--timezone", default=None)
    parser.add_argument("--fireworks-account-id", default=None)
    parser.add_argument("--skip-fireworks", action="store_true")
    parser.add_argument("--json-output", action="store_true")
    args = parser.parse_args()

    if args.days < 1:
        print("--days must be >= 1", file=sys.stderr)
        return 2

    report = build_report(args)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".tmp")
    tmp.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    tmp.replace(output)

    print(
        "llm-usage-tracker: "
        f"{report['totals']['model_calls']} model calls, "
        f"{report['totals']['fireworks_calls']} fireworks calls, "
        f"{report['totals']['tool_calls']} tool calls "
        f"({args.days}d) -> {output}"
    )
    if args.json_output:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
