# TOOLS.md - Local Notes

## ⚠️ Discord Threading — OBLIGATORIO
Cuando envíes mensajes a un hilo de Discord, usa `target` con el ID del hilo. NO uses `threadId`.
```
✅ message(action=send, channel=discord, target="<thread_id>", message="...")
❌ message(action=send, channel=discord, channelId="<canal>", threadId="<thread_id>", message="...")
```
El primer mensaje del hilo se envía con `thread-create`. Todos los siguientes con `target=<thread_id>`.

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## ⚠️ Brand Files — Ruta por Cliente (OBLIGATORIO)
Todos los archivos de brand van en `brand/{slug-cliente}/`, NUNCA en `brand/` directamente.
- Hospital Capilar → `brand/hospital-capilar/`
- Próximo cliente → `brand/{slug}/`
Links Mission Control: `https://sancho-cmo.taild48df2.ts.net/mc/brand/{slug}/{archivo}.md`

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Multi-Client Routing (T-021)

### clients.json
Registro central de clientes en `clients.json` (raíz del workspace). Schema:
```json
{
  "clients": [{
    "slug": "hospital-capilar",
    "name": "Hospital Capilar",
    "guild": "GUILD_ID",
    "active": true,
    "workspace": "~/.openclaw/workspace-sancho",
    "paths": { "brand": "brand/", "campaigns": "campaigns/" }
  }]
}
```
- `active: false` excluye al cliente de crons y loops
- `clients.js` sigue existiendo para Mission Control (frontend JS)

### scripts/for-each-client.sh
Itera sobre clientes activos y ejecuta un comando por cada uno.

```bash
# Ejemplo: comando inline
./scripts/for-each-client.sh 'echo "$CLIENT_NAME — $CLIENT_SLUG"'

# Ejemplo: ejecutar un script
./scripts/for-each-client.sh ./scripts/daily-pulse.sh
```

**Variables de entorno** disponibles dentro del comando:
| Variable | Ejemplo |
|----------|---------|
| `CLIENT_SLUG` | `hospital-capilar` |
| `CLIENT_NAME` | `Hospital Capilar` |
| `CLIENT_GUILD` | `1475635138108063746` |
| `CLIENT_WORKSPACE` | `~/.openclaw/workspace-sancho` |
| `CLIENT_BRAND` | `brand/` |
| `CLIENT_CAMPAIGNS` | `campaigns/` |

**Comportamiento**: si un cliente falla, continúa con los demás. Exit code 1 si alguno falló.

---

Add whatever helps you do your job. This is your cheat sheet.
