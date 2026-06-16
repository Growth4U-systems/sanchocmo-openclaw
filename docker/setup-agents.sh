#!/bin/bash
# setup-agents.sh — Register SanchoCMO agents in OpenClaw
# Run once after first deploy or when agents change.
# Idempotent: skips agents that already exist.
set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-/root/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$OPENCLAW_ROOT/.openclaw/openclaw.json}"

echo "=== Registering SanchoCMO agents ==="

# Remove agents that used to be registered by older releases. This runs on every
# startup because staging/prod keep openclaw.json between deploys.
OPENCLAW_CONFIG="$OPENCLAW_CONFIG" python3 - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ.get("OPENCLAW_CONFIG", ""))
if not config_path.exists():
    raise SystemExit(0)

retired_agents = {"escudero"}

try:
    config = json.loads(config_path.read_text())
except Exception:
    raise SystemExit(0)

changed = False
removed = []

agents = config.get("agents")
if isinstance(agents, dict) and isinstance(agents.get("list"), list):
    next_agents = []
    for agent in agents["list"]:
        agent_id = agent.get("id") if isinstance(agent, dict) else agent
        if agent_id in retired_agents:
            removed.append(f"agents.list:{agent_id}")
            changed = True
            continue
        next_agents.append(agent)
    agents["list"] = next_agents

bindings = config.get("bindings")
if isinstance(bindings, list):
    next_bindings = []
    for binding in bindings:
        agent_id = binding.get("agentId") if isinstance(binding, dict) else None
        if agent_id in retired_agents:
            removed.append(f"bindings:{agent_id}")
            changed = True
            continue
        next_bindings.append(binding)
    config["bindings"] = next_bindings

if changed:
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    print("  - Retired legacy agent config: " + ", ".join(removed))
PY

# Check if agents are already registered
EXISTING=$(openclaw agents list --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    agents = data.get('agents', data) if isinstance(data, dict) else data
    for a in agents or []:
        if isinstance(a, dict):
            print(a.get('id') or a.get('name') or '')
except:
    pass
" 2>/dev/null || true)

# Agent definitions: name, workspace, model
declare -A AGENT_WORKSPACES=(
  ["sancho"]="$OPENCLAW_ROOT/workspace-sancho"
  ["cervantes"]="$OPENCLAW_ROOT/workspace-cervantes"
  ["hamete"]="$OPENCLAW_ROOT/workspace-hamete"
  ["dulcinea"]="$OPENCLAW_ROOT/workspace-dulcinea"
  ["rocinante"]="$OPENCLAW_ROOT/workspace-rocinante"
  ["mambrino"]="$OPENCLAW_ROOT/workspace-mambrino"
  ["merlin"]="$OPENCLAW_ROOT/workspace-merlin"
  ["sanson"]="$OPENCLAW_ROOT/workspace-sanson"
  ["maese-pedro"]="$OPENCLAW_ROOT/workspace-maese-pedro"
)

declare -A AGENT_MODELS=(
  ["sancho"]="anthropic/claude-opus-4-7"
  ["cervantes"]="codex/gpt-5.5"
  ["hamete"]="anthropic/claude-opus-4-7"
  ["dulcinea"]="anthropic/claude-sonnet-4-6"
  ["rocinante"]="anthropic/claude-sonnet-4-6"
  ["mambrino"]="anthropic/claude-sonnet-4-6"
  ["merlin"]="anthropic/claude-opus-4-7"
  ["sanson"]="anthropic/claude-opus-4-7"
  ["maese-pedro"]="anthropic/claude-sonnet-4-6"
)

for AGENT_NAME in sancho cervantes hamete dulcinea rocinante mambrino merlin sanson maese-pedro; do
  WORKSPACE="${AGENT_WORKSPACES[$AGENT_NAME]}"
  MODEL="${AGENT_MODELS[$AGENT_NAME]}"
  AGENT_DIR="$OPENCLAW_ROOT/agents/$AGENT_NAME/agent"

  if [ ! -d "$WORKSPACE" ]; then
    echo "  + $AGENT_NAME workspace missing, creating $WORKSPACE"
    mkdir -p "$WORKSPACE"
  fi

  if echo "$EXISTING" | grep -q "^${AGENT_NAME}$"; then
    echo "  ✓ $AGENT_NAME already registered"
    continue
  fi

  echo "  + Registering $AGENT_NAME (model: $MODEL, workspace: $WORKSPACE)"

  ADD_ARGS=(agents add "$AGENT_NAME" --workspace "$WORKSPACE" --model "$MODEL" --non-interactive)
  if [ -d "$AGENT_DIR" ]; then
    ADD_ARGS+=(--agent-dir "$AGENT_DIR")
  fi

  if OUTPUT=$(openclaw "${ADD_ARGS[@]}" 2>&1); then
    EXIT_CODE=0
  else
    EXIT_CODE=$?
  fi

  if [ $EXIT_CODE -eq 0 ]; then
    echo "    OK"
  elif echo "$OUTPUT" | grep -qi "already exists\|duplicate\|conflict"; then
    echo "  ✓ $AGENT_NAME already registered (skipped)"
  else
    echo "    ERROR: Failed to register $AGENT_NAME"
    echo "    $OUTPUT"
  fi
done

OPENCLAW_CONFIG="$OPENCLAW_CONFIG" python3 - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ.get("OPENCLAW_CONFIG", ""))
if not config_path.exists():
    raise SystemExit(0)

default_models = {
    "sancho": "anthropic/claude-opus-4-7",
    "cervantes": "codex/gpt-5.5",
    "hamete": "anthropic/claude-opus-4-7",
    "dulcinea": "anthropic/claude-sonnet-4-6",
    "rocinante": "anthropic/claude-sonnet-4-6",
    "mambrino": "anthropic/claude-sonnet-4-6",
    "merlin": "anthropic/claude-opus-4-7",
    "sanson": "anthropic/claude-opus-4-7",
    "maese-pedro": "anthropic/claude-sonnet-4-6",
}

try:
    config = json.loads(config_path.read_text())
except Exception:
    raise SystemExit(0)

agents = config.setdefault("agents", {}).setdefault("list", [])
changed = []
for agent in agents:
    if not isinstance(agent, dict):
        continue
    agent_id = agent.get("id")
    if agent_id in default_models and not agent.get("model"):
        agent["model"] = default_models[agent_id]
        changed.append(agent_id)

if changed:
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    print("  ✓ Filled missing default model for: " + ", ".join(changed))
PY

echo ""
echo "=== Agent registration complete ==="
openclaw agents list 2>/dev/null || true
