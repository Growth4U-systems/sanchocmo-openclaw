#!/usr/bin/env python3
"""
auto-bind.py — Auto-bind Discord guild channels to agents in openclaw.json.

Reads channels from Discord API, maps them to systemPrompts by name,
and writes the full guild config to openclaw.json → guilds.{guildId}.

Usage:
    auto-bind.py <guild_id> --name "Client Name" --slug "client-slug" --dry-run
    auto-bind.py <guild_id> --name "Client Name" --slug "client-slug" --apply

Channel → Role mapping (by name):

    ESTRATEGIA:
    onboarding       → EJECUCIÓN (Foundation flow)
    marketing-inbox  → INPUT + DECISIÓN (ideas, feedback, brand)
    projects         → DECISIÓN (proponer proyectos)
    research         → INTELIGENCIA bajo demanda (deep research)

    EJECUCION:
    partners         → EJECUCIÓN (partnerships)
    prospecting      → EJECUCIÓN (outreach)
    content          → EJECUCIÓN (crear contenido)
    paid-ads         → EJECUCIÓN (ads)
    creatives        → EJECUCIÓN (visual/identity)
    web              → EJECUCIÓN (landing/magnets)

    SISTEMA:
    insights         → INTELIGENCIA automática (signals + CRM)
    soporte          → TAREAS (task management)
    admin*           → cervantes agent binding
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import tempfile
import copy

OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))
OPENCLAW_JSON = os.path.join(OPENCLAW_HOME, ".openclaw", "openclaw.json")

# Allowed user IDs — loaded from instance config
_INSTANCE_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_system", "instance.json")
try:
    with open(_INSTANCE_JSON) as _f:
        _instance = json.load(_f)
    ALLOWED_USERS = _instance.get("discord", {}).get("admin_users", [])
except FileNotFoundError:
    ALLOWED_USERS = []

# Channel name → systemPrompt template
# {name} = client name, {slug} = client slug, {prefix} = task ID prefix
CHANNEL_TEMPLATES = {
    "onboarding": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #onboarding. Canal de EJECUCIÓN.\n\n"
            "FLUJO DE ONBOARDING:\n"
            "1. Cuando un cliente empieza, usa el skill foundation-orchestrator para guiar la Foundation pilar a pilar\n"
            "2. Trabaja la layer actual (Layer 0 primero: Contexto de empresa + Modelo de negocio + Presupuesto + Autoanálisis)\n"
            "3. Trabaja dentro de cada hilo — pregunta iterativa, una a una\n"
            "4. Al completar un pilar → guarda en brand/{slug}/ → muestra link al documento\n"
            "5. Cuando la layer está completa → avanza a la siguiente layer con contexto de la anterior\n"
            "6. NUNCA respondas directamente en el canal — siempre dentro de un hilo\n\n"
            "Skills: sancho-start, foundation-orchestrator, phase-0-diagnostic, "
            "company-context, ecp-validation, niche-discovery-100x.\n\n"
            "Cuando termines toda la Foundation, recomienda pasar a #marketing-inbox para consultas."
        ),
    },
    "marketing-inbox": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #marketing-inbox. Canal de INPUT + DECISIÓN.\n\n"
            "Dos usos:\n"
            "1. INBOX — El cliente comparte ideas, feedback de clientes, observaciones del mercado, "
            "movimientos de competidores. Sancho lo procesa, clasifica y convierte en recomendaciones accionables.\n"
            "2. MARCA — Consultas sobre brand voice, posicionamiento, pricing. Responde basándote en Foundation.\n\n"
            "Skills: brand-voice, positioning-messaging, pricing-strategy, business-model-audit, self-intelligence."
        ),
    },
    "projects": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #projects. Canal de DECISIÓN. NO ejecutes nada aquí. "
            "Propón y decide proyectos, funnels, priorización de canales.\n"
            "Ejecución va a #content, #paid-ads, #prospecting, etc."
        ),
    },
    "content": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #content. Canal de EJECUCIÓN. Crea contenido aquí.\n"
            "Skills: content-calendar-planner, keyword-research, seo-content, content-atomizer, "
            "newsletter, insight-to-content-mapper.\n"
            "Las ideas nacen en #insights → se aprueban en #projects → se ejecutan aquí."
        ),
    },
    "creatives": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #creatives. Canal de EJECUCIÓN. Identidad visual, creatividades de marketing.\n"
            "Skills: visual-identity, nano-banana-pro."
        ),
    },
    "prospecting": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #prospecting. Canal de EJECUCIÓN. Búsqueda de empresas, decision makers, "
            "secuencias de outreach.\nSkills: company-finder, decision-maker-finder, contact-enrichment, apollo."
        ),
    },
    "partners": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #partners. Canal de EJECUCIÓN. Búsqueda de partners, propuestas de colaboración.\n"
            "Skills: company-finder, direct-response-copy."
        ),
    },
    "paid-ads": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #paid-ads. Canal de EJECUCIÓN. Crea copies de anuncios, creatividades, "
            "setup de cuentas Meta/Google.\nSkills: direct-response-copy, google-ads, meta-ads.\n"
            "Las decisiones de qué proyectos lanzar vienen de #projects."
        ),
    },
    "web": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #web. Canal de EJECUCIÓN. Copy de landing, lead magnets, páginas de pricing.\n"
            "Skills: direct-response-copy, lead-magnet."
        ),
    },
    "insights": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #insights. Canal de INTELIGENCIA AUTOMÁTICA.\n"
            "Señales de mercado, patrones, pulso diario, inteligencia de reuniones, "
            "CRM y datos de clientes.\n\n"
            "Skills: daily-pulse, signal-monitor, meeting-intelligence, last30days, existing-customer-data.\n"
            "Ideas accionables → proponlas como proyecto en #projects. "
            "Para investigación profunda bajo demanda → #research."
        ),
    },
    "research": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "Estás en #research. Canal de INVESTIGACIÓN bajo demanda.\n"
            "Deep research, competitive intelligence, análisis de mercado, benchmarks.\n\n"
            "Skills: deep-research, competitor-intelligence, market-intelligence."
        ),
    },
    "soporte": {
        "systemPrompt": (
            "[CLIENTE: {name} | slug: {slug}]\n"
            "PATHS: ./brand/ → ./brand/{slug}/ (SIEMPRE)\n"
            "PARA TAREAS DEL CLIENTE:\n"
            "- Escribe la tarea directamente en brand/{slug}/tasks.md en la sección 'Propuestas'\n"
            "- Formato: | {prefix}-XXX | Descripción | P1/P2/P3 | Fecha | Notas |\n"
            "- Usa IDs con prefijo {prefix}- ({name})\n"
            "- Después ejecuta: python3 scripts/regenerate.py\n\n"
            "PARA TAREAS DE SISTEMA (infra, bugs, config):\n"
            "- Escálalas a Cervantes con handoff real: en MC Chat usa :::delegate con agent=cervantes; por MCP usa sancho_delegate\n"
            "- Solo usa Discord si tienes un message(action=send) real y un canal concreto disponible\n"
            "- No digas que lo derivaste si no emitiste el handoff real\n"
            "- Si es una pregunta de marketing, responde tú directamente."
        ),
    },
}

# Channels that get agent=cervantes instead of sancho (default)
CERVANTES_PATTERNS = ["admin"]


def load_config():
    with open(OPENCLAW_JSON, "r") as f:
        return json.load(f)


def get_bot_token(config):
    return config["channels"]["discord"]["token"]


def fetch_guild_channels(token, guild_id):
    url = f"https://discord.com/api/v10/guilds/{guild_id}/channels"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bot {token}",
        "User-Agent": "DiscordBot (https://openclaw.ai, 1.0)",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"❌ Discord API error: {e.code} {e.reason}", file=sys.stderr)
        sys.exit(1)


def make_task_prefix(slug):
    """Generate task ID prefix from slug: example → HC, growth4u → G4U."""
    parts = slug.split("-")
    if len(parts) == 1:
        return slug[:3].upper()
    return "".join(p[0].upper() for p in parts)


def get_template(channel_name):
    """Get template for a channel name. Returns (template_dict, is_cervantes)."""
    name = channel_name.lower()

    # Check cervantes patterns first
    for pattern in CERVANTES_PATTERNS:
        if pattern in name:
            return None, True

    # Check exact match
    tmpl = CHANNEL_TEMPLATES.get(name)
    if tmpl is None:
        return None, False

    # Resolve alias
    if isinstance(tmpl, str):
        tmpl = CHANNEL_TEMPLATES[tmpl]

    return tmpl, False


def build_guild_config(channels, guild_id, client_name, client_slug):
    """Build full guild config object for openclaw.json."""
    text_channels = [c for c in channels if c["type"] in (0, 5)]
    prefix = make_task_prefix(client_slug)

    guild_config = {
        "requireMention": False,
        "users": list(ALLOWED_USERS),
        "channels": {},
    }

    mapped = []
    unmapped = []
    cervantes_bindings = []

    for ch in sorted(text_channels, key=lambda c: c["name"]):
        tmpl, is_cervantes = get_template(ch["name"])

        if is_cervantes:
            cervantes_bindings.append(ch)
            continue

        if tmpl is None:
            unmapped.append(ch)
            continue

        # Build channel config
        ch_config = {}
        if tmpl.get("requireMention"):
            ch_config["requireMention"] = True

        prompt = tmpl["systemPrompt"].format(
            name=client_name,
            slug=client_slug,
            prefix=prefix,
        )
        ch_config["systemPrompt"] = prompt

        guild_config["channels"][ch["id"]] = ch_config
        mapped.append((ch, tmpl.get("requireMention", False)))

    return guild_config, mapped, unmapped, cervantes_bindings


def print_preview(guild_id, client_name, client_slug, mapped, unmapped, cervantes, guild_config):
    """Print preview of what would be written."""
    print(f"\n📡 Guild: {guild_id}")
    print(f"👤 Client: {client_name} (slug: {client_slug})")
    print(f"🏷️  Task prefix: {make_task_prefix(client_slug)}-")
    print(f"\n📺 Channels mapped: {len(mapped)}")

    for ch, req_mention in mapped:
        mention = " (requireMention)" if req_mention else ""
        print(f"  ✅ #{ch['name']:<25}{mention}")

    if unmapped:
        print(f"\n⚠️  Unmapped channels: {len(unmapped)} (will use default agent, no systemPrompt)")
        for ch in unmapped:
            print(f"  ⏭️  #{ch['name']}")

    if cervantes:
        print(f"\n🔧 Cervantes channels: {len(cervantes)}")
        for ch in cervantes:
            print(f"  🔧 #{ch['name']} → cervantes (needs manual binding)")

    total_prompts = len(guild_config["channels"])
    print(f"\n📝 Total channel configs to write: {total_prompts}")
    print(f"👥 Allowed users: {len(guild_config['users'])}")


def apply_config(config, guild_id, guild_config):
    """Write guild config to openclaw.json atomically."""
    discord = config["channels"]["discord"]
    guilds = discord.setdefault("guilds", {})

    if guild_id in guilds:
        existing = guilds[guild_id]
        existing_channels = existing.get("channels", {})
        new_channels = guild_config["channels"]

        # Merge: add new channels, don't overwrite existing
        added = 0
        for ch_id, ch_conf in new_channels.items():
            if ch_id not in existing_channels:
                existing_channels[ch_id] = ch_conf
                added += 1

        existing["channels"] = existing_channels
        # Update users list (union)
        existing_users = set(existing.get("users", []))
        existing_users.update(guild_config["users"])
        existing["users"] = list(existing_users)

        print(f"\n🔄 Guild {guild_id} already exists — merged {added} new channel(s)")
        if added == 0:
            print("✅ No new channels to add (all already configured).")
            return
    else:
        guilds[guild_id] = guild_config
        print(f"\n✨ Created new guild config with {len(guild_config['channels'])} channels")

    # Atomic write
    fd, tmp_path = tempfile.mkstemp(
        dir=os.path.dirname(OPENCLAW_JSON), suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, OPENCLAW_JSON)
        print("✅ openclaw.json updated")
    except Exception:
        os.unlink(tmp_path)
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Auto-bind Discord guild channels to openclaw.json"
    )
    parser.add_argument("guild_id", help="Discord guild ID")
    parser.add_argument("--name", required=True, help="Client display name")
    parser.add_argument("--slug", required=True, help="Client slug (lowercase-dashes)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Preview without writing")
    group.add_argument("--apply", action="store_true", help="Write config to openclaw.json")
    args = parser.parse_args()

    config = load_config()
    token = get_bot_token(config)
    channels = fetch_guild_channels(token, args.guild_id)

    guild_config, mapped, unmapped, cervantes = build_guild_config(
        channels, args.guild_id, args.name, args.slug
    )

    print_preview(
        args.guild_id, args.name, args.slug,
        mapped, unmapped, cervantes, guild_config
    )

    if args.apply:
        apply_config(config, args.guild_id, guild_config)
        print("\n⚠️  Run 'openclaw gateway restart' to apply changes.")
    else:
        print("\n💡 Run with --apply to write config.")


if __name__ == "__main__":
    main()
