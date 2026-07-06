#!/usr/bin/env bash
set -euo pipefail

# migrate-brand-structure.sh — Migra clientes existentes a estructura v3.0
#
# Cambios:
#   1. brand-voice/ → brand-identity/voice-profile/
#   2. Crear subdirectorios faltantes en market-and-us/
#   3. Mover archivos sueltos de raíz a su ubicación correcta
#   4. Crear carpetas faltantes (existing-customer-data, sources, etc.)
#   5. Añadir metrics-plan al foundation-state.json si falta
#
# Uso: migrate-brand-structure.sh [--dry-run] [--slug <slug>]
#   --dry-run: solo muestra qué haría, no ejecuta
#   --slug: migrar solo un cliente específico

WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace-sancho}"
DRY_RUN=false
TARGET_SLUG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --slug) TARGET_SLUG="$2"; shift 2 ;;
    *) echo "❌ Argumento desconocido: $1"; exit 1 ;;
  esac
done

log() { echo "  $1"; }
action() {
  if $DRY_RUN; then
    echo "  [DRY-RUN] $1"
  else
    echo "  $1"
  fi
}

safe_mv() {
  local src="$1" dst="$2"
  if [[ -e "$src" ]]; then
    if [[ -e "$dst" ]]; then
      # Destination exists — archive the source instead
      local archive_dst="$BRAND_DIR/_archive/migration-dupes/$(basename "$(dirname "$src")")/$(basename "$src")"
      action "⚠️  DST EXISTS — archiving source: $src → $archive_dst"
      if ! $DRY_RUN; then
        mkdir -p "$(dirname "$archive_dst")"
        mv "$src" "$archive_dst"
      fi
    else
      action "📦 MOVE: $src → $dst"
      if ! $DRY_RUN; then
        mkdir -p "$(dirname "$dst")"
        mv "$src" "$dst"
      fi
    fi
  fi
}

# Need BRAND_DIR accessible in safe_mv — set per-client
BRAND_DIR=""

safe_mkdir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    action "📁 CREATE: $dir"
    if ! $DRY_RUN; then
      mkdir -p "$dir"
    fi
  fi
}

migrate_client() {
  local slug="$1"
  local brand="$WORKSPACE/brand/$slug"
  BRAND_DIR="$brand"

  if [[ ! -d "$brand" ]]; then
    log "⏭️  $slug — no brand dir, skipping"
    return
  fi

  echo ""
  echo "━━━ Migrando: $slug ━━━"

  # --- 1. Crear carpetas de la estructura v3.0 ---
  safe_mkdir "$brand/market-and-us/market"
  safe_mkdir "$brand/market-and-us/competitors"
  safe_mkdir "$brand/market-and-us/self"
  safe_mkdir "$brand/market-and-us/swot"
  safe_mkdir "$brand/market-and-us/summary"
  safe_mkdir "$brand/market-and-us/ope-canvas"
  safe_mkdir "$brand/market-and-us/sources"
  safe_mkdir "$brand/go-to-market/ecps"
  safe_mkdir "$brand/go-to-market/positioning/shared"
  safe_mkdir "$brand/go-to-market/pricing"
  safe_mkdir "$brand/go-to-market/existing-customer-data"
  safe_mkdir "$brand/brand-identity/voice-profile"
  safe_mkdir "$brand/brand-identity/visual-identity"
  safe_mkdir "$brand/operational"
  safe_mkdir "$brand/_archive"

  # --- 2. brand-voice/ → brand-identity/voice-profile/ ---
  if [[ -d "$brand/brand-voice" ]]; then
    for f in "$brand/brand-voice"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/brand-identity/voice-profile/$(basename "$f")"
    done
    # Remove empty dir
    if ! $DRY_RUN && [[ -d "$brand/brand-voice" ]]; then
      rmdir "$brand/brand-voice" 2>/dev/null || true
    fi
  fi

  # --- 3. Root-level pillar dirs → correct location ---
  # competitor-intelligence/ or competitors/ at root → market-and-us/competitors/
  if [[ -d "$brand/competitor-intelligence" ]]; then
    for f in "$brand/competitor-intelligence"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/market-and-us/competitors/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/competitor-intelligence" 2>/dev/null || true; fi
  fi

  # market-intelligence/ at root → market-and-us/market/
  if [[ -d "$brand/market-intelligence" ]]; then
    for f in "$brand/market-intelligence"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/market-and-us/market/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/market-intelligence" 2>/dev/null || true; fi
  fi

  # self-intelligence/ at root → market-and-us/self/
  if [[ -d "$brand/self-intelligence" ]]; then
    for f in "$brand/self-intelligence"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/market-and-us/self/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/self-intelligence" 2>/dev/null || true; fi
  fi

  # swot-analysis/ at root → market-and-us/swot/
  if [[ -d "$brand/swot-analysis" ]]; then
    for f in "$brand/swot-analysis"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/market-and-us/swot/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/swot-analysis" 2>/dev/null || true; fi
  fi

  # niche-discovery/ at root → go-to-market/ecps/ (only current.md)
  if [[ -d "$brand/niche-discovery" ]]; then
    if [[ -f "$brand/niche-discovery/current.md" ]]; then
      safe_mv "$brand/niche-discovery/current.md" "$brand/go-to-market/ecps/current.md"
    fi
    # Move remaining files to _archive
    for f in "$brand/niche-discovery"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/_archive/niche-discovery-workfiles/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/niche-discovery" 2>/dev/null || true; fi
  fi

  # positioning/ at root (not under go-to-market) → go-to-market/positioning/
  if [[ -d "$brand/positioning" && ! -d "$brand/go-to-market/positioning/shared" || -z "$(ls -A "$brand/go-to-market/positioning/" 2>/dev/null)" ]]; then
    if [[ -d "$brand/positioning" ]]; then
      for f in "$brand/positioning"/*; do
        [[ -e "$f" ]] || continue
        local bname="$(basename "$f")"
        if [[ "$bname" == "current.md" || "$bname" == "history.json" || "$bname" =~ ^v[0-9] ]]; then
          # Root-level positioning summary → archive
          safe_mv "$f" "$brand/_archive/positioning-root/$(basename "$f")"
        else
          # Subdirectories (ecp slugs) → go-to-market/positioning/
          safe_mv "$f" "$brand/go-to-market/positioning/$(basename "$f")"
        fi
      done
      if ! $DRY_RUN; then rmdir "$brand/positioning" 2>/dev/null || true; fi
    fi
  fi

  # metrics-plan.md at root → go-to-market/metrics-plan.md
  if [[ -f "$brand/metrics-plan.md" ]]; then
    safe_mv "$brand/metrics-plan.md" "$brand/go-to-market/metrics-plan.md"
  fi

  # --- 4. Niche discovery workfiles under go-to-market → ecps only keeps current.md ---
  if [[ -d "$brand/go-to-market/niche-discovery" ]]; then
    if [[ -f "$brand/go-to-market/niche-discovery/current.md" ]]; then
      safe_mv "$brand/go-to-market/niche-discovery/current.md" "$brand/go-to-market/ecps/current.md"
    fi
    # Move remaining workfiles to _archive
    for f in "$brand/go-to-market/niche-discovery"/*; do
      [[ -e "$f" ]] || continue
      safe_mv "$f" "$brand/_archive/niche-discovery-workfiles/$(basename "$f")"
    done
    if ! $DRY_RUN; then rmdir "$brand/go-to-market/niche-discovery" 2>/dev/null || true; fi
  fi

  # --- 5. Add metrics-plan to foundation-state.json if missing ---
  local fstate="$brand/foundation-state.json"
  if [[ -f "$fstate" ]]; then
    if ! grep -q "metrics-plan" "$fstate"; then
      action "📝 ADD metrics-plan to foundation-state.json"
      if ! $DRY_RUN; then
        python3 << PYEOF
import json
with open("$fstate") as f:
    state = json.load(f)
gtm = state.get("sections", {}).get("go-to-market", {})
pillars = gtm.get("pillars", {})
if "metrics-plan" not in pillars:
    pillars["metrics-plan"] = {
        "status": "not-started",
        "layer": 4,
        "requires": ["company-brief"],
        "enriches_with": ["niche-discovery"],
        "skill": "acquisition-metrics-plan"
    }
    gtm["pillars"] = pillars
    state["sections"]["go-to-market"] = gtm
    import datetime
    state["updated_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    with open("$fstate", "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    print("     ✅ metrics-plan added")
else:
    print("     ⏭️ metrics-plan already exists")
PYEOF
      fi
    fi
  fi

  echo "  ✅ $slug migrado"
}

# --- Main ---
echo "🔄 Migración de estructura v3.0"
if $DRY_RUN; then
  echo "   (DRY RUN — no se ejecutará nada)"
fi

if [[ -n "$TARGET_SLUG" ]]; then
  migrate_client "$TARGET_SLUG"
else
  # Migrate all clients from clients.json
  for slug in $(python3 -c "
import json
with open('$WORKSPACE/clients.json') as f:
    data = json.load(f)
for c in data.get('clients', []):
    print(c['slug'])
"); do
    migrate_client "$slug"
  done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if $DRY_RUN; then
  echo "🔍 DRY RUN completo. Ejecuta sin --dry-run para aplicar."
else
  echo "✅ Migración completa."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
