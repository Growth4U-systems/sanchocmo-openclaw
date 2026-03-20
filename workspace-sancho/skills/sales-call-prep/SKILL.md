---
name: sales-call-prep
description: "Prepares daily sales call briefings with personalized scripts. Reads tomorrow's calls from Google Calendar, matches with enriched lead profiles, personalizes the generic Notion sales script, sends briefing via Discord. Triggers: 'prep calls', 'sales briefing', 'call prep', 'llamadas de mañana'."
user-invocable: true
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra
  pillar: lead-tracking
  layer: 0+4
  depends_on: [lead-intelligence-hub]
  updated: '2026-03-20'
context_required:
  - brand/{slug}/lead-tracking-config.json
  - brand/{slug}/leads/
context_writes:
  - brand/{slug}/leads/
---

# Sales Call Prep

> Briefing nocturno con las llamadas de mañana, contexto completo y scripts personalizados.

## Prerequisites

**Tools needed:**
- **Google Calendar** (`gog calendar`) — leer eventos de mañana
- **Notion MCP** (`mcp__notion`) — leer sales script genérico
- **Discord** (`message()`) — enviar briefing al canal
- **GHL API** — datos de contacto si el lead file está incompleto
- Archivos de leads en `brand/{slug}/leads/` (generados por @lead-intelligence-hub)

## Config

Lee `brand/{slug}/lead-tracking-config.json`:
- `notion_sales_script_page`: ID de la página de Notion con el sales script genérico
- `slack_channel_id`: Canal donde enviar el briefing (también se publica en Discord)

## Execution Flow

### Step 1: Get Tomorrow's Calendar Events

Usar `gog calendar upcoming` o la Google Calendar API directamente:

```
GET https://www.googleapis.com/calendar/v3/calendars/primary/events
Params:
  timeMin={tomorrow_00:00_UTC}
  timeMax={tomorrow_23:59_UTC}
  singleEvents=true
  orderBy=startTime
```

Filtrar solo eventos que parecen llamadas de ventas:
- Título contiene: "call", "llamada", "demo", "intro", "reunión", "meeting"
- Tiene attendees externos (no @growth4u.io)

Extraer: hora, título, nombres de attendees.

### Step 2: Match Events to Lead Profiles

Para cada evento del calendario:

1. Extraer nombre del lead del título o de los attendees
2. Buscar en `brand/{slug}/leads/` el archivo que coincida:
   - Comparar nombre del frontmatter (`name:`) con el nombre del evento
   - Fuzzy match: ignorar acentos, case-insensitive, permitir orden inverso
3. Si no hay match → incluir en el briefing con "⚠️ Sin perfil encontrado"

### Step 3: Read Generic Sales Script

Leer la página de Notion con el script genérico:

```
notion-fetch(url: "https://notion.so/{notion_sales_script_page}")
```

Parsear el contenido como template base del script.

Si `notion_sales_script_page` está vacío o Notion no responde → usar script fallback:
```
1. Apertura: saludo + referencia a última interacción
2. Contexto: "Vi que en [empresa] están trabajando en..."
3. Discovery: 3 preguntas abiertas sobre pain points
4. Propuesta de valor: cómo Growth4U ayuda con [problema específico]
5. Cierre: siguiente paso concreto
```

### Step 4: Personalize Script per Lead

Para cada lead con perfil encontrado, generar script personalizado usando el contexto del lead file:

**Input al LLM:**
- Company Intelligence (sector, tamaño, producto)
- Interaction History completa
- Pain points de llamadas anteriores (sección Call Transcripts)
- Pipeline stage actual
- Script genérico como template

**Output — script personalizado con:**
- **Apertura**: Referencia a la última interacción o detalle específico de la empresa
- **Preguntas discovery**: Adaptadas a lo que NO sabemos aún
- **Ángulo de valor**: Basado en su industria/pain points
- **Manejo de objeciones**: Basado en concerns de llamadas previas
- **Cierre/Next step**: Apropiado para el stage actual del pipeline

### Step 5: Generate and Send Briefing

Formato del briefing:

```
📞 LLAMADAS DE MAÑANA — {date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 {time} — {name} ({company})
   Estado: {pipeline_stage}
   Última interacción: {days_ago} días ({type})

   📋 Contexto:
   {2-3 sentences resumen del lead file}

   🎯 Script personalizado:
   - Apertura: {opening}
   - Preguntas clave: {key_questions}
   - Ángulo de valor: {value_angle}
   - Cierre: {close}

   🔗 Perfil: brand/{slug}/leads/{ghl_id}.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Publicar en Discord** (patrón obligatorio de hilo):
1. `message(action=send, channel=discord, target="{intelligence_channel}", message="📞 Llamadas de mañana — {date}: {count} calls")`
2. Capturar `messageId` del resultado
3. `message(action=thread-create, channel=discord, target="{intelligence_channel}", messageId="{messageId}", threadName="📞 Call Prep — {date}")`
4. Capturar `threadId`
5. `message(action=send, channel=discord, target="{threadId}", message="{briefing_completo}")`

### Step 6: Log Execution

Actualizar `memory/heartbeat-state.json`:
```json
{
  "sales_call_prep": {
    "last_run": "2026-03-20T23:30:00Z",
    "calls_prepped": 2,
    "no_profile_found": 0
  }
}
```

## No Calls Tomorrow?

Si no hay eventos que coincidan, enviar mensaje breve:
```
📞 No hay llamadas programadas para mañana ({date}).
Leads activos sin seguimiento reciente: {count}
```

Contar leads activos = archivos en `brand/{slug}/leads/` cuyo `last_updated` > 7 días.

## Error Handling

- Calendar API error → skip, log en heartbeat-state, notificar en Discord
- Notion page no encontrada → usar script fallback genérico (Step 3)
- Lead profile missing → incluir en briefing con warning, usar solo datos básicos de GHL
- Discord send falla → retry 1x, log error
