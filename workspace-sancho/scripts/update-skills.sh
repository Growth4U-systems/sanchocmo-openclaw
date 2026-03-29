#!/bin/bash
# update-skills.sh — Actualiza skills de 4 fuentes
# Cron: diario 06:00 Madrid
# Repos: ~/.openclaw/skill-repos/
# Target: ~/.openclaw/workspace-sancho/skills/

set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
SKILL_REPOS="$OPENCLAW_HOME/skill-repos"
SKILLS_DIR="$OPENCLAW_HOME/workspace-sancho/skills"
LOG=""

log() { LOG+="$1\n"; }

# 1. OpenClaw core + bundled skills
log "## 1. OpenClaw Update"
if openclaw update --yes --no-restart 2>&1; then
  log "✅ OpenClaw updated"
else
  log "⚠️ OpenClaw update failed (non-critical)"
fi

# 2. ClawHub registry skills
log ""
log "## 2. ClawHub Skills"
if clawhub update --all --no-input --force 2>&1; then
  log "✅ ClawHub skills updated"
else
  log "⚠️ ClawHub update failed"
fi

# 3. Corey Haines (coreyhaines31/marketingskills)
log ""
log "## 3. Corey Haines Skills"
cd "$SKILL_REPOS/marketingskills"
OLD_SHA=$(git rev-parse HEAD)
git pull --ff-only 2>&1 || git fetch origin main && git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" != "$NEW_SHA" ]; then
  CHANGED=0
  for skill_dir in skills/*/; do
    skill_name=$(basename "$skill_dir")
    target_name="$skill_name"
    [ "$skill_name" = "pricing-strategy" ] && target_name="ch-pricing-strategy"
    
    cp -r "$skill_dir" "$SKILLS_DIR/$target_name/"
    echo '{"source":"github","repo":"coreyhaines31/marketingskills","skill":"'"$skill_name"'"}' > "$SKILLS_DIR/$target_name/.skill-source.json"
    CHANGED=$((CHANGED + 1))
  done
  log "✅ Updated $CHANGED skills (${OLD_SHA:0:7} → ${NEW_SHA:0:7})"
else
  log "— No changes"
fi

# 4. Anthropic official skills (anthropics/skills)
log ""
log "## 4. Anthropic Skills"
cd "$SKILL_REPOS/anthropic-skills"
OLD_SHA=$(git rev-parse HEAD)
git pull --ff-only 2>&1 || git fetch origin main && git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" != "$NEW_SHA" ]; then
  CHANGED=0
  for skill_dir in skills/*/; do
    skill_name=$(basename "$skill_dir")
    # skill-creator: installed from repo (overrides bundled)
    
    cp -r "$skill_dir" "$SKILLS_DIR/$skill_name/"
    echo '{"source":"github","repo":"anthropics/skills","skill":"'"$skill_name"'"}' > "$SKILLS_DIR/$skill_name/.skill-source.json"
    CHANGED=$((CHANGED + 1))
  done
  log "✅ Updated $CHANGED skills (${OLD_SHA:0:7} → ${NEW_SHA:0:7})"
else
  log "— No changes"
fi

# 5. last30days (mvanhorn/last30days-skill)
log ""
log "## 5. last30days"
cd "$SKILL_REPOS/last30days-skill"
OLD_SHA=$(git rev-parse HEAD)
git pull --ff-only 2>&1 || git fetch origin main && git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" != "$NEW_SHA" ]; then
  rsync -a --exclude='.git' ./ "$SKILLS_DIR/last30days/"
  echo '{"source":"github","repo":"mvanhorn/last30days-skill"}' > "$SKILLS_DIR/last30days/.skill-source.json"
  log "✅ Updated (${OLD_SHA:0:7} → ${NEW_SHA:0:7})"
else
  log "— No changes"
fi

# 6. frontend-slides (zarazhangrui/frontend-slides)
log ""
log "## 6. frontend-slides"
cd "$SKILL_REPOS/frontend-slides"
OLD_SHA=$(git rev-parse HEAD)
git pull --ff-only 2>&1 || git fetch origin main && git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$OLD_SHA" != "$NEW_SHA" ]; then
  # Sync repo files but preserve our extras (templates/, generate-foundation-report.py)
  for f in SKILL.md STYLE_PRESETS.md animation-patterns.md html-template.md viewport-base.css LICENSE README.md; do
    [ -f "$f" ] && cp "$f" "$SKILLS_DIR/frontend-slides/"
  done
  [ -d "scripts" ] && cp -r scripts/* "$SKILLS_DIR/frontend-slides/scripts/" 2>/dev/null
  echo '{"source":"github","repo":"zarazhangrui/frontend-slides"}' > "$SKILLS_DIR/frontend-slides/.skill-source.json"
  log "✅ Updated (${OLD_SHA:0:7} → ${NEW_SHA:0:7})"
else
  log "— No changes"
fi

# Summary
TOTAL=$(ls -d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')
log ""
log "---"
log "**Total workspace skills: $TOTAL**"

echo -e "$LOG"
