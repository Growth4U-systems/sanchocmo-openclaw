#!/usr/bin/env python3
"""
Cost Tracker v2 — T-022 complete implementation.
- Classifies sessions → clients via guild mapping (Discord channels)
- Daily breakdown for trend charts
- Per-agent breakdown (sancho/escudero/rocinante/cervantes)
- Alerts when daily spend > threshold
- Month-end projection
- Outputs: costs-global.json, costs-daily.json, brand/{slug}/costs.json

Run: python3 scripts/cost-tracker.py [--alert-threshold 50] [--period 2026-03]
"""

import json, os, re, subprocess, sys, argparse, calendar
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw")))
WORKSPACE = OPENCLAW_HOME / "workspace-sancho"

USD_TO_EUR = 0.92
CHANNEL_CACHE = WORKSPACE / "scripts" / ".channel-guild-cache.json"


def get_agent_sessions_dirs():
    """Map agent_id -> sessions dir. Authoritative source.

    OpenClaw exposes the canonical session store path per agent via
    `openclaw sessions --all-agents --json` (each entry of `stores[]` carries
    `agentId` and `path`, where `path` is the per-agent sessions.json).
    The `.jsonl` transcript files live in the same directory.

    Querying OpenClaw avoids hardcoding layout assumptions — historically the
    flat `~/.openclaw/agents/` moved to the nested `~/.openclaw/.openclaw/agents/`
    on newer deployments, and this script silently reported "0 sessions"
    for months because its hardcoded path stopped resolving.

    Fallback: probe nested then flat on the filesystem if the CLI fails (so
    the script still works in environments without `openclaw` on PATH).
    """
    try:
        result = subprocess.run(
            ["openclaw", "sessions", "--all-agents", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            dirs = {}
            for store in data.get("stores", []):
                agent_id = store.get("agentId")
                store_path = store.get("path")
                if agent_id and store_path:
                    dirs[agent_id] = Path(store_path).parent
            if dirs:
                return dirs
    except Exception:
        pass

    for candidate in (OPENCLAW_HOME / ".openclaw" / "agents", OPENCLAW_HOME / "agents"):
        if candidate.exists():
            return {
                p.name: p / "sessions"
                for p in candidate.iterdir()
                if p.is_dir() and (p / "sessions").exists()
            }
    return {}


_AGENT_DIRS_CACHE = None


def agent_sessions_dirs():
    """Cached accessor — calls get_agent_sessions_dirs() once per run."""
    global _AGENT_DIRS_CACHE
    if _AGENT_DIRS_CACHE is None:
        _AGENT_DIRS_CACHE = get_agent_sessions_dirs()
    return _AGENT_DIRS_CACHE

# ──────────────────── Channel → Guild → Client mapping ────────────────────

def load_guild_to_client():
    """Build guild_id → client_slug map from clients.json."""
    clients_file = WORKSPACE / "clients.json"
    if not clients_file.exists():
        return {}
    data = json.loads(clients_file.read_text())
    mapping = {}
    for c in data.get("clients", []):
        guild = c.get("guild") or c.get("discord_guild_id")
        if guild:
            mapping[str(guild)] = c["slug"]
    return mapping

def load_channel_cache():
    """Load cached channel_id → guild_id mapping."""
    if CHANNEL_CACHE.exists():
        try:
            return json.loads(CHANNEL_CACHE.read_text())
        except:
            pass
    return {}

def save_channel_cache(cache):
    """Persist channel → guild cache."""
    CHANNEL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    CHANNEL_CACHE.write_text(json.dumps(cache, indent=2))

def build_channel_guild_map(session_map):
    """Build channel_id → guild_id from known guilds + transcript scanning."""
    guild_to_client = load_guild_to_client()
    cache = load_channel_cache()
    
    # Build channel → guild map dynamically from sources.json files
    brand_dir = WORKSPACE / "brand"
    if brand_dir.exists():
        for sources_file in brand_dir.glob("*/sources.json"):
            try:
                src = json.loads(sources_file.read_text())
                guild_id = str(src.get("guild_id", ""))
                if guild_id:
                    for ch_name, ch_id in src.get("channels", {}).items():
                        if isinstance(ch_id, str):
                            cache[ch_id] = guild_id
            except:
                pass

    # Also map channels from dispatch-map.json (legacy, uses guild from clients.json)
    dispatch_file = WORKSPACE / "dispatch-map.json"
    if dispatch_file.exists():
        try:
            dispatch = json.loads(dispatch_file.read_text())
            for name, ch_id in dispatch.get("discord_channels", {}).items():
                if isinstance(ch_id, str) and ch_id not in cache:
                    # Try to find guild from clients.json by matching first client
                    for gid in guild_to_client:
                        cache[ch_id] = gid
                        break
        except:
            pass
    
    # Collect unresolved discord channels
    unresolved = set()
    id_to_key = {sid: info.get("key", "") for sid, info in session_map.items()}
    for sid, info in session_map.items():
        key = info.get("key", "")
        if ":discord:channel:" in key:
            ch = key.split(":discord:channel:")[-1]
            if ch not in cache and ch != "heartbeat" and len(ch) > 10:
                unresolved.add(ch)
    
    if unresolved:
        # Pass 1: Scan transcripts for group_space
        for agent_id, sessions_dir in agent_sessions_dirs().items():
            if not sessions_dir.exists():
                continue
            for jsonl_file in sessions_dir.glob("*.jsonl"):
                fname = jsonl_file.stem
                if "_" in fname:
                    sid = fname.split("_", 1)[1]
                elif "-topic-" in fname:
                    sid = fname.split("-topic-")[0]
                else:
                    sid = fname
                
                key = id_to_key.get(sid, "")
                if ":discord:channel:" not in key:
                    continue
                ch = key.split(":discord:channel:")[-1]
                if ch not in unresolved or ch in cache:
                    continue
                
                try:
                    with open(jsonl_file) as f:
                        for line in f:
                            m = re.search(r'"group_space"\s*:\s*"(\d+)"', line)
                            if m:
                                cache[ch] = m.group(1)
                                unresolved.discard(ch)
                                break
                except:
                    pass
        
        # Pass 2: Discord API for remaining unresolved (threads)
        still_unresolved = {ch for ch in unresolved if ch not in cache}
        if still_unresolved:
            _resolve_via_discord_api(still_unresolved, cache)
    
    save_channel_cache(cache)
    return cache, guild_to_client


def _resolve_via_discord_api(channels, cache):
    """Resolve channel IDs to guild IDs via Discord REST API."""
    import urllib.request
    
    # Read bot token from openclaw config
    config_path = Path.home() / ".openclaw" / ".openclaw" / "openclaw.json"
    if not config_path.exists():
        return
    
    try:
        # Parse JSON5-ish config - just grep for the token
        content = config_path.read_text()
        # Find discord token
        m = re.search(r"token:\s*'([^']+)'", content)
        if not m:
            m = re.search(r'"token"\s*:\s*"([^"]+)"', content)
        if not m:
            return
        token = m.group(1)
        if token.startswith("__"):  # Redacted
            return
    except:
        return
    
    import time
    resolved = 0
    for ch_id in sorted(channels):
        try:
            req = urllib.request.Request(
                f"https://discord.com/api/v10/channels/{ch_id}",
                headers={"Authorization": f"Bot {token}"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                guild_id = data.get("guild_id")
                if guild_id:
                    cache[ch_id] = guild_id
                    resolved += 1
            time.sleep(0.1)  # Rate limit
        except Exception:
            pass
    
    if resolved:
        print(f"  🔗 Discord API: resolved {resolved}/{len(channels)} thread channels")

def resolve_unknown_channels(unknown_channels, cache, session_map):
    """Scan transcripts to resolve channel → guild for unknown channels.
    Uses session_id → session_key mapping to connect transcripts to channels,
    then finds group_space in transcript content for guild ID."""
    # Build session_id → channel_id for unresolved channels
    sid_to_channel = {}
    for sid, info in session_map.items():
        key = info.get("key", "")
        if ":discord:channel:" in key:
            ch = key.split(":discord:channel:")[-1]
            if ch in unknown_channels:
                sid_to_channel[sid] = ch
    
    if not sid_to_channel:
        return cache
    
    updated = False
    for agent_id, sessions_dir in agent_sessions_dirs().items():
        if not sessions_dir.exists():
            continue
        for jsonl_file in sessions_dir.iterdir():
            if not jsonl_file.name.endswith(".jsonl"):
                continue
            # Extract session ID from filename
            fname = jsonl_file.stem
            if "_" in fname:
                sid = fname.split("_", 1)[1]
            elif "-topic-" in fname:
                sid = fname.split("-topic-")[0]
            else:
                sid = fname
            
            if sid not in sid_to_channel:
                continue
            
            ch_id = sid_to_channel[sid]
            try:
                with open(jsonl_file) as f:
                    for line in f:
                        m = re.search(r'"group_space"\s*:\s*"(\d+)"', line)
                        if m:
                            guild_id = m.group(1)
                            cache[ch_id] = guild_id
                            unknown_channels.discard(ch_id)
                            del sid_to_channel[sid]
                            updated = True
                            break
            except:
                continue
            if not sid_to_channel:
                break
        if not sid_to_channel:
            break
    
    if updated:
        save_channel_cache(cache)
    return cache

# ──────────────────── Usage extraction ────────────────────

def _extract_usage_blocks(text):
    """Extract usage JSON objects using brace-counting to handle nested cost object."""
    results = []
    search = '"usage":{'
    idx = 0
    while True:
        pos = text.find(search, idx)
        if pos == -1:
            break
        brace_start = pos + len('"usage":')
        depth = 0
        end = brace_start
        for i in range(brace_start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        try:
            usage = json.loads(text[brace_start:end + 1])
            results.append(usage)
        except:
            pass
        idx = end + 1
    return results

# ──────────────────── Session data extraction ────────────────────

def get_active_sessions():
    """Get session key → info mapping from OpenClaw."""
    try:
        result = subprocess.run(
            ["openclaw", "sessions", "--all-agents", "--json"],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(result.stdout)
        sessions = data if isinstance(data, list) else data.get("sessions", [])
        return {s.get("sessionId", ""): s for s in sessions}
    except:
        return {}

def classify_session(key, agent_id, channel_cache, guild_to_client):
    """Classify a session key → client slug."""
    # System patterns
    if ":heartbeat" in key:
        return "_system"
    if ":cron:" in key:
        return "_system"
    if key.endswith(":main"):
        return "_system"
    if ":subagent:" in key:
        return "_system"
    
    # Discord channel sessions
    if ":discord:channel:" in key:
        channel_id = key.split(":discord:channel:")[-1]
        guild_id = channel_cache.get(channel_id)
        if guild_id:
            client = guild_to_client.get(guild_id)
            if client:
                return client
            # Internal guilds
            if guild_id in ("1478770422093709502", "1477997446885019670"):
                return "_system"
        return "_unclassified"
    
    # Cervantes is system by default
    if agent_id == "cervantes":
        return "_system"
    
    return "_unclassified"

def scan_transcript(jsonl_file, agent_id, period_filter=None):
    """
    Scan a single JSONL transcript. Returns per-day usage data.
    
    Returns: {
        "session_id": str,
        "agent_id": str,
        "days": { "2026-03-01": { tokens, cost, turns, models: {...} }, ... },
        "guild_hint": str|None  (from group_space in transcript)
    }
    """
    session_id = None
    session_model = "unknown"
    guild_hint = None
    days = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
        "cost_usd": 0, "turns": 0,
        "models": defaultdict(lambda: {
            "input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
            "cost_usd": 0, "turns": 0
        })
    })
    
    current_date = None
    
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
                
                # Extract session ID
                if entry.get("type") == "session":
                    session_id = entry.get("id")
                
                # Track model changes
                if entry.get("type") == "model_change":
                    session_model = entry.get("modelId", "unknown")
                
                # Extract timestamp for date bucketing
                ts = entry.get("timestamp")
                if ts:
                    try:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        current_date = dt.strftime("%Y-%m-%d")
                    except:
                        pass
                
                # Extract guild hint
                if not guild_hint and "group_space" in line:
                    m = re.search(r'"group_space"\s*:\s*"(\d+)"', line)
                    if m:
                        guild_hint = m.group(1)
                
                # Extract usage data using brace-counting (handles nested cost object)
                for usage in _extract_usage_blocks(line):
                    inp = usage.get("input", 0) or 0
                    out = usage.get("output", 0) or 0
                    cr = usage.get("cacheRead", 0) or 0
                    cw = usage.get("cacheWrite", 0) or 0
                    cost = usage.get("cost", {})
                    turn_cost = cost.get("total", 0) or 0
                    
                    date_key = current_date or "unknown"
                    
                    # Period filter
                    if period_filter and date_key != "unknown" and not date_key.startswith(period_filter):
                        continue
                    
                    d = days[date_key]
                    d["input"] += inp
                    d["output"] += out
                    d["cache_read"] += cr
                    d["cache_write"] += cw
                    d["cost_usd"] += turn_cost
                    d["turns"] += 1
                    
                    model = session_model
                    m = d["models"][model]
                    m["input"] += inp
                    m["output"] += out
                    m["cache_read"] += cr
                    m["cache_write"] += cw
                    m["cost_usd"] += turn_cost
                    m["turns"] += 1
    except:
        pass
    
    if not days:
        return None
    
    # Extract session ID from filename if not found in content
    if not session_id:
        fname = jsonl_file.stem
        if "_" in fname:
            session_id = fname.split("_", 1)[1]
        elif "-topic-" in fname:
            session_id = fname.split("-topic-")[0]
        else:
            session_id = fname
    
    return {
        "session_id": session_id,
        "agent_id": agent_id,
        "file": jsonl_file.name,
        "days": dict(days),
        "guild_hint": guild_hint
    }

# ──────────────────── Aggregation ────────────────────

def aggregate(all_results, channel_cache, guild_to_client, session_map):
    """
    Aggregate results into:
    - per_client: { slug: { total, per_day, per_agent, per_model } }
    - global_daily: { date: { total, per_client } }
    """
    # Build session_id → session_key
    id_to_info = {}
    for sid, info in session_map.items():
        id_to_info[sid] = info
    
    per_client = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
        "cost_usd": 0, "turns": 0, "sessions": 0,
        "days": defaultdict(lambda: {"cost_usd": 0, "turns": 0}),
        "agents": defaultdict(lambda: {"cost_usd": 0, "turns": 0, "sessions": 0}),
        "models": defaultdict(lambda: {
            "input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
            "cost_usd": 0, "turns": 0
        })
    })
    
    unresolved_channels = set()
    
    for result in all_results:
        sid = result["session_id"]
        agent_id = result["agent_id"]
        
        # Classify
        info = id_to_info.get(sid, {})
        key = info.get("key", "")
        slug = classify_session(key, agent_id, channel_cache, guild_to_client)
        
        # If unclassified, try guild hint from transcript
        if slug == "_unclassified" and result.get("guild_hint"):
            gh = result["guild_hint"]
            client = guild_to_client.get(gh)
            if client:
                slug = client
                # Also cache this channel if it's a discord session
                if ":discord:channel:" in key:
                    ch_id = key.split(":discord:channel:")[-1]
                    channel_cache[ch_id] = gh
            elif gh in ("1478770422093709502", "1477997446885019670"):
                slug = "_system"
        
        # Still unclassified? Try matching channel via guild hint scan
        if slug == "_unclassified" and ":discord:channel:" in key:
            ch_id = key.split(":discord:channel:")[-1]
            unresolved_channels.add(ch_id)
        
        c = per_client[slug]
        c["sessions"] += 1
        c["agents"][agent_id]["sessions"] += 1
        
        for date_key, day_data in result["days"].items():
            c["input"] += day_data["input"]
            c["output"] += day_data["output"]
            c["cache_read"] += day_data["cache_read"]
            c["cache_write"] += day_data["cache_write"]
            c["cost_usd"] += day_data["cost_usd"]
            c["turns"] += day_data["turns"]
            
            c["days"][date_key]["cost_usd"] += day_data["cost_usd"]
            c["days"][date_key]["turns"] += day_data["turns"]
            
            c["agents"][agent_id]["cost_usd"] += day_data["cost_usd"]
            c["agents"][agent_id]["turns"] += day_data["turns"]
            
            for model, mdata in day_data["models"].items():
                m = c["models"][model]
                m["input"] += mdata["input"]
                m["output"] += mdata["output"]
                m["cache_read"] += mdata["cache_read"]
                m["cache_write"] += mdata["cache_write"]
                m["cost_usd"] += mdata["cost_usd"]
                m["turns"] += mdata["turns"]
    
    # Try resolving remaining unknown channels via transcript scan
    if unresolved_channels:
        old_cache_len = len(channel_cache)
        channel_cache = resolve_unknown_channels(unresolved_channels, channel_cache, session_map)
        
        # If we resolved new channels, re-aggregate the unclassified sessions
        if len(channel_cache) > old_cache_len:
            # Re-run full aggregation with updated cache
            return aggregate(all_results, channel_cache, guild_to_client, session_map)
    
    return per_client

# ──────────────────── Output generation ────────────────────

def generate_outputs(per_client, period, alert_threshold):
    """Generate all output files."""
    now = datetime.now().isoformat()
    
    # Separate system/internal from real clients
    real_clients = {k: v for k, v in per_client.items() if not k.startswith("_")}
    system = per_client.get("_system", {})
    unclassified = per_client.get("_unclassified", {})
    
    total_usd = sum(v.get("cost_usd", 0) for v in per_client.values())
    total_turns = sum(v.get("turns", 0) for v in per_client.values())
    total_sessions = sum(v.get("sessions", 0) for v in per_client.values())
    
    # ── costs-global.json ──
    global_data = {
        "period": period,
        "updatedAt": now,
        "total_cost_usd": round(total_usd, 4),
        "total_cost_eur": round(total_usd * USD_TO_EUR, 4),
        "total_turns": total_turns,
        "total_sessions": total_sessions,
        "system": _format_section(system),
        "unclassified": _format_section(unclassified),
        "clients": {
            slug: _format_section(data)
            for slug, data in real_clients.items()
        }
    }
    
    (WORKSPACE / "memory" / "costs" / "global.json").parent.mkdir(parents=True, exist_ok=True)
    (WORKSPACE / "memory" / "costs" / "global.json").write_text(
        json.dumps(global_data, indent=2, ensure_ascii=False, default=str)
    )

    # ── costs-daily.json (for trend charts) ──
    all_dates = set()
    for data in per_client.values():
        if isinstance(data, dict) and "days" in data:
            all_dates.update(data["days"].keys())
    all_dates.discard("unknown")
    
    daily = {}
    for date in sorted(all_dates):
        day_entry = {"total_usd": 0, "total_turns": 0, "clients": {}, "system_usd": 0}
        
        for slug, data in per_client.items():
            if not isinstance(data, dict):
                continue
            day_data = data.get("days", {}).get(date, {})
            cost = day_data.get("cost_usd", 0)
            turns = day_data.get("turns", 0)
            
            day_entry["total_usd"] += cost
            day_entry["total_turns"] += turns
            
            if slug == "_system":
                day_entry["system_usd"] += cost
            elif not slug.startswith("_"):
                day_entry["clients"][slug] = {
                    "cost_usd": round(cost, 4),
                    "turns": turns
                }
        
        day_entry["total_usd"] = round(day_entry["total_usd"], 4)
        day_entry["system_usd"] = round(day_entry["system_usd"], 4)
        daily[date] = day_entry
    
    (WORKSPACE / "memory" / "costs" / "daily.json").write_text(
        json.dumps({"period": period, "updatedAt": now, "days": daily},
                    indent=2, ensure_ascii=False, default=str)
    )
    
    # ── Month-end projection ──
    today = datetime.now()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_elapsed = today.day
    
    if days_elapsed > 0 and total_usd > 0:
        daily_avg = total_usd / days_elapsed
        projected_month = daily_avg * days_in_month
        projection = {
            "days_elapsed": days_elapsed,
            "days_in_month": days_in_month,
            "daily_avg_usd": round(daily_avg, 2),
            "projected_month_usd": round(projected_month, 2),
            "projected_month_eur": round(projected_month * USD_TO_EUR, 2),
        }
    else:
        projection = None
    
    global_data["projection"] = projection
    (WORKSPACE / "memory" / "costs" / "global.json").write_text(
        json.dumps(global_data, indent=2, ensure_ascii=False, default=str)
    )

    # ── Per-client brand/{slug}/costs.json ──
    for slug, data in real_clients.items():
        brand_dir = WORKSPACE / "brand" / slug
        if not brand_dir.exists():
            brand_dir.mkdir(parents=True, exist_ok=True)
        
        client_costs = {
            "client": slug,
            "period": period,
            "updatedAt": now,
            "total_cost_usd": round(data.get("cost_usd", 0), 4),
            "total_cost_eur": round(data.get("cost_usd", 0) * USD_TO_EUR, 4),
            "turns": data.get("turns", 0),
            "sessions": data.get("sessions", 0),
            "agents": {
                agent: {
                    "cost_usd": round(ad.get("cost_usd", 0), 4),
                    "cost_eur": round(ad.get("cost_usd", 0) * USD_TO_EUR, 4),
                    "turns": ad.get("turns", 0),
                    "sessions": ad.get("sessions", 0),
                }
                for agent, ad in data.get("agents", {}).items()
            },
            "models": {
                model: {
                    "input": md.get("input", 0),
                    "output": md.get("output", 0),
                    "cache_read": md.get("cache_read", 0),
                    "cache_write": md.get("cache_write", 0),
                    "cost_usd": round(md.get("cost_usd", 0), 4),
                    "cost_eur": round(md.get("cost_usd", 0) * USD_TO_EUR, 4),
                    "turns": md.get("turns", 0),
                }
                for model, md in data.get("models", {}).items()
            },
            "days": {
                date: {
                    "cost_usd": round(dd.get("cost_usd", 0), 4),
                    "turns": dd.get("turns", 0),
                }
                for date, dd in sorted(data.get("days", {}).items())
                if date != "unknown"
            },
            "clientSpend": {"google-ads": 0, "meta-ads": 0, "total": 0},
        }
        
        (brand_dir / "costs.json").write_text(
            json.dumps(client_costs, indent=2, ensure_ascii=False, default=str)
        )
    
    # ── Alerts ──
    alerts = []
    if daily and alert_threshold > 0:
        # Check today and yesterday
        for date in sorted(daily.keys())[-2:]:
            day_total = daily[date]["total_usd"]
            if day_total > alert_threshold:
                alerts.append({
                    "date": date,
                    "total_usd": round(day_total, 2),
                    "threshold_usd": alert_threshold,
                    "severity": "warning" if day_total < alert_threshold * 2 else "critical",
                    "detail": {slug: round(c["cost_usd"], 2) for slug, c in daily[date]["clients"].items()}
                })
    
    alert_file = WORKSPACE / "memory" / "cost-alert.json"
    alert_file.parent.mkdir(parents=True, exist_ok=True)
    alert_file.write_text(json.dumps({
        "updatedAt": now,
        "threshold_usd": alert_threshold,
        "alerts": alerts,
        "projection": projection
    }, indent=2, ensure_ascii=False, default=str))
    
    return {
        "total_usd": total_usd,
        "total_turns": total_turns,
        "total_sessions": total_sessions,
        "clients": {s: {"cost_usd": d.get("cost_usd", 0), "turns": d.get("turns", 0), "sessions": d.get("sessions", 0)} for s, d in real_clients.items()},
        "system_usd": system.get("cost_usd", 0) if isinstance(system, dict) else 0,
        "unclassified_usd": unclassified.get("cost_usd", 0) if isinstance(unclassified, dict) else 0,
        "projection": projection,
        "alerts": alerts,
    }


def _format_section(data):
    """Format a section for JSON output."""
    if not data or not isinstance(data, dict):
        return {"cost_usd": 0, "cost_eur": 0, "turns": 0, "sessions": 0}
    return {
        "input_tokens": data.get("input", 0),
        "output_tokens": data.get("output", 0),
        "cache_read": data.get("cache_read", 0),
        "cache_write": data.get("cache_write", 0),
        "cost_usd": round(data.get("cost_usd", 0), 4),
        "cost_eur": round(data.get("cost_usd", 0) * USD_TO_EUR, 4),
        "turns": data.get("turns", 0),
        "sessions": data.get("sessions", 0),
        "agents": {
            agent: {
                "cost_usd": round(ad.get("cost_usd", 0), 4),
                "turns": ad.get("turns", 0),
                "sessions": ad.get("sessions", 0),
            }
            for agent, ad in data.get("agents", {}).items()
        } if "agents" in data else {},
        "models": {
            model: {
                "input": md.get("input", 0),
                "output": md.get("output", 0),
                "cache_read": md.get("cache_read", 0),
                "cache_write": md.get("cache_write", 0),
                "cost_usd": round(md.get("cost_usd", 0), 4),
                "cost_eur": round(md.get("cost_usd", 0) * USD_TO_EUR, 4),
                "turns": md.get("turns", 0),
            }
            for model, md in data.get("models", {}).items()
        } if "models" in data else {},
    }

# ──────────────────── Main ────────────────────

def main():
    parser = argparse.ArgumentParser(description="SanchoCMO Cost Tracker v2")
    parser.add_argument("--alert-threshold", type=float, default=50.0,
                        help="Daily spend alert threshold in USD (default: 50)")
    parser.add_argument("--period", type=str, default=None,
                        help="Period filter YYYY-MM (default: current month)")
    parser.add_argument("--json-output", action="store_true",
                        help="Output summary as JSON to stdout")
    args = parser.parse_args()
    
    period = args.period or datetime.now().strftime("%Y-%m")
    
    print(f"💰 Cost Tracker v2 — period {period}")
    
    # Build mappings
    session_map = get_active_sessions()
    channel_cache, guild_to_client = build_channel_guild_map(session_map)
    print(f"  📋 {len(channel_cache)} channels mapped, {len(guild_to_client)} guilds, {len(session_map)} active sessions")
    
    # Scan all transcripts
    all_results = []
    for agent_id, sessions_dir in sorted(agent_sessions_dirs().items()):
        if not sessions_dir.exists():
            continue
        count = 0
        for jsonl_file in sessions_dir.glob("*.jsonl"):
            result = scan_transcript(jsonl_file, agent_id, period)
            if result:
                all_results.append(result)
                count += 1
        print(f"  📂 {agent_id}: {count} sessions with data")
    
    # Aggregate
    per_client = aggregate(all_results, channel_cache, guild_to_client, session_map)
    
    # Generate outputs
    summary = generate_outputs(per_client, period, args.alert_threshold)
    
    # Print summary
    print(f"\n{'─'*50}")
    print(f"  📊 Total: ${summary['total_usd']:.2f} (€{summary['total_usd']*USD_TO_EUR:.2f})")
    print(f"  🔧 Sistema: ${summary['system_usd']:.2f}")
    print(f"  ❓ Sin clasificar: ${summary['unclassified_usd']:.2f}")
    for slug, data in summary["clients"].items():
        print(f"  🏢 {slug}: ${data['cost_usd']:.2f} | {data['turns']} turns | {data['sessions']} sessions")
    
    if summary.get("projection"):
        p = summary["projection"]
        print(f"\n  📈 Proyección: ${p['projected_month_usd']:.2f}/mes (avg ${p['daily_avg_usd']:.2f}/día)")
    
    if summary.get("alerts"):
        for a in summary["alerts"]:
            print(f"  ⚠️  ALERTA [{a['severity']}]: {a['date']} → ${a['total_usd']:.2f} (threshold: ${a['threshold_usd']:.2f})")
    
    print(f"\n✅ Output: memory/costs/global.json, memory/costs/daily.json, brand/*/costs.json, memory/cost-alert.json")
    
    if args.json_output:
        print(json.dumps(summary, indent=2, default=str))

if __name__ == "__main__":
    main()
