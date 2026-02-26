#!/bin/bash
# =============================================================================
# SanchoCMO — Estado de todas las instancias
# =============================================================================
# Uso: ./scripts/status.sh
#
# Muestra:
#   - Skills del master
#   - Por cada cliente: skills shared, custom, overrides, brand files
# =============================================================================

set -uo pipefail

MASTER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MASTER_SKILLS=$(find "$MASTER_DIR"/skills -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
MASTER_AGENTS=$(find "$MASTER_DIR"/agents -name "*.soul.md" 2>/dev/null | wc -l | tr -d ' ')

echo "==========================================="
echo "  SanchoCMO Multi-Client Status"
echo "==========================================="
echo ""
echo "  Master: $MASTER_DIR"
echo "  Skills: $MASTER_SKILLS"
echo "  Agents: $MASTER_AGENTS"
echo ""
echo "-------------------------------------------"

found=0
for client_dir in "$MASTER_DIR"/../sanchocmo-*/; do
    [ ! -d "$client_dir" ] && continue

    # No listar el master
    real_client="$(cd "$client_dir" && pwd)" || continue
    real_master="$(cd "$MASTER_DIR" && pwd)"
    [ "$real_client" = "$real_master" ] && continue

    # Solo listar instancias de cliente (tienen .claude/skills/)
    [ ! -d "$client_dir/.claude/skills" ] && continue

    found=$((found + 1))
    name=$(basename "$client_dir")

    # Contar skills
    shared=0
    custom=0
    overrides=0
    broken=0

    for item in "$client_dir"/.claude/skills/*; do
        [ ! -e "$item" ] && [ ! -L "$item" ] && continue
        if [ -L "$item" ]; then
            if [ -e "$item" ]; then
                shared=$((shared + 1))
            else
                broken=$((broken + 1))
            fi
        elif [ -d "$item" ]; then
            # Verificar si es override (mismo nombre que shared) o custom
            item_name=$(basename "$item")
            if [ -d "$MASTER_DIR/skills/$item_name" ]; then
                overrides=$((overrides + 1))
            else
                custom=$((custom + 1))
            fi
        fi
    done

    # Contar brand files
    brand_files=$(find "$client_dir/brand" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

    # Verificar .env
    has_env="no"
    [ -f "$client_dir/.env" ] && has_env="si"

    # Verificar openclaw config
    has_config="no"
    [ -f "$client_dir/openclaw.config.json" ] && has_config="si"

    echo ""
    echo "  $name"
    echo "    Skills:    $shared shared + $custom custom + $overrides overrides"
    [ "$broken" -gt 0 ] && echo "    Rotos:     $broken symlinks rotos"
    echo "    Brand:     $brand_files archivos"
    echo "    .env:      $has_env"
    echo "    Config:    $has_config"
done

if [ "$found" -eq 0 ]; then
    echo ""
    echo "  No hay instancias de cliente."
    echo "  Usa ./scripts/new-client.sh <nombre> para crear una."
fi

echo ""
echo "==========================================="
