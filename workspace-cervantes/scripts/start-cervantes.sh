#!/usr/bin/env bash
# Wrapper to start Cervantes Claude Code service
# Provides a pseudo-TTY via 'script' so Claude detects interactive mode

export PATH="/root/.local/bin:/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

exec /usr/bin/script -qfc "/root/.local/bin/claude --permission-mode acceptEdits --channels plugin:discord@claude-plugins-official" /dev/null
