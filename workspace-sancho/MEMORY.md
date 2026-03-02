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

## Learnings Críticos

### Discord: Hilos SIEMPRE + NUNCA narrar pasos (2026-02-26, 2026-02-28)
- Alfonso me corrigió: los resultados de cron (daily pulse, meeting intelligence) los publiqué sin hilo.
- Regla reforzada en SOUL.md: TODA respuesta en Discord va en hilo, sin excepción.
- Incluye system messages, cron results, cualquier output.
- **CRÍTICO (2026-02-28):** NUNCA generar texto entre tool calls en Discord. Cada bloque de texto intermedio ("Now let me scrape...", "I have enough context...") aparece como mensaje público. Solo tool calls + respuesta final NO_REPLY.

### NUNCA saltar el flujo del sistema (2026-02-26)
- sancho-start → foundation-orchestrator → gate check → Phase 2. Sin atajos.
- El DAG de pillars tiene dependencias por algo. Layer 0 → 1 → 2 → 3 → 4 → 5.
- Positioning sin SWOT/ICP previo = positioning superficial.
- "Sí" del usuario a un paso ≠ "haz todos los pasos siguientes de golpe".
- Gate check SIEMPRE antes de cambiar de phase. Es advisory pero obligatorio mostrarlo.

### Self-QA > Rocinante para docs internos (2026-02-27)
- Alfonso desafió calidad de market-intelligence (v1-v5 iterations). Problema raíz: solo 45% del prompt ejecutado.
- Decisión: **Self-QA obligatorio, Rocinante opcional** para Foundation docs. Rocinante solo para external-facing content.
- Checklist.md añadido a market-intelligence skill (30 items). Cervantes tasked para añadir checklist.md a todos los 13 Foundation skills.
- Documents should follow their prompt 100%, not 45%. El checklist previene esto.

### Usar Supabase como Context Lake (2026-02-26)
- Las 9 tablas existen y están vacías. Debo poblarlas.
- Archivos ./brand/ son complementarios, no sustitutos de la DB.
- Pendiente: clarificar con Alfonso el flujo exacto md ↔ Supabase.

### Foundation antes de GTM
- La primera sesión con Hospital Capilar salió con buen contenido pero proceso incorrecto.
- Generé GTM (keywords, quiz, ads, emails, briefs) ANTES de completar Foundation correctamente.
- El contenido es usable pero prematuro. Se hizo sin SWOT, sin ICP 100x, sin validation.

## Estado Hospital Capilar
- **Foundation:** Regenerados 4 pilares con versionado v2 (2026-02-28): company-context, budget, business-model, ope-canvas. Self-QA tags añadidos. Rocinante QA: 8.5-9/10. Version history completo (v1.md + history.json).
- **Brand Voice:** Ejecutado 2026-02-28 (Full mode, Hybrid approach, website scraping + ECP cross-reference). Guardado en `brand/hospital-capilar/brand-voice/current.md`.
- **Visual Identity:** Bloqueado (2026-02-28) porque brand-voice estaba en "not-started" cuando se intentó. Ahora desbloqueado.
- **Positioning:** v2 completado 2026-02-27. 6 ECPs definidos, UVP core "Entre el Pilexil y la cirugía, hay un mundo que no conoces". ECP 1 (Frustrado Minoxidil) y ECP 2 (Mujer Hormonal) son los más fuertes.
- **Contenido (2026-02-28):** Calendario editorial agosto (Escudero), calendario marzo (Escudero), post blog mesoterapia capilar 800 palabras (Escudero con brand voice aplicado).
- **Supabase:** Vacío. Nada migrado.
- **GTM (prematuro Feb 26):** keyword-plan, quiz-structure, ad-copy-tratamientos, email-sequence-postcirugía, briefs-creativos — guardados pero generados sin seguir flujo correcto.

## Eventos Recientes (Feb 27-28)

### 2026-02-27 — Market Intelligence Deep Dive
- Sesión larga con Alfonso (10:00-12:20) refinando market-intelligence v1→v5
- Alfonso criticó: "Too many tables, not enough analysis" + "Is this actually a good market analysis?" + "45% completion vs the prompt"
- Decisión: Self-QA reemplaza Rocinante para Foundation docs
- Skill reestructurado siguiendo skill-creator principles: SKILL.md 372→111 lines, references/ creado (concepts.md, schema.md, checklist.md, prompt.md)
- Cervantes tasked para añadir checklist.md a todos los 13 Foundation skills

### 2026-02-28 — Doc Regeneration + Brand Voice
- Regeneración masiva: company-context v2, budget v2, business-model v2, ope-canvas v2
- Todos con version tags, Self-QA inline, history.json, v1.md preservado
- Rocinante QA external: company-context 9/10, budget 8.5/10, business-model + ope-canvas pending → APROBADO CON OBSERVACIONES
- Brand-voice ejecutado (Full mode, Hybrid approach). Foundation state actualizado.
- Generación de contenido: calendario editorial agosto/marzo, post blog mesoterapia capilar (Escudero, brand voice aplicado)

### Decisiones de Sistema
- **Self-QA mandatory, Rocinante optional** para Foundation docs (27-Feb)
- **Checklist.md en todos los Foundation skills** para garantizar 100% prompt execution (27-Feb)
- **skill-creator principles** validados: lean SKILL.md + rich references/ = clear execution (27-Feb)
- **Discord: NUNCA texto entre tool calls** — solo tool calls + respuesta final NO_REPLY (28-Feb)
