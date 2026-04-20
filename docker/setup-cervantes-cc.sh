#!/usr/bin/env bash
# One-time setup for Cervantes Claude Code on Hetzner VPS
# Run on VPS host (not inside Docker container)
set -euo pipefail

echo "=== Cervantes Claude Code Setup ==="

# Ensure locally-installed tools are in PATH (claude, bun)
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

# 1. Check prerequisites
echo "[1/6] Checking prerequisites..."
command -v claude >/dev/null 2>&1 || { echo "ERROR: claude CLI not installed. Run: curl -fsSL https://claude.ai/install.sh | sh"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "ERROR: bun not installed. Run: curl -fsSL https://bun.sh/install | bash"; exit 1; }

# 2. Verify workspace and Cervantes .env
echo "[2/6] Verifying workspace..."
WORKSPACE="/root/.openclaw/workspace-cervantes"
if [ ! -f "$WORKSPACE/CLAUDE.md" ]; then
  echo "ERROR: $WORKSPACE/CLAUDE.md not found. Create it first."
  exit 1
fi

# The systemd service reads env from WORKSPACE/.env (isolated from the OpenClaw
# .env to avoid DISCORD_BOT_TOKEN collisions). Create it from the example if missing.
if [ ! -f "$WORKSPACE/.env" ]; then
  if [ -f "$WORKSPACE/.env.example" ]; then
    cp "$WORKSPACE/.env.example" "$WORKSPACE/.env"
    chmod 600 "$WORKSPACE/.env"
    echo "Created $WORKSPACE/.env from .env.example — edit it before starting the service."
    echo "Required values: CLAUDE_CODE_OAUTH_TOKEN, DISCORD_BOT_TOKEN (Cervantes bot), DISCORD_WEBHOOK_CERVANTES."
    exit 1
  else
    echo "ERROR: $WORKSPACE/.env not found and no .env.example to copy from."
    exit 1
  fi
fi

# 3. Check auth token in the Cervantes env
echo "[3/6] Checking authentication..."
if ! grep -qE "^CLAUDE_CODE_OAUTH_TOKEN=.+" "$WORKSPACE/.env"; then
  echo "ERROR: CLAUDE_CODE_OAUTH_TOKEN not set in $WORKSPACE/.env"
  echo "Generate on a machine with browser: claude setup-token"
  echo "Then add to $WORKSPACE/.env: CLAUDE_CODE_OAUTH_TOKEN=<token>"
  exit 1
fi

# 4. Install systemd service
echo "[4/6] Installing systemd service..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/cervantes-claude-code.service" /etc/systemd/system/cervantes-claude-code.service
systemctl daemon-reload

# 5. Install crontab
echo "[5/6] Installing crontab..."
crontab "$SCRIPT_DIR/crontab-cervantes"

# 6. Install logrotate
echo "[6/6] Installing logrotate..."
cp "$SCRIPT_DIR/logrotate-cervantes" /etc/logrotate.d/cervantes

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Start the service: systemctl start cervantes-claude-code"
echo "  2. Enable on boot:    systemctl enable cervantes-claude-code"
echo "  3. Check logs:        journalctl -u cervantes-claude-code -f"
echo "  4. Pair Discord bot:  watch the logs for pairing instructions"
echo ""
echo "After Discord pairing, Cervantes is live."
