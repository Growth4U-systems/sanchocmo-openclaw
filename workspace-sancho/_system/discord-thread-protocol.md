# Discord Thread Protocol — Cron Outputs

> Regla: TODO output de cron que publique en Discord DEBE usar hilos. Sin excepción.

## Patrón Obligatorio

Cuando un cron (o cualquier proceso automatizado) necesite publicar contenido en un canal de Discord:

### Paso 1: Mensaje corto al canal
```
message(action=send, channel=discord, target=<channelId>, message='<emoji> <Título> — YYYY-MM-DD: <resumen de 1 línea>')
```
- Máximo 1-2 líneas
- Incluir emoji identificador (📊, 🧠, 📚, ⚠️, 🔍)
- Incluir la fecha
- Incluir el insight/dato más relevante

### Paso 2: Capturar messageId
Del resultado del `send`, extraer el `messageId` devuelto.

### Paso 3: Crear hilo desde ese mensaje
```
message(action=thread-create, channel=discord, target=<channelId>, messageId=<messageId>, threadName='<emoji> <Título> — YYYY-MM-DD')
```

### Paso 4: Capturar threadId
Del resultado del `thread-create`, extraer el `threadId` devuelto.

### Paso 5: Publicar contenido completo en el hilo
```
message(action=send, channel=discord, target=<threadId>, message=<contenido completo>)
```

## Reglas

1. **NUNCA** publiques contenido largo directamente en un canal
2. El mensaje del canal debe ser **informativo por sí solo** (1 línea que dé contexto)
3. Si no hay contenido relevante (ej: Meeting Intelligence sin reuniones nuevas), envía solo el mensaje corto informando que no hay novedades — sin crear hilo
4. Para alertas cortas (healthcheck, backup), sigue el mismo patrón: alerta en canal, detalles en hilo
5. Aplica siempre `_system/client-context-isolation.md`

## Crons afectados

| Cron | Canal | Emoji |
|------|-------|-------|
| Daily Pulse | #intelligence | 📊 |
| Meeting Intelligence | #intelligence | 🧠 |
| Weekly Synthesis | #learning | 📚 |
| Healthcheck (fallo) | #admin | ⚠️ |
| Backup (fallo) | #admin | ⚠️ |
| Cervantes observa (urgente) | #admin | 🔍 |
| Thief Marketers (futuro) | TBD | 🕵️ |

## Fecha de implementación
2026-03-01 — T-041
