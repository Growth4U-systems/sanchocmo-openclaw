#!/usr/bin/env python3
"""
Cost Tracker — Calculates real usage & costs per client from OpenClaw session transcripts.
Reads usage data from JSONL transcripts (per-turn cost data).
Run: python3 scripts/cost-tracker.py
"""

import json, os, glob, re, subprocess
from datetime import datetime
from pathlib import Path

WORKSPACE = Path.home() / ".openclaw" / "workspace-sancho"
AGENTS_DIR = Path.home() / ".openclaw" / "agents"
USD_TO_EUR = 0.92

def load_channel_to_client():
    """Map discord channel IDs to client slugs."""
    dispatch = WORKSPACE / "dispatch-map.json"
    if dispatch.exists():
        data = json.loads(dispatch.read_text())
        channels = data.get("discord_channels", {})
        return {v: "hospital-capilar" for k, v in channels.items() if isinstance(v, str)}
    return {}

def get_session_mapping():
    """Get session key → session ID mapping from openclaw sessions."""
    result = subprocess.run(
        ["openclaw", "sessions", "--all-agents", "--json"],
        capture_output=True, text=True, timeout=30
    )
    data = json.loads(result.stdout)
    sessions = data if isinstance(data, list) else data.get("sessions", [])
    # key → {sessionId, agentId, model}
    return {s["key"]: s for s in sessions}

def classify_session_key(key, agent_id, channel_map):
    """Classify a session key to a client slug or _system."""
    if ":discord:channel:" in key:
        channel_id = key.split(":discord:channel:")[-1]
        if channel_id == "heartbeat":
            return "_system"
        return channel_map.get(channel_id, "_unclassified")
    if agent_id == "cervantes":
        return "_system"
    if ":cron:" in key:
        return "_system"
    if key.endswith(":main"):
        return "_system"
    return "_unclassified"

def scan_transcripts(agent_id):
    """Scan all JSONL transcripts for an agent, extract per-turn usage."""
    sessions_dir = AGENTS_DIR / agent_id / "sessions"
    if not sessions_dir.exists():
        return []
    
    results = []
    for jsonl_file in sessions_dir.glob("*.jsonl"):
        session_id = None
        session_model = None
        total_cost_usd = 0
        total_input = 0
        total_output = 0
        total_cache_read = 0
        total_cache_write = 0
        turns = 0
        models_used = {}
        
        try:
            with open(jsonl_file) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except:
                        continue
                    
                    if entry.get("type") == "session":
                        session_id = entry.get("id")
                    
                    if entry.get("type") == "model_change":
                        session_model = entry.get("modelId", "unknown")
                    
                    # Extract usage from any entry that has it
                    usage_str = line
                    # Match nested braces: "usage":{...{...}...}
                    usage_matches = re.findall(r'"usage":\{[^}]*\{[^}]*\}[^}]*\}', usage_str)
                    if not usage_matches:
                        usage_matches = re.findall(r'"usage":\{[^}]+\}', usage_str)
                    for um in usage_matches:
                        try:
                            usage = json.loads("{" + um + "}")["usage"]
                            inp = usage.get("input", 0) or 0
                            out = usage.get("output", 0) or 0
                            cr = usage.get("cacheRead", 0) or 0
                            cw = usage.get("cacheWrite", 0) or 0
                            cost = usage.get("cost", {})
                            turn_cost = cost.get("total", 0) or 0
                            
                            total_input += inp
                            total_output += out
                            total_cache_read += cr
                            total_cache_write += cw
                            total_cost_usd += turn_cost
                            turns += 1
                            
                            model = session_model or "unknown"
                            if model not in models_used:
                                models_used[model] = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0, "turns": 0}
                            models_used[model]["input"] += inp
                            models_used[model]["output"] += out
                            models_used[model]["cache_read"] += cr
                            models_used[model]["cache_write"] += cw
                            models_used[model]["cost_usd"] += turn_cost
                            models_used[model]["turns"] += 1
                        except:
                            pass
        except:
            continue
        
        if turns > 0:
            results.append({
                "agent_id": agent_id,
                "session_id": session_id,
                "file": jsonl_file.name,
                "model": session_model,
                "input_tokens": total_input,
                "output_tokens": total_output,
                "cache_read": total_cache_read,
                "cache_write": total_cache_write,
                "cost_usd": total_cost_usd,
                "cost_eur": total_cost_usd * USD_TO_EUR,
                "turns": turns,
                "models": models_used
            })
    
    return results

def main():
    print("💰 Running cost tracker (transcript-based)...")
    
    channel_map = load_channel_to_client()
    session_info = get_session_mapping()
    
    # Scan all agent transcripts
    all_transcripts = []
    for agent_dir in AGENTS_DIR.iterdir():
        if agent_dir.is_dir() and (agent_dir / "sessions").exists():
            agent_id = agent_dir.name
            transcripts = scan_transcripts(agent_id)
            all_transcripts.extend(transcripts)
            print(f"  📂 {agent_id}: {len(transcripts)} sessions scanned")
    
    # Map transcripts to clients via session keys
    # Build session_id → session_key map
    id_to_key = {}
    for key, info in session_info.items():
        sid = info.get("sessionId", "")
        if sid:
            id_to_key[sid] = key
    
    # Aggregate by client
    usage = {}
    for t in all_transcripts:
        sid = t["session_id"]
        key = id_to_key.get(sid, "")
        agent_id = t["agent_id"]
        slug = classify_session_key(key, agent_id, channel_map) if key else "_unclassified"
        
        if slug not in usage:
            usage[slug] = {
                "input_tokens": 0, "output_tokens": 0,
                "cache_read": 0, "cache_write": 0,
                "cost_usd": 0, "cost_eur": 0,
                "turns": 0, "sessions": 0, "models": {}
            }
        
        u = usage[slug]
        u["input_tokens"] += t["input_tokens"]
        u["output_tokens"] += t["output_tokens"]
        u["cache_read"] += t["cache_read"]
        u["cache_write"] += t["cache_write"]
        u["cost_usd"] += t["cost_usd"]
        u["cost_eur"] += t["cost_eur"]
        u["turns"] += t["turns"]
        u["sessions"] += 1
        
        for model, mdata in t["models"].items():
            if model not in u["models"]:
                u["models"][model] = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0, "cost_eur": 0, "turns": 0}
            m = u["models"][model]
            m["input"] += mdata["input"]
            m["output"] += mdata["output"]
            m["cache_read"] += mdata["cache_read"]
            m["cache_write"] += mdata["cache_write"]
            m["cost_usd"] += mdata["cost_usd"]
            m["cost_eur"] += mdata["cost_usd"] * USD_TO_EUR
            m["turns"] += mdata["turns"]
    
    now = datetime.now().isoformat()
    period = datetime.now().strftime("%Y-%m")
    
    # Write per-client costs.json
    for slug, data in usage.items():
        if slug.startswith("_"):
            continue
        cost_file = WORKSPACE / "brand" / slug / "costs.json"
        if cost_file.parent.exists():
            costs = {
                "client": slug,
                "period": period,
                "updatedAt": now,
                "sancho": {
                    "tokens_in": data["input_tokens"],
                    "tokens_out": data["output_tokens"],
                    "cache_read": data["cache_read"],
                    "cache_write": data["cache_write"],
                    "tokens_total": data["input_tokens"] + data["output_tokens"] + data["cache_read"] + data["cache_write"],
                    "turns": data["turns"],
                    "sessions": data["sessions"],
                    "cost_usd": round(data["cost_usd"], 4),
                    "cost_eur": round(data["cost_eur"], 4),
                    "models": {
                        model: {
                            "tokens_in": m["input"],
                            "tokens_out": m["output"],
                            "cache_read": m["cache_read"],
                            "cache_write": m["cache_write"],
                            "turns": m["turns"],
                            "cost_usd": round(m["cost_usd"], 4),
                            "cost_eur": round(m["cost_eur"], 4),
                        }
                        for model, m in data["models"].items()
                    }
                },
                "clientSpend": {"google-ads": 0, "meta-ads": 0, "total": 0}
            }
            cost_file.write_text(json.dumps(costs, indent=2, ensure_ascii=False))
            print(f"  📊 {slug}: ${data['cost_usd']:.2f} (€{data['cost_eur']:.2f}) | {data['turns']} turns | {data['sessions']} sessions")
    
    # Write global
    total_usd = sum(d["cost_usd"] for d in usage.values())
    total_eur = sum(d["cost_eur"] for d in usage.values())
    global_costs = {
        "period": period,
        "updatedAt": now,
        "total_cost_usd": round(total_usd, 4),
        "total_cost_eur": round(total_eur, 4),
        "total_turns": sum(d["turns"] for d in usage.values()),
        "total_sessions": sum(d["sessions"] for d in usage.values()),
        "system": {k: round(v, 4) if isinstance(v, float) else v for k, v in usage.get("_system", {}).items() if k != "models"} | {"models": {m: {k: round(v, 4) if isinstance(v, float) else v for k, v in md.items()} for m, md in usage.get("_system", {}).get("models", {}).items()}},
        "clients": {
            slug: {
                "cost_usd": round(d["cost_usd"], 4),
                "cost_eur": round(d["cost_eur"], 4),
                "turns": d["turns"],
                "sessions": d["sessions"],
                "models": {m: {"turns": md["turns"], "cost_usd": round(md["cost_usd"], 4), "cost_eur": round(md["cost_eur"], 4)} for m, md in d["models"].items()}
            }
            for slug, d in usage.items() if not slug.startswith("_")
        }
    }
    
    global_file = WORKSPACE / "costs-global.json"
    global_file.write_text(json.dumps(global_costs, indent=2, ensure_ascii=False))
    
    sys_data = usage.get("_system", {})
    print(f"\n  🏢 Sistema: ${sys_data.get('cost_usd', 0):.2f} (€{sys_data.get('cost_eur', 0):.2f}) | {sys_data.get('turns', 0)} turns")
    print(f"  📊 Total: ${total_usd:.2f} (€{total_eur:.2f}) | {sum(d['turns'] for d in usage.values())} turns | {sum(d['sessions'] for d in usage.values())} sessions")
    print("✅ Cost tracker complete")

if __name__ == "__main__":
    main()
