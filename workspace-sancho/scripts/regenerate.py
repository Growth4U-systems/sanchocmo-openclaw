#!/usr/bin/env python3
"""
Regenerate Mission Control data files from workspace sources.
Run: python3 scripts/regenerate.py
Called by Sancho on changes or via heartbeat.
"""

import os, json, re, glob, subprocess
from datetime import datetime, timedelta
from pathlib import Path

WORKSPACE = Path.home() / ".openclaw" / "workspace-sancho"
CERVANTES_WORKSPACE = Path.home() / ".openclaw" / "workspace-cervantes"
OUT = WORKSPACE  # output JS files next to mission-control.html

def parse_tasks_from_file(tasks_file, source="sancho"):
    """Parse a TASKS.md file into structured data."""
    if not tasks_file.exists():
        return {"proposals": [], "approved": [], "progress": [], "review": [], "done": [], "frozen": [], "rejected": [], "discarded": []}

    content = tasks_file.read_text(encoding="utf-8")
    tasks = {"proposals": [], "approved": [], "progress": [], "review": [], "done": [], "frozen": [], "rejected": [], "discarded": []}

    # Map section headers to keys
    section_map = {
        "📥 Propuestas": "proposals",
        "✅ Aprobadas": "approved",
        "🔧 En Progreso": "progress",
        "👀 En Review": "review",
        "✔️ Completadas": "done",
        "🧊 Congeladas": "frozen",
        "🗑️ Descartadas": "discarded",
        "❌ Rechazadas": "rejected",
    }

    current_section = None

    for line in content.split("\n"):
        # Detect section
        for header, key in section_map.items():
            if header in line:
                current_section = key
                break

        if not current_section:
            continue

        # Parse table rows (| ID | Task | Cat | ... |)
        if line.startswith("|") and not line.startswith("| ID") and not line.startswith("|---"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) >= 4 and cells[0].startswith("T-"):
                cat_match = re.search(r'\[(\w+)\]', cells[2])
                pri_match = re.search(r'P(\d)', cells[3] if len(cells) > 3 else "")
                notes_text = cells[5] if len(cells) > 5 else ""
                # Extract client slug from tags like [hospital-capilar] in cat or notes
                all_text = " ".join(cells)
                client_tags = re.findall(r'\[([a-z][a-z0-9-]+)\]', all_text)
                # Filter out known category tags
                known_cats = {"infra","skill","agent","flow","brain","tool","docs","cost","client"}
                client_slug = None
                for tag in client_tags:
                    if tag not in known_cats and not tag.startswith("T-"):
                        client_slug = tag
                        break
                task = {
                    "id": cells[0],
                    "title": cells[1],
                    "cat": cat_match.group(1) if cat_match else "docs",
                    "pri": f"p{pri_match.group(1)}" if pri_match else "p2",
                    "proposed": cells[4] if len(cells) > 4 else "",
                    "notes": notes_text,
                    "date": cells[3] if len(cells) > 3 else "",
                    "status": current_section,
                    "source": source,
                    "client": client_slug,
                }
                # Check if PRD exists
                prd_path = WORKSPACE / "_system" / "prds" / f"{task['id']}.md"
                task["has_prd"] = prd_path.exists() and prd_path.stat().st_size > 50
                if task["has_prd"]:
                    task["prd"] = prd_path.read_text(encoding="utf-8")
                tasks[current_section].append(task)

    return tasks


def parse_tasks():
    """Parse tasks from Cervantes TASKS.md (single source of truth)."""
    return parse_tasks_from_file(CERVANTES_WORKSPACE / "TASKS.md", source="cervantes")


def parse_activity():
    """Parse memory/*.md files for recent activity."""
    memory_dir = WORKSPACE / "memory"
    activity = []

    if not memory_dir.exists():
        return activity

    # Get files from last 7 days
    for md_file in sorted(memory_dir.glob("*.md"), reverse=True)[:7]:
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', md_file.name)
        if not date_match:
            continue
        date = date_match.group(1)

        content = md_file.read_text(encoding="utf-8")
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("- ") or line.startswith("* "):
                text = line[2:].strip()
                if text and len(text) > 10:
                    # Extract time if present
                    time_match = re.search(r'\*\*(\d{2}:\d{2})\*\*', text)
                    time_str = time_match.group(1) if time_match else ""
                    activity.append({
                        "date": date,
                        "time": time_str,
                        "text": re.sub(r'\*\*.*?\*\*:?\s*', '', text).strip(),
                        "raw": text,
                    })

    return activity[:50]  # Last 50 events


def parse_foundation():
    """Parse Foundation v2.0 state from all brand/{slug}/foundation-state.json files."""
    brand_dir = WORKSPACE / "brand"

    # v2.0 section/pillar display order
    SECTIONS_ORDER = [
        ("Company Brief", "company-brief", ["company-context", "business-model", "budget"]),
        ("Market & Us", "market-and-us", ["market-analysis", "competitor-analysis", "self-analysis", "swot"]),
        ("Go-To-Market", "go-to-market", ["niche-discovery", "existing-customer-data", "positioning", "pricing", "ecp-validation"]),
        ("Brand Identity", "brand-identity", ["brand-voice", "visual-identity"]),
    ]

    clients = {}
    if brand_dir.exists():
        for client_dir in sorted(brand_dir.iterdir()):
            if not client_dir.is_dir() or client_dir.name.startswith('.'):
                continue
            slug = client_dir.name
            state_file = client_dir / "foundation-state.json"

            if not state_file.exists():
                continue

            try:
                state = json.loads(state_file.read_text(encoding="utf-8"))
            except Exception:
                continue

            version = state.get("version", "1.0")
            client_data = {"slug": slug, "version": version, "sections": {}, "total": 0, "approved": 0, "pending": 0}

            if version.startswith("2"):
                # v2.0 schema: sections → pillars
                for display_name, sec_key, pillar_names in SECTIONS_ORDER:
                    sec = state.get("sections", {}).get(sec_key, {})
                    sec_data = {"display_name": display_name, "status": sec.get("status", "not-started"), "pillars": {}, "syntheses": {}}

                    if sec_key == "company-brief":
                        # Company Brief: skills, not pillars
                        skills = sec.get("skills", {})
                        for pname in pillar_names:
                            skill_state = skills.get(pname, {})
                            sec_data["pillars"][pname] = {"status": skill_state.get("status", "not-started")}
                            client_data["total"] += 1
                            if skill_state.get("status") == "approved" or sec.get("status") == "approved":
                                client_data["approved"] += 1
                            elif skill_state.get("status") in ("pending-review", "in-progress"):
                                client_data["pending"] += 1
                    else:
                        pillars = sec.get("pillars", {})
                        for pname in pillar_names:
                            if pname in pillars:
                                pdata = pillars[pname]
                                pentry = {
                                    "status": pdata.get("status", "not-started"),
                                    "layer": pdata.get("layer"),
                                    "requires": pdata.get("requires", []),
                                    "optional": pdata.get("optional", False),
                                }
                                if pdata.get("output_file"):
                                    pentry["output_file"] = pdata["output_file"]
                                elif pdata.get("output_files"):
                                    pentry["output_file"] = pdata["output_files"][0]
                                sec_data["pillars"][pname] = pentry
                                client_data["total"] += 1
                                st = pdata.get("status", "not-started")
                                if st == "approved":
                                    client_data["approved"] += 1
                                elif st in ("pending-review", "in-progress"):
                                    client_data["pending"] += 1

                    # Syntheses
                    for syn_name, syn_data in sec.get("syntheses", {}).items():
                        sentry = {"status": syn_data.get("status", "not-generated")}
                        if syn_data.get("output_file"):
                            sentry["output_file"] = syn_data["output_file"]
                        sec_data["syntheses"][syn_name] = sentry

                    client_data["sections"][sec_key] = sec_data
            else:
                # v1.x fallback: flat pillars (legacy clients)
                fstate = state.get("pillars", {})
                for display_name, sec_key, pillar_names in SECTIONS_ORDER:
                    sec_data = {"display_name": display_name, "status": "not-started", "pillars": {}, "syntheses": {}}
                    for pname in pillar_names:
                        st = fstate.get(pname, {}).get("status", "not-started")
                        sec_data["pillars"][pname] = {"status": st}
                        client_data["total"] += 1
                        if st == "approved":
                            client_data["approved"] += 1
                        elif st in ("pending-review", "in-progress"):
                            client_data["pending"] += 1
                    client_data["sections"][sec_key] = sec_data

            clients[slug] = client_data

    # Aggregate totals
    total_approved = sum(c["approved"] for c in clients.values())
    total_pillars = sum(c["total"] for c in clients.values())
    total_pending = sum(c["pending"] for c in clients.values())

    return {
        "clients": clients,
        "done": total_approved,
        "pending": total_pending,
        "total": total_pillars,
        "categories": SECTIONS_ORDER,
    }


def parse_campaigns():
    """Check campaigns/ directory."""
    campaigns_dir = WORKSPACE / "campaigns"
    campaigns = []

    if campaigns_dir.exists():
        for d in campaigns_dir.iterdir():
            if d.is_dir() and not d.name.startswith('.'):
                campaigns.append({
                    "name": d.name,
                    "files": len(list(d.glob("*"))),
                    "date": datetime.fromtimestamp(d.stat().st_mtime).strftime("%Y-%m-%d"),
                })

    return campaigns


def get_system_status():
    """Get system status from openclaw."""
    status = {
        "gateway": "unknown",
        "discord": "unknown",
        "tailscale": "unknown",
        "tailscale_url": "",
    }

    try:
        result = subprocess.run(
            ["openclaw", "status"],
            capture_output=True, text=True, timeout=15
        )
        output = result.stdout

        if "running" in output.lower():
            status["gateway"] = "running"
        elif "stopped" in output.lower():
            status["gateway"] = "stopped"

        if "Discord" in output and "OK" in output.split("Discord")[1][:50]:
            status["discord"] = "ok"

        ts_match = re.search(r'(https://[\w.-]+\.ts\.net)', output)
        if ts_match:
            status["tailscale"] = "serve"
            status["tailscale_url"] = ts_match.group(1)

    except Exception:
        pass

    return status


def get_changelog():
    """Parse CHANGELOG.md."""
    cl_file = WORKSPACE / "CHANGELOG.md"
    if not cl_file.exists():
        return []

    content = cl_file.read_text(encoding="utf-8")
    entries = []
    current = None

    for line in content.split("\n"):
        version_match = re.match(r'^## \[(.+?)\] — (\d{4}-\d{2}-\d{2})', line)
        if version_match:
            if current:
                entries.append(current)
            current = {"version": version_match.group(1), "date": version_match.group(2), "sections": []}
            continue

        if current:
            section_match = re.match(r'^### (.+)', line)
            if section_match:
                current["sections"].append({"title": section_match.group(1), "items": []})
            elif line.startswith("- ") and current["sections"]:
                current["sections"][-1]["items"].append(line[2:].strip())

    if current:
        entries.append(current)

    return entries


def parse_costs():
    """Load cost data from cost-data.json (generated by cost-tracker.py)."""
    cost_file = WORKSPACE / "memory" / "cost-data.json"
    if not cost_file.exists():
        return {"days": {}, "summary": {"total_cost": 0, "by_agent": {}, "days_tracked": 0}}
    try:
        return json.loads(cost_file.read_text(encoding="utf-8"))
    except Exception:
        return {"days": {}, "summary": {"total_cost": 0, "by_agent": {}, "days_tracked": 0}}


def parse_healthcheck():
    """Load healthcheck state from healthcheck-state.json."""
    hc_file = WORKSPACE / "memory" / "healthcheck-state.json"
    if not hc_file.exists():
        return {"status": "unknown", "last_run": None, "checks": {}}
    try:
        return json.loads(hc_file.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "unknown", "last_run": None, "checks": {}}


def parse_client_tasks():
    """Parse tasks.md from each client brand directory."""
    brand_dir = WORKSPACE / "brand"
    result = {}
    if brand_dir.exists():
        for client_dir in sorted(brand_dir.iterdir()):
            if not client_dir.is_dir() or client_dir.name.startswith('.'):
                continue
            tasks_file = client_dir / "tasks.md"
            if tasks_file.exists():
                result[client_dir.name] = parse_tasks_from_file(tasks_file, source=client_dir.name)
    return result


def parse_global_costs():
    """Parse costs-global.json for the global dashboard."""
    cost_file = WORKSPACE / "costs-global.json"
    if cost_file.exists():
        try:
            return json.loads(cost_file.read_text(encoding="utf-8"))
        except:
            pass
    return {}


def parse_intelligence_log():
    """Parse _system/intelligence-log.json for MC Intelligence section."""
    log_file = WORKSPACE / "_system" / "intelligence-log.json"
    if not log_file.exists():
        return {"entries": [], "stats": {}}
    try:
        data = json.loads(log_file.read_text(encoding="utf-8"))
        entries = data.get("entries", [])
        # Group by client
        by_client = {}
        for e in entries:
            client = e.get("client", "unknown")
            by_client.setdefault(client, []).append(e)
        # Stats
        types = {}
        for e in entries:
            t = e.get("type", "unknown")
            types[t] = types.get(t, 0) + 1
        return {
            "entries": entries,
            "by_client": by_client,
            "stats": {"total": len(entries), "by_type": types}
        }
    except Exception as ex:
        print(f"⚠️ intelligence-log.json parse error: {ex}")
        return {"entries": [], "stats": {}}


def parse_meetings():
    """Parse meetings.json for all clients in brand/."""
    brand_dir = WORKSPACE / "brand"
    clients = {}
    if brand_dir.exists():
        for client_dir in sorted(brand_dir.iterdir()):
            if not client_dir.is_dir() or client_dir.name.startswith('.'):
                continue
            slug = client_dir.name
            meetings_file = client_dir / "intelligence" / "meetings.json"
            if meetings_file.exists():
                try:
                    clients[slug] = json.loads(meetings_file.read_text(encoding="utf-8"))
                except:
                    clients[slug] = []
            else:
                clients[slug] = []
    return clients


def parse_integrations():
    """Parse integrations.json and costs.json for all clients in brand/."""
    brand_dir = WORKSPACE / "brand"
    clients = {}
    if brand_dir.exists():
        for client_dir in sorted(brand_dir.iterdir()):
            if not client_dir.is_dir() or client_dir.name.startswith('.'):
                continue
            slug = client_dir.name
            client_data = {"slug": slug, "services": [], "costs": None}
            # integrations.json
            int_file = client_dir / "integrations.json"
            if int_file.exists():
                try:
                    client_data["services"] = json.loads(int_file.read_text(encoding="utf-8")).get("services", [])
                except: pass
            # costs.json
            cost_file = client_dir / "costs.json"
            if cost_file.exists():
                try:
                    client_data["costs"] = json.loads(cost_file.read_text(encoding="utf-8"))
                except: pass
            clients[slug] = client_data
    return clients


def parse_api_health():
    """Load API health check data from _system/api-health.json."""
    health_file = WORKSPACE / "_system" / "api-health.json"
    if not health_file.exists():
        return {"lastCheck": None, "services": {}}
    try:
        return json.loads(health_file.read_text(encoding="utf-8"))
    except Exception:
        return {"lastCheck": None, "services": {}}


def main():
    print("🔄 Regenerating Mission Control data...")

    data = {
        "generated": datetime.now().isoformat(),
        "tasks": parse_tasks(),
        "activity": parse_activity(),
        "foundation": parse_foundation(),
        "campaigns": parse_campaigns(),
        "system": get_system_status(),
        "changelog": get_changelog(),
        "costs": parse_costs(),
        "healthcheck": parse_healthcheck(),
        "integrations": parse_integrations(),
        "meetings": parse_meetings(),
        "intelligence_log": parse_intelligence_log(),
        "global_costs": parse_global_costs(),
        "client_tasks": parse_client_tasks(),
        "apiHealth": parse_api_health(),
    }

    # Write as JS file
    out_file = OUT / "mc-data.js"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write("const MC_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"✅ Written to {out_file}")
    print(f"   Tasks: {sum(len(v) for v in data['tasks'].values())} total")
    print(f"   Activity: {len(data['activity'])} events")
    print(f"   Foundation: {data['foundation']['done']}/{data['foundation']['total']} pillars ({data['foundation'].get('pending',0)} pending)")
    print(f"   Campaigns: {len(data['campaigns'])}")
    print(f"   System: gateway={data['system']['gateway']}")


if __name__ == "__main__":
    main()
