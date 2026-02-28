#!/usr/bin/env python3
"""
auto-bind.py — Auto-bind Discord guild channels to agents in openclaw.json.

Usage:
    auto-bind.py <guild_id> --dry-run    # Preview bindings without writing
    auto-bind.py <guild_id> --apply      # Write bindings to openclaw.json

Channel → Agent mapping:
    - Channels containing "admin" → cervantes
    - Everything else → sancho (default agent, no explicit binding needed)
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import tempfile

OPENCLAW_JSON = os.path.expanduser("~/.openclaw/openclaw.json")

# Channel name patterns → agent ID
CHANNEL_PATTERNS = {
    "admin": "cervantes",
    # Add more patterns here as needed
    # "ops": "cervantes",
}

DEFAULT_AGENT = "sancho"  # No explicit binding needed for default


def load_config():
    with open(OPENCLAW_JSON, "r") as f:
        return json.load(f)


def get_bot_token(config):
    return config["channels"]["discord"]["token"]


def fetch_guild_channels(token, guild_id):
    url = f"https://discord.com/api/v10/guilds/{guild_id}/channels"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bot {token}",
        "User-Agent": "DiscordBot (https://openclaw.ai, 1.0)",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"❌ Discord API error: {e.code} {e.reason}", file=sys.stderr)
        sys.exit(1)


def match_agent(channel_name):
    """Return agent ID for a channel name, or None if default."""
    name_lower = channel_name.lower()
    for pattern, agent in CHANNEL_PATTERNS.items():
        if pattern in name_lower:
            return agent
    return None  # Default agent — no binding needed


def build_bindings(channels, guild_id):
    """Build bindings array from guild channels."""
    # Only text channels (type 0) and announcement channels (type 5)
    text_channels = [c for c in channels if c["type"] in (0, 5)]
    bindings = []

    for ch in sorted(text_channels, key=lambda c: c["name"]):
        agent = match_agent(ch["name"])
        if agent:  # Only create bindings for non-default agents
            bindings.append({
                "channelId": ch["id"],
                "channelName": ch["name"],  # For readability
                "agent": agent,
                "guildId": guild_id,
            })

    return bindings, text_channels


def merge_bindings(existing, new_bindings):
    """Merge new bindings into existing, avoiding duplicates by channelId."""
    existing_ids = {b["channelId"] for b in existing}
    merged = list(existing)
    added = []
    for b in new_bindings:
        if b["channelId"] not in existing_ids:
            merged.append(b)
            added.append(b)
    return merged, added


def print_preview(text_channels, bindings, guild_id):
    """Print a human-readable preview."""
    print(f"\n📡 Guild: {guild_id}")
    print(f"📺 Text channels found: {len(text_channels)}\n")

    print("Channel Mapping:")
    print("-" * 60)
    for ch in sorted(text_channels, key=lambda c: c["name"]):
        agent = match_agent(ch["name"])
        label = agent or f"{DEFAULT_AGENT} (default)"
        marker = "🔧" if agent else "  "
        print(f"  {marker} #{ch['name']:<30} → {label}")

    print(f"\n🔗 Explicit bindings to generate: {len(bindings)}")
    if bindings:
        print(json.dumps(bindings, indent=2))


def apply_bindings(config, bindings):
    """Write bindings to openclaw.json atomically."""
    discord = config["channels"]["discord"]
    existing = discord.get("bindings", [])
    merged, added = merge_bindings(existing, bindings)

    if not added:
        print("\n✅ No new bindings to add (all already exist).")
        return

    discord["bindings"] = merged

    # Atomic write
    fd, tmp_path = tempfile.mkstemp(
        dir=os.path.dirname(OPENCLAW_JSON), suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, OPENCLAW_JSON)
        print(f"\n✅ Added {len(added)} binding(s) to openclaw.json")
        for b in added:
            print(f"   #{b['channelName']} → {b['agent']}")
    except Exception:
        os.unlink(tmp_path)
        raise


def main():
    parser = argparse.ArgumentParser(description="Auto-bind Discord channels to agents")
    parser.add_argument("guild_id", help="Discord guild ID")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Preview without writing")
    group.add_argument("--apply", action="store_true", help="Write bindings to openclaw.json")
    args = parser.parse_args()

    config = load_config()
    token = get_bot_token(config)
    channels = fetch_guild_channels(token, args.guild_id)
    bindings, text_channels = build_bindings(channels, args.guild_id)

    print_preview(text_channels, bindings, args.guild_id)

    if args.apply:
        apply_bindings(config, bindings)
    else:
        print("\n💡 Run with --apply to write these bindings.")


if __name__ == "__main__":
    main()
