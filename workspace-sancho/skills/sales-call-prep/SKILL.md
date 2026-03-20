---
name: sales-call-prep
description: "Prepares call briefings: weekly overview on Fridays + daily detail the night before. For each call: time, lead summary, meeting objective. Triggers: 'prep calls', 'llamadas de mañana', 'llamadas de la semana', 'call prep'."
user-invocable: true
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '2.0'
  system: SanchoCMO
  phase: Encuentra
  pillar: lead-tracking
  layer: 0+4
  depends_on: [lead-intelligence-hub]
  updated: '2026-03-20'
context_required:
  - brand/{slug}/lead-tracking-config.json
  - brand/{slug}/leads/
context_writes: []
---

# Sales Call Prep

> Dos avisos: viernes = resumen semanal, cada noche = detalle de mañana.

## Prerequisites

**Tools needed:**
- **Google Calendar** (`gog calendar`) — leer eventos
- **Discord** (`message()`) — enviar briefing
- **GHL API** — datos operativos del lead (notas Slack, pipeline stage)
- Archivos de leads en `brand/{slug}/leads/` (inteligencia generada por @lead-intelligence-hub)

## Dos modos de ejecución

### Modo 1: Briefing diario (cada noche, domingo a jueves)

Llamadas de **mañana** con detalle completo.

### Modo 2: Resumen semanal (viernes)

Llamadas de **lunes a viernes de la semana siguiente** en vista panorámica.

---

## Step 1: Get All Lead Names from GHL

Primero, obtener TODOS los contactos de GHL:
```
GET https://services.leadconnectorhq.com/contacts/?locationId={id}&limit=100
Headers: Authorization: Bearer $GROWTH4U_GHL_API_KEY, Version: 2021-07-28
```
Paginar si hay más de 100. Extraer lista de nombres: `{firstName} {lastName}` de cada contacto.

## Step 2: Search Calendar for Leads

**Diario:** eventos de mañana (00:00 a 23:59)
**Semanal (viernes):** eventos de lunes a viernes de la semana siguiente

Usar `gog calendar upcoming` o Google Calendar API:
```
GET https://www.googleapis.com/calendar/v3/calendars/primary/events
Params:
  timeMin={start_UTC}
  timeMax={end_UTC}
  singleEvents=true
  orderBy=startTime
```

Para cada evento, comprobar si el **título o algún attendee** contiene alguno de los nombres de la lista de leads de GHL. Solo incluir en el briefing los eventos que matchean con un lead.

El match es fuzzy: ignorar acentos, case-insensitive, nombre parcial OK (ej: "Juan" matchea con "Juan Pérez").

## Step 3: Enrich with GHL Data + Intelligence

Para cada evento que matchea con un lead:

1. Del contacto GHL correspondiente extraer: pipeline stage, notas Slack (`slack_notes` custom field), tags, empresa
2. Buscar inteligencia adicional en `brand/{slug}/leads/{ghl_id}.md` (company research, transcripts)
3. Si el lead file no existe → usar solo datos de GHL

## Step 3: Build Briefing

Para cada llamada, generar:

### A) Hora y datos básicos
- Hora de la reunión
- Nombre del lead + empresa (de GHL)
- Pipeline stage actual

### B) Resumen del lead
Combinar info de GHL + leads/{id}.md para responder: **¿Qué hablamos la última vez?**
- Leer `slack_notes` de GHL → extraer la última nota con fecha
- Leer Call Transcripts de leads/{id}.md → pain points y key quotes de la última llamada
- Si no hay historial previo → indicar "Primera interacción"

### C) Objetivo de la reunión
Inferir el objetivo según:
- El título del evento en Calendar (a veces dice "Demo", "Follow-up", "Propuesta", etc.)
- El pipeline stage en GHL (si es "new" → discovery, si es "proposal" → cierre, etc.)
- El contexto de las últimas notas (si dijeron "quiero ver pricing" → la reunión es para presentar propuesta)

## Step 4: Send Briefing

### Formato diario (llamadas de mañana):

```
📞 LLAMADAS DE MAÑANA — {date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 {time} — {name} ({company})
   Estado: {pipeline_stage}

   📋 Última vez: {resumen de qué se habló, 2-3 líneas}

   🎯 Objetivo: {qué queremos lograr en esta reunión}

   📄 Perfil: brand/growth4u/leads/{ghl_id}.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Formato semanal (viernes, semana siguiente):

```
📅 LLAMADAS SEMANA {date_range}

Lunes:
  10:00 — Juan Pérez (TechCorp) — Follow-up demo
  16:00 — María López (StartupXYZ) — Primera call

Martes:
  (sin llamadas)

Miércoles:
  11:00 — Carlos García (AgenciaABC) — Propuesta

Total: {count} llamadas programadas
```

### Publicar en Discord (patrón de hilo):
1. `message(action=send, channel=discord, target=1477741644789842031, message="📞 {título}: {count} llamadas")`
2. Capturar `messageId` → `message(action=thread-create, ...threadName="📞 Call Prep — {date}")`
3. Capturar `threadId` → `message(action=send, target={threadId}, message="{briefing_completo}")`

## Step 5: Log

Actualizar `memory/heartbeat-state.json`:
```json
{
  "sales_call_prep": {
    "last_run": "2026-03-20T22:30:00Z",
    "mode": "daily",
    "calls_found": 2,
    "no_ghl_match": 0
  }
}
```

## No Calls?

**Diario:** "📞 No hay llamadas programadas para mañana ({date})."
**Semanal:** "📅 No hay llamadas programadas para la semana del {date_range}."

## Error Handling

- Calendar API error → log en heartbeat-state, notificar en Discord
- GHL contact no encontrado → incluir en briefing con datos del evento solo
- leads/{id}.md no existe → briefing con datos de GHL solamente (sin inteligencia extra)
- Discord send falla → retry 1x, log error
