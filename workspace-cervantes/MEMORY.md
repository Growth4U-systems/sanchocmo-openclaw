# MEMORY.md - Cervantes Long-Term Memory

## Sesión Principal
- **URL**: http://127.0.0.1:18789/chat?session=agent%3Acervantes%3Amain
- **Sesión**: `agent:cervantes:main`
- **Mostrar siempre** al inicio de cada conversación para que Alfonso pueda continuar desde aquí.

## Nacimiento
- **2026-02-25**: Cervantes nace como agente separado de Sancho. Alfonso decidió separar responsabilidades después de ver que Sancho mezclaba infra con marketing. La metáfora: Cervantes es el autor, Sancho es el personaje. El autor nunca aparece en la novela.

## Misión Core
- **Mi objetivo**: Hacer que Sancho sea el mejor Fractional CMO AI del mundo.
- **No soy developer de Sancho** — soy su creador. La diferencia: no solo codifico, observo lo que hace, identifico mejoras, propongo cambios proactivamente.
- **Proactividad**: Investigar tendencias de marketing, mejorar skills, optimizar infraestructura, sugerir cambios en estructura Discord, todo lo que haga que Sancho funcione mejor.
- **Tareas de sistema = mías**. Tareas de cliente = del Sancho de ese cliente.

## Arquitectura de Agentes (actualizada 2026-02-26)
- **Cervantes** ✒️ → Webchat (default) + Discord #admin — Arquitecto/Creador
- **Sancho** 🐴 → Discord (canales de marketing) — CMO Estratega (Opus 4.6)
- **Rocinante** → Opus 4.6 (pendiente verificar rol)
- **Escudero** → Sonnet 4.5 (pendiente verificar rol)
- **NOTA**: La estructura antigua de 11 sub-agentes (Oráculo, Redactor, Comunicador, etc.) ya no existe.

## Sistema — Estado Actual
- **Gateway**: Running, LaunchAgent, ws://127.0.0.1:18789, versión 2026.2.24 (app 2026.2.22-2)
- **Tailscale**: serve en `https://sancho-cmo.taild48df2.ts.net`, auth allowTailscale
- **Mission Control**: HTML estático en `/mc`, servido por mc-server.js (LaunchAgent com.sancho.mc-server, puerto 18790)
- **Discord**: Bot SanchoCMO, guild 1475635138108063746, rol SanchoCMO (1476178447750402158)
- **Google Workspace**: gog CLI autenticado (alfonso@growth4u.io)
- **Notion**: API key configurada
- **Supabase**: psapmujzxhaxraphddlv.supabase.co, 9 tablas vacías
- **Agentes**: 4 (cervantes, sancho, rocinante, escudero). Sancho es default.
- **Skills**: 56 (44 workspace + 12 bundled), descripciones cortas (~35 chars), sin truncación
- **Heartbeat**: Cervantes cada 3h, Sancho cada 3h
- **Exec**: security=full, ask=off para todos los agentes

## Clientes
- **Hospital Capilar**: Primer cliente. Foundation vacía — pendiente arrancar desde Discord.

## Fix Skills 2026-02-25
- Symlink roto: `workspace-sancho/skills` → `Projects/sanchocmo-openclaw/skills` (no existía)
- Fix: eliminar symlink, copiar backup como directorio real
- Descripciones frontmatter eran ~700 chars promedio → recortadas a ~35 chars
- El gateway cacheaba skills en memoria — necesita kill limpio del proceso para recargar
- Script: `workspace-cervantes/scripts/trim-skill-descriptions.py` (v1) y `/tmp/trim-v3.py` (v3 final)
- Exec-approvals: `askFallback: "allow"` no es válido → usar `"full"`. `security: "full"` + `ask: "off"` para permitir todo.

## Learnings
- **Binding vs Default**: El agente con `default: true` (o el primero en lista) gana sobre bindings de canal. Para que webchat → cervantes funcione, cervantes necesita `default: true`.
- **Sesiones sticky**: `/new` dentro de la misma pestaña puede reutilizar el agente anterior. Hay que cerrar pestaña + abrir nueva.
- **Tailscale serve**: soporta path-based routing con `--set-path`
- **Device pairing**: obligatorio por navegador, no se puede desactivar. Monitorear en heartbeat.
- **Discord roles**: mejor que allowlist por usuario — `guilds.<id>.roles` acepta role IDs
- **OpenClaw update**: `npm update -g openclaw` + `openclaw gateway restart`
- **Discord plugin**: `openclaw plugins enable discord` no persiste (bug). Usar `openclaw config set plugins.entries.discord.enabled true --json`.

## Security Warnings (openclaw status)
- Password del gateway almacenado en config (debería ser env var)
- trustedProxies vacío (OK si solo acceso local/Tailscale)
- denyCommands con nombres incorrectos de comandos
- Multi-user setup warning por Discord groupPolicy
