# Publish Protocol — Cron Outputs (transport-agnostic)

> Regla: TODO output de cron que publique a un canal DEBE hacerlo vía el endpoint server-side
> `POST /api/integrations/publish`. NUNCA con tools de canal (Discord/Slack) directos, NUNCA con
> IDs de canal hardcodeados. El transporte y el canal salen de la config del cliente.

## Por qué un endpoint y no el tool de canal

- El canal y el transporte (Slack hoy; Discord/Telegram en el futuro) se resuelven desde
  `client-config.json` → `crons.<cronKey>.publish_transport` / `publish_channel` (Slack por defecto).
  Así "a qué chat publica cada cron" es **configurable por cron**, no código.
- El tool de canal de Slack reporta erróneamente falta de scope (bug conocido); el endpoint maneja el
  posteo y el formateo de forma consistente.

## Patrón obligatorio

### Paso 1: Leer el adminToken
Leé el `adminToken` de la RAÍZ de `~/.openclaw/workspace-sancho/clients.json` (campo `adminToken`, al
mismo nivel que `clients`). Si falta, ABORTÁ reportando el error.

### Paso 2: POST al endpoint
```
POST http://localhost:3000/api/integrations/publish
Headers: Content-Type: application/json, x-admin-token: <adminToken>
Body: {
  "slug": "<slug>",
  "cronKey": "<cronKey>",          // ej: daily_pulse, weekly_synthesis, idea_generation
  "title": "<emoji> <Título> — YYYY-MM-DD: <resumen de 1 línea>",
  "body": "<contenido completo>"
}
```
- `title` = mensaje raíz: máximo 1-2 líneas, con emoji identificador (📊, 🧠, 📚, ⚠️, 🔍), fecha y el
  dato más relevante. Debe ser **informativo por sí solo**.
- `body` = se postea en el hilo bajo la raíz (en transportes con hilos; los que no tienen hilo lo
  concatenan). NUNCA pongas el contenido largo en `title`.

### Paso 3: Manejar el resultado
El endpoint devuelve `{ ok, rootId, threadId, transport, channel }`. Si `ok=false` o status 4xx/5xx,
reportá el `error` y no reintentes a ciegas. Si la respuesta trae skipped:true, el cron no tiene canal configurado: NO es un error — mencionalo brevemente y seguí.

## Reglas

1. **NUNCA** hardcodees un ID de canal ni asumas Discord — todo sale de `client-config.json`.
2. El `title` debe dar contexto en 1 línea; el detalle va en `body` (hilo).
3. Si no hay contenido relevante (ej: Meeting Intelligence sin reuniones nuevas), publicá igual con un
   `body` corto informando que no hay novedades.
4. Aplica siempre `_system/governance/client-context-isolation.md`.

## Extender a otros transportes (Discord / Telegram)

El endpoint usa un **registry de transportes** (`src/lib/publish/registry.ts`). Hoy solo `slack` está
registrado. Para sumar otro: implementá la interfaz `Transport` (`src/lib/publish/types.ts`) en
`src/lib/publish/<name>.ts` y registralo. Las skills y los crons no cambian — solo la config del
cliente (`publish_transport`) elige el transporte.
