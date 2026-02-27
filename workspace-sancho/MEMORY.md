# MEMORY.md - Sancho Long-Term Memory

## Setup Progress
- **2026-02-24**: Primera sesión real. Workspace ya tenía SOUL.md, 11 agentes, symlinks a sanchocmo-openclaw/. Discord conectado (bot SanchoCMO). Fix clave: plugins bundled necesitan `plugins.entries.discord.enabled: true`. Foundation vacía. BRAIN.md no existe.
- El usuario (nombre pendiente) ya había trabajado en configuración previa pero no se persistió memoria.

## Personas
- **Alfonso** — Madrid, fundador/marketing de Hospital Capilar. Técnico, directo, no le gusta perder tiempo.

## Decisiones
- **2026-02-24**: Esta instancia es la **versión test** de SanchoCMO. Objetivo: iterar, versionar, aprender. Probar skills/herramientas/flujos, capturar qué funciona, mejorar el sistema progresivamente. Alfonso y Martín trabajan conmigo para refinar SanchoCMO antes de producción.
- **2026-02-24**: Foundation se hace siempre desde el **Discord del cliente**, no desde webchat.
- **2026-02-24**: Google Workspace autenticado (`alfonso@growth4u.io`), Notion API key configurada, Tailscale serve activo (`https://sancho-cmo.taild48df2.ts.net`), auth por password.

## Learnings
- **Discord plugin fix**: `openclaw plugins enable discord` no persiste (bug). Usar `openclaw config set plugins.entries.discord.enabled true --json` y luego restart gateway.
- **Gateway restart**: Si hay procesos zombie del gateway, `kill -9 <pid>` antes de reinstalar LaunchAgent.

## Sistema — Estado Actual (actualizado 2026-02-24 16:00)
- **Gateway**: Running, LaunchAgent, ws://127.0.0.1:18789
- **Tailscale**: serve en `https://sancho-cmo.taild48df2.ts.net`, auth por password (`swpIv4UazD3BcjX`)
- **Discord**: Bot SanchoCMO conectado, 15 bindings, allowlist Alfonso (1334604955687977042)
- **Google Workspace**: gog CLI autenticado (alfonso@growth4u.io) — todos los servicios
- **Notion**: API key configurada en entorno
- **Supabase**: 9 tablas creadas, vacías (psapmujzxhaxraphddlv.supabase.co)
- **Agentes**: 4 configurados (Cervantes, Sancho, Rocinante, Escudero) — migrado de 12 a 4 (Feb 25-26)
- **Skills**: 38 compartidas vía symlinks
- **BRAIN.md**: Eliminado (Feb 26). Contenido redistribuido a SOUL.md (principios, marco) + `_system/` (onboarding-playbook, phase-playbooks, workflow-recipes, intelligence-protocol)
- **Foundation**: Vacía — pendiente arrancar desde Discord
- **Mission Control**: HTML dashboard con Supabase live, multi-cliente, tasks, search, skill reader, wizard nuevo cliente, DAG, activity feed, dark/light mode
- **Archivos clave**: CHANGELOG.md, VERSION.md, TASKS.md, clients.js, skills-data.js, mc-data.js, scripts/regenerate.py

## Learnings Críticos (2026-02-26)

### Hilos SIEMPRE — incluso para cron jobs
- Alfonso me corrigió: los resultados de cron (daily pulse, meeting intelligence) los publiqué sin hilo.
- Regla reforzada en SOUL.md: TODA respuesta en Discord va en hilo, sin excepción.
- Incluye system messages, cron results, cualquier output.

### NUNCA saltar el flujo del sistema
- sancho-start → foundation-orchestrator → gate check → Phase 2. Sin atajos.
- El DAG de pillars tiene dependencias por algo. Layer 0 → 1 → 2 → 3 → 4 → 5.
- Positioning sin SWOT/ICP previo = positioning superficial.
- "Sí" del usuario a un paso ≠ "haz todos los pasos siguientes de golpe".
- Gate check SIEMPRE antes de cambiar de phase. Es advisory pero obligatorio mostrarlo.

### Usar Supabase como Context Lake
- Las 9 tablas existen y están vacías. Debo poblarlas.
- Archivos ./brand/ son complementarios, no sustitutos de la DB.
- Pendiente: clarificar con Alfonso el flujo exacto md ↔ Supabase.

### Foundation antes de GTM
- La primera sesión con Hospital Capilar salió con buen contenido pero proceso incorrecto.
- Generé GTM (keywords, quiz, ads, emails, briefs) ANTES de completar Foundation correctamente.
- El contenido es usable pero prematuro. Se hizo sin SWOT, sin ICP 100x, sin validation.

## Estado Hospital Capilar (2026-02-26)
- **Foundation Lite:** 7 archivos en ./brand/ (company-context, product-analysis, competitors, budget, icp, positioning, channel-plan)
- **Foundation DAG:** NO seguido. Pillars hechos sin respetar dependencias.
- **Supabase:** Vacío. Nada migrado.
- **GTM (prematuro):** keyword-plan, quiz-structure, ad-copy-tratamientos, email-sequence-postcirugía, briefs-creativos — todo en ./brand/
- **Pendiente:** Rehacer Foundation via orchestrator, poblar Supabase, gate check, y LUEGO GTM.

## Próximos pasos
1. Analizar gaps en skills y proponer cambios
2. Rehacer Foundation via foundation-orchestrator (DAG correcto)
3. Poblar Supabase con datos de Foundation
4. Gate check antes de Phase 2
5. Heartbeat con checks periódicos
6. Dispatch bot
7. Next.js migration (T-010, última)
