#!/usr/bin/env bash
set -euo pipefail

# new-client.sh — Crea workspace para un nuevo cliente de SanchoCMO
# Uso: new-client.sh <slug>

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/templates"
CLIENTS_DIR="$HOME/.openclaw/workspace-sancho/clients"
SUBDIRS=(brand campaigns intelligence assets reports)

# --- Help ---
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Uso: new-client.sh <slug>"
  echo ""
  echo "Crea el workspace completo para un nuevo cliente."
  echo "Ejemplo: new-client.sh hospital-capilar"
  exit 0
fi

# --- Validación ---
if [[ $# -lt 1 ]]; then
  echo "❌ Error: falta el slug del cliente."
  echo "Uso: new-client.sh <slug>"
  exit 1
fi

SLUG="$1"

# Validar formato del slug (solo minúsculas, números, guiones)
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ && ! "$SLUG" =~ ^[a-z0-9]$ ]]; then
  echo "❌ Error: slug inválido '$SLUG'. Usa solo minúsculas, números y guiones."
  exit 1
fi

CLIENT_DIR="$CLIENTS_DIR/$SLUG"

# --- Safety check ---
if [[ -d "$CLIENT_DIR" ]]; then
  echo "❌ Error: el cliente '$SLUG' ya existe en $CLIENT_DIR"
  echo "No se sobreescribe. Elimínalo manualmente si quieres recrearlo."
  exit 1
fi

# --- Crear estructura ---
echo "🔨 Creando workspace para cliente: $SLUG"

mkdir -p "$CLIENT_DIR"
for dir in "${SUBDIRS[@]}"; do
  mkdir -p "$CLIENT_DIR/$dir"
done

# --- Copiar templates ---
DATE="$(date +%Y-%m-%d)"
# Slug a nombre legible (hospital-capilar -> Hospital Capilar)
NAME="$(echo "$SLUG" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')"

# Brand templates
cp "$TEMPLATES_DIR/brand/company-context.md" "$CLIENT_DIR/brand/"
cp "$TEMPLATES_DIR/brand/positioning.md"     "$CLIENT_DIR/brand/"
cp "$TEMPLATES_DIR/brand/competitors.md"     "$CLIENT_DIR/brand/"
cp "$TEMPLATES_DIR/brand/voice-profile.md"   "$CLIENT_DIR/brand/"

# Root templates con sustitución
sed -e "s/__SLUG__/$SLUG/g" -e "s/__NAME__/$NAME/g" -e "s/__DATE__/$DATE/g" \
  "$TEMPLATES_DIR/README.md" > "$CLIENT_DIR/README.md"

sed -e "s/__SLUG__/$SLUG/g" \
  "$TEMPLATES_DIR/.env.template" > "$CLIENT_DIR/.env.template"

cp "$TEMPLATES_DIR/sources.json" "$CLIENT_DIR/"

# --- Resumen ---
echo ""
echo "✅ Cliente '$SLUG' creado correctamente:"
echo ""
echo "   📁 $CLIENT_DIR/"
for dir in "${SUBDIRS[@]}"; do
  echo "   📁 $CLIENT_DIR/$dir/"
done
echo ""
echo "   📄 brand/company-context.md"
echo "   📄 brand/positioning.md"
echo "   📄 brand/competitors.md"
echo "   📄 brand/voice-profile.md"
echo "   📄 sources.json"
echo "   📄 .env.template"
echo "   📄 README.md"
echo ""
echo "👉 Siguiente paso: completa brand/company-context.md y ejecuta Foundation."
