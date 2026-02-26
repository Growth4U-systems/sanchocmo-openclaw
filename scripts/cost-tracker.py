#!/usr/bin/env python3
"""
T-022: Cost Tracker — Extrae datos de coste de sesiones OpenClaw.

Lee los JSONL de sesión de cada agente, extrae usage.cost por turno,
agrupa por agente y día, y guarda en memory/cost-data.json.

Precios por MTok (referencia, los JSONL ya traen cost calculado):
  Opus 4.6:   $15 input / $75 output  / cacheRead $5 / cacheWrite $18.75
  Sonnet 4.5: $3 input  / $15 output  / cacheRead $0.30 / cacheWrite $3.75
  Haiku:      $0.80 input / $4 output / cacheRead $0.08 / cacheWrite $1

Run: python3 scripts/cost-tracker.py
"""

import json, glob, os
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

AGENTS_DIR = Path.home() / ".openclaw" / "agents"
WORKSPACE = Path.home() / ".openclaw" / "workspace-sancho"
COST_FILE = WORKSPACE / "memory" / "cost-data.json"

# Model name normalization
MODEL_TIER = {
    "claude-opus-4-6": "opus",
    "claude-sonnet-4-5": "sonnet",
    "claude-haiku-3-5": "haiku",
}

def normalize_model(model_str):
    """Map model string to tier name."""
    if not model_str:
        return "unknown"
    for key, tier in MODEL_TIER.items():
        if key in model_str:
            return tier
    if "opus" in model_str.lower():
        return "opus"
    if "sonnet" in model_str.lower():
        return "sonnet"
    if "haiku" in model_str.lower():
        return "haiku"
    return model_str


def parse_session_jsonl(filepath):
    """Parse a JSONL session file, extract per-turn usage data."""
    turns = []
    try:
        with open(filepath, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Usage may be at entry.usage or entry.message.usage
                msg = entry.get("message", {})
                usage = msg.get("usage") if isinstance(msg, dict) else None
                if not usage:
                    usage = entry.get("usage")
                if not usage or not isinstance(usage, dict):
                    continue

                cost_data = usage.get("cost", {})
                total_cost = cost_data.get("total", 0) if isinstance(cost_data, dict) else 0

                # Skip zero-cost entries
                if not total_cost and not usage.get("input") and not usage.get("output"):
                    continue

                # Timestamp: ISO string or ms epoch
                timestamp = entry.get("timestamp")
                if not timestamp:
                    continue

                # Model may be at entry.model or entry.message.model
                model = (msg.get("model") if isinstance(msg, dict) else None) or entry.get("model", "unknown")

                turns.append({
                    "timestamp": timestamp,
                    "model": model,
                    "input_tokens": usage.get("input", 0) or 0,
                    "output_tokens": usage.get("output", 0) or 0,
                    "cache_read": usage.get("cacheRead", 0) or 0,
                    "cache_write": usage.get("cacheWrite", 0) or 0,
                    "total_tokens": usage.get("totalTokens", 0) or 0,
                    "cost_input": cost_data.get("input", 0) if isinstance(cost_data, dict) else 0,
                    "cost_output": cost_data.get("output", 0) if isinstance(cost_data, dict) else 0,
                    "cost_cache_read": cost_data.get("cacheRead", 0) if isinstance(cost_data, dict) else 0,
                    "cost_cache_write": cost_data.get("cacheWrite", 0) if isinstance(cost_data, dict) else 0,
                    "cost_total": total_cost,
                })
    except Exception as e:
        print(f"  Error parsing {filepath}: {e}")

    return turns


def collect_all_usage():
    """Collect usage data from all agents."""
    # Structure: { "YYYY-MM-DD": { agent: { model_tier: {tokens, cost, ...} } } }
    daily = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {
        "input_tokens": 0, "output_tokens": 0,
        "cache_read": 0, "cache_write": 0,
        "total_tokens": 0, "cost": 0.0, "turns": 0,
    })))

    agent_dirs = glob.glob(str(AGENTS_DIR / "*/sessions"))
    for agent_dir in agent_dirs:
        agent = Path(agent_dir).parent.name
        if agent == "main":  # skip main pseudo-agent
            continue

        jsonl_files = glob.glob(os.path.join(agent_dir, "*.jsonl"))
        print(f"Agent '{agent}': {len(jsonl_files)} session files")

        for jf in jsonl_files:
            turns = parse_session_jsonl(jf)
            for t in turns:
                # Convert timestamp (ISO string or ms epoch) to date
                ts = t["timestamp"]
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                else:
                    dt = datetime.fromtimestamp(ts / 1000)
                day = dt.strftime("%Y-%m-%d")
                tier = normalize_model(t["model"])

                bucket = daily[day][agent][tier]
                bucket["input_tokens"] += t["input_tokens"]
                bucket["output_tokens"] += t["output_tokens"]
                bucket["cache_read"] += t["cache_read"]
                bucket["cache_write"] += t["cache_write"]
                bucket["total_tokens"] += t["total_tokens"]
                bucket["cost"] += t["cost_total"]
                bucket["turns"] += 1

    return daily


def load_existing():
    """Load existing cost-data.json."""
    if COST_FILE.exists():
        try:
            return json.loads(COST_FILE.read_text())
        except:
            pass
    return {"days": {}, "updated": None}


def main():
    print("=== Cost Tracker T-022 ===")
    print(f"Scanning {AGENTS_DIR}")

    daily = collect_all_usage()

    # Merge with existing data
    existing = load_existing()

    for day, agents in daily.items():
        day_data = {}
        for agent, models in agents.items():
            agent_data = {}
            for model, stats in models.items():
                agent_data[model] = {
                    "input_tokens": stats["input_tokens"],
                    "output_tokens": stats["output_tokens"],
                    "cache_read": stats["cache_read"],
                    "cache_write": stats["cache_write"],
                    "total_tokens": stats["total_tokens"],
                    "cost": round(stats["cost"], 6),
                    "turns": stats["turns"],
                }
            day_data[agent] = agent_data
        existing["days"][day] = day_data

    existing["updated"] = datetime.now().isoformat()

    # Summary
    total_cost = 0
    agent_totals = defaultdict(float)
    for day, agents in existing["days"].items():
        for agent, models in agents.items():
            for model, stats in models.items():
                total_cost += stats["cost"]
                agent_totals[agent] += stats["cost"]

    existing["summary"] = {
        "total_cost": round(total_cost, 4),
        "by_agent": {a: round(c, 4) for a, c in sorted(agent_totals.items())},
        "days_tracked": len(existing["days"]),
    }

    # Save
    COST_FILE.parent.mkdir(parents=True, exist_ok=True)
    COST_FILE.write_text(json.dumps(existing, indent=2))
    print(f"\nSaved to {COST_FILE}")
    print(f"Total cost: ${total_cost:.4f}")
    for agent, cost in sorted(agent_totals.items()):
        print(f"  {agent}: ${cost:.4f}")
    print(f"Days tracked: {len(existing['days'])}")

    # --- Alert if today's cost > threshold ---
    DAILY_THRESHOLD = float(os.environ.get("COST_DAILY_THRESHOLD", "5.0"))  # $5/day default
    today = datetime.now().strftime("%Y-%m-%d")
    today_cost = 0.0
    if today in existing["days"]:
        for agent, models in existing["days"][today].items():
            for model, stats in models.items():
                today_cost += stats["cost"]

    if today_cost > DAILY_THRESHOLD:
        alert_file = WORKSPACE / "memory" / "cost-alert.json"
        alert_data = {
            "date": today,
            "daily_cost": round(today_cost, 4),
            "threshold": DAILY_THRESHOLD,
            "alert": True,
            "message": f"⚠️ Coste diario ${today_cost:.2f} supera threshold ${DAILY_THRESHOLD:.2f}",
        }
        alert_file.write_text(json.dumps(alert_data, indent=2))
        print(f"\n⚠️  ALERT: Today's cost ${today_cost:.4f} exceeds threshold ${DAILY_THRESHOLD}")
        print(f"   Alert written to {alert_file} — healthcheck cron will notify #admin")
    else:
        print(f"\n✅ Today's cost: ${today_cost:.4f} (threshold: ${DAILY_THRESHOLD})")


if __name__ == "__main__":
    main()
