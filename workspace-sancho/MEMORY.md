# MEMORY.md - Sancho Long-Term Memory

> Estructura: Este archivo = core compacto. Detalle por cliente → `memory/clients/*.md`. Skills → `memory/skills.md`.

## Sistema
- Gateway running (LaunchAgent), Tailscale serve (`https://sancho-cmo.taild48df2.ts.net`), Discord bot SanchoCMO
- Google Workspace (alfonso@growth4u.io), Notion API, Supabase (psapmujzxhaxraphddlv)
- **Cost alerts** → publicar en hilo "Costes APIs" (thread `1481910083255406694`) dentro de #infra. NO crear mensajes sueltos en #infra.
- **Plan Anthropic**: Claude Max $200/mes (20x). Coste fijo, NO por API. Alertar solo por anomalías de volumen (>2x promedio diario).
- 4 agentes (Cervantes/Sancho/Rocinante/Escudero), 38 skills

## Personas
- **Alfonso** — Madrid, técnico + marketing. Directo, prefiere acción sobre explicación.

## Clientes Activos
> Detalle completo en `memory/clients/{slug}.md`
- **Hospital Capilar** — Foundation vacía (reset Mar 2). Pendiente: Foundation desde cero.
- **Paymático** — Foundation L0-3 done, L4 pending. Contacto: Alex G.
- **SanchoCMO** — Foundation COMPLETA. Phase 2 Ejecución pendiente.
- **Growth4U** — Foundation L0-3 done, L4 pending. Niche Discovery complete.

## Bugs Pendientes
- Scripts Python niche-discovery-100x: SIGTERM silencioso. Workaround: web_search.

## Learnings Clave
- Foundation ANTES de GTM — sin atajos
- DAG de pillars: Layer 0→1→2→3→4→5, gate check SIEMPRE
- Self-QA obligatorio, Rocinante opcional

## Memory Structure
```
memory/
├── daily/          ← Daily notes (YYYY-MM-DD.md)
├── topics/         ← Topic-specific notes (YYYY-MM-DD-topic.md)
├── clients/        ← Per-client memory (slug.md)
├── archive/        ← Daily notes >30 días
├── skills.md       ← Skills changelog
├── *.json          ← State trackers (heartbeat, onboarding, cost, etc.)
└── *.sqlite        ← OpenClaw memory_search indices (no tocar)
```
