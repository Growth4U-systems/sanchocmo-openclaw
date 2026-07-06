# Plan — Rich progress streaming en el chat de MC

Estado: borrador, pendiente de aprobación.
Fecha: 2026-05-08.
Origen: el usuario quiere que el chat de Mission Control le explique en vivo
qué está haciendo el agente (tool calls, archivos escritos, agentes a los que
delega, etc.), del mismo modo que el gateway de OpenClaw lo hace cuando se le
habla por su CLI. Hoy MC sólo recibe un `role: "status"` ocasional con un
texto libre tipo "Sancho está pensando…".

---

## 1. Contexto actual

- **Webhook** `POST /api/chat/webhook` (`src/pages/api/chat/webhook.ts`)
  acepta dos roles:
  - `role: "status"` → cachea `{text, agent, ts}` en memoria (pisa el anterior).
  - default (bot) → escribe un mensaje final con `addMessage()`.
- **Polling** del cliente cada 1.5–3s (`useThreadMessages`) trae
  `{messages, status}`. El indicador de typing usa `statusData.text` cuando
  existe; si no, muestra el i18n key `thinking`.
- **El plugin del gateway** (paquete `openclaw` vendored en `~/.openclaw/node_modules`/
  `~/.npm/_npx/.../openclaw`) es el responsable de llamar al webhook. Hoy
  emite typically uno o dos `status` por respuesta y luego el bot final.
- **No hay timeline persistente**: cada `status` pisa al anterior, no se
  almacena en `thread.messages` ni se ve después de que llegue el bot final.
  Todo lo que pasó "por dentro" se pierde.

## 2. Objetivo

Que durante la respuesta de un agente, el usuario vea una lista colapsable
encima (o dentro) del mensaje final con los pasos concretos del agente:

- 🔧 `tool_call` — nombre de la herramienta + arg resumido
- 📝 `file_write` — path relativo escrito/modificado
- 🤝 `agent_handoff` — Sancho llama a Escudero, Hamete, etc.
- 🔍 `search` / `read` — para herramientas read-only típicas
- 💬 `thinking` — texto libre del agente (lo que ya existe hoy como `status`)

El stream debe ser **append-only durante la sesión y persistente con el
mensaje final**, no efímero. Una vez terminada la respuesta, el panel de
pasos se colapsa (chevron) y queda anclado al mensaje del bot.

## 3. Cambios propuestos

### 3.1 Protocolo del webhook (server-side)

Extender `POST /api/chat/webhook` para aceptar un nuevo rol:

```ts
{
  role: "progress",
  threadId: "<slug:short>",
  agent: "escudero",
  ts: 1746729130000,
  event: {
    kind: "tool_call" | "file_write" | "agent_handoff" | "search" | "read" | "thinking",
    label: "ContentTask draft writer",   // texto cortito para mostrar
    detail?: string,                     // opcional, mostrado al expandir
    target?: string,                     // path / agent / herramienta
  }
}
```

- **Persistencia**: por simplicidad, los progress events se acumulan en el
  thread (en disco) bajo una clave nueva `pendingProgress: ProgressEvent[]`.
  Cuando llega el bot final, se "sella" copiando ese array al campo
  `progress` del propio mensaje y vaciando el pending. Así sobreviven al
  reload.
- **Cap**: limitar pendingProgress a, p.ej., 200 eventos por turno para
  evitar abusos.
- **Compatibilidad**: `role: "status"` se mantiene como sinónimo de
  `kind: "thinking"` para no romper el plugin actual.

Archivos a tocar:

- `src/lib/data/mc-chat.ts` — añadir `appendProgress(threadId, event)`,
  `sealProgress(threadId)` y tipo `ProgressEvent`. Modificar
  `ThreadData['messages'][i]` para aceptar un campo opcional
  `progress?: ProgressEvent[]`.
- `src/pages/api/chat/webhook.ts` — branch nuevo `if (role === "progress")`.
  En el path de bot final, llamar `sealProgress()` antes de `addMessage()` y
  pasar el array como nuevo arg.
- `src/pages/api/chat/thread/[threadId].ts` — devolver
  `pendingProgress` además de `status` y `messages` para que el cliente
  pueda renderizar lo que va en curso.

### 3.2 Plugin del gateway (cliente del webhook)

Esto vive **fuera de MC** (paquete `openclaw`). Hay que:

1. Localizar el código del plugin `mc-chat` (probablemente en
   `~/.npm/_npx/.../openclaw/dist/`). Si está minificado, buscar el
   repo fuente — el README/changelog del paquete debería apuntar a él.
2. Identificar el wrapper que envuelve la conversación con el agente y
   donde Claude hace tool calls. Si usan el SDK de Anthropic o el CLI
   de Claude Code, hay hooks de tool_use / tool_result.
3. En ese punto, emitir un `POST /api/chat/webhook` con `role: "progress"`
   por cada evento — tool_use → kind="tool_call", Write/Edit →
   kind="file_write", Task → kind="agent_handoff", etc.
4. Mantener el debounce/batch razonable (no más de ~2 eventos/segundo)
   para no inundar al webhook.

**Tradeoff clave**: si el plugin es de Anthropic / un upstream que no
controlamos del todo, considerar mantener un **fork local** o un shim
intermedio. Documentar en `~/.openclaw/MIGRATION-PENDING.md`.

### 3.3 UI (cliente)

Renderizar el timeline en `chat-sidebar.tsx`:

- **Durante la respuesta** (`isAwaitingReply`): mostrar el indicador
  actual de typing pero, debajo de él, una lista vertical de los
  `pendingProgress` (más reciente abajo). Cada entrada con icono por
  `kind`, label y badge del agente. Estilo "log line" sutil — italic,
  text-xs, color de fondo apagado.
- **Después de la respuesta**: mover el timeline al propio mensaje del
  bot final como un `<details>` colapsable ("▾ 7 pasos"), expandible
  para ver todo. Por defecto colapsado salvo que el usuario tenga
  preferencia "siempre expandido" (config opcional, fase 2).
- **Auto-scroll**: cada nuevo evento debe hacer scroll al final si el
  usuario no ha scrolleado manualmente hacia arriba.

Archivos:

- `src/hooks/useChat.ts` — ampliar el tipo de la respuesta de
  `useThreadMessages` para incluir `pendingProgress` y el `progress`
  por mensaje.
- `src/components/chat/chat-sidebar.tsx` — nuevo componente
  `<ProgressTimeline events={…} mode="live" | "sealed" />` y dos
  puntos de uso (live encima del typing indicator, sealed dentro
  del mensaje del bot).

### 3.4 Telemetría / sanity checks

- Log `[mc-chat] progress event {kind} for {threadId}` con throttle a
  un cada N para no saturar logs.
- Métrica simple: contar eventos por respuesta — si pasa de 200
  cortar y avisar (probable bug del plugin).

## 4. Fases

1. **Fase 0 — Diseño cerrado** (este doc, 1 sesión). Aprobar el shape
   del evento y el lugar donde vive el timeline (encima vs. dentro del
   mensaje final).
2. **Fase 1 — Server + UI sin plugin real** (1 sesión). Implementar
   3.1 y 3.3. Para probar, escribir un script `scripts/fake-progress.ts`
   que dispare eventos contra el webhook con `curl` cada 500ms. Ver
   que el timeline aparece, persiste y se colapsa.
3. **Fase 2 — Plugin gateway** (1–2 sesiones, depende de qué tan
   accesible sea el código del plugin). Hookear los tool_use reales y
   probar con un thread real de Sancho.
4. **Fase 3 — Pulido** (0.5 sesión). Auto-scroll, colapsado por
   defecto, badges por kind, traducciones, accesibilidad.

## 5. Riesgos / preguntas abiertas

- **¿Vivo el código del plugin?** Si está sólo en el `dist/`
  minificado del npm package, hay que decidir si forkeamos o si
  pedimos al upstream (Anthropic / autor del plugin) un hook
  oficial. La fase 2 depende de esto.
- **Persistencia vs. ruido**: ¿queremos guardar TODOS los eventos
  para siempre? Probablemente no — un thread con 50 respuestas
  largas crecería mucho. Posible salida: cap a 50 eventos por
  mensaje sealed, o un toggle por usuario.
- **Threads viejos sin progress**: el campo `progress` será
  `undefined` para mensajes anteriores; UI debe tolerar.
- **Cancelación**: cuando el usuario pulsa el botón rojo, hay que
  vaciar `pendingProgress` también (igual que `clearStatus`).

## 6. No-objetivos (por ahora)

- No es un panel de "¿qué hacen los agentes globalmente?". Es por
  thread.
- No es un sistema de re-play / time-travel. Sólo añadir contexto al
  mensaje final.
- No es streaming token-a-token de la respuesta del agente (eso
  sería un proyecto distinto y mucho más caro).
