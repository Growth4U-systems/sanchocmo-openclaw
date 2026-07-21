#!/usr/bin/env python3
"""
Daily Slack report for Sancho LLM usage.

Reads:
  workspace-sancho/memory/costs/llm-usage-daily.json

Posts once per day to Slack after LLM_USAGE_SLACK_REPORT_HOUR local time. The
script is safe to run every few minutes from the container loop; state is kept in
memory/costs/llm-usage-slack-report-state.json.

Required env to post:
  LLM_USAGE_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN

Optional env:
  LLM_USAGE_SLACK_CHANNEL=C096X3WUQP9
  LLM_USAGE_SLACK_REPORT_HOUR=9
  LLM_USAGE_SLACK_REPORT_MINUTE=0
  LLM_USAGE_SLACK_REPORT_TIMEZONE=Europe/Madrid
  LLM_USAGE_SLACK_REPORT_ENABLED=1
  LLM_USAGE_SLACK_REQUIRE_BILLING=0
  LLM_USAGE_SLACK_ALLOW_DEFAULT_TOKEN=1
  LLM_USAGE_REPORT_LABEL=Sancho Produccion
  LLM_USAGE_PEER_STAGING_URL=https://staging.sanchocmo.ai
  LLM_USAGE_PEER_STAGING_ADMIN_TOKEN=...
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None


OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw")))
WORKSPACE = Path(os.environ.get("SANCHO_WORKSPACE", str(OPENCLAW_HOME / "workspace-sancho")))
DEFAULT_INPUT = WORKSPACE / "memory" / "costs" / "llm-usage-daily.json"
STATE_FILE = WORKSPACE / "memory" / "costs" / "llm-usage-slack-report-state.json"
SLACK_API = "https://slack.com/api/chat.postMessage"
SLACK_AUTH_TEST_API = "https://slack.com/api/auth.test"
DEFAULT_SLACK_CHANNEL = "C096X3WUQP9"


def env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


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


def fmt_int(value):
    return f"{to_int(value):,}".replace(",", ".")


def fmt_usd(value):
    try:
        amount = float(value or 0)
    except Exception:
        amount = 0.0
    return f"${amount:,.2f}"


def usd_to_eur_rate(data=None):
    for key in ("LLM_USAGE_USD_TO_EUR", "USD_TO_EUR"):
        raw = os.environ.get(key)
        if raw:
            rate = to_float(str(raw).replace(",", "."))
            if rate > 0:
                return rate
    currency = (data or {}).get("currency") if isinstance(data, dict) else {}
    if isinstance(currency, dict):
        rate = to_float(currency.get("usd_to_eur_rate"))
        if rate > 0:
            return rate
    return 0.92


def eur_from_usd(value, rate):
    return to_float(value) * rate


def money_eur(bucket, usd_key, rate):
    if isinstance(bucket, dict) and usd_key.endswith("_usd"):
        eur_key = f"{usd_key[:-4]}_eur"
        if eur_key in bucket:
            return to_float(bucket.get(eur_key))
        return eur_from_usd(bucket.get(usd_key), rate)
    return 0.0


def fmt_eur(value):
    try:
        amount = float(value or 0)
    except Exception:
        amount = 0.0
    formatted = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"€{formatted}"


def short(value, limit=72):
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return default


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(STATE_FILE.suffix + ".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False))
    tmp.replace(STATE_FILE)


def local_timezone(args):
    tz_name = (
        args.timezone
        or os.environ.get("LLM_USAGE_SLACK_REPORT_TIMEZONE")
        or os.environ.get("LLM_USAGE_TRACKER_TIMEZONE")
        or os.environ.get("TZ")
        or "Europe/Madrid"
    )
    try:
        return tz_name, ZoneInfo(tz_name) if ZoneInfo else timezone.utc
    except Exception:
        return "UTC", timezone.utc


def schedule_due(now_local, args):
    if args.force:
        return True
    hour = to_int(os.environ.get("LLM_USAGE_SLACK_REPORT_HOUR") or 9)
    minute = to_int(os.environ.get("LLM_USAGE_SLACK_REPORT_MINUTE") or 0)
    return (now_local.hour, now_local.minute) >= (hour, minute)


def pick_report_date(data, now_local, forced_date=None):
    days = data.get("days") if isinstance(data.get("days"), dict) else {}
    if forced_date:
        return forced_date
    yesterday = (now_local.date() - timedelta(days=1)).isoformat()
    if yesterday in days:
        return yesterday
    if days:
        return sorted(days.keys())[-1]
    return yesterday


def display_environment_label(value):
    raw = str(value or "").strip()
    normalized = raw.lower().replace("-", " ").replace("_", " ")
    if normalized in ("prod", "production", "produccion", "sancho production", "sancho produccion"):
        return "Sancho Produccion"
    if normalized in ("stage", "staging", "sancho stage", "sancho staging"):
        return "Sancho Staging"
    return raw or "Sancho Produccion"


def local_report_label():
    return display_environment_label(
        os.environ.get("LLM_USAGE_REPORT_LABEL")
        or os.environ.get("NEXT_PUBLIC_ENV_LABEL")
        or os.environ.get("SANCHO_ENV")
        or "Sancho Produccion"
    )


def configured_peers():
    peers = []
    staging_url = os.environ.get("LLM_USAGE_PEER_STAGING_URL") or os.environ.get("LLM_USAGE_STAGING_URL")
    staging_token = (
        os.environ.get("LLM_USAGE_PEER_STAGING_ADMIN_TOKEN")
        or os.environ.get("LLM_USAGE_STAGING_ADMIN_TOKEN")
    )
    if staging_url:
        peers.append(
            {
                "label": display_environment_label(
                    os.environ.get("LLM_USAGE_PEER_STAGING_LABEL") or "Sancho Staging"
                ),
                "url": staging_url,
                "token": staging_token,
            }
        )
    return peers


def fetch_remote_usage(peer):
    token = (peer.get("token") or "").strip()
    if not token:
        return {"label": peer.get("label") or "remote", "status": "error", "error": "missing_admin_token"}
    base_url = str(peer.get("url") or "").rstrip("/")
    if not base_url:
        return {"label": peer.get("label") or "remote", "status": "error", "error": "missing_url"}
    url = f"{base_url}/api/system/llm-usage"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "x-admin-token": token,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {
                "label": peer.get("label") or base_url,
                "status": "ok",
                "data": json.loads(resp.read().decode("utf-8")),
                "url": base_url,
            }
    except urllib.error.HTTPError as exc:
        return {"label": peer.get("label") or base_url, "status": "error", "error": f"http_{exc.code}"}
    except Exception as exc:
        return {"label": peer.get("label") or base_url, "status": "error", "error": str(exc)}


def top_line(item, rate, metric="fireworks_calls"):
    name = item.get("name") or item.get("agent") or "unknown"
    fw = to_int(item.get("fireworks_calls"))
    model = to_int(item.get("model_calls"))
    tools = to_int(item.get("tool_calls"))
    cost = money_eur(item, "total_cost_usd", rate) or money_eur(item, "reported_cost_usd", rate)
    cost_prefix = f"{fmt_eur(cost)} · " if cost > 0 else ""
    if metric == "thread":
        label = f"{item.get('client') or '_unclassified'} · {item.get('agent') or 'unknown'} · {item.get('thread') or name}"
        return f"• `{short(label, 82)}` — {cost_prefix}{fmt_int(fw)} fw · {fmt_int(model)} model · {fmt_int(tools)} tools"
    return f"• `{short(name, 42)}` — {cost_prefix}{fmt_int(fw)} fw · {fmt_int(model)} model · {fmt_int(tools)} tools"


def local_model_line(item, rate):
    name = item.get("name") or "unknown"
    cost = fmt_eur(money_eur(item, "total_cost_usd", rate) or money_eur(item, "reported_cost_usd", rate))
    fw = to_int(item.get("fireworks_calls"))
    model = to_int(item.get("model_calls"))
    usage = item.get("reported_usage") if isinstance(item.get("reported_usage"), dict) else {}
    total_tokens = to_int(usage.get("total"))
    token_text = f" · {fmt_int(total_tokens)} tokens" if total_tokens else ""
    return f"• `{short(name, 58)}` — {cost} · {fmt_int(model)} model · {fmt_int(fw)} fw{token_text}"


def billing_model_line(item, rate):
    name = item.get("name") or "unknown"
    prompt = to_int(item.get("prompt_tokens"))
    completion = to_int(item.get("completion_tokens"))
    rows = to_int(item.get("rows"))
    actual = money_eur(item, "cost_usd", rate)
    cost_text = f"{fmt_eur(actual)} real" if actual > 0 else "sin coste real por fila"
    return f"• `{short(name, 58)}` — {cost_text} · {fmt_int(prompt)} prompt · {fmt_int(completion)} completion · {fmt_int(rows)} rows"


def model_cost_eur(item, rate):
    return (
        money_eur(item, "total_cost_usd", rate)
        or money_eur(item, "cost_usd", rate)
        or money_eur(item, "reported_cost_usd", rate)
    )


def friendly_model_name(name):
    raw = str(name or "unknown")
    lower = raw.lower()
    if "glm-5p2" in lower or "glm-5.2" in lower:
        return "GLM 5.2"
    if "claude-sonnet" in lower:
        return "Claude Sonnet"
    if "claude-opus" in lower:
        return "Claude Opus"
    if "delivery-mirror" in lower:
        return "Delivery mirror"
    return short(raw.rsplit("/", 1)[-1], 28)


def concise_model_summary(models, rate, limit=3):
    priced = [m for m in models if model_cost_eur(m, rate) > 0]
    priced.sort(key=lambda m: model_cost_eur(m, rate), reverse=True)
    if not priced:
        return "Sin desglose por modelo"
    return " · ".join(f"{friendly_model_name(m.get('name'))} {fmt_eur(model_cost_eur(m, rate))}" for m in priced[:limit])


def day_cost_eur(data, day, rate):
    total = money_eur(day, "sancho_total_cost_usd", rate)
    if total <= 0 and to_float(day.get("sancho_total_cost_usd")) > 0:
        total = eur_from_usd(day.get("sancho_total_cost_usd"), rate)
    return total


def source_day_summary(source, report_date):
    label = source.get("label") or "Entorno"
    if source.get("status") != "ok":
        return {"label": label, "exists": False, "error": source.get("error") or "unavailable"}

    data = source.get("data") if isinstance(source.get("data"), dict) else {}
    day = ((data.get("days") or {}).get(report_date) or {})
    if not day:
        return {"label": label, "exists": False, "error": "sin datos"}

    rate = usd_to_eur_rate(data)
    billing_source = ((data.get("sources") or {}).get("fireworks_billing_usage") or {})
    billing_day = ((billing_source.get("days") or {}).get(report_date) or {})
    provider = money_eur(day, "fireworks_actual_cost_usd", rate) or money_eur(day, "fireworks_billing_cost_usd", rate)
    estimated = money_eur(day, "fireworks_estimated_cost_usd", rate)
    complete = bool(day.get("sancho_cost_complete", provider > 0 or to_int(day.get("fireworks_calls")) == 0))
    scope = day.get("fireworks_billing_scope") if isinstance(day.get("fireworks_billing_scope"), dict) else {}

    return {
        "label": label,
        "exists": True,
        "cost_eur": day_cost_eur(data, day, rate),
        "provider_eur": provider if provider > 0 else estimated,
        "provider_label": "real" if provider > 0 else ("estimado" if estimated > 0 else "sin coste"),
        "model_calls": to_int(day.get("model_calls")),
        "tool_calls": to_int(day.get("tool_calls")),
        "fireworks_calls": to_int(day.get("fireworks_calls")),
        "sessions": to_int(day.get("sessions")),
        "complete": complete,
        "billing_status": billing_source.get("status") or "not_configured",
        "fireworks_cost_status": day.get("fireworks_cost_status") or "missing",
        "scope_status": scope.get("status"),
        "models": day.get("by_model") if isinstance(day.get("by_model"), list) else [],
        "providers": day.get("by_provider") if isinstance(day.get("by_provider"), list) else [],
        "agents": day.get("by_agent") if isinstance(day.get("by_agent"), list) else [],
        "unmetered_providers": day.get("unmetered_providers") if isinstance(day.get("unmetered_providers"), list) else [],
        "account_api_keys": billing_day.get("by_api_key") if isinstance(billing_day.get("by_api_key"), list) else [],
        "fireworks_account_eur": money_eur(billing_day, "cost_usd", rate),
        "rate": rate,
    }


def combined_model_summary(summaries, limit=3):
    totals = {}
    for summary in summaries:
        if not summary.get("exists"):
            continue
        rate = summary.get("rate") or 0.92
        for item in summary.get("models") or []:
            cost = model_cost_eur(item, rate)
            if cost <= 0:
                continue
            name = friendly_model_name(item.get("name"))
            totals[name] = totals.get(name, 0.0) + cost
    if not totals:
        return "Sin desglose por modelo"
    ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    return " · ".join(f"{name} {fmt_eur(cost)}" for name, cost in ordered[:limit])


def friendly_provider_name(name):
    raw = str(name or "unknown")
    known = {
        "anthropic": "Anthropic",
        "fireworks": "Fireworks",
        "google": "Google",
        "openai": "OpenAI",
        "openrouter": "OpenRouter",
        "xai": "xAI",
        "minimax": "MiniMax",
    }
    return known.get(raw.lower(), short(raw, 24))


def combined_provider_summary(summaries):
    totals = {}
    for summary in summaries:
        if not summary.get("exists"):
            continue
        rate = summary.get("rate") or 0.92
        for item in summary.get("providers") or []:
            name = str(item.get("name") or "unknown")
            if name.lower() in ("openclaw", "unknown"):
                continue
            bucket = totals.setdefault(name, {"cost_eur": 0.0, "calls": 0, "errors": 0, "statuses": set()})
            bucket["cost_eur"] += model_cost_eur(item, rate)
            bucket["calls"] += to_int(item.get("model_calls"))
            bucket["errors"] += to_int(item.get("error_calls"))
            if item.get("cost_status"):
                bucket["statuses"].add(item.get("cost_status"))

    if not totals:
        return "Sin proveedores registrados"

    parts = []
    ordered = sorted(totals.items(), key=lambda pair: (pair[1]["cost_eur"], pair[1]["calls"]), reverse=True)
    for name, bucket in ordered:
        calls = bucket["calls"]
        errors = bucket["errors"]
        if "missing" in bucket["statuses"]:
            value = "sin medicion"
        elif calls > 0 and errors >= calls:
            value = f"{fmt_eur(bucket['cost_eur'])} ({fmt_int(errors)} intentos rechazados)"
        else:
            value = f"{fmt_eur(bucket['cost_eur'])} ({fmt_int(calls)} llamadas)"
        parts.append(f"{friendly_provider_name(name)} {value}")
    return " · ".join(parts)


def top_agent_summary(summaries):
    totals = {}
    for summary in summaries:
        if not summary.get("exists"):
            continue
        rate = summary.get("rate") or 0.92
        for item in summary.get("agents") or []:
            name = str(item.get("name") or "unknown")
            bucket = totals.setdefault(name, {"cost_eur": 0.0, "calls": 0})
            bucket["cost_eur"] += model_cost_eur(item, rate)
            bucket["calls"] += to_int(item.get("model_calls"))
    if not totals:
        return "Sin agente atribuible"
    name, bucket = max(totals.items(), key=lambda pair: (pair[1]["cost_eur"], pair[1]["calls"]))
    return f"{short(name, 32)} {fmt_eur(bucket['cost_eur'])}"


def external_account_projects(summaries):
    for summary in summaries:
        items = summary.get("account_api_keys") if summary.get("exists") else []
        if not items:
            continue
        rate = summary.get("rate") or 0.92
        external = []
        for item in items:
            raw_name = str(item.get("name") or "unknown")
            if "sanchocmo" in raw_name.lower():
                continue
            project_name = raw_name.split(" (", 1)[0]
            cost = money_eur(item, "cost_usd", rate)
            if cost > 0:
                external.append((project_name, cost))
        if external:
            external.sort(key=lambda pair: pair[1], reverse=True)
            return [{"name": short(name, 28), "cost_eur": cost} for name, cost in external]
    return []


def fireworks_account_total(summaries):
    for summary in summaries:
        total = to_float(summary.get("fireworks_account_eur")) if summary.get("exists") else 0.0
        if total > 0:
            return total
    return 0.0


def format_unified_report(sources, report_date):
    summaries = [source_day_summary(source, report_date) for source in sources]
    available = [summary for summary in summaries if summary.get("exists")]

    total_cost = sum(to_float(summary.get("cost_eur")) for summary in available)
    model_calls = sum(to_int(summary.get("model_calls")) for summary in available)
    tool_calls = sum(to_int(summary.get("tool_calls")) for summary in available)
    fireworks_calls = sum(to_int(summary.get("fireworks_calls")) for summary in available)
    sessions = sum(to_int(summary.get("sessions")) for summary in available)
    complete = bool(available) and all(summary.get("complete") for summary in available)
    total_label = "Total Sancho" if complete else "Total parcial Sancho"
    models_text = combined_model_summary(summaries)
    providers_text = combined_provider_summary(summaries)
    top_agent_text = top_agent_summary(summaries)
    external_projects = external_account_projects(summaries)
    account_total = fireworks_account_total(summaries)

    env_lines = []
    warnings = []
    for summary in summaries:
        label = summary.get("label")
        if not summary.get("exists"):
            env_lines.append(f"*{label}:* sin datos ({summary.get('error')})")
            warnings.append(f"{label}: {summary.get('error')}")
            continue
        env_lines.append(
            f"*{label}:* {fmt_eur(summary.get('cost_eur'))} · "
            f"{fmt_int(summary.get('model_calls'))} model · "
            f"{fmt_int(summary.get('fireworks_calls'))} Fireworks"
        )
        if summary.get("billing_status") != "ok" and summary.get("fireworks_calls", 0) > 0:
            warnings.append(f"{label}: billing {summary.get('billing_status')}")
        elif summary.get("fireworks_cost_status") != "actual" and summary.get("fireworks_calls", 0) > 0:
            warnings.append(f"{label}: coste {summary.get('fireworks_cost_status')}")
        if summary.get("scope_status") == "api_key_unmatched":
            warnings.append(f"{label}: Fireworks sin match de API key")
        elif summary.get("scope_status") == "api_key_breakdown_missing":
            warnings.append(f"{label}: Fireworks sin desglose por API key")
        if summary.get("unmetered_providers"):
            warnings.append(f"{label}: sin medicion {', '.join(summary.get('unmetered_providers'))}")

    title = f"Sancho coste LLM · {report_date}"
    fallback_lines = [title, f"{total_label}: {fmt_eur(total_cost)}", *env_lines]
    fallback_lines.extend(f"{item['name']}: {fmt_eur(item['cost_eur'])}" for item in external_projects)
    if account_total > 0:
        fallback_lines.append(f"Total cuenta Fireworks: {fmt_eur(account_total)}")
    fallback_lines.extend(
        [
            f"Proveedores Sancho: {providers_text}",
            f"Agente Sancho que mas consumio: {top_agent_text}",
            f"Uso Sancho: {fmt_int(model_calls)} model · {fmt_int(tool_calls)} tools",
            f"Top modelos Sancho: {models_text}",
        ]
    )
    fallback = "\n".join(fallback_lines)

    summary_lines = [f"*{total_label}:* {fmt_eur(total_cost)}", *env_lines]
    summary_lines.extend(f"*{item['name']}:* {fmt_eur(item['cost_eur'])}" for item in external_projects)
    if account_total > 0:
        summary_lines.append(f"*Total cuenta Fireworks:* {fmt_eur(account_total)}")
    summary_lines.extend(
        [
            f"*Proveedores Sancho:* {providers_text}",
            f"*Agente Sancho que mas consumio:* {top_agent_text}",
            f"*Uso Sancho:* {fmt_int(model_calls)} model calls · {fmt_int(tool_calls)} tool calls",
            f"*Top modelos Sancho:* {models_text}",
        ]
    )
    summary = "\n".join(summary_lines)
    if warnings:
        summary += "\n*Atencion:* " + "; ".join(short(warning, 48) for warning in warnings[:4])

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title[:150]}},
        {"type": "section", "text": {"type": "mrkdwn", "text": summary}},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Dia cerrado: `{report_date}` · Sesiones: `{fmt_int(sessions)}` · Produccion + Staging · EUR.",
                }
            ],
        },
    ]
    return fallback, blocks


def cost_source_text(bucket):
    sources = bucket.get("cost_sources") if isinstance(bucket, dict) else {}
    if not isinstance(sources, dict) or not sources:
        return "source unknown"
    return ", ".join(f"{k}:{v}" for k, v in sorted(sources.items()))


def resolve_slack_token():
    dedicated = (os.environ.get("LLM_USAGE_SLACK_BOT_TOKEN") or "").strip()
    if dedicated:
        return dedicated, "LLM_USAGE_SLACK_BOT_TOKEN"

    fallback = (os.environ.get("SLACK_BOT_TOKEN") or "").strip()
    if fallback and env_bool("LLM_USAGE_SLACK_ALLOW_DEFAULT_TOKEN", True):
        return fallback, "SLACK_BOT_TOKEN"

    return "", ""


def format_report(data, report_date):
    rate = usd_to_eur_rate(data)
    day = (data.get("days") or {}).get(report_date) or {}
    billing_source = ((data.get("sources") or {}).get("fireworks_billing_usage") or {})
    billing_day = ((billing_source.get("days") or {}).get(report_date) or {})
    billing_status = billing_source.get("status") or "not_configured"

    fireworks_calls = to_int(day.get("fireworks_calls"))
    model_calls = to_int(day.get("model_calls"))
    tool_calls = to_int(day.get("tool_calls"))
    zero_prompt = to_int(day.get("zero_prompt_fireworks_calls"))
    sessions = to_int(day.get("sessions"))

    reported_cost = to_float(day.get("reported_cost_usd"))
    local_fireworks_cost = to_float(day.get("fireworks_reported_cost_usd"))
    fireworks_actual_cost_usd = to_float(day.get("fireworks_actual_cost_usd", billing_day.get("cost_usd")))
    fireworks_actual_cost = money_eur(day, "fireworks_actual_cost_usd", rate)
    if fireworks_actual_cost <= 0 and billing_day:
        fireworks_actual_cost = money_eur(billing_day, "cost_usd", rate)
    fireworks_estimated_cost_usd = to_float(day.get("fireworks_estimated_cost_usd", billing_day.get("estimated_cost_usd")))
    if fireworks_estimated_cost_usd <= 0 and local_fireworks_cost > 0:
        fireworks_estimated_cost_usd = local_fireworks_cost
    fireworks_estimated_cost = eur_from_usd(fireworks_estimated_cost_usd, rate)
    provider_metered_cost = fireworks_actual_cost if fireworks_actual_cost > 0 else fireworks_estimated_cost
    provider_metered_label = "real" if fireworks_actual_cost > 0 else ("estimado" if provider_metered_cost > 0 else "sin coste")
    fireworks_cost_status = day.get("fireworks_cost_status") or ("actual" if fireworks_actual_cost_usd > 0 else "estimated_only")
    sancho_total_cost_usd = to_float(day.get("sancho_total_cost_usd"))
    if sancho_total_cost_usd <= 0 and reported_cost > 0:
        sancho_total_cost_usd = reported_cost
    sancho_cost_complete = bool(day.get("sancho_cost_complete", fireworks_actual_cost_usd > 0 or fireworks_calls == 0))
    if not sancho_cost_complete and reported_cost > sancho_total_cost_usd:
        sancho_total_cost_usd = reported_cost
    sancho_total_cost = money_eur(day, "sancho_total_cost_usd", rate)
    if sancho_total_cost <= 0 and sancho_total_cost_usd > 0:
        sancho_total_cost = eur_from_usd(sancho_total_cost_usd, rate)
    local_non_fireworks_cost = eur_from_usd(max(reported_cost - local_fireworks_cost, 0), rate)
    if not sancho_cost_complete and provider_metered_cost > fireworks_actual_cost:
        sancho_total_cost = local_non_fireworks_cost + provider_metered_cost
    total_label = "Total" if sancho_cost_complete else "Total estimado"
    top_models = day.get("by_model") or []
    models_text = concise_model_summary(top_models, rate)
    single_summary = source_day_summary({"label": local_report_label(), "status": "ok", "data": data}, report_date)
    providers_text = combined_provider_summary([single_summary])
    top_agent_text = top_agent_summary([single_summary])
    external_projects = external_account_projects([single_summary])
    account_total = fireworks_account_total([single_summary])

    title = f"Sancho coste LLM · {report_date}"
    fallback_lines = [title, f"{total_label} Sancho: {fmt_eur(sancho_total_cost)}"]
    fallback_lines.extend(f"{item['name']}: {fmt_eur(item['cost_eur'])}" for item in external_projects)
    if account_total > 0:
        fallback_lines.append(f"Total cuenta Fireworks: {fmt_eur(account_total)}")
    fallback_lines.extend(
        [
            f"Proveedores Sancho: {providers_text}",
            f"Agente Sancho que mas consumio: {top_agent_text}",
            f"{fmt_int(model_calls)} model calls · {fmt_int(tool_calls)} tool calls · {fmt_int(fireworks_calls)} provider-metered calls",
            models_text,
        ]
    )
    fallback = "\n".join(fallback_lines)

    summary_lines = [f"*{total_label} Sancho:* {fmt_eur(sancho_total_cost)}"]
    summary_lines.extend(f"*{item['name']}:* {fmt_eur(item['cost_eur'])}" for item in external_projects)
    if account_total > 0:
        summary_lines.append(f"*Total cuenta Fireworks:* {fmt_eur(account_total)}")
    summary_lines.extend(
        [
            f"*Proveedores Sancho:* {providers_text}",
            f"*Agente Sancho que mas consumio:* {top_agent_text}",
            f"*Uso Sancho:* {fmt_int(model_calls)} model calls · {fmt_int(tool_calls)} tool calls",
            f"*Top modelos Sancho:* {models_text}",
        ]
    )
    summary = "\n".join(summary_lines)
    if billing_status != "ok" and fireworks_calls > 0:
        summary += f"\n*Atencion:* billing del proveedor medido `{billing_status}`; esa parte del coste puede estar incompleta."
    elif fireworks_cost_status != "actual" and fireworks_calls > 0:
        summary += "\n*Atencion:* coste del proveedor medido sin confirmacion real."
    if not sancho_cost_complete and fireworks_calls > 0:
        summary += "\n*Nota:* se envia el reporte con coste estimado de proveedor para no perder el cierre diario."
    if day.get("unmetered_providers"):
        summary += "\n*Atencion:* sin medicion de coste para " + ", ".join(day.get("unmetered_providers")) + "."

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title[:150]}},
        {"type": "section", "text": {"type": "mrkdwn", "text": summary}},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Dia cerrado: `{report_date}` · Sesiones: `{fmt_int(sessions)}` · EUR.",
                }
            ],
        },
    ]

    return fallback, blocks


def post_to_slack(token, channel, text, blocks):
    body = {
        "channel": channel,
        "text": text,
        "blocks": blocks,
        "unfurl_links": False,
        "unfurl_media": False,
    }
    req = urllib.request.Request(
        SLACK_API,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            payload = {"ok": False, "error": f"http_{exc.code}"}
        return payload


def slack_auth_test(token):
    req = urllib.request.Request(
        SLACK_AUTH_TEST_API,
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": f"http_{exc.code}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def bot_matches_expected(auth_payload):
    expected_raw = os.environ.get("LLM_USAGE_SLACK_EXPECTED_BOT") or "SanchoCMO"
    expected = {x.strip().lower() for x in expected_raw.split(",") if x.strip()}
    if not expected:
        return True
    actual_values = [
        str(auth_payload.get("user") or ""),
        str(auth_payload.get("bot_id") or ""),
        str(auth_payload.get("user_id") or ""),
    ]
    actual = {x.strip().lower() for x in actual_values if x.strip()}
    return bool(actual & expected)


def main():
    parser = argparse.ArgumentParser(description="Send daily Sancho LLM usage report to Slack.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--date", default=None, help="YYYY-MM-DD. Default: yesterday in report timezone.")
    parser.add_argument("--force", action="store_true", help="Ignore schedule and sent-state checks.")
    parser.add_argument("--dry-run", action="store_true", help="Print report payload instead of posting.")
    parser.add_argument("--timezone", default=None)
    args = parser.parse_args()

    if not env_bool("LLM_USAGE_SLACK_REPORT_ENABLED", True):
        print("llm-usage-slack-report: disabled by LLM_USAGE_SLACK_REPORT_ENABLED")
        return 0

    tz_name, tz = local_timezone(args)
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(tz)
    if not schedule_due(now_local, args):
        print(f"llm-usage-slack-report: not due yet ({now_local.strftime('%H:%M')} {tz_name})")
        return 0

    data = load_json(args.input, {})
    report_date = pick_report_date(data, now_local, args.date)
    sources = [{"label": local_report_label(), "status": "ok", "data": data, "local": True}]
    for peer in configured_peers():
        sources.append(fetch_remote_usage(peer))

    day_exists = any(
        source.get("status") == "ok" and report_date in ((source.get("data") or {}).get("days") or {})
        for source in sources
    )
    if not day_exists:
        print(f"llm-usage-slack-report: no usage data for {report_date}")
        return 0

    if env_bool("LLM_USAGE_SLACK_REQUIRE_BILLING", False):
        not_ready = []
        for source in sources:
            if source.get("status") != "ok":
                not_ready.append(f"{source.get('label')}: {source.get('error')}")
                continue
            source_data = source.get("data") if isinstance(source.get("data"), dict) else {}
            billing_source = ((source_data.get("sources") or {}).get("fireworks_billing_usage") or {})
            billing_day = ((billing_source.get("days") or {}).get(report_date) or {})
            day = ((source_data.get("days") or {}).get(report_date) or {})
            fireworks_calls = to_int(day.get("fireworks_calls"))
            if fireworks_calls > 0 and (billing_source.get("status") != "ok" or not billing_day):
                not_ready.append(f"{source.get('label')}: {billing_source.get('status') or 'missing'}")
        if not_ready:
            print(
                "llm-usage-slack-report: skipped "
                f"(provider billing not ready for {report_date}; {', '.join(not_ready)})"
            )
            return 0

    state = load_json(STATE_FILE, {"sent": {}})
    sent = state.setdefault("sent", {})
    if report_date in sent and not args.force:
        print(f"llm-usage-slack-report: already sent for {report_date}")
        return 0

    if len(sources) > 1:
        text, blocks = format_unified_report(sources, report_date)
    else:
        text, blocks = format_report(data, report_date)
    token, token_source = resolve_slack_token()
    channel = (
        os.environ.get("LLM_USAGE_SLACK_CHANNEL")
        or os.environ.get("COST_TRACKER_SLACK_CHANNEL")
        or os.environ.get("SLACK_COST_REPORT_CHANNEL")
        or DEFAULT_SLACK_CHANNEL
    )

    if args.dry_run:
        print(
            json.dumps(
                {
                    "date": report_date,
                    "channel": channel,
                    "sources": [
                        {"label": source.get("label"), "status": source.get("status"), "error": source.get("error")}
                        for source in sources
                    ],
                    "text": text,
                    "blocks": blocks,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    if not token:
        if os.environ.get("SLACK_BOT_TOKEN") and not env_bool("LLM_USAGE_SLACK_ALLOW_DEFAULT_TOKEN", True):
            print("llm-usage-slack-report: skipped (missing LLM_USAGE_SLACK_BOT_TOKEN; SLACK_BOT_TOKEN fallback disabled)")
        else:
            print("llm-usage-slack-report: skipped (missing LLM_USAGE_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN)")
        return 0
    if not channel:
        print("llm-usage-slack-report: skipped (missing LLM_USAGE_SLACK_CHANNEL)")
        return 0

    auth = slack_auth_test(token)
    if not auth.get("ok"):
        print(f"llm-usage-slack-report: skipped (Slack auth.test failed: {auth.get('error') or auth})")
        return 0
    if not bot_matches_expected(auth):
        print(
            "llm-usage-slack-report: skipped "
            f"(token belongs to Slack user {auth.get('user') or auth.get('user_id') or 'unknown'}, expected {os.environ.get('LLM_USAGE_SLACK_EXPECTED_BOT') or 'SanchoCMO'})"
        )
        return 0

    result = post_to_slack(token, channel, text, blocks)
    if not result.get("ok"):
        print(f"llm-usage-slack-report: Slack error: {result.get('error') or result}", file=sys.stderr)
        return 1

    sent[report_date] = {
        "sent_at": now_utc.isoformat().replace("+00:00", "Z"),
        "channel": channel,
        "ts": result.get("ts"),
    }
    save_state(state)
    print(f"llm-usage-slack-report: sent {report_date} to {channel} using {token_source} ts={result.get('ts')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
