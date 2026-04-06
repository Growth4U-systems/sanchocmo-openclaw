# TOOLS.md - Local Notes

<!-- Fill in with deployment-specific values. Sections marked [FILL] need your data. -->

## Discord
- **Guild ID**: [FILL]
- **Admin channel**: [FILL]
- **Onboarding channel**: [FILL]
- **Admin user ID**: [FILL]

## Mission Control
- **Config**: Ver `memory/instance.json` para URLs actuales
- **MC path**: /mc (puerto configurable)

## Supabase
- **URL**: [FILL]
- **Tablas**: clients, pillars, meetings, intelligence_log, integrations, costs, content, campaigns
- **Schema**: multi-tenant con client_id + RLS

## LaunchAgents
- **Gateway**: com.openclaw.gateway (pid en `openclaw status`)
- **MC Server**: com.sancho.mc-server (mc-server.js)

## Paths (relativos al $OPENCLAW_HOME)
- **Mi workspace**: workspace-cervantes/
- **Workspace de Sancho**: workspace-sancho/
- **Regenerate script**: workspace-sancho/scripts/regenerate.py
- **Skills compartidas**: workspace-sancho/skills/
- **Dispatch map**: workspace-sancho/dispatch-map.json

## Google Workspace
- **Account**: [FILL]
- **CLI**: gog (todos los servicios autenticados)

## Modelos — Matriz Agente x Tier

| Agente | Modelo | Tier | Justificación |
|--------|--------|------|---------------|
| **Cervantes** | Opus 4.6 | T1 ($15/$75) | Arquitectura, código, decisiones de sistema |
| **Sancho** | Opus 4.6 | T1 ($15/$75) | Estrategia CMO, decisiones de marketing |
| **Rocinante** | Sonnet 4.5 | T2 ($3/$15) | QA y review |
| **Escudero** | Sonnet 4.5 | T2 ($3/$15) | Ejecución de tareas mecánicas |

### Tiers disponibles
- **T1 Opus** ($15/$75 MTok): Razonamiento complejo, estrategia, código
- **T2 Sonnet** ($3/$15 MTok): Ejecución con contexto, escritura, QA
- **T3 Haiku** ($0.80/$4 MTok): Tareas simples, clasificación (para crons/heartbeats)
- **T4 MiniMax** ($0.30/$1.10 MTok): Traducción, formato, extracción

### Crons (modelo sugerido)
- Heartbeats → Haiku (T3)
- Daily pulse → Sonnet (T2)
- Reports → Sonnet (T2)
- Foundation → Opus (T1)

## DataForSEO
- **Login**: [FILL]
- **API Password**: en openclaw.json (skills.entries.dataforseo.env)
- **Balance**: [check]
- **Base URL**: https://api.dataforseo.com/v3

## Onboarding Clientes
- **Plantilla Discord**: [FILL — discord.new template URL]
- **OAuth Bot**: URL construida desde `instance.json → discord.bot_client_id`
- **Procedimiento**: `workspace-sancho/_system/client-onboarding.md`
- **Script**: `workspace-sancho/scripts/new-client.sh --slug X --name Y --guild Z`
