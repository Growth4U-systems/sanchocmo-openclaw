#!/bin/bash
# setup-agents.sh — Register SanchoCMO agents in OpenClaw
# Run once after first deploy or when agents change.
# Idempotent: skips agents that already exist.
set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-/root/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_CONFIG:-$OPENCLAW_ROOT/.openclaw/openclaw.json}"
FIREWORKS_DEFAULT_MODEL="fireworks/accounts/fireworks/routers/kimi-k2p5-turbo"
STRATEGY_MODEL="anthropic/claude-opus-4-7"
CONTENT_MODEL="anthropic/claude-sonnet-4-6"
CODE_MODEL="codex/gpt-5.5"

if [ "${ANTHROPIC_AUTH_MODE:-api_key}" = "subscription" ]; then
  ANTHROPIC_AVAILABLE=0
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_OAUTH_TOKEN:-}" ] && ANTHROPIC_AVAILABLE=1
else
  ANTHROPIC_AVAILABLE=0
  [ -n "${ANTHROPIC_API_KEY:-}" ] && ANTHROPIC_AVAILABLE=1
fi

if [ "$ANTHROPIC_AVAILABLE" = "0" ] && [ -n "${FIREWORKS_API_KEY:-}" ]; then
  STRATEGY_MODEL="$FIREWORKS_DEFAULT_MODEL"
  CONTENT_MODEL="$FIREWORKS_DEFAULT_MODEL"
fi

if [ "${OPENAI_AUTH_MODE:-api_key}" != "subscription" ] && [ -z "${OPENAI_API_KEY:-}" ] && [ -n "${FIREWORKS_API_KEY:-}" ]; then
  CODE_MODEL="$FIREWORKS_DEFAULT_MODEL"
fi

export STRATEGY_MODEL CONTENT_MODEL CODE_MODEL

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
  ["sancho"]="$STRATEGY_MODEL"
  ["cervantes"]="$CODE_MODEL"
  ["hamete"]="$STRATEGY_MODEL"
  ["dulcinea"]="$CONTENT_MODEL"
  ["rocinante"]="$CONTENT_MODEL"
  ["mambrino"]="$CONTENT_MODEL"
  ["merlin"]="$STRATEGY_MODEL"
  ["sanson"]="$STRATEGY_MODEL"
  ["maese-pedro"]="$CONTENT_MODEL"
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

strategy_model = os.environ.get("STRATEGY_MODEL", "anthropic/claude-opus-4-7")
content_model = os.environ.get("CONTENT_MODEL", "anthropic/claude-sonnet-4-6")
code_model = os.environ.get("CODE_MODEL", "codex/gpt-5.5")

default_models = {
    "sancho": strategy_model,
    "cervantes": code_model,
    "hamete": strategy_model,
    "dulcinea": content_model,
    "rocinante": content_model,
    "mambrino": content_model,
    "merlin": strategy_model,
    "sanson": strategy_model,
    "maese-pedro": content_model,
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
