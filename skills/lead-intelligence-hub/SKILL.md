---
name: lead-intelligence-hub
description: "Syncs leads from GHL, enriches new leads with company research and contact data, updates existing leads with latest GHL state and call transcripts. Run nightly via heartbeat or manually. Triggers: 'sync leads', 'lead intelligence', 'enrich leads', 'update lead profiles'."
user-invocable: true
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra
  pillar: lead-tracking
  layer: 0+4
  depends_on: [company-finder, contact-enrichment]
  chains_to: [sales-call-prep]
  updated: '2026-03-20'
context_required:
  - brand/{slug}/lead-tracking-config.json
context_writes:
  - brand/{slug}/leads/
---

# Lead Intelligence Hub

> Syncs GHL contacts → enriches new leads → updates existing leads nightly.

## Prerequisites

**Tools needed:**
- **GHL API** — `$GHL_API_KEY` en `.env`, endpoint `https://services.leadconnectorhq.com`
- **Slack MCP** (`mcp__slack`) — leer notas de threads del canal de leads
- **Google Workspace** (`gog`) — buscar transcripts en Drive
- **Apollo.io** — enrichment de contacto (via @contact-enrichment)
- **Web search** — company research (via @company-finder)

## Config

Lee `brand/{slug}/lead-tracking-config.json`:
```json
{
  "ghl_location_id": "BnXWP5dcLVMgUudLv10O",
  "ghl_api_key_env": "GHL_API_KEY",
  "slack_channel_id": "C097N5EJGTB",
  "drive_recordings_folder": "Supabase Recordings",
  "lead_sync_enabled": true,
  "ghl_custom_field_ids": {
    "slack_notes": "",
    "last_slack_sync": "",
    "lead_source_channel": ""
  }
}
```

## Execution Flow

### Phase 1: Fetch contacts from GHL

1. Lee `brand/{slug}/lead-tracking-config.json`
2. Llama a la GHL API para obtener todos los contactos:

```
GET https://services.leadconnectorhq.com/contacts/
Headers:
  Authorization: Bearer $GHL_API_KEY
  Version: 2021-07-28
Params:
  locationId={ghl_location_id}
  limit=100
```

Paginar con `startAfter` si hay más de 100 contactos.

3. Para cada contacto, comprobar si existe `brand/{slug}/leads/{ghl_id}.md`

### Phase 2: Slack Notes → GHL

Para CADA contacto con threads en Slack:

1. **Buscar mensajes del lead en Slack** usando `mcp__slack`:
```
search_messages(query: "{email} OR {phone} OR {firstName} {lastName}", limit: 20)
```

2. **Leer threads con notas** — para cada mensaje que sea parent de un thread:
```
list_channel_messages(channel: "{slack_channel_id}", oldest: "{last_sync_timestamp}")
```

3. **Formatear notas con fecha** — cada reply del thread se convierte en:
```
[YYYY-MM-DD] {texto del reply}
```

4. **Escribir a GHL custom field** (acumulativo, append):
```
PUT https://services.leadconnectorhq.com/contacts/{contactId}
Headers:
  Authorization: Bearer $GHL_API_KEY
  Version: 2021-07-28
  Content-Type: application/json
Body:
{
  "customFields": [
    {"id": "{slack_notes_field_id}", "field_value": "{existing_notes}\n{new_notes}"},
    {"id": "{last_slack_sync_field_id}", "field_value": "{ISO_timestamp}"}
  ]
}
```

⚠️ **Custom fields usan formato array-of-objects**, NO dict.

### Phase 3: New Lead — Full Enrichment

Para contactos SIN archivo `leads/{ghl_id}.md`:

1. **Company Research** (targeted mode):
   - Extraer company name/domain de los campos del contacto GHL
   - Ejecutar @company-finder en modo targeted: buscar solo por nombre/dominio de empresa
   - NO usar búsqueda por ICP (ya tenemos el contacto)
   - Guardar intel en el archivo del lead

2. **Contact Enrichment** (gap-filling):
   - Ejecutar @contact-enrichment solo para datos que faltan:
     - Email no verificado → verificar via Hunter/Apollo
     - Teléfono missing → probar SignalHire
     - LinkedIn missing → probar Apollo
   - Si todos los campos están completos → skip enrichment

3. **Transcript Search** via Google Workspace:
```
gog drive search "nombre del lead" --folder="Supabase Recordings"
```
   - Si encuentra transcripts: leer contenido con `gog drive read {fileId}`
   - Resumir con LLM: pain points, next steps, key quotes
   - Incluir link de Drive en el archivo del lead

4. **Crear archivo de lead**: `brand/{slug}/leads/{ghl_id}.md`

### Phase 4: Existing Lead — Update Intelligence

Para contactos CON archivo `leads/{ghl_id}.md`:

1. Buscar nuevos transcripts en Drive (por fecha vs `last_enriched`)
2. Si hay nuevos transcripts → resumir y añadir a sección Call Transcripts
3. Actualizar frontmatter: `last_enriched`
4. NO duplicar datos de GHL — pipeline stage, notas, contacto se leen siempre de GHL en tiempo real

### Phase 5: Summary

Guardar resumen en `memory/heartbeat-state.json`:
```json
{
  "lead_sync": {
    "last_run": "2026-03-20T23:00:00Z",
    "new_leads": 3,
    "updated_leads": 15,
    "slack_notes_synced": 8,
    "errors": 0
  }
}
```

Publicar resumen vía el endpoint server-side (transport-agnostic; resuelve transporte y canal desde `client-config.json` → `crons.lead_intelligence.publish_transport`/`publish_channel`, Slack por defecto — NO hardcodees IDs ni asumas Discord):

1. Leé el `adminToken` de la RAÍZ de `~/.openclaw/workspace-sancho/clients.json`.
2. `POST http://localhost:3000/api/integrations/publish`
   Headers: `Content-Type: application/json`, `x-admin-token: <adminToken>`
   Body: `{"slug": "{slug}", "cronKey": "lead_intelligence", "title": "📊 Lead Sync — {date}: {new_leads} nuevos, {updated} actualizados, {slack_notes} notas sincronizadas", "body": "<detalle del sync>"}`
3. El endpoint postea `title` como raíz y `body` en el hilo. Devuelve `{ok, rootId, threadId}`; si `ok=false` o status 4xx/5xx, reportá el error y no reintentes a ciegas.

## Lead File Template

> Solo inteligencia que NO está en GHL. Datos operativos (email, teléfono, pipeline stage, notas Slack) se leen siempre de GHL en tiempo real.

```markdown
---
ghl_id: {id}
last_enriched: {now}
enrichment_pending: false
---

## Company Intelligence
{company-finder output — sector, tamaño, producto, competidores, funding}

## Contact Enrichment
{datos encontrados por contact-enrichment que NO estaban en GHL: LinkedIn verificado, email secundario, etc.}

## Call Transcripts
### {date} — {call_title}
- **Pain points**: {extracted}
- **Next steps**: {extracted}
- **Key quotes**: {extracted}
- 🔗 [Transcript en Drive]({drive_link})
```

## Error Handling

- GHL API error → log, skip contacto, continuar con el siguiente
- Company research falla → crear lead file sin sección company, marcar `enrichment_pending: true`
- Drive search falla → crear lead file sin transcripts, log warning
- Slack MCP no disponible → skip sync de notas, log warning
- Todos los errores se logean en `memory/heartbeat-state.json`
