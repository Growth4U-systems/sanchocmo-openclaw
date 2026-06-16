# TOOLS.md

## Discord (OBLIGATORIO)
- Contenido → tool calls al hilo. Respuesta final = NO_REPLY.
- **Sancho responde:** thread-create(channelId, messageId) → send(target=thread_id) → NO_REPLY
- **Delegar:** especialistas reales vía `Agent(subagent_type="<slug>")`; para entregables con estado, crear/usar la tarea del especialista y enviar ahí el brief. Escudero está retirado: NUNCA invocar el agente `escudero`.
- Siempre `target="<thread_id>"`. NUNCA `threadId`. CERO texto entre tool calls.

## Brand Files
- Ruta: `brand/{slug}/` — Links MC SIEMPRE con token (ver `_system/technical/mc-links-protocol.md`)
- `{MC_BASE_URL}` se inyecta al arranque del container con la URL canónica de este deployment. Usa el valor que veas tras la inyección — NUNCA un host distinto.
- Cliente: `{MC_BASE_URL}/portal/{mcToken}/docs/brand/{slug}/{path}` | Admin: `{MC_BASE_URL}/admin/{adminToken}/docs/brand/{slug}/{path}`
- NUNCA `/mc/docs/...` sin token → 403

## Multi-Client
- `clients.json` (raíz). `active: false` excluye de crons.
- `./scripts/for-each-client.sh '<cmd>'` — vars: `$CLIENT_SLUG`, `$CLIENT_NAME`, `$CLIENT_GUILD`

## Notion
- Skill `notion` está disponible. Si te piden leer un doc de Notion, **NO inventes solicitudes de instalación** — usala.
- CLI: `ntn pages get <page-id>` (lee el token de `NOTION_API_TOKEN`, que el container exporta aliasado de `NOTION_API_KEY`).
- Fallback raw: `curl -H "Authorization: Bearer $NOTION_API_KEY" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/pages/<page-id>`.
- Si recibís `object_not_found` o `unauthorized`: el bot del integration token no fue invitado a esa página. Reportalo al usuario pidiéndole que invite al bot en Notion: *Share → Add connections* — sin esa invitación ningún endpoint funciona, aunque el panel APIs muestre Notion como "connected".

## Lecciones
- LinkedIn scraping: web_fetch mezcla posts propios y "Liked by". Verificar autoría.

## Progress Updates
- Max 3 tool calls sin update. Patrón: `🔄 Update (X/Y): progreso → siguiente → ETA`

## Entrega de resultados (P0)
Al completar cualquier tarea que genera archivos:
1. **Mencionar** al usuario: `<@{sender_id}>` — sin mención no hay notificación
2. **Links tokenizados de MC** a TODOS los archivos generados:
   - `{MC_BASE_URL}/portal/{mcToken}/docs/brand/{slug}/{path}` (plain URL — el MC chat UI lo auto-linkifica; el host de `{MC_BASE_URL}` se inyecta al arranque)
   - NUNCA rutas internas (`campaigns/content/archivo.md`)
   - NUNCA links sin token
   - NUNCA un hostname distinto al que ves tras la inyección
3. **Formato obligatorio:**
   ```
   <@{sender_id}> ✅ Listo.
   📄 **Pillar Page:** <{link MC}>
   📱 **Posts LinkedIn (4):** <{link MC}>
   ```
4. Si tarda >30s → update intermedio: `🔄 Trabajando en {X}...`
