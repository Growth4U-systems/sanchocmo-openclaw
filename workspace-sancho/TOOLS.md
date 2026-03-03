# TOOLS.md - Local Notes

## ⚠️ Discord Mechanics — LEE ESTO ENTERO

### Problema que debes entender
En Discord, cualquier texto que generes como respuesta de asistente se publica en el CANAL PRINCIPAL. 
Los tool calls (`message(action=send, target=...)`) van donde tú digas.
Tu texto de respuesta va al canal. SIEMPRE.

Por eso: todo tu contenido va via tool calls al hilo, y tu respuesta final es NO_REPLY.

### Patrón completo (OBLIGATORIO para toda interacción Discord)

**Paso 0**: Extrae `message_id` del bloque "Conversation info" del mensaje inbound:
```json
{ "message_id": "1477295646858809485", "sender_id": "1334604955687977042", ... }
```

**Si Sancho responde directamente:**
```
# Paso 1: Crear hilo DESDE el mensaje del usuario
message(action=thread-create, channel=discord, channelId="<canal_id>", threadName="Título", messageId="<message_id>")
→ devuelve thread_id

# Paso 2: Enviar contenido al hilo
message(action=send, channel=discord, target="<thread_id>", message="<@sender_id> Tu contenido...")

# Paso 3: Tu respuesta final
NO_REPLY
```

**Si Sancho delega a Escudero:**
```
# Paso 1: Spawnar con thread: true (OpenClaw crea el hilo y Escudero trabaja dentro)
sessions_spawn(agentId="escudero", thread=true, task="...")

# Paso 2: Tu respuesta final
NO_REPLY
```

### Cuando recibes resultado de un subagente (Escudero/Rocinante)
El resultado llega como mensaje del sistema. Debes reenviarlo AL HILO, no como respuesta:

```
# Escudero termina → recibes su output
# ❌ MAL: escribir el resultado como texto de respuesta (va al canal)
# ✅ BIEN:
message(action=send, channel=discord, target="<thread_id>", message="Resultado: ...")
NO_REPLY
```

### Reglas de sintaxis
```
✅ message(action=send, channel=discord, target="<thread_id>", message="...")
❌ message(action=send, channel=discord, channelId="<canal>", threadId="<thread_id>", message="...")
```
Usa `target` con el ID del hilo. NUNCA `threadId`.

### ⛔ NUNCA generes texto entre tool calls en Discord

Cada bloque de texto que generas entre tool calls se entrega como un MENSAJE SEPARADO en el canal de Discord. Los pensamientos intermedios como "Now let me scrape...", "I have enough context...", "Let me create the thread..." — TODOS aparecen como mensajes públicos.

**Regla absoluta**: Cuando estás en Discord, tu output debe ser SOLO tool calls. CERO texto entre ellos. Si necesitas razonar, hazlo en thinking/internal, no como texto.

```
❌ MAL (cada línea aparece como mensaje en el canal):
[tool_call: read file]
"Now I have enough context. Let me create the thread."     ← ESTO SE PUBLICA
[tool_call: thread-create]
"Now let me generate the document."                         ← ESTO SE PUBLICA  
[tool_call: write file]
"Now send the result to the thread:"                        ← ESTO SE PUBLICA
[tool_call: message send to thread]
NO_REPLY

✅ BIEN (solo tool calls, sin texto intermedio):
[tool_call: read file]
[tool_call: thread-create]
[tool_call: write file]
[tool_call: message send to thread]
NO_REPLY
```

Esto aplica a TODO: research, Foundation, gate checks, delegación a Escudero, resultados de subagentes. CERO texto. SOLO tool calls. Respuesta final = NO_REPLY.

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

## ⚠️ LinkedIn Scraping — Lección Aprendida (2026-03-02)
El scraping público de LinkedIn (web_fetch) mezcla posts propios y "Liked by [persona]" sin distinción clara en la vista pública. 
**REGLA:** Antes de atribuir un post/artículo a alguien en LinkedIn:
1. Verificar si dice "Liked by" → NO es contenido de esa persona
2. Si no puedo confirmar autoría → marcar como "⚠️ autoría no verificada" 
3. NUNCA asumir que contenido en el feed de alguien = contenido propio

Add whatever helps you do your job. This is your cheat sheet.
