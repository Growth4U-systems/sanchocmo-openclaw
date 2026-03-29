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

WORKDIR /root/.openclaw

EXPOSE 18789 18790

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
