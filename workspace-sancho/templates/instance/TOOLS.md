# TOOLS.md

## Discord
- Content -> tool calls to thread. Final response = NO_REPLY.
- **Agent responds:** thread-create(channelId, messageId) -> send(target=thread_id) -> NO_REPLY
- **Delegate:** sessions_spawn(agentId="[agent]", thread=true) -> NO_REPLY
- Always `target="<thread_id>"`. NEVER `threadId`. ZERO text between tool calls.

## Brand Files
- Path: `brand/{slug}/` — MC links ALWAYS with token (see `_system/mc-links-protocol.md`)
- Client: `.../mc/portal/{mcToken}/docs/{path}` | Admin: `.../mc/admin/{adminToken}/docs/brand/{slug}/{path}`
- NEVER `/mc/docs/...` without token -> 403

## Multi-Client
- `clients.json` (root). `active: false` excludes from crons.
- `./scripts/for-each-client.sh '<cmd>'` — vars: `$CLIENT_SLUG`, `$CLIENT_NAME`, `$CLIENT_GUILD`

## Integrations
- [List your integrations here: Google Workspace, Notion, Supabase, etc.]

## Lessons
- [Add tool-specific lessons learned here]

## Progress Updates
- Max 3 tool calls without update. Pattern: `Update (X/Y): progress -> next -> ETA`
