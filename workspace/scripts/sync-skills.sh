#!/bin/bash
# =============================================================================
# SanchoCMO — Sync skills del master a instancias de cliente
# =============================================================================
# Uso: ./scripts/sync-skills.sh              (sync TODAS las instancias)
#      ./scripts/sync-skills.sh <cliente>     (sync solo ese cliente)
#
# Que hace:
#   - Detecta skills nuevas en master que faltan en el cliente
#   - Crea symlinks para las nuevas
#   - RESPETA overrides (directorios reales) — nunca los toca
#   - Detecta skills eliminadas del master (symlinks rotos)
# =============================================================================

set -euo pipefail

MASTER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

sync_client() {
    local client_dir="$1"
    local client_name
    client_name=$(basename "$client_dir" | sed 's/sanchocmo-//')

    if [ ! -d "$client_dir/.claude/skills" ]; then
        echo "  Saltando $client_name (no tiene .claude/skills/)"
        return
    fi

    local added=0
    local skipped=0
    local broken=0

    # 1. Anadir skills nuevas del master
    for skill_dir in "$MASTER_DIR"/skills/*/; do
        [ ! -d "$skill_dir" ] && continue
        local skill_name
        skill_name=$(basename "$skill_dir")
        local target="$client_dir/.claude/skills/$skill_name"

        if [ -L "$target" ]; then
            # Ya es symlink — verificar que no este roto
            if [ ! -e "$target" ]; then
                echo "    Reparando symlink roto: $skill_name"
                rm "$target"
                ln -s "../../skills-shared/$skill_name" "$target"
                added=$((added + 1))
            fi
        elif [ -d "$target" ]; then
            # Directorio real = override o custom — NO tocar
            skipped=$((skipped + 1))
        else
            # No existe — crear symlink
            ln -s "../../skills-shared/$skill_name" "$target"
            added=$((added + 1))
        fi
    done

    # 2. Detectar symlinks rotos (skills eliminadas del master)
    for link in "$client_dir"/.claude/skills/*; do
        [ ! -L "$link" ] && continue
        if [ ! -e "$link" ]; then
            local broken_name
            broken_name=$(basename "$link")
            echo "    Symlink roto (skill eliminada del master): $broken_name"
            broken=$((broken + 1))
        fi
    done

    # 3. Resumen
    local total_shared
    total_shared=$(find "$client_dir/.claude/skills" -maxdepth 1 -type l 2>/dev/null | wc -l | tr -d ' ')
    local total_custom
    total_custom=$(find "$client_dir/.claude/skills" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')

    echo "  $client_name: +$added nuevas, $skipped overrides respetados, $broken rotos"
    echo "    Total: $total_shared shared + $total_custom custom"
}

echo "=== SanchoCMO — Sync Skills ==="
echo "Master: $MASTER_DIR"
echo ""

if [ -n "${1:-}" ]; then
    # Sync un solo cliente
    CLIENT_DIR="$MASTER_DIR/../sanchocmo-$1"
    if [ ! -d "$CLIENT_DIR" ]; then
        echo "Error: $CLIENT_DIR no existe"
        exit 1
    fi
    sync_client "$CLIENT_DIR"
else
    # Sync TODAS las instancias
    found=0
    for client_dir in "$MASTER_DIR"/../sanchocmo-*/; do
        # No sync el master consigo mismo
        real_client=$(cd "$client_dir" 2>/dev/null && pwd)
        real_master=$(cd "$MASTER_DIR" 2>/dev/null && pwd)
        [ "$real_client" = "$real_master" ] && continue
        [ ! -d "$client_dir" ] && continue

        sync_client "$client_dir"
        found=$((found + 1))
    done

    if [ "$found" -eq 0 ]; then
        echo "No se encontraron instancias de cliente."
        echo "Usa ./scripts/new-client.sh <nombre> para crear una."
    fi
fi

echo ""
echo "Done."
