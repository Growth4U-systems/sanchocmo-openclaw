# TOOLS.md

## Discord (OBLIGATORIO)
- Contenido → tool calls al hilo. Respuesta final = NO_REPLY.
- **Sancho responde:** thread-create(channelId, messageId) → send(target=thread_id) → NO_REPLY
- **Delegar:** sessions_spawn(agentId="escudero", thread=true) → NO_REPLY
- Siempre `target="<thread_id>"`. NUNCA `threadId`. CERO texto entre tool calls.

## Brand Files
- Ruta: `brand/{slug}/` — Links MC SIEMPRE con token (ver `_system/mc-links-protocol.md`)
- Cliente: `.../mc/portal/{mcToken}/docs/{path}` | Admin: `.../mc/admin/{adminToken}/docs/brand/{slug}/{path}`
- NUNCA `/mc/docs/...` sin token → 403

## Multi-Client
- `clients.json` (raíz). `active: false` excluye de crons.
- `./scripts/for-each-client.sh '<cmd>'` — vars: `$CLIENT_SLUG`, `$CLIENT_NAME`, `$CLIENT_GUILD`

## Lecciones
- LinkedIn scraping: web_fetch mezcla posts propios y "Liked by". Verificar autoría.

## Progress Updates
- Max 3 tool calls sin update. Patrón: `🔄 Update (X/Y): progreso → siguiente → ETA`

## Entrega de resultados (P0)
Al completar cualquier tarea que genera archivos:
1. **Mencionar** al usuario: `<@{sender_id}>` — sin mención no hay notificación
2. **Links tokenizados de MC** a TODOS los archivos generados:
   - `<https://sancho-cmo.taild48df2.ts.net/mc/portal/{mcToken}/docs/brand/{slug}/{path}>`
   - NUNCA rutas internas (`campaigns/content/archivo.md`)
   - NUNCA links sin token
3. **Formato obligatorio:**
   ```
   <@{sender_id}> ✅ Listo.
   📄 **Pillar Page:** <{link MC}>
   📱 **Posts LinkedIn (4):** <{link MC}>
   ```
4. Si tarda >30s → update intermedio: `🔄 Trabajando en {X}...`
