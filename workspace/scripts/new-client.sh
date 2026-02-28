#!/bin/bash
# =============================================================================
# SanchoCMO — Onboard nuevo cliente
# =============================================================================
# Uso: ./scripts/new-client.sh <nombre-cliente>
# Ejemplo: ./scripts/new-client.sh monzo
#
# Crea una instancia de cliente con:
#   - Symlinks a skills compartidas del master
#   - Symlinks a agents, _system, docs compartidos
#   - Directorios propios: brand/, campaigns/
#   - Copias editables: .env, openclaw.config.json
# =============================================================================

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Error: Falta nombre del cliente"
    echo "Uso: $0 <nombre-cliente>"
    echo "Ejemplo: $0 monzo"
    exit 1
fi

CLIENT_NAME="$1"
MASTER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$MASTER_DIR/../sanchocmo-$CLIENT_NAME"

# Verificar que no existe ya
if [ -d "$CLIENT_DIR" ]; then
    echo "Error: $CLIENT_DIR ya existe"
    exit 1
fi

echo "=== SanchoCMO — Nuevo cliente: $CLIENT_NAME ==="
echo ""

# 1. Crear estructura de directorios
echo "1/6 Creando estructura..."
mkdir -p "$CLIENT_DIR"/{brand,campaigns,.claude/skills}

# 2. Symlinks a recursos compartidos del master
echo "2/6 Creando symlinks a master..."
ln -s "$MASTER_DIR/skills" "$CLIENT_DIR/skills-shared"
ln -s "$MASTER_DIR/agents" "$CLIENT_DIR/agents"
ln -s "$MASTER_DIR/_system" "$CLIENT_DIR/_system"
ln -s "$MASTER_DIR/BRAIN.md" "$CLIENT_DIR/BRAIN.md"
ln -s "$MASTER_DIR/CLAUDE.md" "$CLIENT_DIR/CLAUDE.md"
ln -s "$MASTER_DIR/ARCHITECTURE-MAP.md" "$CLIENT_DIR/ARCHITECTURE-MAP.md"
ln -s "$MASTER_DIR/README.md" "$CLIENT_DIR/README.md"

# 3. Copiar archivos que se customizaran por cliente
echo "3/6 Copiando archivos editables..."
cp "$MASTER_DIR/openclaw.config.json" "$CLIENT_DIR/"
cp "$MASTER_DIR/env.example" "$CLIENT_DIR/.env"

# 4. Poblar .claude/skills/ con symlinks a CADA skill compartida
echo "4/6 Creando symlinks de skills..."
SKILL_COUNT=0
for skill_dir in "$MASTER_DIR"/skills/*/; do
    [ ! -d "$skill_dir" ] && continue
    skill_name=$(basename "$skill_dir")
    ln -s "../../skills-shared/$skill_name" "$CLIENT_DIR/.claude/skills/$skill_name"
    SKILL_COUNT=$((SKILL_COUNT + 1))
done

# 5. Copiar dispatch bot (cada cliente tiene su propia instancia)
echo "5/6 Copiando dispatch bot..."
mkdir -p "$CLIENT_DIR/discord"
cp "$MASTER_DIR/discord/dispatch-bot.js" "$CLIENT_DIR/discord/"
cp "$MASTER_DIR/discord/package.json" "$CLIENT_DIR/discord/"
if [ -f "$MASTER_DIR/discord/env.example" ]; then
    cp "$MASTER_DIR/discord/env.example" "$CLIENT_DIR/discord/.env"
fi

# 6. Resumen
echo "6/6 Verificando..."
echo ""
echo "============================================"
echo "  Cliente '$CLIENT_NAME' creado"
echo "============================================"
echo ""
echo "  Directorio:  $CLIENT_DIR"
echo "  Skills:      $SKILL_COUNT compartidas (symlinks)"
echo "  Brand:       vacio (se llena con Foundation Blitz)"
echo "  Config:      openclaw.config.json (editable)"
echo ""
echo "  Proximos pasos:"
echo "  1. Editar $CLIENT_DIR/.env"
echo "     - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
echo "     - DISCORD_BOT_TOKEN + GUILD_ID"
echo "     - ANTHROPIC_API_KEY"
echo ""
echo "  2. Editar $CLIENT_DIR/discord/.env"
echo "     - DISCORD_BOT_TOKEN + GUILD_ID"
echo ""
echo "  3. Crear servidor Discord 'SanchoCMO - $CLIENT_NAME'"
echo "     - 14 canales, 5 categorias (ver SETUP.md)"
echo ""
echo "  4. Crear proyecto Supabase 'sanchocmo-$CLIENT_NAME'"
echo "     - Ejecutar database/init-db.sql"
echo ""
echo "  5. Lanzar:"
echo "     cd $CLIENT_DIR/discord && npm install && node dispatch-bot.js"
echo "     cd $CLIENT_DIR && openclaw start --config openclaw.config.json"
echo ""
echo "  Para skills custom de este cliente:"
echo "     mkdir -p $CLIENT_DIR/.claude/skills/mi-skill-custom"
echo "     # Crear SKILL.md dentro"
echo ""
echo "  Para override de skill compartida:"
echo "     cd $CLIENT_DIR/.claude/skills"
echo "     rm nombre-skill  # eliminar symlink"
echo "     cp -r ../../skills-shared/nombre-skill .  # copiar como real"
echo "     # Editar la copia"
echo ""
