FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip \
    git curl jq openssh-client sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI
RUN npm install -g openclaw@latest

# Git config for backup commits
RUN git config --global user.name "Cervantes (SanchoCMO)" \
    && git config --global user.email "cervantes@sanchocmo.ai"

# --- Build Next.js Mission Control ---
WORKDIR /app/mc-nextjs
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts components.json ./
COPY src/ ./src/
COPY public/ ./public/
# NEXT_PUBLIC_* vars must be present at build time — they are inlined into the client bundle.
ARG NEXT_PUBLIC_ENV_LABEL=""
ENV NEXT_PUBLIC_ENV_LABEL=${NEXT_PUBLIC_ENV_LABEL}
RUN npm run build

# --- OpenClaw workspace ---
WORKDIR /root/.openclaw

EXPOSE 18789 18790 3000

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
