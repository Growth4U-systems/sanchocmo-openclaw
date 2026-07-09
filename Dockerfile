FROM node:26-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-full \
    git curl jq openssh-client rsync sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Fireworks CLI. The public billingUsage HTTP endpoint exposes usage/tokens, but
# account-level real/rated cost currently comes from firectl account costs.
RUN curl -fsSL https://storage.googleapis.com/fireworks-public/firectl/stable/linux-amd64.gz \
      | gunzip > /usr/local/bin/firectl \
    && chmod 0755 /usr/local/bin/firectl

# PDF extraction libs. Debian Bookworm marks the system Python as
# externally-managed (PEP 668), so `pip install pypdf` from an agent's
# bash tool fails with "externally-managed-environment". Sancho recovered
# the first time using `--break-system-packages`, but the recovery dance
# (failed pip, failed venv, retry with override) surfaces as alarming red
# "tool failed" lines in MC Chat. Pre-installing the two libraries the
# agent actually reaches for keeps the happy path silent.
RUN pip install --break-system-packages --no-cache-dir pypdf pdfplumber

# Default /bin/sh to bash so child processes that prepend `set -o pipefail`
# (e.g. agent-issued shell commands via the OpenClaw Bash tool) don't fail
# on Debian's dash. Both /bin/sh and /usr/bin/sh are symlinked because
# Debian's usr-merge exposes the latter and some callers resolve it directly.
RUN ln -sf /usr/bin/bash /bin/sh && ln -sf /usr/bin/bash /usr/bin/sh

# Install OpenClaw CLI — pinned so a major schema change (auth-profiles.json,
# openclaw.json) doesn't silently break the running container on rebuild.
# Bump deliberately when staging is validated against a new version.
# ENV propagates the pin to runtime so entrypoint.sh can keep auto-installed
# plugins (e.g. @openclaw/codex) in lockstep — see entrypoint section 5c.
ARG OPENCLAW_VERSION=2026.5.18
ENV OPENCLAW_VERSION=${OPENCLAW_VERSION}
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Optional Hermes CLI install. Keep it opt-in so the default OpenClaw image path
# stays small and unchanged; Hermes staging builds set INSTALL_HERMES=1.
ARG INSTALL_HERMES=0
ARG HERMES_AGENT_REF=main
RUN if [ "$INSTALL_HERMES" = "1" ]; then \
      git clone --depth 1 --branch "$HERMES_AGENT_REF" https://github.com/NousResearch/hermes-agent.git /opt/hermes-agent \
      && python3 -m venv /opt/hermes-agent/venv \
      && /opt/hermes-agent/venv/bin/pip install --upgrade pip setuptools wheel \
      && /opt/hermes-agent/venv/bin/pip install -e "/opt/hermes-agent[cli,cron,pty,mcp]" \
      && ln -sf /opt/hermes-agent/venv/bin/hermes /usr/local/bin/hermes; \
    else \
      echo "Skipping Hermes CLI install (INSTALL_HERMES=$INSTALL_HERMES)"; \
    fi

# Official Notion CLI used by the bundled `notion` skill. Without `ntn`
# on PATH, the skill's anyBins=["ntn","curl"] check passes via curl, but
# its SKILL.md tells the agent to prefer `ntn` — leading to "command not
# found" mid-session. Installing it here keeps the preferred path working.
RUN npm install -g ntn

# --- Build Next.js Mission Control ---
WORKDIR /app/mc-nextjs
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts components.json drizzle.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
# pillar-manifest.json is imported at build time by src/lib/pillar-doc-paths.ts
# (SAN-166) — without config/ in the build stage, `next build` fails with
# "Module not found" even though GitHub CI (full checkout) passes.
COPY config/ ./config/
COPY scripts/apply-sql-migration.mjs ./scripts/apply-sql-migration.mjs
# Single-day metrics ingest (SAN-318): the collector pipes a snapshot to this tsx
# script to persist via the app's getDb(); scripts/ is copied file-by-file.
COPY scripts/ingest-metrics.ts ./scripts/ingest-metrics.ts
# Local-Postgres baseline migrator (bundled local-db). Applies the journal-backed
# baseline under src/db/migrations-local (copied via `COPY src/`) at boot — see
# docker/entrypoint.sh section 5d.
COPY scripts/migrate-local.mjs ./scripts/migrate-local.mjs
# prod→staging data sync (staging-only "Sync with Prod" admin button). Invoked
# via `bash` by /api/system/sync-prod-to-staging; needs rsync (installed above).
COPY scripts/resync-prod-to-staging.sh ./scripts/resync-prod-to-staging.sh
# Runtime connector assets served by /api/runtime/local-connector/*.
COPY scripts/sancho-local-connector.mjs ./scripts/sancho-local-connector.mjs
COPY docker/runtimes/hermes/bridge.mjs ./docker/runtimes/hermes/bridge.mjs
COPY docker/runtimes/claude-code/bridge.mjs ./docker/runtimes/claude-code/bridge.mjs
COPY docker/runtimes/codex/bridge.mjs ./docker/runtimes/codex/bridge.mjs
# NEXT_PUBLIC_* vars must be present at build time — they are inlined into the client bundle.
ARG NEXT_PUBLIC_ENV_LABEL=""
ENV NEXT_PUBLIC_ENV_LABEL=${NEXT_PUBLIC_ENV_LABEL}
# Build-time commit SHA, surfaced by /api/health for deploy verification.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT}
RUN npm run build

# --- Bake the OpenClaw "home" framework as a seed layer ---
# The entrypoint runs with cwd=/root/.openclaw and needs the framework there, but
# a fresh product volume mounted at that path is empty (and shadows anything baked
# into it). So we bake the framework at /opt/sancho-seed (NOT shadowed by the mount)
# and docker/init-home.sh populates the volume from it at boot. .dockerignore keeps
# per-instance DATA and runtime state out of this layer (verify: no memory/, brand/,
# clients.json, etc. under /opt/sancho-seed).
WORKDIR /opt/sancho-seed
COPY docker/ ./docker/
COPY src/lib/runtime/agent-contract/ ./src/lib/runtime/agent-contract/
COPY skills/ ./skills/
COPY plugins/ ./plugins/
COPY agents/ ./agents/
COPY cron/ ./cron/
COPY config/ ./config/
COPY workspace-sancho/ ./workspace-sancho/
COPY workspace-cervantes/ ./workspace-cervantes/
COPY workspace-hamete/ ./workspace-hamete/
COPY workspace-dulcinea/ ./workspace-dulcinea/
COPY workspace-rocinante/ ./workspace-rocinante/
COPY workspace-mambrino/ ./workspace-mambrino/
COPY workspace-merlin/ ./workspace-merlin/
COPY workspace-sanson/ ./workspace-sanson/
COPY workspace-alarife/ ./workspace-alarife/
COPY workspace-maese-pedro/ ./workspace-maese-pedro/
# Bake runtime Node deps into the seed so a fresh product install boots without
# the entrypoint's first-run `npm install` (workspace-sancho scripts +
# metrics-collector GA4/GSC adapters) — that step added ~1-2 min to first boot.
# buildx runs this per target arch, so the modules match the platform.
RUN cd /opt/sancho-seed/workspace-sancho \
      && npm install --omit=dev --no-audit --no-fund --quiet \
    && cd /opt/sancho-seed/skills/metrics-collector/scripts \
      && npm install --omit=dev --no-audit --no-fund --quiet
# Version marker: init-home.sh refreshes the framework only when this changes
# (avoids re-copying ~180 MB of skills on every container restart).
RUN echo "${GIT_COMMIT:-$(date +%s)}" > /opt/sancho-seed/.seed-version \
    && find /opt/sancho-seed/docker -name '*.sh' -exec chmod +x {} +

# --- OpenClaw workspace ---
WORKDIR /root/.openclaw

EXPOSE 18789 18790 3000

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
