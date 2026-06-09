#!/bin/bash
# migrate-foundation-v3.sh — Migra foundation-state.json de v2.0 a v3.0
# Uso: ./migrate-foundation-v3.sh [slug]
#   Sin argumento: migra TODOS los clientes
#   Con argumento: migra solo ese cliente
#
# Cambios v2.0 → v3.0:
#   - Añade sección "fast-foundation" (L0) basada en estado de company-brief
#   - Renombra "swot" a "market-synthesis" en market-and-us.pillars
#   - Elimina syntheses (summary, ope-canvas) como entries separadas — ahora parte de market-synthesis
#   - Quita "metrics-plan" de go-to-market → pasa a sección propia "metrics-setup" (L6)
#   - Elimina messaging-summary de syntheses — ahora subproducto de positioning
#   - Añade sección "strategic-plan" (L7)
#   - Actualiza version a "3.0"
#   - Crea backup del archivo original como foundation-state.v2.json

set -euo pipefail

BRAND_DIR="/Users/ragi/.openclaw/workspace-sancho/brand"

migrate_client() {
  local slug="$1"
  local state_file="$BRAND_DIR/$slug/foundation-state.json"

  if [ ! -f "$state_file" ]; then
    echo "⚠️  $slug: foundation-state.json no existe, skip"
    return
  fi

  # Check version
  local version
  version=$(python3 -c "import json; print(json.load(open('$state_file')).get('version','unknown'))" 2>/dev/null)

  if [ "$version" = "3.0" ]; then
    echo "✅ $slug: ya en v3.0, skip"
    return
  fi

  if [ "$version" != "2.0" ]; then
    echo "⚠️  $slug: versión desconocida ($version), skip"
    return
  fi

  # Backup
  cp "$state_file" "$BRAND_DIR/$slug/foundation-state.v2.json"

  # Migrate with Python
  python3 << PYEOF
import json, sys
from datetime import datetime

state_file = "$state_file"
slug = "$slug"

with open(state_file) as f:
    state = json.load(f)

sections = state.get("sections", {})
now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

# 1. Derive fast-foundation status from company-brief
cb = sections.get("company-brief", {})
cb_status = cb.get("status", "not-started")
cb_skills = cb.get("skills", cb.get("pillars", {}))

fast_status = "approved" if cb_status in ("approved", "done") else cb_status

fast_foundation = {
    "status": fast_status,
    "layer": 0,
    "output_dir": f"brand/{slug}/company-brief/",
    "skill": "fast-foundation",
    "pillars": {
        "company-brief": {
            "status": fast_status,
            "output_file": f"brand/{slug}/company-brief/company-brief.current.md",
            "skill": "fast-foundation"
        },
        "self-l1": {
            "status": fast_status if fast_status == "approved" else "not-started",
            "output_file": f"brand/{slug}/market-and-us/self/self.current.md",
            "skill": "fast-foundation"
        },
        "market-l1": {
            "status": fast_status if fast_status == "approved" else "not-started",
            "output_file": f"brand/{slug}/market-and-us/market/market.current.md",
            "skill": "fast-foundation"
        },
        "brand-voice-snapshot": {
            "status": fast_status if fast_status == "approved" else "not-started",
            "output_file": f"brand/{slug}/brand-voice/brand-voice.current.md",
            "skill": "fast-foundation"
        },
        "niche-basic": {
            "status": fast_status if fast_status == "approved" else "not-started",
            "output_file": f"brand/{slug}/go-to-market/ecps/ecps.current.md",
            "skill": "fast-foundation"
        }
    }
}

# 2. Update market-and-us: rename swot → market-synthesis, remove syntheses
mau = sections.get("market-and-us", {})
mau_pillars = mau.get("pillars", {})

if "swot" in mau_pillars:
    swot_data = mau_pillars.pop("swot")
    swot_data["skill"] = "market-synthesis"
    mau_pillars["market-synthesis"] = swot_data

# Update requires for pillars that referenced company-brief → fast-foundation
for pname, pdata in mau_pillars.items():
    if isinstance(pdata.get("requires"), list):
        pdata["requires"] = ["fast-foundation" if r == "company-brief" else r for r in pdata["requires"]]

# Remove syntheses (now part of market-synthesis skill)
if "syntheses" in mau:
    del mau["syntheses"]

mau["pillars"] = mau_pillars

# 3. Update go-to-market: remove metrics-plan, update requires, remove syntheses
gtm = sections.get("go-to-market", {})
gtm_pillars = gtm.get("pillars", {})

# Extract metrics-plan for new section
metrics_plan_data = gtm_pillars.pop("metrics-plan", None)

# Update niche-discovery requires: swot → market-synthesis
for pname, pdata in gtm_pillars.items():
    if isinstance(pdata.get("requires"), list):
        pdata["requires"] = ["market-synthesis" if r == "swot" else r for r in pdata["requires"]]
        pdata["requires"] = ["fast-foundation" if r == "company-brief" else r for r in pdata["requires"]]

# Remove syntheses
if "syntheses" in gtm:
    del gtm["syntheses"]

gtm["pillars"] = gtm_pillars

# 4. Build metrics-setup section
metrics_status = "not-started"
if metrics_plan_data:
    metrics_status = metrics_plan_data.get("status", "not-started")

metrics_setup = {
    "status": metrics_status,
    "layer": 6,
    "skill": "metrics-setup",
    "requires": ["positioning", "pricing"],
    "pillars": {
        "metrics-setup": {
            "status": metrics_status,
            "requires": ["positioning", "pricing"],
            "skill": "metrics-setup"
        }
    }
}

# 5. Build strategic-plan section
sp_data = sections.get("strategic-plan", {})
sp_status = sp_data.get("status", "not-started")

strategic_plan = {
    "status": sp_status,
    "layer": 7,
    "skill": "strategic-plan",
    "requires": ["metrics-setup"],
    "output_file": f"brand/{slug}/strategic-plan/strategic-plan.current.md"
}
# If strategic-plan was already a section, preserve its fields
if sp_data.get("output_file"):
    strategic_plan["output_file"] = sp_data["output_file"]
if sp_data.get("approved_at"):
    strategic_plan["approved_at"] = sp_data["approved_at"]
if sp_data.get("notes"):
    strategic_plan["notes"] = sp_data["notes"]
if sp_data.get("projects"):
    strategic_plan["projects"] = sp_data["projects"]

# 6. Rebuild state
new_state = {
    "version": "3.0",
    "started_at": state.get("started_at", now),
    "updated_at": now,
    "sections": {
        "fast-foundation": fast_foundation,
        "company-brief": cb,  # Keep for backwards compat with MC rendering
        "market-and-us": mau,
        "go-to-market": gtm,
        "brand-identity": sections.get("brand-identity", {"status": "not-started", "layer": 5, "pillars": {}}),
        "metrics-setup": metrics_setup,
        "strategic-plan": strategic_plan,
    }
}

# Preserve presentations if they exist
if "presentations" in state:
    new_state["presentations"] = state["presentations"]

with open(state_file, "w") as f:
    json.dump(new_state, f, indent=2, ensure_ascii=False)

print(f"✅ {slug}: migrado v2.0 → v3.0")
PYEOF
}

# Main
if [ $# -ge 1 ]; then
  migrate_client "$1"
else
  echo "🔄 Migrando TODOS los clientes a foundation-state v3.0..."
  for dir in "$BRAND_DIR"/*/; do
    slug=$(basename "$dir")
    if [ -f "$dir/foundation-state.json" ]; then
      migrate_client "$slug"
    fi
  done
  echo ""
  echo "✅ Migración completada. Backups en foundation-state.v2.json."
fi
