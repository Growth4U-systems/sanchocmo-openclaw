# Lead Tracking System — Growth4U

## Qué hace

Sistema automático que mantiene GHL actualizado con notas de Slack, enriquece leads nuevos con inteligencia de empresa y transcripts, y avisa de las llamadas programadas con leads.

## Procesos automáticos

### 1. Lead Sync — cada noche a las 22:00

**Skill:** `lead-intelligence-hub`

- Lee el canal de Slack de leads y extrae las notas de los threads
- Busca el contacto correspondiente en GHL (por email, teléfono o nombre)
- Escribe las notas en el custom field `slack_notes` de GHL con fecha: `[2026-03-20] Llamé, quiere demo`
- Para leads nuevos (sin archivo de inteligencia):
  - Investiga la empresa con @company-finder
  - Completa datos de contacto que falten con @contact-enrichment
  - Busca transcripts de llamadas en Google Drive ("Supabase Recordings")
  - Crea `brand/growth4u/leads/{ghl_id}.md` con toda la inteligencia
- Para leads existentes: busca nuevos transcripts en Drive y los añade
- Publica resumen en Discord #intelligence

### 2. Call Prep Diario — domingo a jueves a las 22:30

**Skill:** `sales-call-prep` (modo diario)

- Saca todos los nombres de leads de GHL
- Busca en Google Calendar los eventos de mañana que mencionen alguno de esos nombres (título o attendee)
- Para cada match genera:
  - Hora de la reunión
  - Resumen del lead: qué hablamos la última vez (de notas Slack + transcripts)
  - Objetivo de la reunión (inferido del contexto y pipeline stage)
- Publica briefing en Discord #intelligence

### 3. Call Prep Semanal — viernes a las 22:30

**Skill:** `sales-call-prep` (modo semanal)

- Mismo proceso pero para lunes a viernes de la semana siguiente
- Vista panorámica: lista de llamadas por día con nombre, empresa y tipo

## Dónde vive cada dato

| Dato | Ubicación | Motivo |
|------|-----------|--------|
| Contacto, email, teléfono, tags | GHL | Fuente de verdad operativa |
| Pipeline stage | GHL | Se actualiza en el CRM |
| Notas de Slack | GHL (custom field `slack_notes`) | Sancho las escribe, GHL las almacena |
| Company research | `brand/growth4u/leads/{id}.md` | No cabe en un custom field de GHL |
| Transcript summaries | `brand/growth4u/leads/{id}.md` | Pain points, key quotes, next steps |
| Enrichment extras | `brand/growth4u/leads/{id}.md` | LinkedIn, datos que GHL no tenía |

## Archivos del sistema

```
workspace-sancho/
├── brand/growth4u/
│   ├── lead-tracking-config.json    # Config: GHL location, Slack channel, custom field IDs
│   └── leads/                       # Inteligencia por lead (solo lo que no cabe en GHL)
├── skills/
│   ├── lead-intelligence-hub/       # Skill: sync + enrichment
│   └── sales-call-prep/            # Skill: briefings de llamadas
├── cron/jobs.json                   # 3 cron jobs: lead sync + call prep daily + weekly
└── HEARTBEAT.md                     # Checks periódicos incluyen lead sync y call prep
```

## Configuración pendiente

- [ ] Crear custom fields en GHL admin: `slack_notes`, `last_slack_sync`
- [ ] Poner los IDs de esos fields en `brand/growth4u/lead-tracking-config.json`
