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
    """Check brand/ directory for foundation pillar completion."""
    brand_dir = WORKSPACE / "brand"
    pillars = {
        "company-context": {"layer": 0, "file": "company-context.md", "done": False, "date": None},
        "budget-constraints": {"layer": 0, "file": "budget-constraints.md", "done": False, "date": None},
        "business-model-audit": {"layer": 1, "file": "business-model.md", "done": False, "date": None},
        "self-intelligence": {"layer": 1, "file": "self-intelligence.md", "done": False, "date": None},
        "existing-customer-data": {"layer": 1, "file": "customer-data.md", "done": False, "date": None, "optional": True},
        "competitor-intelligence": {"layer": 2, "file": "competitors.md", "done": False, "date": None},
        "market-intelligence": {"layer": 2, "file": "market.md", "done": False, "date": None},
        "swot-analysis": {"layer": 2, "file": "swot.md", "done": False, "date": None},
        "niche-discovery-100x": {"layer": 3, "file": "ecps.md", "done": False, "date": None},
        "ecp-validation": {"layer": 4, "file": "ecp-validation-results.md", "done": False, "date": None, "optional": True},
        "positioning-messaging": {"layer": 4, "file": "positioning.md", "done": False, "date": None},
        "pricing-hooks": {"layer": 4, "file": "pricing.md", "done": False, "date": None},
        "brand-voice": {"layer": 5, "file": "voice-profile.md", "done": False, "date": None},
        "visual-identity": {"layer": 5, "file": "visual-identity.md", "done": False, "date": None},
    }

    if brand_dir.exists():
        for name, info in pillars.items():
            filepath = brand_dir / info["file"]
            # Also check alternative names
            alt_names = [info["file"], name + ".md", name + ".json"]
            for alt in alt_names:
                fp = brand_dir / alt
                if fp.exists() and fp.stat().st_size > 50:  # Not empty placeholder
                    info["done"] = True
                    info["date"] = datetime.fromtimestamp(fp.stat().st_mtime).strftime("%Y-%m-%d")
                    break

    done_count = sum(1 for p in pillars.values() if p["done"])
    total = len(pillars)

    return {"pillars": pillars, "done": done_count, "total": total}


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
        "global_costs": parse_global_costs(),
        "client_tasks": parse_client_tasks(),
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
    print(f"   Foundation: {data['foundation']['done']}/{data['foundation']['total']} pillars")
    print(f"   Campaigns: {len(data['campaigns'])}")
    print(f"   System: gateway={data['system']['gateway']}")


if __name__ == "__main__":
    main()
