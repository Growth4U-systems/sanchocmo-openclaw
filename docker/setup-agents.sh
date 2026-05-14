#!/bin/bash
# setup-agents.sh — Register SanchoCMO agents in OpenClaw
# Run once after first deploy or when agents change.
# Idempotent: skips agents that already exist.
set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_HOME:-/root/.openclaw}"

echo "=== Registering SanchoCMO agents ==="

# Check if agents are already registered
EXISTING=$(openclaw agents list --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for a in data.get('agents', []):
        print(a.get('name', ''))
except:
    pass
" 2>/dev/null || true)

# Agent definitions: name, workspace, model
declare -A AGENT_WORKSPACES=(
  ["sancho"]="$OPENCLAW_ROOT/workspace-sancho"
  ["escudero"]="$OPENCLAW_ROOT/workspace-escudero"
  ["rocinante"]="$OPENCLAW_ROOT/workspace-rocinante"
  ["yalc"]="$OPENCLAW_ROOT/workspace-yalc"
)

declare -A AGENT_MODELS=(
  ["sancho"]="anthropic/claude-opus-4-6"
  ["escudero"]="anthropic/claude-sonnet-4-6"
  ["rocinante"]="anthropic/claude-opus-4-6"
  ["yalc"]="anthropic/claude-sonnet-4-6"
)

for AGENT_NAME in sancho escudero rocinante yalc; do
  if echo "$EXISTING" | grep -q "^${AGENT_NAME}$"; then
    echo "  ✓ $AGENT_NAME already registered"
    continue
  fi

  WORKSPACE="${AGENT_WORKSPACES[$AGENT_NAME]}"
  MODEL="${AGENT_MODELS[$AGENT_NAME]}"
  AGENT_DIR="$OPENCLAW_ROOT/agents/$AGENT_NAME/agent"

  echo "  + Registering $AGENT_NAME (model: $MODEL, workspace: $WORKSPACE)"

  OUTPUT=$(openclaw agents add "$AGENT_NAME" \
    --workspace "$WORKSPACE" \
    --agent-dir "$AGENT_DIR" \
    --model "$MODEL" \
    --non-interactive 2>&1) && true
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "    OK"
  elif echo "$OUTPUT" | grep -qi "already exists\|duplicate\|conflict"; then
    echo "  ✓ $AGENT_NAME already registered (skipped)"
  else
    echo "    ERROR: Failed to register $AGENT_NAME"
    echo "    $OUTPUT"
  fi
done

echo ""
echo "=== Agent registration complete ==="
openclaw agents list 2>/dev/null || true
