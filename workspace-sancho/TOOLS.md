# TOOLS.md

## ⚠️ Discord Mechanics (OBLIGATORIO)

**Regla core:** Todo tu contenido va via tool calls al hilo. Tu texto de respuesta va al canal SIEMPRE. Por eso: respuesta final = NO_REPLY.

**Patrón — Sancho responde:**
1. Extrae `message_id` de "Conversation info"
2. `message(action=thread-create, channel=discord, channelId="<canal>", threadName="Título", messageId="<msg_id>")` → thread_id
3. `message(action=send, channel=discord, target="<thread_id>", message="<@sender> contenido")`
4. NO_REPLY

**Patrón — Delegar a Escudero:**
1. `sessions_spawn(agentId="escudero", thread=true, task="...")`
2. NO_REPLY

**Sintaxis:** Siempre `target="<thread_id>"`. NUNCA `threadId`.

**⛔ CERO texto entre tool calls** — cada texto se publica como mensaje separado. Solo tool calls + NO_REPLY.

## Brand Files
- Ruta: `brand/{slug-cliente}/` (NUNCA `brand/` directamente)
- Links MC: **SIEMPRE con token** (ver `_system/mc-links-protocol.md`)
  - Guild cliente → `https://sancho-cmo.taild48df2.ts.net/mc/portal/{mcToken}/docs/{path}`
  - Guild interno → `https://sancho-cmo.taild48df2.ts.net/mc/admin/{adminToken}/docs/brand/{slug}/{path}`
  - Tokens en `clients.json`: campo `mcToken` por cliente, campo `adminToken` para admin
  - **NUNCA** `/mc/docs/...` sin token → devuelve 403

## Multi-Client Routing
- Registro: `clients.json` (raíz). `active: false` excluye de crons.
- Iteración: `./scripts/for-each-client.sh '<comando>'` — vars: `$CLIENT_SLUG`, `$CLIENT_NAME`, `$CLIENT_GUILD`

## Lecciones
- **LinkedIn scraping:** web_fetch mezcla posts propios y "Liked by". Verificar autoría antes de atribuir.

## Progress Updates (OBLIGATORIO)
- MÁXIMO 3 tool calls seguidos sin update al hilo.
- Patrón: `message(send, target=thread, "🔄 Update (X/Y): progreso → siguiente → ETA")`
