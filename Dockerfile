FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-full \
    git curl jq openssh-client sqlite3 \
    && rm -rf /var/lib/apt/lists/*

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
COPY scripts/apply-sql-migration.mjs ./scripts/apply-sql-migration.mjs
# Local-Postgres baseline migrator (bundled local-db). Applies the journal-backed
# baseline under src/db/migrations-local (copied via `COPY src/`) at boot — see
# docker/entrypoint.sh section 5d.
COPY scripts/migrate-local.mjs ./scripts/migrate-local.mjs
# NEXT_PUBLIC_* vars must be present at build time — they are inlined into the client bundle.
ARG NEXT_PUBLIC_ENV_LABEL=""
ENV NEXT_PUBLIC_ENV_LABEL=${NEXT_PUBLIC_ENV_LABEL}
# Build-time commit SHA, surfaced by /api/health for deploy verification.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT}
RUN npm run build

# --- OpenClaw workspace ---
WORKDIR /root/.openclaw

EXPOSE 18789 18790 3000

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
