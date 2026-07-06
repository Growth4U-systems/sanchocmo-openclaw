# Source Configuration Guide

Como configurar y consultar cada fuente de datos para el Daily Pulse.

---

## 1. Slack MCP (Read-Only)

**Herramienta:** `mcp__slack` (Slack MCP tools)

**Canales recomendados para escanear:**

| Tipo de canal | Que buscar | Prioridad |
|---------------|-----------|-----------|
| #clientes / #clients | Pain points, feature requests, success stories | ALTA |
| #soporte / #support | Repeated questions, pain points | ALTA |
| #ventas / #sales | Competitive intel, objections, wins | ALTA |
| #producto / #product | Feature requests, internal friction | MEDIA |
| #general | Industry trends, team discussions | BAJA |
| #random | Serendipity (low signal, high noise) | BAJA |

**Queries de ejemplo:**

```
# Mensajes de las ultimas 24 horas en un canal
list_channel_messages(channel: "#clients", limit: 100)

# Buscar mensajes con keywords especificos
search_messages(query: "cliente pregunta", limit: 50)
search_messages(query: "problema OR bug OR no funciona", limit: 50)

# Mensajes de un canal en un rango de fechas
list_channel_messages(channel: "#support", oldest: "2026-02-20", latest: "2026-02-21")
```

**Filtros recomendados:**
- **Fecha**: Ultimas 24h para daily pulse, ultima semana para weekly pulse
- **Excluir bots**: Ignorar mensajes automaticos (webhooks, CI/CD, deploy notifications)
- **Threads**: Incluir respuestas en threads (a menudo contienen los insights mas valiosos)
- **Reacciones**: Mensajes con muchas reacciones suelen ser mas relevantes

**Tipos de mensaje a priorizar:**
1. Mensajes largos (mas de 100 caracteres) - suelen tener contexto
2. Mensajes con threads activos (discusion = relevancia)
3. Mensajes de personas clave (founders, account managers, customer success)
4. Mensajes con menciones (@here, @channel) - urgencia = importancia

---

## 2. Notion MCP

**Herramienta:** `notion-search`, `notion-fetch`, `notion-query-database-view`

**Fuentes de meeting notes:**

| Fuente | Notion DB / Location | Que extraer |
|--------|---------------------|-------------|
| Meeting notes | Buscar por "meeting" o "reunion" | Decisions, action items, client feedback |
| Sprint retros | Buscar por "retro" o "sprint" | Internal friction, process improvements |
| Client pages | `01-business/clients/` | Recent updates, session notes |
| Task comments | Task databases | Context on blockers, decisions |

**Queries de ejemplo:**

```
# Buscar meeting notes recientes
notion-search(query: "meeting notes", filter: { property: "object", value: "page" })

# Obtener contenido de una pagina especifica
notion-fetch(url: "https://notion.so/page-id")

# Buscar por fecha (ultimas 24-48h)
notion-search(query: "reunion", sort: { direction: "descending", timestamp: "last_edited_time" })

# Query a base de datos de tareas (filtrar por fecha)
notion-query-database-view(
  database_id: "TASK_DB_ID",
  filter: {
    property: "Last edited time",
    date: { on_or_after: "2026-02-20" }
  }
)
```

**Que extraer de meeting notes:**
- **Decisions**: "Decidimos que...", "Se acordo...", "Action: ..."
- **Client feedback**: Cualquier frase atribuida al cliente
- **Blockers**: "Bloqueado por...", "Esperando...", "Pending..."
- **Next steps**: Action items asignados
- **Quotes textuales**: Las mas valiosas para content — entrecomillar siempre

**Filtros:**
- Solo paginas editadas en las ultimas 24-48h
- Priorizar paginas de clientes activos
- Excluir templates y paginas de sistema

---

## 3. Google Meet / Zoom Transcripts

**Herramienta:** `search_drive_files`, `get_drive_file_content` (Google Workspace MCP)

**Donde encontrar transcripts:**

| Plataforma | Ubicacion en Drive | Formato |
|-----------|-------------------|---------|
| Google Meet | "My Drive/Meet Recordings/" o carpeta del calendario | .txt, .vtt, .sbv |
| Zoom | Depende de configuracion (normalmente "Zoom/" en Drive) | .vtt, .txt |
| Otter.ai | Exportado a Drive o via API | .txt, .md |
| Manual | Upload directo a Drive | Cualquier formato texto |

**Queries de ejemplo:**

```
# Buscar transcripts recientes en Drive
search_drive_files(query: "transcript OR transcripcion", orderBy: "modifiedTime desc")

# Buscar recordings de Meet
search_drive_files(query: "mimeType='text/plain' and modifiedTime > '2026-02-20'")

# Buscar por nombre de reunion
search_drive_files(query: "name contains 'Weekly' and mimeType='text/plain'")

# Leer contenido del transcript
get_drive_file_content(fileId: "FILE_ID")
```

**Procesamiento de transcripts:**
1. **Dividir por speaker**: Identificar quien dice que
2. **Extraer highlights**: Frases con senales de insight (ver insight-categories.md)
3. **Ignorar small talk**: Filtrar saludos, despedidas, "me oyes?", etc.
4. **Buscar action items**: "Vamos a...", "Hay que...", "Para la proxima..."
5. **Marcar quotes**: Atribuir insights al speaker (importante para credibilidad)

---

## 4. Manual Input

**Cuando usar:** El usuario puede pegar directamente conversaciones, notas o fragmentos.

**Formatos aceptados:**

```
# Texto libre
"Ayer en la call con Monzo, el cliente dijo que el onboarding
es confuso y que 3 de sus usuarios abandonaron en el paso 2."

# Formato estructurado
Source: Call with Monzo (2026-02-20)
Speaker: Product Manager
Quote: "El onboarding es confuso, 3 usuarios abandonaron en paso 2"
Context: Weekly sync, discussing activation metrics

# Bullet points
- Monzo PM: onboarding confuso, 3 abandonos paso 2
- Example CEO: quiere dashboard de analytics
- FellowFunders: preguntan si hay API de reportes

# Copy-paste de chat
[10:30] Juan: Oye, el cliente de Example dice que no entiende el pricing
[10:32] Maria: Si, es la tercera vez esta semana que preguntan lo mismo
[10:33] Juan: Deberiamos hacer una FAQ o algo
```

**Instrucciones para el usuario:**

```
Para input manual, puedes:

1. Pegar texto tal cual — el skill lo clasificara
2. Indicar la fuente: "De la call con [Cliente]"
3. Mezclar fuentes: "De Slack + meeting de hoy"
4. Pegar screenshots — Claude los puede leer

Cuanto mas contexto des (quien, cuando, donde), mejor
sera la clasificacion y el content idea generado.
```

---

## Configuracion Recomendada

### Daily Pulse (Diario)

```
sources:
  slack:
    channels: ["#clients", "#support", "#sales"]
    timeframe: "last 24h"
    min_message_length: 50
  notion:
    search: "meeting notes, reunion, sync"
    timeframe: "last 24h"
  transcripts:
    search: "transcript"
    timeframe: "last 24h"
  manual: optional
```

### Weekly Pulse (Semanal)

```
sources:
  slack:
    channels: ["#clients", "#support", "#sales", "#product", "#general"]
    timeframe: "last 7 days"
    min_message_length: 30
  notion:
    search: "meeting notes, retro, sprint, sync"
    timeframe: "last 7 days"
  transcripts:
    search: "transcript, recording"
    timeframe: "last 7 days"
  manual: optional
```

### Ad-hoc (Post-Meeting)

```
sources:
  manual: required (paste transcript or notes)
  notion: optional (if notes already in Notion)
  slack: skip
  transcripts: optional
```

---

## Tool Detection Matrix

| Herramienta | Disponible | Modo |
|-------------|-----------|------|
| Slack MCP + Notion MCP + Google Workspace MCP | Si | FULL — automated scan de todas las fuentes |
| Notion MCP + Google Workspace MCP (sin Slack) | Si | PARTIAL — sin Slack, manual input para chat |
| Solo Google Workspace MCP | Si | LIGHT — transcripts only, rest is manual |
| Ninguna MCP | Si | MANUAL — user pega todo el input |

En cualquier modo, el skill funciona. Solo cambia el grado de automatizacion.
