# CHANGELOG — SanchoCMO

Todas las modificaciones notables del sistema se documentan aquí.
Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [0.1.0] — 2026-02-24

### 🎉 Initial Setup (versión test)

#### Added
- **Infraestructura core**: OpenClaw gateway + LaunchAgent (auto-start)
- **11 agentes** configurados con SOUL.md individual:
  Sancho, El Oráculo, El Explorador, El Redactor, El Comunicador,
  El Creativo, El Amplificador, El Conector, El Comercial, El Arquitecto, El Investigador
- **38 skills** compartidas vía symlinks desde sanchocmo-openclaw
- **Discord**: Bot SanchoCMO conectado, 15 bindings agente↔canal, guild Hospital Capilar
- **Supabase**: 9 tablas operacionales (vacías), proyecto `psapmujzxhaxraphddlv`
- **Google Workspace**: gog CLI autenticado (`alfonso@growth4u.io`) — Gmail, Calendar, Drive, Contacts, Docs, Sheets
- **Notion**: API key configurada (`ntn_...`)
- **Tailscale serve**: Gateway expuesto en `https://sancho-cmo.taild48df2.ts.net`
- **Auth por password**: Para acceso del equipo vía tailnet
- **Discord allowlist**: User ID `1334604955687977042` (Alfonso) con slash commands
- **BRAIN.md**: 1,384 líneas — sistema completo SanchoCMO (SOUL, SYSTEM, KNOWLEDGE, ONBOARDING, CONTEXT PARADOX, PHASES, WORKFLOWS)
- **Memory system**: MEMORY.md + memory/*.md + vector search + FTS

#### Not yet
- Foundation para Hospital Capilar (pendiente — se hace desde Discord)
- BRAIN.md como referencia activa (copiado, no integrado en flujo)
- MCP servers (no soportado nativo en OpenClaw — cubierto con tools equivalentes)
- Dispatch bot (discord/dispatch-bot.js) — no desplegado
- Heartbeat tasks — vacío por ahora
- Cron jobs — ninguno configurado

---

## [0.2.0] — 2026-02-24

### Added
- **Mission Control v2**: Formulario colapsable, tareas accionables (Aprobar/Ejecutar/Estado), visor de archivos de agentes con tabs por .md
- **agents-data.js**: Datos de 11 agentes con contenido SOUL.md, TOOLS.md, USER.md (y extras para Sancho)
- **Heartbeat configurado** (T-011): HEARTBEAT.md con checks rotativos (email, calendario, regenerar dashboard, memory maintenance), heartbeat-state.json
- **Dispatch map** (T-012): dispatch-map.json con channel IDs de Discord por agente, roles, y skills asociadas. Sancho puede despachar briefs a canales de agentes via `message` tool.

### Changed
- Task cards ahora tienen botones de acción según estado (Propuestas→Aprobar, Aprobadas→Ejecutar, En Progreso→Estado)
- Sección Agentes clickeable con visor de archivos + "Proponer cambio" que pre-rellena formulario de tareas

---

## [0.3.0] — 2026-02-26

### Migracion: 12 Agentes → 4 Agentes + Eliminacion BRAIN.md

#### Changed
- **Arquitectura de agentes**: De 12 agentes (channel-based routing) a 4 agentes (sessions-based orchestration)
  - Sancho (Opus) — CMO brain, default agent para todo Discord
  - Cervantes (Opus) — System architect, solo webchat + sessions_send desde Sancho
  - Rocinante (Sonnet) — QA/Brand Guardian via sessions_send
  - Escudero (Sonnet) — Worker generico via sessions_spawn con persona profiles
- **SOUL.md**: Expandido con Principios Fundamentales (7 principios), Marco Estrategico (Core Four, Phases, Model Tiers), Referencia Operativa (indice de playbooks _system/)
- **dispatch-protocol.md**: Reescrito para modelo 4 agentes con sessions
- **skill-communication-protocol.md**: Anadidas listas anti-patterns de context passing

#### Added
- **`_system/onboarding-playbook.md`**: Flujo completo de onboarding (new client + returning)
- **`_system/phase-playbooks.md`**: Detalle de Phase 0-3 + DAGs + gates
- **`_system/workflow-recipes.md`**: 5 flujos pre-construidos
- **`_system/intelligence-protocol.md`**: Daily Pulse, Aprende, 3 Lenses
- **`personas/*.md`**: 9 persona profiles para Escudero (antes eran agentes independientes)
- **Workspace Rocinante y Escudero**: Nuevos workspaces con SOUL.md

#### Removed
- **BRAIN.md**: Eliminado. Contenido redistribuido a SOUL.md (auto-loaded) y `_system/` (on-demand)
- **8 agentes Sonnet**: Convertidos a persona profiles en `./personas/`
- **Channel-based routing**: Reemplazado por sessions_spawn/sessions_send

---

## Formato de entradas futuras

```
## [X.Y.Z] — YYYY-MM-DD

### Added (nuevas features/skills/integraciones)
### Changed (modificaciones a lo existente)
### Fixed (bugs corregidos)
### Removed (eliminado)
### Learned (insights del testing — único de versión test)
```
