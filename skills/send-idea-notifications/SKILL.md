---
name: send-idea-notifications
description: "Consume notification queue and send to Discord #intelligence. Use when: cron fires (daily check), user asks 'send pending notifications', 'enviar notificaciones pendientes', 'check notification queue', or after idea-generation run completes. Reads brand/{slug}/idea-generation/notifications.json, sends to Discord, marks as sent."
metadata:
  author: Growth4U
  version: '1.0'
  system: SanchoCMO
  phase: Execution
  depends_on: idea-generation
  context_required:
    - brand/{slug}/idea-generation/notifications.json
    - brand/{slug}/client-config.json (for Discord channel ID)
  context_writes:
    - brand/{slug}/idea-generation/notifications.json (marks sent)
---

# Send Idea Notifications

> Consume la cola de notificaciones y envía a Discord #intelligence.

## Pipeline

```
Read notifications.json → Filter pending → Send to Discord → Mark as sent
```

---

## Step 1: Load Notifications Queue

```
For each client in clients.json where active=true:
  1. Read brand/{slug}/idea-generation/notifications.json
  2. Filter notifications where sent=false
  3. If empty → skip client
```

---

## Step 2: Send to Discord

For each pending notification:

```
1. Read brand/{slug}/client-config.json → get channels.intelligence Discord channel ID
2. If no intelligence channel configured → log warning, skip
3. Send message to Discord:
   - Use message tool, channel=discord
   - Target = intelligence channel ID
   - Message format:
     
     {emoji} **{title}**
     
     {summary}
     
     📊 **Stats**: {count} nuevas ideas ({content_count} contenido, {contact_count} contactos)
     
     🔗 **Ver en Mission Control**: {mc_link}
     
4. Mark notification as sent:
   - Update notification object: sent = true, sent_at = ISO timestamp
```

---

## Step 3: Update notifications.json

```
Write back to brand/{slug}/idea-generation/notifications.json with sent=true for processed notifications.
```

---

## Message Format Examples

> `<MC_BASE>` = host pre-resuelto que aparece en `workspace-sancho/PROTOCOLS.md` Rule 3 / `TOOLS.md` (se inyecta al arranque del container). NUNCA inventar otro hostname.


### Content ideas notification
```
💡 **Nuevas ideas de contenido**

Se generaron 12 ideas de contenido para Hospital Capilar:
- 8 keywords para rankear (SEO)
- 3 trending topics (redes sociales)
- 1 gap vs competencia

📊 **Stats**: 12 nuevas ideas (12 contenido, 0 contactos)

🔗 **Ver en Mission Control**: <MC_BASE>/portal/{token}/docs/brand/hospital-capilar/idea-generation
```

### Contact ideas notification
```
🎯 **Nuevos contactos detectados**

Se identificaron 5 oportunidades de contacto para Growth4U:
- 3 medios donde publicar
- 2 influencers para colaborar

📊 **Stats**: 5 nuevas ideas (0 contenido, 5 contactos)

🔗 **Ver en Mission Control**: <MC_BASE>/portal/{token}/docs/brand/growth4u/idea-generation
```

### Mixed notification
```
🔔 **Nuevas ideas disponibles**

Se generaron 18 ideas para Paymático:
- 10 ideas de contenido (keywords + trending)
- 8 contactos (medios + partners)

📊 **Stats**: 18 nuevas ideas (10 contenido, 8 contactos)

🔗 **Ver en Mission Control**: <MC_BASE>/portal/{token}/docs/brand/paymatico/idea-generation
```

---

## Error Handling

| Error | Action |
|-------|--------|
| notifications.json not found | Skip client, log warning |
| client-config.json missing intelligence channel | Skip client, log: "Client {slug}: No intelligence channel configured" |
| Discord send fails | Log error, do NOT mark as sent (will retry next run) |
| Empty queue | Silent skip |

---

## Self-QA

1. ¿Se procesaron TODOS los clientes activos?
2. ¿Se envió a Discord #intelligence de cada cliente (no al canal interno)?
3. ¿Se marcaron como sent=true solo las notificaciones enviadas exitosamente?
4. ¿El link de Mission Control usa el token correcto del cliente?
5. ¿Se respetó el formato de mensaje (emoji + título + stats + link)?
6. ¿Se loguearon los errores sin detener el proceso completo?

---

## Cron Configuration

Add to `openclaw cron add`:
```
Name: Send Idea Notifications
Schedule: 0 10,18 * * * (10:00 y 18:00 diario)
Agent: sancho
Task: Check and send pending idea notifications for all active clients
```

---

## Related Skills

| Skill | Relation |
|-------|----------|
| idea-generation | Produces notifications.json |
| This skill | Consumes notifications.json, sends to Discord |
