# TASKS — Cervantes Change Management

> Archivo único de tareas. Sistema + clientes, todo aquí.
> Usa tags de cliente (`[hospital-capilar]`, `[otro-cliente]`) para filtrar por cliente.
> Tareas sin tag de cliente = tareas de sistema/infra.

## Cómo funciona

1. **Proponer**: Cualquiera dice "quiero cambiar X" (webchat, Discord #admin)
2. **Cervantes registra**: Creo la tarea aquí con estado `📥 propuesta`
3. **Review**: Alfonso (o admin designado) revisa y aprueba/rechaza
4. **Ejecutar**: Solo tareas `✅ aprobada` se ejecutan
5. **Cerrar**: Al completar → `✔️ hecha` + entrada en CHANGELOG.md

## Estados

| Emoji | Estado | Quién |
|---|---|---|
| 📥 | Propuesta | Cualquiera propone |
| 👀 | En review | Cervantes analiza impacto |
| ✅ | Aprobada | Alfonso aprueba |
| ❌ | Rechazada | Alfonso rechaza (con razón) |
| 🔧 | En progreso | Cervantes ejecuta |
| ✔️ | Hecha | Completada + en CHANGELOG |
| 🧊 | Congelada | Aparcada para más adelante |
| 🗑️ | Descartada | No procede ahora (con razón) |

## Prioridades

| Tag | Significado |
|---|---|
| `P0` | Crítico — bloquea trabajo |
| `P1` | Importante — hacer esta semana |
| `P2` | Normal — cuando toque |
| `P3` | Nice-to-have — backlog |

## Categorías

| Tag | Área |
|---|---|
| `[infra]` | Gateway, Tailscale, servicios, DevOps |
| `[skill]` | Skills nuevas o modificaciones |
| `[agent]` | Agentes, SOULs, configuración |
| `[flow]` | Workflows, procesos, protocolos |
| `[brain]` | BRAIN.md, sistema de decisión |
| `[tool]` | Herramientas externas, integraciones |
| `[docs]` | Documentación, changelog, mission control |
| `[cost]` | Optimización de costes y modelos |

---

## 📋 Board

### 📥 Propuestas (pendientes de aprobación)

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|

| T-032 | Auto-sync TASKS.md → MC (tareas se actualizan solas) | `[docs]` | P1 | Cervantes 2026-02-26 | Opciones: (A) regenerate.py en cron cada 30min, (B) file watcher en mc-server.js, (C) esperar a Next.js T-010. |
| T-043 | Tablas estratégicas en Supabase (competitors, niches, value_criteria, assets, messaging) | `[infra]` | P1 | Alfonso 2026-03-02 | 6 tablas nuevas para datos relacionales estratégicos. Arquitectura híbrida: Supabase owner de datos estructurados, markdown owner de narrativa. Supabase MCP Server para queries desde agentes. PRD completo en `_system/prds/T-043.md`. |
| T-044 | Debug SIGTERM en scripts Python niche-discovery-100x | `[skill]` | P2 | Alfonso 2026-03-03 | **RESUELTO** — Scripts funcionan correctamente. Causa raíz: Gateway restarts (SIGTERM) matan procesos hijo. 40+ restarts en logs recientes. Discord health-monitor reinicia cada 10min ("stuck"). Workaround: usar `background:true` + `process(poll)`, o ejecutar en terminal separado. Scripts probados: serp_search.py completó 125 queries en ~2min sin error. |
| T-045 | **BUG P1** — Error "thinking blocks cannot be modified" bloquea sesiones con extended thinking | `[infra]` | P1 | Cervantes 2026-03-09 | **Síntoma**: API Anthropic rechaza request con `messages.N.content.M: thinking or redacted_thinking blocks in the latest assistant message cannot be modified`. Bloquea al usuario, requiere `/reset`. **Causa raíz**: Bug upstream en `@mariozechner/pi-ai` — `sanitizeSurrogates()` modifica texto de thinking blocks firmados criptográficamente antes de reenviar a Anthropic (line ~732 de `anthropic.ts`). Cuando el texto contiene surrogates Unicode no pareados, la firma se invalida. **Issue upstream**: [openclaw#24612](https://github.com/openclaw/openclaw/issues/24612). **PR fix**: [openclaw#24665](https://github.com/openclaw/openclaw/pull/24665) (pnpm patch de pi-ai). **Estado**: Fix NO incluido en v2026.3.7 (nuestra versión actual). **Workaround temporal**: `/reset` la sesión. **Acción**: (1) Verificar si PR #24665 ya fue mergeado en una versión más reciente y actualizar OpenClaw, o (2) aplicar pnpm patch local al paquete `@mariozechner/pi-ai`. |
| T-046 | Auditoría de tokens/costes — reducir spend 20-30% | `[cost]` | P1 | Cervantes 2026-03-15 | Dashboard de tokens, auditorías regulares, subagents para sesión lean, aislar crons. Fuente: bibliografía "Optimize Token Usage with OpenClaw" + "Avoid Context Limitations". Cron semanal `Weekly Token Audit` ya creado. Thread Discord: 1482642745905512601. |
| T-047 | Cron Reliability — 0 silent failures en 7 días | `[infra]` | P1 | Cervantes 2026-03-15 | Listar crons activos, verificar ejecución, añadir webhook monitoring, documentar patrones de fallo, restart catch-up. Fuente: bibliografía "Optimizing OpenClaw Cron Jobs for Reliability". Thread Discord: 1482642836586233886. |
| T-048 | Validar Skill Creator 2.0 — A/B testing + description optimization | `[skill]` | P1 | Cervantes 2026-03-15 | Revisar capacidades actuales de `skill-creator`, comparar con features (A/B testing, description optimization). Fuente: bibliografía "Optimize Claude Skills with Skill Creator 2.0". Thread Discord: 1482642903863136287. |
| T-049 | Self-Improvement Loop para Skills — skills como componentes vivos | `[skill]` `[flow]` | P2 | Cervantes 2026-03-15 | Post-ejecución: evaluar output → proponer mejora al SKILL.md con evidencia. Cognee-skills: observar → inspeccionar → enmendar → evaluar. Meta: 1 skill mejorado/semana. Fuente: bibliografía "Enhancing Agent Skills with Self-Improvement Mechanisms". Thread Discord: 1482642972712505395. |
| T-050 | ✔️ Reestructurar Memory Stack — 3 fases (core, durabilidad, inteligencia) | `[flow]` | P2 | Cervantes 2026-03-15 | **DONE 2026-03-26.** 3 fases completadas: (1) Core — directorios daily/topics/clients/archive, MEMORY.md compacto, scripts actualizados. (2) Durabilidad — compactación mensual, INDEX.md auto, memory_search verificado. (3) Inteligencia — `brand/{slug}/memory.md` canonical, pattern detection semanal, memory decay scoring. Thread Discord: 1482643082393419969. |
| T-051 | GEO/AEO Strategy — optimizar para AI search engines | `[skill]` | P3 | Cervantes 2026-03-15 | Mejorar skill `ai-seo` con Reddit seeding, YouTube B2B, decision pages. Medir citaciones LLM con Profound/Amplitude. Fuente: bibliografía "Optimizing LLM Mentions with GEO Strategy" + "AI-Driven SEO for SaaS". Thread Discord: 1482643158251864135. |
| T-052 | ✔️ Arquitectura Agentes Narrow — single metric por agente | `[agent]` | P3 | Cervantes 2026-03-15 | **DONE 2026-03-26.** Auditoría completada. Decisiones: (1) Mantener 4 agentes (Opción A), no split. (2) NSM por cliente como métrica de Sancho — no fixed metric. (3) Aprendizaje vive en skills, no en agentes. (4) HAGO/NO HAGO + single metric en los 4 SOUL.md. (5) NSM campo REQUIRED en company-context + business-model-audit schemas. (6) Skill learning loop → tarea separada T-049. Thread Discord: 1482643246827176077. |
| T-053 | Content Automation Pipeline — scrape → cluster → generar → publicar | `[flow]` `[skill]` | P3 | Cervantes 2026-03-15 | Pipeline: Reddit/newsletters/X → análisis → generación → review → publish. Integrar Apify. Piloto SanchoCMO. Meta: 3-5 piezas/semana. Fuente: bibliografía "Automating Content Curation" + "Transform Reddit into LinkedIn". Thread Discord: 1482643323754909868. |
| T-054 | GTM con AI Agents — mapear 7 skills del pipeline $1.5M | `[skill]` `[flow]` | P3 | Cervantes 2026-03-15 | Mapear 7 skills GTM vs nuestros 38. Identificar gaps. Evaluar integración CRM (Apollo/HubSpot). Fuente: bibliografía "Optimizing GTM Motion with AI Agents". Thread Discord: 1482643405354827836. |
| T-055 | Automated Ad Creation — ciclo completo Meta Ads con AI | `[skill]` `[tool]` | P3 | Cervantes 2026-03-15 | Extender `ad-creative` para gestión automática. Meta Ads API + Nano Banana para creatividades. Fuente: bibliografía "Automated META ADS Management" + "Automated Ad Creation with Claude Code". Thread Discord: 1482643484136570992. |



### ✅ Aprobadas (listas para ejecutar)

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|





### 🔧 En Progreso

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|

| T-010 | Migrar Mission Control a Next.js (dual view) | [docs] | P1 | Alfonso 2026-02-24 | **Phase 1 COMPLETE.** Starter clonado, npm install OK (838 pkg). Error 500 expected (no DB). Commit 1e95719. Ready for Phase 2: Auth + Supabase. |

### ✔️ Completadas (recientes)

| ID | Tarea | Cat | Fecha | Notas |
|---|---|---|---|---|
| T-014 | Panel de APIs en Mission Control (globales + por cliente) | `[docs]` | 2026-03-04 | 23 servicios (6 LLM, 5 Data, 5 Infra, 5 Media, 2 Marketing). Health checks reales. Gestión de API keys desde MC (masked, auto-verify). Restart Gateway desde UI. `_system/api-health.json` persistente. |
| T-042 | Auditoría completa de skills (57 auditadas) | `[skills]` | 2026-03-03 | 57 skills auditadas. Foundation pipeline 8.1/10 (excelente). 11 skills oversized (20-57KB). 4 merge candidates. 4 gaps: linkedin-content, reporting, landing-page, case-study. Reporte en `memory/T-042-skills-audit.md`. |
| T-041 | Cron outputs siempre en hilos — patrón obligatorio de hilo para Discord | `[flow]` | 2026-03-01 | Todos los crons que publican en Discord ahora siguen patrón: 1) mensaje corto al canal, 2) thread-create desde ese mensaje, 3) contenido completo dentro del hilo. Actualizados: Daily Pulse, Weekly Synthesis, Meeting Intelligence, Healthcheck, Backup, Cervantes observa. Weekly Synthesis cambiado de delivery:announce a delivery:none con publish explícito. |

| ID | Tarea | Cat | Fecha | Notas |
|---|---|---|---|---|
| T-038 | Fix daily-pulse — no detecta mensajes de Discord | `[infra]` | 2026-02-27 | Bug: cron prompt no incluía instrucciones para leer Discord. Fix: cron message reescrito con channel IDs explícitos + message(action=read). sources.json actualizado con IDs. |
| T-040 | Intelligence Log — histórico completo + visualización en MC | `[flow]` `[docs]` | 2026-02-28 | intelligence-log.json centralizado (12 entries migradas). MC renderIntelligence() con filtros por tipo, búsqueda, tabla. Skills actualizados para escribir al log. Dedup mantenida. PRD en T-040.md. |
| T-039 | Acceso público a docs desde móvil (sin Tailscale) | `[infra]` | 2026-03-01 | Tailscale Funnel en puerto 8443 para /mc/docs (público). Serve en 443 para / y /mc (tailnet only). URL: https://sancho-cmo.taild48df2.ts.net:8443/mc/docs/ |
| T-035 | URLs obligatorias en market-intelligence + sugerencia deep-research | `[skill]` | 2026-02-27 | Reglas de citación en market-intelligence + 4 skills cuantitativos. Bloque deep-research en 13 skills. |
| T-036 | Deep-research como profundizador universal de Foundation | `[flow]` | 2026-02-27 | Skill deep-research creada. Bloque "profundizar" añadido a 13 Foundation skills. PRDs en T-035.md y T-036.md. |
| T-022 | Métricas de coste por cliente | `[cost]` | 2026-02-27 | cost-tracker.py + cron 23:00 + MC muestra costes por cliente y global. Cron delivery arreglado. |
| T-037 | Aislamiento de contexto por cliente | `[flow]` | 2026-02-27 | `_system/client-context-isolation.md` + regla 0 en SOUL.md. P0 por Alfonso. |
| T-034 | Integraciones y costes por cliente en MC | `[infra]` | P1 | ✅ 2026-02-26 | integrations.json + costs.json por cliente, sección en MC vista cliente y global, regenerate.py actualizado |
| T-020 | Backup automático de datos de cliente | `[infra]` | P1 | ✔️ 2026-03-04 | COMPLETADA. Script backup.sh + cron 03:00 diario + alerta >48h en #admin. Funcionando sin fallos desde 26 Feb. Aprobada por Alfonso. |
| T-024 | Auditar e instalar skills de ClawHub | `[skill]` | P1 | ✅ 2026-02-26 | Instalados: google-ads, meta-ads, google-analytics, google-search-console, apollo, apify, social-media-extractor. |
| T-013 | Estilo visual SanchoCMO en Mission Control | `[docs]` | ✔️ 2026-02-26 | Comic UI: parchment, Bangers, ink borders, flat shadows, textures. Logo/favicon/ilustraciones pendientes para T-010. |
| T-023 | Sistema de selección de modelos multi-tier | `[cost]` | 2026-02-26 | Opus/Sonnet/Haiku por agente. Heartbeats → Haiku. QA → Sonnet. |
| T-025 | Separar tareas sistema vs cliente en MC | `[docs]` | 2026-02-26 | Vista global = todas. Vista cliente = solo [client]. |
| T-016 | Auto-binding Discord channels al crear cliente | `[infra]` | 2026-02-26 | auto-bind.py escrito + probado |
| T-017 | Script new-client.sh | `[infra]` | 2026-02-26 | Script + templates creados |
| T-019 | Health check endpoint / cron | `[infra]` | ✔️ 2026-03-04 | COMPLETADA. Cron cada 6h chequea 24 servicios via MC endpoint + Tailscale. Debounce (solo alerta en cambio de estado). Escribe a `_system/api-health.json` → sección APIs de MC. Botón manual MC preservado. 20/20 servicios OK. Aprobada por Alfonso. |
| T-026 | Sancho Start iterativo (onboarding conversacional) | `[flow]` | 2026-02-26 | Skill sancho-start reescrita |
| T-028 | Foundation iterativa con aprobación por pilar | `[flow]` | 2026-02-26 | Skill foundation-orchestrator reescrita |
| T-029 | GTM sigue flujo de campañas | `[flow]` | 2026-02-26 | Skill gtm-orchestrator creada |
| T-030 | Skill funnel-architect | `[skill]` | 2026-02-26 | Skill creada |
| T-031 | Context Matrix enforcement en skills | `[flow]` | 2026-02-26 | CONTEXT_REQUIRED/WRITES en 44 skills + regla en SOUL.md |
| T-012 | Dispatch map — auto-dispatch a agentes en Discord | `[flow]` | 2026-02-24 | dispatch-map.json v3 con channel roles |
| T-011 | Heartbeat configurado — checks periódicos | `[infra]` | 2026-02-24 | HEARTBEAT.md + heartbeat-state.json |
| T-009 | Script regeneración automática del dashboard | `[infra]` | 2026-02-24 | regenerate.py + agents-data.js |
| T-008 | Nav contextual (global vs cliente) | `[docs]` | 2026-02-24 | Foundation/Campañas solo con cliente |
| T-007 | Skills legibles + proponer cambio desde Mission Control | `[docs]` | 2026-02-24 | Panel lateral + skills-data.js |
| T-006 | Mission Control HTML con tareas, multi-cliente, guía | `[docs]` | 2026-02-24 | Dashboard completo estático |
| T-005 | Sistema de tareas (TASKS.md) | `[docs]` | 2026-02-24 | Este archivo |
| T-004 | CHANGELOG.md + VERSION.md + Mission Control | `[docs]` | 2026-02-24 | Dashboard HTML estático |
| T-003 | Discord allowlist configurada | `[infra]` | 2026-02-24 | User ID Alfonso |
| T-002 | BRAIN.md copiado al workspace | `[brain]` | 2026-02-24 | 1,384 líneas |
| T-001 | Setup inicial completo (gateway, discord, tailscale, gog, notion) | `[infra]` | 2026-02-24 | v0.1.0 |

### 🧊 Congeladas

_ninguna_

### 🗑️ Descartadas

| ID | Tarea | Cat | Fecha | Razón |
|---|---|---|---|---|
| T-015 | Dispatch bot real (discord.js) | `[flow]` | 2026-02-27 | Conflicto de token con OpenClaw Discord plugin + código usa dispatch-map v1 (obsoleto). El flujo actual con systemPrompts ya cubre el dispatch. |
| T-018 | Supabase RLS policies por agente | `[infra]` | 2026-02-27 | Supabase no se usa aún. RLS tiene sentido cuando haya datos reales. |
| T-021 | Multi-client routing en crons | `[infra]` | 2026-02-27 | Ya resuelto de facto con systemPrompts + clients.json + dispatch-map v3. No se necesita script separado. |
| T-027 | Docsify + Cloudflare Pages para docs fundacionales | `[infra]` | 2026-03-01 | Tailscale Funnel (T-039) ya expone /mc/docs/ públicamente. No necesitamos hosting separado. |

### ❌ Rechazadas

_ninguna_

---

## Reglas

1. **Todo cambio al sistema pasa por aquí.** Sin excepción.
2. **Cervantes puede proponer tareas** pero no auto-aprobarse.
3. **Cambios menores** (typos, formatting) no necesitan tarea — van directo.
4. **Tareas completadas** generan entrada en CHANGELOG.md automáticamente.
5. **Tags de cliente**: `[hospital-capilar]`, `[otro-slug]` en la columna Cat o Notas. Sin tag = sistema.
6. **Un solo archivo**: Todo aquí. MC filtra por tag de cliente.
7. **Próximo ID**: T-056
