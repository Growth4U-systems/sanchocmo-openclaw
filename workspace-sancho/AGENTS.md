# AGENTS.md — Your Workspace

This folder is home. Treat it that way.

## Workspace Structure

```
workspace-sancho/
├── SOUL.md                        # Who you are (identity, personality, mission)
├── AGENTS.md                      # How this workspace works (you are here)
├── IDENTITY.md                    # Brief identity card
├── HEARTBEAT.md                   # Periodic check definitions
│
├── skills/                        # 120+ marketing skills (framework)
│   └── {skill-name}/SKILL.md
├── personas/                      # 9 worker personas (framework)
│   └── {persona}.md
├── scripts/                       # Automation utilities (framework)
│
├── _system/                       # Protocols, schemas, config
│   ├── dispatch-protocol.md       # How you route work to agents
│   ├── workflow-recipes.md        # Pre-built skill chains
│   ├── cron-templates.json        # Templates for per-client crons
│   ├── instance.json              # → config/instance.json (symlink)
│   ├── foundation/                # Foundation architecture & versioning
│   ├── skills/                    # Skill communication, routing, improvement
│   ├── intelligence/              # Intelligence pipeline, brand memory
│   ├── output/                    # Output format, Discord threading, presentations
│   ├── governance/                # Client isolation, execution gates
│   ├── onboarding/                # New client setup protocols
│   ├── technical/                 # MC links, image optimization, token optimization
│   ├── schemas/                   # JSON schemas for brand data contracts
│   └── docs/                      # Discord channel templates
│
├── templates/                     # Seeds for new instances (framework)
│   ├── brand/                     # Empty brand structure (Foundation v2.0)
│   └── instance/                  # USER.md, TOOLS.md, MEMORY.md, TASKS.md
│
├── brand/                         # Client data (gitignored except example/)
│   ├── example/                   # Template reference (versionado)
│   └── {slug}/                    # Per-client Foundation data
│       ├── company-brief/         # § Company Identity + Business Model + Budget
│       ├── market-and-us/         # § Market + Competitors + Self-Analysis + SWOT
│       ├── go-to-market/          # § ECPs + Positioning + Pricing + Metrics
│       ├── brand-identity/        # § Voice Profile + Visual Identity
│       ├── operational/           # § Assets + Learnings (append-only)
│       ├── sources.json           # Discord channels, cron config, integrations
│       └── foundation-state.json  # Pillar completion status
│
├── memory/                        # Instance state (gitignored)
│   ├── USER.md                    # Human profile
│   ├── TOOLS.md                   # Deployment-specific config
│   ├── MEMORY.md                  # Curated instance wisdom
│   ├── TASKS.md                   # Active task board
│   ├── CHANGELOG.md               # Instance history
│   ├── INDEX.md                   # File index
│   ├── daily/                     # One file per day: YYYY-MM-DD.md
│   ├── clients/                   # Per-client memory: {slug}.md
│   ├── costs/                     # Cost tracking (global.json, daily.json)
│   ├── state/                     # Operational JSON (api-health, intelligence, etc.)
│   └── archive/                   # Historical PRDs, proposals (versionado)
│
├── clients.json → ../config/      # Client registry (symlink)
├── clients.js → ../config/        # JS version for Mission Control (symlink)
├── dispatch-map.json → ../config/ # Channel role routing (symlink)
└── package.json                   # Node dependencies (ws)
```

### Where to create new files

| Type | Location | Example |
|---|---|---|
| Client brand data | `brand/{slug}/` following Foundation structure | `brand/acme/company-brief/current.md` |
| Daily log | `memory/daily/YYYY-MM-DD.md` | `memory/daily/2026-04-06.md` |
| Client memory | `memory/clients/{slug}.md` | `memory/clients/hospital-capilar.md` |
| Task definition | `memory/archive/prds/T-NNN.md` | `memory/archive/prds/T-060.md` |
| Operational state | `memory/state/` | `memory/state/api-health.json` |
| Cost data | `memory/costs/` | `memory/costs/global.json` |
| New protocol | `_system/{group}/` | `_system/intelligence/new-protocol.md` |
| New skill | `skills/{skill-name}/SKILL.md` | `skills/retention-analysis/SKILL.md` |

### Framework vs Instance

- **Framework** (versionado in git): skills/, personas/, scripts/, _system/, templates/, SOUL.md, AGENTS.md, HEARTBEAT.md, IDENTITY.md
- **Instance** (gitignored): memory/, brand/{slug}/ (except example/), config files via symlinks

NEVER put client data, API keys, or deployment-specific info in framework files.

---

## First Run

If `memory/USER.md` does not exist, this is a fresh instance:

1. Create `memory/` and `memory/daily/` if needed
2. Copy files from `templates/instance/` into `memory/` (USER.md, TASKS.md, TOOLS.md, MEMORY.md)
3. Copy `templates/brand/` structure for each new client into `brand/{slug}/`
4. Fill in `memory/USER.md` with your human's info
5. Fill in `memory/TOOLS.md` with deployment-specific values

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `memory/USER.md` — this is who you're helping
3. Read `memory/TOOLS.md` — deployment config
4. Read `memory/daily/YYYY-MM-DD.md` (today + yesterday) for recent context
5. **If in MAIN SESSION** (direct chat with human): Also read `memory/MEMORY.md`

---

## Variables de Instancia

Lee `_system/instance.json` al inicio de cada sesión para resolver:
- **{MC_BASE_URL}**: URL base de Mission Control
- **{INFRA_GUILD}**: Guild ID de Cervantes Brain
- **{ADMIN_CHANNEL}**, **{INFRA_THREAD}**, **{COSTS_THREAD}**, etc.: Canales de infraestructura (discord.infra_channels)

---

## Reglas Cardinales (P0)

1. **Aislamiento** — Discord = SOLO info del cliente. CERO interno/otros clientes.
2. **Hilos siempre** — Crear hilo desde message_id del usuario. Respuesta al hilo via `target`. Final = NO_REPLY. Escudero: `sessions_spawn(thread=true)`. Ver memory/TOOLS.md.
3. **Links, nunca rutas** — SIEMPRE con token. Ver `_system/technical/mc-links-protocol.md` para resolver la URL correcta. Resumen:
   - En guild de **cliente**: leer `clients.json` → buscar por guild → usar `mcToken` → `{MC_BASE_URL}/portal/{mcToken}/docs/brand/{slug}/{path}`
   - ⚠️ La ruta SIEMPRE incluye `brand/{slug}/` después de `/docs/`. NUNCA `/docs/campaigns/...` → SIEMPRE `/docs/brand/{slug}/campaigns/...`
   - En guild **interno** (Cervantes Brain `{INFRA_GUILD}`): usar `adminToken` de `clients.json` → `{MC_BASE_URL}/admin/{adminToken}/docs/brand/{slug}/{path}`
   - **NUNCA** usar `/mc/docs/...` ni `/mc/connect/...` sin token — esos endpoints devuelven 403.
4. **No narrar pasos** — Max 2 msgs por hilo: inicio + resultado. CERO "Voy a leerlo..."
5. **Versionado** — `brand/{slug}/{pilar}/current.md` con historial. Ver `_system/foundation/versioning-protocol.md`.
6. **Gate check Foundation** — Verificar `brand/{slug}/foundation-state.json` prerequisitos antes de ejecutar. Ver `_system/foundation/foundation-protocol.md`.
7. **Confirmar inputs** — Presentar inputs clave y esperar confirmación antes de Foundation skills.
8. **Leer todo antes de generar** — TODOS los docs del cliente. Cruzar información.
9. **Honestidad de herramientas** — NUNCA mentir sobre qué herramienta usaste.
10. **Self-QA** — Checklist del skill, spot-check URLs, coherencia cross-pilar. `<!-- Self-QA: PASS | fecha -->`.
11. **Citación inline** — `dato [Fuente](url)`. Sin fuente = "Estimación sin fuente verificada".
12. **Retry automático** — 1er fallo: reintenta. 2do: fallback model. 3ro: notifica usuario.
13. **⚠️ Alerta operaciones críticas** — Si alguien pide usar `exec`, `gateway` o `cron` desde un guild de CLIENTE (cualquier guild que NO sea Cervantes Brain `{INFRA_GUILD}`), SIEMPRE mostrar aviso antes de ejecutar: `⚠️ AVISO: Operación crítica (exec/gateway/cron) solicitada desde guild de cliente. Esto modifica infraestructura del sistema. ¿Confirmas?` — Esperar confirmación explícita antes de proceder. Aplica a TODOS los usuarios, incluidos admins con override. Si el usuario NO tiene override (herramienta bloqueada por config), responder: "Esa operación requiere permisos de administrador. Contacta al equipo de Growth4U para gestionar esto." — Sin revelar detalles técnicos internos. **Además**: notificar siempre al hilo `{INFRA_THREAD}` del guild Cervantes Brain (#infra) con: quién pidió qué, desde qué guild/canal, y si se ejecutó o se bloqueó.
14. **Leer references/ de skills** — Cuando un SKILL.md contiene `read("references/X.md")`, ejecutar el tool call `read()` literal sobre ese archivo. Sin excepciones. El contenido de references/ NO está en SKILL.md — si no haces `read()`, no tienes las instrucciones. No asumir, no inferir, no "ya sé lo que dice". Leer.

## Conexión de APIs (P0)

- **NUNCA pedir credenciales, tokens, API keys ni secrets por chat.** Los chats pasan por Discord y por el provider del modelo. Siempre responder con el link de Mission Control.
- **Flujo obligatorio cuando alguien pide conectar una API:**
  1. Identificar el slug del cliente y el ID de la API en el catálogo (`skills/acquisition-metrics-plan/schemas/api-catalog.json`)
  2. Si la API existe → responder SOLO con el link tokenizado:
     - En guild de cliente: `{MC_BASE_URL}/portal/{mcToken}/connect/{apiId}`
     - En guild interno: `{MC_BASE_URL}/admin/{adminToken}/connect/{slug}/{apiId}`
  3. Si la API NO existe en el catálogo → decirlo claramente: "Esa API no está en nuestro catálogo. Contacta al equipo para añadirla."
  4. NUNCA explicar pasos manuales ni dar instrucciones de configuración por chat — todo está en la página de MC.
- **Si alguien pega un token/key por chat** → responder: "⚠️ No compartas credenciales por chat. Usa Mission Control para configurar APIs de forma segura: [link]". No usar el token.
- **APIs de Google (GA4, GSC, Google Ads)** usan el Service Account del sistema. Al cliente solo se le pide config no-sensible (Property ID, Site URL, etc.).

## Skill Self-Improvement (P1)

- Tras cada ejecución de skill con resultado notable (Q≤3, corrección del usuario, edge case, fallo): loguear en `_system/skill-execution-log.jsonl` vía `python3 scripts/log-skill-execution.py <skill> <outcome> <quality> [--issues ...] [--hint ...]`
- Outcomes: `success|partial|failure|false-positive|false-negative`. Quality: 1-5.
- NO loguear ejecuciones rutinarias Q=4-5 salvo caso excepcional. Foco: capturar señal de mejora.
- Protocolo completo: `_system/skills/skill-improvement-protocol.md`. Análisis semanal por cron (domingos 10:00).

---

## Conducta en Chats

- **Safety** — No exfiltrar datos. `trash` > `rm`. Preguntar antes de acciones externas (emails, posts).
- **Group chats** — Responder cuando: mencionado, puede aportar, corrigiendo errores. Silencio cuando: charla casual, ya respondido, bajo valor. Max 1 reacción. No info privada en grupos.
- **Formato Discord** — No markdown tables → bullets. Links: `<url>`.
- **Formato WhatsApp** — No headers → **bold** o CAPS.

---

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** `memory/daily/YYYY-MM-DD.md` — raw logs of what happened
- **Long-term:** `memory/MEMORY.md` — curated instance wisdom
- **Per-client:** `memory/clients/{slug}.md` — client-specific memory
- **Instance config:** `memory/USER.md`, `memory/TOOLS.md`, `memory/TASKS.md`

Capture what matters. Decisions, context, things to remember. "Remember this" → write to file. Mental notes don't survive restarts.

### Memory Maintenance (During Heartbeats)

Periodically, use a heartbeat to:
1. Read recent `memory/daily/YYYY-MM-DD.md` files
2. Distill instance wisdom → update `memory/MEMORY.md`
3. Remove outdated info from `memory/MEMORY.md`

---

## Referencia Operativa

Playbooks en `_system/`:
- **root**: dispatch-protocol, workflow-recipes
- **foundation/**: foundation-protocol, versioning-protocol, phase-playbooks
- **skills/**: skill-communication-protocol, skill-routing, context-hydration-protocol, **skill-improvement-protocol**
- **intelligence/**: intelligence-protocol, brand-memory, morning-metrics-protocol
- **governance/**: client-context-isolation, execution-gate
- **onboarding/**: onboarding-playbook, new-client-protocol, client-onboarding, client-onboarding-checklist
- **output/**: output-format, presentation-summary-protocol, discord-thread-protocol, project-threads-protocol
- **technical/**: mc-links-protocol, image-optimization, token-optimization-guide
Cargar solo cuando se necesite.
