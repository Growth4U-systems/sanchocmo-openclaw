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
    """Parse memory/*.md files for recent activity, tagged by client."""
    memory_dir = WORKSPACE / "memory"
    activity = []

    if not memory_dir.exists():
        return activity

    # Load client slugs and names for matching
    clients_file = WORKSPACE / "clients.json"
    client_keywords = {}  # slug -> [keywords to match]
    system_keywords = ["heartbeat", "cron", "skill", "gateway", "config", "backup",
                       "mc-server", "mission control", "tailscale", "token optimization",
                       "soul.md", "tools.md", "agents.md", "dispatch", "regenerate",
                       "system service account", "api catalog", "setup guides",
                       "api-health", "scripts/", "skills/", "_system/", "infra",
                       "changelog", "memory maintenance", "token", "openclaw",
                       "cervantes", "escudero", "rocinante", "sancho",
                       "daily memory", "supabase security"]
    if clients_file.exists():
        try:
            import json
            cdata = json.loads(clients_file.read_text(encoding="utf-8"))
            for c in cdata.get("clients", []):
                slug = c.get("slug", "")
                name = c.get("name", "")
                aliases = c.get("aliases", [])
                keywords = [slug]
                if name:
                    keywords.append(name.lower())
                # Add common variations
                if "-" in slug:
                    keywords.append(slug.replace("-", " "))
                # Add aliases from config
                for a in aliases:
                    keywords.append(a.lower())
                client_keywords[slug] = keywords
        except Exception:
            pass

    # Add well-known aliases that may not be in clients.json
    alias_map = {
        "hospital-capilar": ["hospital capilar", "hc ", "hc)", "hc.", "hc,", "philippe",
                             "capilar", "trasplante", "alopecia", "tricoscopia", "hrt",
                             "crt", "prp", "mesohair", "mesoterapia", "cirugía",
                             "tratamiento", "bono", "consulta diagnóstica", "insparya",
                             "svensson", "capiclinic", "medical hair", "imd"],
        "growth4u": ["growth4u", "growth 4u", "g4u", "alfonso", "kleva", "lenny"],
        "paymatico": ["paymático", "paymatico", "alex g", "alexg", "sepa", "tpv",
                       "gasolineras", "franquicias", "bde", "entidad de pago"],
        "sanchocmo": ["sanchocmo", "sancho cmo", "sancho futurista", "martin",
                       "frontend-slides", "presentation template"],
    }
    # Expand system keywords
    system_keywords.extend(["api connection", "step-by-step guides", "30+ apis",
                            "service account", "sa json", "api catalog", "setup guides",
                            "test-connection", "gate check phase", "onboarding-playbook",
                            "no se crea canal", "se documenta en", "obligatorio como",
                            "shared across all clients", "viewer access",
                            "pending", "await", "confirmation to proceed"])
    for slug, aliases in alias_map.items():
        if slug in client_keywords:
            client_keywords[slug].extend(aliases)
        elif slug:
            client_keywords[slug] = aliases

    def detect_client(text, section_header, parent_section="", fallback="unknown"):
        """Detect which client an activity item belongs to based on text + section + parent context."""
        combined = (text + " " + section_header + " " + parent_section).lower()
        for slug, keywords in client_keywords.items():
            for kw in keywords:
                if kw in combined:
                    return slug
        # Check if it's system/product activity
        for sk in system_keywords:
            if sk in combined:
                return "system"
        # If we can't determine from text, inherit from section context
        return fallback

    # Get files from last 14 days — ONLY daily logs (YYYY-MM-DD.md), not session transcripts
    # Check both memory/daily/ (new structure) and memory/ (legacy fallback)
    daily_dir = memory_dir / "daily"
    daily_source = daily_dir if daily_dir.exists() else memory_dir
    for md_file in sorted(daily_source.glob("*.md"), reverse=True)[:30]:
        # Only parse daily log files (exact format: YYYY-MM-DD.md)
        if not re.match(r'^\d{4}-\d{2}-\d{2}\.md$', md_file.name):
            continue
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', md_file.name)
        if not date_match:
            continue
        date = date_match.group(1)

        content = md_file.read_text(encoding="utf-8")
        parent_section = ""  # ## level
        current_section = ""  # ### level
        section_client = "unknown"  # client detected from section header
        for line in content.split("\n"):
            stripped = line.strip()
            # Track section headers for context (## = parent, ### = child)
            if stripped.startswith("## ") and not stripped.startswith("### "):
                parent_section = stripped
                current_section = ""
                # Detect client from section header to use as fallback
                sc = detect_client("", stripped, "", "unknown")
                if sc != "unknown":
                    section_client = sc
                continue
            if stripped.startswith("### "):
                current_section = stripped
                sc = detect_client("", stripped, parent_section, "unknown")
                if sc != "unknown":
                    section_client = sc
                continue
            if stripped.startswith("- ") or stripped.startswith("* "):
                text = stripped[2:].strip()
                if text and len(text) > 10:
                    # Skip noise: session metadata, UUIDs, source labels, checkboxes
                    if re.match(r'^[0-9a-f-]{20,}', text): continue
                    if re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}', text): continue
                    if text.lower().strip(':').strip() in ('discord', 'telegram', 'signal', 'source'): continue
                    if text.startswith('[x] ') or text.startswith('[ ] '): continue
                    if text.startswith('**Session') or text.startswith('**Source'): continue
                    if len(text) < 20 and '→' not in text: continue
                    # Skip conversation transcript lines (assistant/user prefixes, bare fragments)
                    if text.startswith('assistant:') or text.startswith('user:'): continue
                    if text.startswith('A:') and len(text) < 40: continue
                    # Extract time if present
                    time_match = re.search(r'\*\*(\d{2}:\d{2})\*\*', text)
                    time_str = time_match.group(1) if time_match else ""
                    client = detect_client(text, current_section, parent_section, section_client)
                    activity.append({
                        "date": date,
                        "time": time_str,
                        "text": re.sub(r'\*\*.*?\*\*:?\s*', '', text).strip(),
                        "raw": text,
                        "client": client,
                    })

    return activity[:100]  # Last 100 events


def extract_brand_summary(client_dir):
    """Extract key brand fields from company-brief for dashboard, including Foundation Index links."""
    brief_file = client_dir / "company-brief" / "current.md"
    if not brief_file.exists():
        return None
    try:
        content = brief_file.read_text(encoding="utf-8")
    except Exception:
        return None
    summary = {}
    # Company name from title
    title_match = re.search(r'^#\s+Company Brief\s*[—–-]\s*(.+)', content, re.MULTILINE)
    if title_match:
        summary["company_name"] = title_match.group(1).strip()
    # Section "## 1. La Empresa"
    empresa_match = re.search(r'##\s+1\.\s+La Empresa[^\n]*\n+((?:\*\*[^\n]+\n)*)', content)
    if empresa_match:
        lines_text = empresa_match.group(1).strip().split('\n')
        for line in lines_text:
            kv = re.match(r'\*\*([^*]+)\*\*:?\s*(.*)', line)
            if kv:
                key = kv.group(1).strip().lower()
                val = kv.group(2).strip()
                if 'nombre' in key and "company_name" not in summary:
                    summary["company_name"] = val
                elif 'tipo' in key:
                    summary["sector"] = val
                elif 'modelo' in key and "description" not in summary:
                    summary["description"] = val[:200]
    # Parse Foundation Index table for ICPs, competitors, positioning
    index_match = re.search(r'## Foundation Index.*?\n\n(.*?)(?:\n##\s|\Z)', content, re.DOTALL)
    if index_match:
        table_text = index_match.group(1)
        icps = []
        competitors = []
        for line in table_text.split('\n'):
            if not line.strip().startswith('|'):
                continue
            cells = [c.strip() for c in line.split('|')[1:-1]]
            if len(cells) < 4:
                continue
            layer, pilar, status, archivo = cells[0], cells[1], cells[2], cells[3]
            if 'Layer' in layer or '---' in layer:
                continue
            link_match = re.search(r'\[([^\]]+)\]\(([^)]+)\)', archivo)
            if not link_match:
                continue
            link_text, link_url = link_match.group(1), link_match.group(2)
            # Normalize relative path: ../go-to-market/... → go-to-market/...
            link_url = link_url.replace('../', '')
            # ICPs: Positioning — ECP1/2/3/4/5
            if 'Positioning — ECP' in pilar:
                ecp_name = pilar.split('—')[1].strip() if '—' in pilar else pilar
                icps.append({"name": ecp_name, "link": link_url})
            # Competitors: individual folders
            elif pilar in ['Product Hackers', 'Snowball', 'TheGrowtHacker', 'Glissmarket', 'TEAM LEWIS', 'Innsomnia / FinTK']:
                competitors.append({"name": pilar, "link": link_url})
            # Positioning: Messaging Summary
            elif 'Messaging Summary' in pilar:
                summary["positioning_link"] = link_url
        if icps:
            summary["icps"] = icps
        if competitors:
            summary["competitors"] = competitors
    # Fallback positioning text from "## 3. Cliente Ideal"
    if "positioning_link" not in summary:
        icp_section = re.search(r'##\s+3\.\s+Cliente Ideal[^\n]*\n(.*?)(?:\n##\s+\d+\.|\Z)', content, re.DOTALL)
        if icp_section:
            frase_match = re.search(r'\*\*En una frase:\*\*\s*(.+)', icp_section.group(1))
            if frase_match:
                summary["positioning"] = frase_match.group(1).strip()[:200]
    return summary if summary else None



def parse_foundation():
    """Parse Foundation v2.0 state from all brand/{slug}/foundation-state.json files."""
    brand_dir = WORKSPACE / "brand"

    # v2.0 section/pillar display order
    SECTIONS_ORDER = [
        ("Company Brief", "company-brief", ["company-brief"]),
        ("Market & Us", "market-and-us", ["market-analysis", "competitor-analysis", "self-analysis", "market-synthesis", "foundation-presentation"]),
        ("Go-To-Market", "go-to-market", ["niche-discovery", "existing-customer-data", "positioning", "pricing", "ecp-validation", "gtm-presentation"]),
        ("Brand Book", "brand-book", ["brand-voice", "visual-identity", "brand-report"]),
        ("Métricas", "metrics-setup", ["metrics-setup"]),
        ("Strategic Plan", "strategic-plan", ["strategic-plan", "strategic-presentation"]),
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

            if version.startswith("2") or version.startswith("3"):
                # v2.0 schema: sections → pillars
                for display_name, sec_key, pillar_names in SECTIONS_ORDER:
                    sec = state.get("sections", {}).get(sec_key, {})
                    sec_data = {"display_name": display_name, "status": sec.get("status", "not-started"), "pillars": {}, "syntheses": {}}

                    pillars = sec.get("pillars", sec.get("skills", {}))
                    for pname in pillar_names:
                        if pname in pillars:
                            pdata = pillars[pname]
                            is_optional = pdata.get("optional", False)
                            pentry = {
                                "status": pdata.get("status", "not-started"),
                                "layer": pdata.get("layer"),
                                "requires": pdata.get("requires", []),
                                "optional": is_optional,
                            }
                            if pdata.get("output_file"):
                                pentry["output_file"] = pdata["output_file"]
                            elif pdata.get("output_files"):
                                pentry["output_file"] = pdata["output_files"][0]
                            sec_data["pillars"][pname] = pentry
                            if not is_optional:
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

            # Brand summary
            client_data["brand_summary"] = state.get("brand_summary", {})

            # Presentations: scan presentations/ dir, auto-map to sections
            presentations = state.get("presentations", [])
            if not presentations:
                pres_dir = client_dir / "presentations"
                if pres_dir.exists():
                    for pf in sorted(pres_dir.rglob("*.html")):
                        rel = pf.relative_to(client_dir.parent.parent)
                        name = pf.stem if pf.stem != "index" else pf.parent.name
                        presentations.append({
                            "name": name.replace("-", " ").title(),
                            "file": str(rel),
                            "type": "html"
                        })

            # Auto-assign sections based on filename keywords
            PRES_SECTION_MAP = {
                "market-and-us": ["foundation-report", "foundation-slides", "swot", "ope-canvas", "competitor", "mercado", "competidor", "market", "deep-dive"],
                "go-to-market": ["strategic-plan", "strategic", "gtm", "go-to-market", "channels", "pricing"],
                "brand-identity": ["brand", "voice", "visual", "identity", "logo"],
                "company-brief": ["company", "brief", "business-model", "budget"],
            }
            for p in presentations:
                if "section" not in p:
                    fname = (p.get("file", "") + " " + p.get("name", "")).lower().replace(" ", "-")
                    matched = None
                    for sec_key, keywords in PRES_SECTION_MAP.items():
                        if any(kw in fname for kw in keywords):
                            matched = sec_key
                            break
                    p["section"] = matched  # None = unassigned → "Otras"

            client_data["presentations"] = presentations

            # Strategic Plan: enrich section data with top-level fields if present
            sp = state.get("sections", {}).get("strategic-plan", {})
            if sp and sp.get("status") and "strategic-plan" in client_data["sections"]:
                sec = client_data["sections"]["strategic-plan"]
                sec["output_file"] = sp.get("output_file", "")
                sec["notes"] = sp.get("notes", "")

            # Projects
            projects_dir = client_dir / "projects"
            projects_list = []
            if projects_dir.exists():
                registry_file = projects_dir / "registry.json"
                if registry_file.exists():
                    try:
                        registry = json.loads(registry_file.read_text())
                        for proj in registry.get("projects", []):
                            proj_id = proj.get("id", "")
                            proj_slug = proj.get("slug", "")
                            # Try multiple folder patterns: P01, P01-slug
                            proj_dir = None
                            for fname in [proj_id, f"{proj_id}-{proj_slug}", proj_slug]:
                                candidate = projects_dir / fname
                                if candidate.exists():
                                    proj_dir = candidate
                                    break
                            if not proj_dir:
                                proj_dir = projects_dir / proj_id  # fallback
                            proj_file = proj_dir / "project.json"
                            if proj_file.exists():
                                try:
                                    pdata = json.loads(proj_file.read_text())
                                    # Merge registry info with project.json
                                    proj.update({k: v for k, v in pdata.items() if k not in proj})
                                except:
                                    pass
                            # Load tasks
                            tasks_file = proj_dir / "tasks.json"
                            if tasks_file.exists():
                                try:
                                    tdata = json.loads(tasks_file.read_text())
                                    proj["tasks"] = tdata if isinstance(tdata, list) else tdata.get("tasks", [])
                                except:
                                    proj["tasks"] = []
                            else:
                                proj["tasks"] = []
                            projects_list.append(proj)
                    except:
                        pass
            client_data["projects"] = projects_list

            # Ideas (Idea Bank)
            ideas_file = client_dir / "idea-generation" / "ideas.json"
            if ideas_file.exists():
                try:
                    ideas_data = json.loads(ideas_file.read_text())
                    client_data["ideas"] = ideas_data if isinstance(ideas_data, list) else ideas_data.get("ideas", [])
                except:
                    client_data["ideas"] = []
            else:
                client_data["ideas"] = []

            # Metrics
            metrics_file = client_dir / "metrics" / "metrics-data.json"
            if metrics_file.exists():
                try:
                    metrics_data = json.loads(metrics_file.read_text())
                    client_data["metrics"] = metrics_data
                except:
                    client_data["metrics"] = {}
            else:
                client_data["metrics"] = {}

            # Latest daily metrics
            metrics_dir = client_dir / "metrics"
            if metrics_dir.exists():
                daily_files = sorted([f for f in metrics_dir.iterdir() if f.name.startswith("20") and f.suffix == ".json"], reverse=True)
                if daily_files:
                    try:
                        client_data["metrics_latest"] = json.loads(daily_files[0].read_text())
                        client_data["metrics_latest"]["_date"] = daily_files[0].stem
                    except:
                        client_data["metrics_latest"] = {}

            # Brand Summary — extract key fields from company-brief/current.md
            brand_summary = extract_brand_summary(client_dir)
            if brand_summary:
                client_data["brand_summary"] = brand_summary

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

    # Load client list for frontend
    clients_list = []
    try:
        cfile = WORKSPACE / "clients.json"
        if cfile.exists():
            cdata = json.loads(cfile.read_text(encoding="utf-8"))
            for c in cdata.get("clients", []):
                clients_list.append({"slug": c.get("slug",""), "name": c.get("name",""), "active": c.get("active", True)})
    except Exception:
        pass

    data = {
        "generated": datetime.now().isoformat(),
        "clients": clients_list,
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
