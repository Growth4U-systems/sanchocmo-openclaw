# MEMORY.md - Sancho Long-Term Memory

## Setup Progress
- **2026-02-24**: Primera sesión real. Workspace ya tenía SOUL.md, 11 agentes, symlinks a sanchocmo-openclaw/. Discord conectado (bot SanchoCMO). Fix clave: plugins bundled necesitan `plugins.entries.discord.enabled: true`. Foundation vacía. BRAIN.md no existe.

## Personas
- **Alfonso** — Madrid, fundador/marketing de Hospital Capilar. Técnico, directo, no le gusta perder tiempo.

## Decisiones
- **2026-02-24**: Esta instancia es la **versión test** de SanchoCMO. Objetivo: iterar, versionar, aprender.
- **2026-02-24**: Foundation se hace siempre desde el **Discord del cliente**, no desde webchat.
- **2026-02-24**: Google Workspace autenticado (`alfonso@growth4u.io`), Notion API key configurada, Tailscale serve activo (`https://sancho-cmo.taild48df2.ts.net`), auth por password.
- **2026-03-02**: Reset completo de datos de Hospital Capilar. Backup en `_backups/2026-03-02/`. Motivo: Foundation hecha sin seguir DAG, GTM prematuro. Empezar de cero con proceso correcto.

## Learnings
- **Discord plugin fix**: `openclaw plugins enable discord` no persiste (bug). Usar `openclaw config set plugins.entries.discord.enabled true --json` y luego restart gateway.
- **Gateway restart**: Si hay procesos zombie del gateway, `kill -9 <pid>` antes de reinstalar LaunchAgent.

## Sistema — Estado Actual (actualizado 2026-03-02)
- **Gateway**: Running, LaunchAgent, ws://127.0.0.1:18789
- **Tailscale**: serve en `https://sancho-cmo.taild48df2.ts.net`, auth por password
- **Discord**: Bot SanchoCMO conectado, allowlist Alfonso (1334604955687977042)
- **Google Workspace**: gog CLI autenticado (alfonso@growth4u.io) — todos los servicios
- **Notion**: API key configurada en entorno
- **Supabase**: 9 tablas creadas, vacías (psapmujzxhaxraphddlv.supabase.co)
- **Agentes**: 4 configurados (Cervantes, Sancho, Rocinante, Escudero)
- **Skills**: 38 compartidas vía symlinks
- **Foundation**: VACÍA — reset 2026-03-02, pendiente arrancar desde cero
- **Mission Control**: HTML dashboard con Supabase live, multi-cliente

## Learnings Críticos

### Discord: Hilos SIEMPRE + NUNCA narrar pasos (2026-02-26, 2026-02-28)
- TODA respuesta en Discord va en hilo, sin excepción.
- **CRÍTICO:** NUNCA generar texto entre tool calls en Discord. Solo tool calls + NO_REPLY.

### NUNCA saltar el flujo del sistema (2026-02-26)
- sancho-start → foundation-orchestrator → gate check → Phase 2. Sin atajos.
- El DAG de pillars tiene dependencias. Layer 0 → 1 → 2 → 3 → 4 → 5.
- Gate check SIEMPRE antes de cambiar de phase.

### Self-QA > Rocinante para docs internos (2026-02-27)
- Self-QA obligatorio, Rocinante opcional para Foundation docs.
- Checklist.md en cada Foundation skill para 100% prompt execution.

### Foundation antes de GTM — LECCIÓN CLAVE
- Primera ronda con Hospital Capilar: GTM generado ANTES de Foundation correcta.
- Contenido usable pero sobre cimientos débiles. No repetir.

## Bugs Pendientes

### SIGTERM en scripts Python niche-discovery-100x (2026-03-03)
- Scripts serp_search.py, scrape_urls.py, extract_problems.py se cuelgan silenciosamente y son matados con SIGTERM
- API keys están OK, config JSON válido, --help funciona
- Ocurre con config completo (3.900 búsquedas) Y reducido (375 búsquedas)
- El script no produce ningún output antes de morir
- Probablemente: las llamadas a Serper API se cuelgan (timeout/network) y el sistema exec mata el proceso
- Workaround: usar harvest de Foundation (40 problemas) y herramientas agente (web_search) en vez de scripts
- TODO: debuggear offline, probar ejecutar script fuera de OpenClaw exec

## Estado Hospital Capilar
- **Foundation:** VACÍA — reset completo 2026-03-02
- **Backup:** `_backups/2026-03-02/hospital-capilar-backup/` (1.1MB, todo lo anterior)
- **Supabase:** Vacío
- **Próximo paso:** Arrancar Foundation desde cero siguiendo DAG correcto
