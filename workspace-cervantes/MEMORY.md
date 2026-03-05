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

## Sistema — Estado Actual (actualizado 2026-03-04)
- **Gateway**: Running, LaunchAgent, ws://127.0.0.1:18789
- **Tailscale**: serve en `https://sancho-cmo.taild48df2.ts.net` (tailnet), Funnel desactivado
- **Mission Control**: HTML estático en `/mc`, mc-server.js (LaunchAgent, puerto 18790). Foundation v2.0 rendering. File watcher auto-regenera.
- **Discord**: Bot SanchoCMO, 4 guilds configurados
- **Google Workspace**: gog CLI autenticado (alfonso@growth4u.io)
- **Supabase**: psapmujzxhaxraphddlv.supabase.co — migration SQL lista, pendiente deploy
- **DataForSEO**: balance ~$35
- **Agentes**: 4 (cervantes, sancho, rocinante, escudero). Sancho es default.
- **Skills**: ~54 activas (3 deprecated). Foundation pipeline v2.0.
- **Heartbeat**: Cervantes cada 3h, Sancho cada 3h
- **Exec**: security=full, ask=off
- **Update disponible**: 2026.3.2 (notificado a Alfonso)

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

## Foundation v2.0 — Implementación (2026-03-03)
- **56 skills migradas** a rutas v2.0. 4 protocolos actualizados. MC HTML reescrito.
- **Growth4U**: migrado (company-brief merged 3→1). **Hospital Capilar**: migrado a schema v2.0 (13/56 pilares).
- **Paymatico + SanchoCMO**: v2.0 vacío + dirs creados.
- Detalle completo: `memory/2026-03-03.md`

## Skills — Estado (T-042, 2026-03-03)
- **57 auditadas**. Pipeline Foundation: 8.1/10.
- **8 restructured** (lean + references): seo-content, email-sequences, lead-magnet, direct-response-copy, thief-marketers, pricing-strategy.
- **3 deprecated**: phase-0-diagnostic, pricing-hooks, social-media-extractor.
- **Reporte completo**: `memory/T-042-skills-audit.md`

## Clientes
- **4 clientes activos** (2026-03-02):
  - Hospital Capilar (hospital-capilar, guild 1475635138108063746) — 10/15 Foundation
  - Paymatico (paymatico, guild 1477995837719056458) — nuevo
  - SanchoCMO SelfMarketing (sanchocmo, guild 1477997446885019670) — nuevo
  - Growth4U (growth4u, guild 1477741643762241548) — nuevo, Alfonso testando
- **Hospital Capilar** (slug: hospital-capilar): Primer cliente.
  - Foundation: 10/15 aprobados (company-context, business-model, budget, self-intelligence, ope-canvas, market, competitors, positioning, swot-analysis, niche-discovery)
  - Pendientes: ecp-validation, existing-customer-data, pricing, brand-voice, visual-identity
  - Docs legacy en `_archive/` (product-analysis, icp, channel-plan, briefs-creativos, assets-doc)
  - Integrations: 7 services en integrations.json
  - Meetings: 5 en intelligence/meetings/

## Foundation v2.0 — DAG (6 layers, 12 pilares, 4 secciones)
```
L0 INTAKE:     company-brief (3 skills: company-context + business-model + budget → 1 doc, 1 aprobación)
L1 RESEARCH:   market + competitors + self-intelligence (requires: company-brief)
L2 SYNTHESIS:  summary.md + swot.md + ope-canvas.md (auto-generated, requires: L1 completo)
L3 DISCOVERY:  niche-discovery + existing-customer-data (optional)
L4 ACTIVATION: positioning + pricing + ecp-validation (optional) + messaging-summary
L5 BRAND:      brand-voice + visual-identity

Outputs: company-brief/ | market-and-us/ | go-to-market/ | brand-identity/ | operational/
requires = bloqueante | enriches_with = opcional
8 Discord threads (agrupados por sección, vs 15 antes)
```

## Decisiones de Arquitectura Clave
- **Meeting transcripts + summaries colocados** — `meetings/{slug}/summary.md + transcript.md`. Skills leen summary; transcript bajo demanda.
- **Intelligence log como dedup + discovery** — Skills escriben al log tras procesar. MC visualiza.
- **Síntesis inline** (no skills separadas) — summary.md, ope-canvas.md, messaging-summary.md generadas por orchestrator directamente.
- **OPE Canvas demotido a síntesis** — no es pilar bloqueante, es output de Layer 2.
- **Competitors como lista dinámica** — crece desde Company Brief, Market, Niche Discovery.

## Learnings (consolidados 2026-03-04)

### 🔴 Nunca hacer (errores con consecuencias graves)
1. **Gateway restart durante webchat** — me mata a mí mismo. Pedir a Alfonso que lo haga desde terminal.
2. **Heredoc con emojis en Python** → surrogates corrompen JSON. Usar siempre `\uXXXX` escapes.
3. **Inventar keys en openclaw.json** — schema estricto. SIEMPRE leer docs antes de editar config.
4. **Regex artesanal para markdown** — siempre librería estándar (marked.js). Cada doc nuevo revela edge cases.
5. **Consolidar prompts que scripts leen enteros** — si `llm_step.py` lee un archivo completo como prompt, NO juntar fases separadas en un solo archivo.

### 🟡 Config & Placement (dónde van las cosas)
6. **Exec permissions**: `tools.exec.security` + `tools.exec.ask`, NO en `agents.defaults.exec` (crashea gateway).
7. **Crons**: `openclaw cron add/edit/list`, persisten en `~/.openclaw/cron/jobs.json`. NO editar openclaw.json.
8. **Cron delivery en sesiones aisladas**: `delivery.mode: "announce"` + `channel: "last"` falla → usar `mode: none` y publicar explícitamente via message tool.
9. **thinkingDefault**: global en `agents.defaults`, no por agente. Niveles: off/minimal/low/medium/high/xhigh.
10. **Discord plugin**: `openclaw plugins enable discord` no persiste entre restarts → usar `config set`.
11. **Tailscale**: reset de Funnel borra config de serve → re-verificar `/` y `/mc` tras cambios.
12. **Guild faltante en openclaw.json** = error silencioso más común. Brand dir puede existir pero si la guild no está en config, Sancho no responde. Siempre verificar ambos.

### 🟢 Discord Patterns (cómo funciona bien)
13. **Thinking tokens** resuelven texto intermedio en canal: `thinkingDefault: high` → razonamiento a tokens internos, no se publican.
14. **thread-create con messageId** del usuario → hilo vinculado (mejor UX que standalone).
15. **sessions_send** para QA silencioso (Rocinante). **sessions_spawn con thread:true** para trabajo visible (Escudero).
16. **Todos los crons** que publican en Discord deben usar patrón: `send` → `thread-create(messageId)` → contenido en hilo.
17. **Discord roles** > allowlist por usuario para permisos.
18. **curl > urllib.request** para Discord API (urllib da error 1010).

### 🔵 Diseño de SOUL.md (principios para Sancho)
19. **Ejecutable, no punteros**: mover reglas P0 a `_system/` hizo que Sancho las ignorara. Las reglas críticas van inline en SOUL.md.
20. **3 capas**: SOUL.md (comportamiento, siempre cargado) → TOOLS.md (mecánicas plataforma) → `_system/` (procedimientos bajo demanda).
21. **Menos reglas bien escritas > muchas vagas**: de 21 a 11 reglas, mejor cumplimiento.
22. **NO mandar instrucciones a Sancho** via sessions_send. Mejorar skills, reglas, checklists — no mensajes ad-hoc.

### 🟤 Calidad & QA
23. **Sancho puede mentir sobre herramientas** — dijo "Apify website crawl" sin haberlo ejecutado (0 llamadas). Regla 0h resuelve esto.
24. **Docs tempranos (pre-reglas) son peores** — los primeros pilares tenían 50-60 líneas sin QA. Siempre regenerar con QA completo.
25. **Checklists de herramientas**: items explícitos por tool (pegar run ID), prohibido marcar ✅ con fallback genérico.

### ⚡ Performance & Sub-agentes
26. **Sub-agentes Opus para reestructuración masiva son lentos** (8 min para 2/5 archivos). Para tareas mecánicas de extracción, hacerlo yo es más rápido.
27. **Sub-agentes CSS rompen cosas** cuando tocan demasiado HTML/JS. Hacer cambios quirúrgicos uno a uno desde sesión principal.
28. **Gateway SIGTERM mata child processes** — Discord health-monitor provocó 49 restarts en un día. Scripts largos: usar `nohup`, `tmux`, o `exec(background:true)` + `process(poll)`.

### 📐 Arquitectura (patrones establecidos)
29. **Versionado por pilar**: `brand/{slug}/{pilar}/current.md` + `v1.md` + `history.json` + `qa-log.md`.
30. **foundation-state.json** por cliente: fuente de verdad para statuses. File watcher en mc-server.js auto-regenera mc-data.js.
31. **Onboarding 6 min**: cliente crea server (template) + OAuth bot → Cervantes ejecuta `new-client.sh` + config guild manual. `new-client.sh` no configura openclaw.json (pendiente automatizar).
32. **Aislamiento de contexto**: Daily Pulse filtró info interna a canal de cliente → Regla 0 en SOUL.md. Pre-publicación: ¿este contenido pertenece a este cliente?

## Arquitectura de Canales Discord
- **Decision channels** (general, brand, campaigns): NO ejecutan
- **Execution channels** (onboarding, content, paid-ads, prospecting, creatives, web, partners): CREAN
- **Intelligence channels** (research, intelligence, learning): ALIMENTAN decisiones
- **#general**: requireMention=true
- **14 canales** con systemPrompt limpio (contexto cliente + PATHS + instrucciones de canal)

## Hitos del Sistema (cronológico)
- **2026-02-25**: Nacimiento. Separación de Sancho.
- **2026-02-26**: 14 tareas completadas en sprint nocturno. Comic UI. Discord bindings.
- **2026-02-27**: SOUL.md de 531→99 líneas. 11 reglas cardinales. Aislamiento contexto (P0). Versionado por carpeta.
- **2026-02-28**: Intelligence Log. Threading resuelto (thinkingDefault:high). "No mandar instrucciones a Sancho".
- **2026-03-01**: Onboarding 6 min. Tailscale Funnel. Crons en hilos. Supabase multi-tenant SQL lista.
- **2026-03-02**: 3 clientes onboarded (Paymatico, SanchoCMO, Growth4U). niche-discovery v3.1-3.3. Foundation v2.0 diseñada.
- **2026-03-03**: Foundation v2.0 implementada completa (56 skills, 4 protocolos, MC). T-042 auditoría (57 skills). Skills cleanup (-140KB).
- **2026-03-04**: Consolidación de learnings. Sección Evolución en SOUL.md.

## Tareas — Estado actual
- **TASKS.md**: `~/.openclaw/workspace-cervantes/TASKS.md` — fuente de verdad
- **Próximo ID**: T-045
- **Aprobadas pendientes**: T-010 (Next.js MC — "ya volveremos")
- **Propuestas pendientes**: T-014 (API panel), T-032 (auto-sync tasks), T-043 (tablas Supabase), T-044 (SIGTERM resuelto, mover a hecha)
- **Skill gaps** (T-042): linkedin-content (P1), reporting (P2), landing-page (P2), case-study (P2)
- **Skills oversized** pendientes de slim: content-atomizer (54KB), keyword-research (54KB), newsletter (47KB)
