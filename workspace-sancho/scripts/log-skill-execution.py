#!/usr/bin/env python3
"""Log a skill execution to the execution log.

Usage:
  python log-skill-execution.py <skill> <outcome> <quality> [--issues "issue1" "issue2"] [--hint "improvement hint"] [--trigger "user prompt"]

Examples:
  python log-skill-execution.py copywriting success 5
  python log-skill-execution.py seo-content partial 3 --issues "missed keyword density" --hint "add density checker"
  python log-skill-execution.py brand-voice failure 1 --issues "wrong tone" "missed brand rules" --trigger "write social post"
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

LOG_FILE = Path(__file__).parent.parent / "_system" / "skill-execution-log.jsonl"


def main():
    parser = argparse.ArgumentParser(description="Log a skill execution")
    parser.add_argument("skill", help="Skill name")
    parser.add_argument("outcome", choices=["success", "partial", "failure", "false-positive", "false-negative"])
    parser.add_argument("quality", type=int, choices=range(1, 6), help="Quality 1-5")
    parser.add_argument("--issues", nargs="*", default=[], help="List of issues")
    parser.add_argument("--hint", default="", help="Improvement hint")
    parser.add_argument("--trigger", default="", help="What the user asked")
    parser.add_argument("--session", default="", help="Session key")
    parser.add_argument("--notes", default="", help="Free-form notes")
    
    args = parser.parse_args()
    
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "skill": args.skill,
        "outcome": args.outcome,
        "quality": args.quality,
        "issues": args.issues,
        "improvement_hint": args.hint,
        "trigger": args.trigger,
        "session_key": args.session,
        "notes": args.notes,
    }
    
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    
    print(f"✅ Logged: {args.skill} | {args.outcome} | Q:{args.quality}")


if __name__ == "__main__":
    main()
