# TOOLS.md - Cervantes Local Notes

## Discord
- **Guild ID**: 1475635138108063746
- **Rol SanchoCMO**: 1476178447750402158
- **#admin channel**: 1475638273501040681
- **#onboarding channel**: 1476491108421730334
- **Alfonso user ID**: 1334604955687977042

## Tailscale
- **Hostname**: sancho-cmo.taild48df2.ts.net
- **Dashboard**: https://sancho-cmo.taild48df2.ts.net
- **MC path**: /mc (puerto 18790 interno)

## Supabase
- **URL**: psapmujzxhaxraphddlv.supabase.co
- **Tablas**: 9 (vacías)

## LaunchAgents
- **Gateway**: com.openclaw.gateway (pid en `openclaw status`)
- **MC Server**: com.sancho.mc-server (puerto 18790, mc-server.js)

## Paths
- **Mi workspace**: ~/.openclaw/workspace-cervantes/
- **Workspace de Sancho**: ~/.openclaw/workspace-sancho/
- **Regenerate script**: ~/.openclaw/workspace-sancho/scripts/regenerate.py
- **Mission Control HTML**: ~/.openclaw/workspace-sancho/mission-control.html
- **Skills compartidas**: ~/.openclaw/workspace-sancho/skills/
- **Dispatch map**: ~/.openclaw/workspace-sancho/dispatch-map.json

## Google Workspace
- **Account**: alfonso@growth4u.io
- **CLI**: gog (todos los servicios autenticados)

## Notion
- **API key**: configurada en entorno

## Modelos — Matriz Agente × Tier (T-023)

| Agente | Modelo | Tier | Justificación |
|--------|--------|------|---------------|
| **Cervantes** | Opus 4.6 | T1 ($15/$75) | Arquitectura, código, decisiones de sistema |
| **Sancho** | Opus 4.6 | T1 ($15/$75) | Estrategia CMO, decisiones de marketing |
| **Rocinante** | Sonnet 4.5 | T2 ($3/$15) | QA y review — no necesita razonamiento profundo |
| **Escudero** | Sonnet 4.5 | T2 ($3/$15) | Ejecución de tareas mecánicas |

### Tiers disponibles
- **T1 Opus** ($15/$75 MTok): Razonamiento complejo, estrategia, código
- **T2 Sonnet** ($3/$15 MTok): Ejecución con contexto, escritura, QA
- **T3 Haiku** ($0.80/$4 MTok): Tareas simples, clasificación (para crons/heartbeats)
- **T4 MiniMax** ($0.30/$1.10 MTok): Traducción, formato, extracción

### Crons (pendiente implementar)
- Heartbeats → Haiku (T3)
- Daily pulse → Sonnet (T2)
- Reports → Sonnet (T2)
- Foundation → Opus (T1)

## DataForSEO
- **Login**: accounts@growth4u.io
- **API Password**: en openclaw.json (skills.entries.dataforseo.env)
- **Balance**: ~$35
- **Base URL**: https://api.dataforseo.com/v3
- **Uso**: SEO competitivo (SERP, backlinks, keywords, on-page)
