#!/usr/bin/env python3
"""Analyze skill execution logs and generate improvement proposals.

Reads: _system/skill-execution-log.jsonl
Outputs: _system/skill-improvement-proposals/weekly-YYYY-MM-DD.md
"""

import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
LOG_FILE = WORKSPACE / "_system" / "skill-execution-log.jsonl"
PROPOSALS_DIR = WORKSPACE / "_system" / "skill-improvement-proposals"
METRICS_FILE = WORKSPACE / "memory" / "state" / "skill-improvement-metrics.json"


def load_log(days: int = 7) -> list[dict]:
    """Load execution log entries from the last N days."""
    if not LOG_FILE.exists():
        return []
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    entries = []
    
    for line in LOG_FILE.read_text().strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
            ts = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
            if ts.replace(tzinfo=None) >= cutoff:
                entries.append(entry)
        except (json.JSONDecodeError, KeyError, ValueError):
            continue
    
    return entries


def analyze(entries: list[dict]) -> dict:
    """Analyze entries and return skill-level stats."""
    skills = defaultdict(lambda: {
        "executions": 0,
        "qualities": [],
        "issues": [],
        "outcomes": defaultdict(int),
        "hints": [],
        "triggers": []
    })
    
    for e in entries:
        skill = e.get("skill", "unknown")
        s = skills[skill]
        s["executions"] += 1
        if "quality" in e:
            s["qualities"].append(e["quality"])
        if "issues" in e:
            s["issues"].extend(e["issues"])
        s["outcomes"][e.get("outcome", "unknown")] += 1
        if "improvement_hint" in e and e["improvement_hint"]:
            s["hints"].append(e["improvement_hint"])
        if "trigger" in e:
            s["triggers"].append(e["trigger"])
    
    # Calculate priority scores
    results = {}
    for skill, data in skills.items():
        avg_q = sum(data["qualities"]) / len(data["qualities"]) if data["qualities"] else 3.0
        priority = (5 - avg_q) * data["executions"]
        
        # Count issue frequencies
        issue_counts = defaultdict(int)
        for issue in data["issues"]:
            issue_counts[issue] += 1
        
        results[skill] = {
            "executions": data["executions"],
            "avg_quality": round(avg_q, 2),
            "priority_score": round(priority, 2),
            "outcomes": dict(data["outcomes"]),
            "top_issues": sorted(issue_counts.items(), key=lambda x: -x[1])[:5],
            "hints": list(set(data["hints"]))[:5],
            "failure_rate": round(
                (data["outcomes"].get("failure", 0) + data["outcomes"].get("partial", 0)) 
                / max(data["executions"], 1) * 100, 1
            )
        }
    
    return results


def generate_report(results: dict, days: int = 7) -> str:
    """Generate markdown report of skills needing improvement."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Sort by priority
    ranked = sorted(results.items(), key=lambda x: -x[1]["priority_score"])
    top5 = ranked[:5]
    
    total_executions = sum(r["executions"] for r in results.values())
    total_skills = len(results)
    avg_quality_all = (
        sum(r["avg_quality"] * r["executions"] for r in results.values()) 
        / max(total_executions, 1)
    )
    
    lines = [
        f"# Weekly Skill Improvement Report — {today}",
        f"",
        f"**Period:** Last {days} days",
        f"**Total executions logged:** {total_executions}",
        f"**Skills with activity:** {total_skills}",
        f"**Weighted avg quality:** {avg_quality_all:.2f}/5",
        f"",
        f"---",
        f"",
        f"## 🔴 Top 5 Skills Needing Improvement",
        f"",
        f"| Rank | Skill | Executions | Avg Quality | Failure Rate | Priority |",
        f"|------|-------|-----------|-------------|-------------|----------|",
    ]
    
    for i, (skill, data) in enumerate(top5, 1):
        lines.append(
            f"| {i} | `{skill}` | {data['executions']} | "
            f"{data['avg_quality']}/5 | {data['failure_rate']}% | "
            f"{data['priority_score']} |"
        )
    
    lines.extend(["", "---", ""])
    
    for i, (skill, data) in enumerate(top5, 1):
        lines.append(f"### {i}. `{skill}`")
        lines.append(f"")
        lines.append(f"**Executions:** {data['executions']} | **Avg Quality:** {data['avg_quality']}/5 | **Failure Rate:** {data['failure_rate']}%")
        lines.append(f"")
        
        if data["top_issues"]:
            lines.append("**Top Issues:**")
            for issue, count in data["top_issues"]:
                lines.append(f"- {issue} (×{count})")
            lines.append("")
        
        if data["hints"]:
            lines.append("**Improvement Hints:**")
            for hint in data["hints"]:
                lines.append(f"- {hint}")
            lines.append("")
        
        lines.append("**Outcomes:**")
        for outcome, count in sorted(data["outcomes"].items(), key=lambda x: -x[1]):
            lines.append(f"- {outcome}: {count}")
        lines.append("")
    
    # Summary for all skills
    lines.extend(["---", "", "## All Skills Summary", ""])
    for skill, data in ranked:
        emoji = "🟢" if data["avg_quality"] >= 4 else "🟡" if data["avg_quality"] >= 3 else "🔴"
        lines.append(f"- {emoji} `{skill}`: {data['executions']}× | Q:{data['avg_quality']} | F:{data['failure_rate']}%")
    
    return "\n".join(lines)


def update_metrics(results: dict):
    """Update running metrics file."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    metrics = {}
    if METRICS_FILE.exists():
        try:
            metrics = json.loads(METRICS_FILE.read_text())
        except json.JSONDecodeError:
            metrics = {}
    
    if "weekly_snapshots" not in metrics:
        metrics["weekly_snapshots"] = []
    
    snapshot = {
        "date": today,
        "total_skills_active": len(results),
        "total_executions": sum(r["executions"] for r in results.values()),
        "avg_quality": round(
            sum(r["avg_quality"] * r["executions"] for r in results.values())
            / max(sum(r["executions"] for r in results.values()), 1), 2
        ),
        "skills_below_3": [s for s, r in results.items() if r["avg_quality"] < 3],
        "top_priority": list(sorted(results.items(), key=lambda x: -x[1]["priority_score"])[:3])
    }
    
    metrics["weekly_snapshots"].append(snapshot)
    metrics["last_updated"] = today
    
    METRICS_FILE.write_text(json.dumps(metrics, indent=2, default=str))


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    
    entries = load_log(days)
    if not entries:
        print(f"No execution log entries found in the last {days} days.")
        print(f"Log file: {LOG_FILE}")
        print("Start logging skill executions to generate reports.")
        sys.exit(0)
    
    results = analyze(entries)
    report = generate_report(results, days)
    
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    report_path = PROPOSALS_DIR / f"weekly-{today}.md"
    report_path.write_text(report)
    
    update_metrics(results)
    
    print(f"Report generated: {report_path}")
    print(f"Metrics updated: {METRICS_FILE}")
    print(f"\nTop issues:")
    ranked = sorted(results.items(), key=lambda x: -x[1]["priority_score"])
    for skill, data in ranked[:3]:
        print(f"  {skill}: Q={data['avg_quality']}, P={data['priority_score']}")


if __name__ == "__main__":
    main()
