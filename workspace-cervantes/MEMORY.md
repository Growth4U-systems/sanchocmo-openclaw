# MEMORY.md - Cervantes Long-Term Memory

## Sesión Principal
- **URL**: http://127.0.0.1:18789/chat?session=agent%3Acervantes%3Amain
- **Sesión**: `agent:cervantes:main`
- **Mostrar siempre** al inicio de cada conversación para que Alfonso pueda continuar desde aquí.

## Nacimiento
- **2026-02-25**: Cervantes nace como agente separado de Sancho. Alfonso decidió separar responsabilidades después de ver que Sancho mezclaba infra con marketing. La metáfora: Cervantes es el autor, Sancho es el personaje. El autor nunca aparece en la novela.

## Misión Core
- **Mi objetivo**: Hacer que Sancho sea el mejor Fractional CMO AI del mundo.
- **No soy developer de Sancho** — soy su creador. La diferencia: no solo codifico, observo lo que hace, identifico mejoras, propongo cambios proactivamente.
- **NO MANDO INSTRUCCIONES A SANCHO** (corrección Alfonso 2026-02-28). Mi trabajo es mejorar skills, reglas y el sistema. Las mejoras van en SOUL.md, TOOLS.md, skills, checklists — no en mensajes ad-hoc via sessions_send.
- **Tareas de sistema = mías**. Tareas de cliente = del Sancho de ese cliente.

## Arquitectura de Agentes (actualizada 2026-02-28)
- **Cervantes** ✒️ → Webchat (default) — Arquitecto/Creador
- **Sancho** 🐴 → Discord (todos los canales, default agent) — CMO Estratega (Opus 4.6, thinking: high)
- **Rocinante** 🐎 → QA/Brand Guardian (Sonnet 4.5) — via sessions_send, sin presencia Discord
- **Escudero** 🛡️ → Worker/Executor (Sonnet 4.5) — via sessions_spawn con thread:true, trabaja en hilos Discord

## Sistema — Estado Actual (actualizado 2026-02-28)
- **Gateway**: Running, LaunchAgent, ws://127.0.0.1:18789
- **Tailscale**: serve en `https://sancho-cmo.taild48df2.ts.net`, auth allowTailscale
- **Mission Control**: HTML estático en `/mc`, mc-server.js (LaunchAgent com.sancho.mc-server, puerto 18790)
  - Doc viewer en `/mc/docs/` con marked.js (reemplazó renderizador artesanal)
  - File watcher en mc-server.js: vigila foundation-state.json, auto-regenera mc-data.js
  - WYSIWYG editor (Toast UI Editor)
- **Discord**: Bot SanchoCMO, guild 1475635138108063746
- **Google Workspace**: gog CLI autenticado (alfonso@growth4u.io)
- **Supabase**: psapmujzxhaxraphddlv.supabase.co, 9 tablas vacías
- **DataForSEO**: login accounts@growth4u.io, balance ~$35
- **Agentes**: 4 (cervantes, sancho, rocinante, escudero). Sancho es default.
- **Skills**: 56 (44 workspace + 12 bundled)
- **Heartbeat**: Cervantes cada 3h, Sancho cada 3h
- **Exec**: security=full, ask=off

## Config Discord clave (2026-02-28)
- `agents.defaults.thinkingDefault: high` — razonamiento profundo, va a thinking tokens (no se publica en Discord)
- `channels.discord.threadBindings.enabled: true`
- `channels.discord.threadBindings.spawnSubagentSessions: true` — Escudero crea hilos propios
- `spawnSubagentSessions` estaba en `false` para evitar hilos de Rocinante → ahora `true` porque Rocinante usa sessions_send (no spawn)
- 14 systemPrompts limpios: solo contexto cliente + PATHS + instrucciones de canal (sin HILOS/LINKS repetidos)

## SOUL.md de Sancho — Estructura (2026-02-28)
- **99 líneas** (antes 531). 3 capas:
  - SOUL.md: identidad, personalidad, principios, 11 reglas cardinales P0
  - TOOLS.md: mecánicas de plataforma (Discord Mechanics, threading, NO_REPLY)
  - `_system/`: procedimientos bajo demanda (foundation-protocol, versioning-protocol, dispatch-protocol, workflow-recipes)
- **11 reglas cardinales**: aislamiento, hilos (messageId), links, no narrar, versionado, gate check, confirmar inputs, leer todo, honestidad herramientas, self-QA, citación
- **threading-protocol.md eliminado** — contenido movido a TOOLS.md
- **Lesson**: SOUL.md debe tener reglas ejecutables inline, no punteros a archivos externos. Los `_system/` son para detalles, no para reglas P0.

## Discord Threading — Solución (2026-02-28)
- **Problema**: texto entre tool calls se publicaba en canal como mensajes separados
- **Solución**: thinkingDefault:high → razonamiento a thinking tokens (internos, no se publican)
- **Hilos vinculados**: thread-create con messageId del usuario (viene en "Conversation info" del inbound) → hilo aparece debajo del mensaje del usuario
- **Escudero en hilos**: sessions_spawn con thread:true → OpenClaw crea hilo, Escudero trabaja dentro
- **Sancho → NO_REPLY**: después de crear hilo + enviar contenido, o después de spawnar Escudero
- **Rocinante sin hilos**: usa sessions_send, no sessions_spawn → no crea hilos

## Clientes
- **Hospital Capilar** (slug: hospital-capilar): Primer cliente.
  - Foundation: 10/15 aprobados (company-context, business-model, budget, self-intelligence, ope-canvas, market, competitors, positioning, swot-analysis, niche-discovery)
  - Pendientes: ecp-validation, existing-customer-data, pricing, brand-voice, visual-identity
  - Docs legacy en `_archive/` (product-analysis, icp, channel-plan, briefs-creativos, assets-doc)
  - Integrations: 7 services en integrations.json
  - Meetings: 5 en intelligence/meetings/

## Foundation — Orden universal (15 pilares, 5 bloques)
```
🏢 LA EMPRESA: company-context, business-model, budget, self-intelligence
🎯 OPE CANVAS: ope-canvas (depende de La Empresa)
📊 EL MERCADO: market, competitors, swot-analysis (depende de OPE Canvas)
👥 LOS CLIENTES: niche-discovery-100x, ecp-validation, existing-customer-data (depende de El Mercado)
🎯 LA MARCA: positioning, pricing, brand-voice, visual-identity (depende de El Mercado)
```

## Learnings (actualizados 2026-02-28)

### Arquitectura y Config
- **NUNCA hacer `gateway restart` durante conversación activa por webchat** — me mata a mí mismo
- **openclaw.json schema es estricto**: No inventar keys. SIEMPRE leer docs antes de editar config
- **Exec permissions** van en `tools.exec`, NO en `agents.defaults.exec`
- **Crons** se gestionan via `openclaw cron add/edit/list`, persisten en `~/.openclaw/cron/jobs.json`
- **thinkingDefault** es global (agents.defaults), no por agente. Niveles: off/minimal/low/medium/high/xhigh

### Discord
- **Thinking tokens resuelven texto intermedio**: `thinkingDefault: high` redirige razonamiento a tokens internos
- **thread-create con messageId**: crea hilo vinculado al mensaje del usuario (mejor UX que standalone)
- **spawnSubagentSessions: true**: necesario para que Escudero trabaje en hilos propios
- **sessions_send vs sessions_spawn**: send para QA silencioso (Rocinante), spawn con thread:true para trabajo visible (Escudero)
- **Discord roles** mejor que allowlist por usuario
- **Discord plugin** `openclaw plugins enable discord` no persiste — usar config set

### SOUL.md y Reglas
- **SOUL.md debe ser ejecutable, no punteros**: mover reglas a `_system/` hizo que Sancho las ignorara
- **3 capas**: SOUL.md (comportamiento) + TOOLS.md (mecánicas) + `_system/` (procedimientos)
- **Menos reglas bien escritas > muchas reglas vagas**: de 21 reglas a 11, mejor cumplimiento
- **NO mandar instrucciones a Sancho**: mejorar skills/reglas/sistema, no mensajes ad-hoc

### Calidad de documentos
- **Sancho mintió sobre Apify**: dijo "Apify website crawl" sin haberlo ejecutado (0 llamadas). Regla 0h (honestidad) añadida
- **Checklist de herramientas**: items explícitos por tool (pegar run ID), prohibido marcar ✅ con fallback
- **Docs tempranos (pre-reglas) son peores**: company-context, budget, business-model eran de 50-60 líneas sin QA. Regenerados a v2 con QA completo
- **Nunca regex artesanal para markdown**: usar siempre librería estándar (marked.js)

### Versionado
- **Cada pilar**: `brand/{slug}/{pilar}/current.md` + `v1.md` + `history.json` + `qa-log.md`
- **foundation-state.json** por cliente: fuente de verdad para pillar statuses (approved/pending-review/not-started)
- **File watcher** en mc-server.js: vigila foundation-state.json, auto-regenera mc-data.js (ya no depende de que Sancho ejecute regenerate.py)

## Arquitectura de Canales Discord
- **Decision channels** (general, brand, campaigns): NO ejecutan
- **Execution channels** (onboarding, content, paid-ads, prospecting, creatives, web, partners): CREAN
- **Intelligence channels** (research, intelligence, learning): ALIMENTAN decisiones
- **#general**: requireMention=true
- **14 canales** con systemPrompt limpio (contexto cliente + PATHS + instrucciones de canal)

## Tareas
- **TASKS.md**: `~/.openclaw/workspace-cervantes/TASKS.md` — task board unificado con tags de cliente
- **Próximo ID**: T-040
- **T-010** (Next.js MC): única aprobada, pendiente de que estático esté estable
- **T-039** (acceso móvil sin Tailscale): propuesta, pendiente decisión
