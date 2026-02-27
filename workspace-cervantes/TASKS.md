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
| T-014 | Panel de APIs en Mission Control (globales + por cliente) | `[docs]` | P2 | Alfonso 2026-02-24 | Estado de APIs: Anthropic, OpenRouter, Brave, OpenClaw + por cliente. |
| T-032 | Auto-sync TASKS.md → MC (tareas se actualizan solas) | `[docs]` | P1 | Cervantes 2026-02-26 | Opciones: (A) regenerate.py en cron cada 30min, (B) file watcher en mc-server.js, (C) esperar a Next.js T-010. |
| T-027 | Docsify + Cloudflare Pages para docs fundacionales | `[infra]` | P1 | Alfonso 2026-02-26 | Montar Docsify sobre brand/ + hostear en Cloudflare Pages (gratis). Ya tenemos /mc/docs/ como viewer interno. |

### ✅ Aprobadas (listas para ejecutar)

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|
| T-035 | URLs obligatorias en market-intelligence + sugerencia deep-research | `[skill]` | P1 | Alfonso 2026-02-27 | PRD en T-035.md. Implementar citación obligatoria + bloque deep-research. |
| T-036 | Deep-research como profundizador universal de Foundation | `[flow]` | P1 | Alfonso 2026-02-27 | PRD en T-036.md. Crear skill + editar 16 Foundation skills. |
| T-010 | Migrar Mission Control a Next.js (dual view) | `[docs]` | P2 | Alfonso 2026-02-24 | PRD actualizado: vista cliente + vista admin. Depende de T-013. ÚLTIMA — cuando lo estático esté estable. |




### 🔧 En Progreso

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|


### ✔️ Completadas (recientes)

| ID | Tarea | Cat | Fecha | Notas |
|---|---|---|---|---|
| T-022 | Métricas de coste por cliente | `[cost]` | 2026-02-27 | cost-tracker.py + cron 23:00 + MC muestra costes por cliente y global. Cron delivery arreglado. |
| T-037 | Aislamiento de contexto por cliente | `[flow]` | 2026-02-27 | `_system/client-context-isolation.md` + regla 0 en SOUL.md. P0 por Alfonso. |
| T-034 | Integraciones y costes por cliente en MC | `[infra]` | P1 | ✅ 2026-02-26 | integrations.json + costs.json por cliente, sección en MC vista cliente y global, regenerate.py actualizado |
| T-020 | Backup automático de datos de cliente | `[infra]` | P1 | ✅ 2026-02-26 | Cron backup-sancho arreglado (modelo haiku→sonnet), ejecutado OK. |
| T-024 | Auditar e instalar skills de ClawHub | `[skill]` | P1 | ✅ 2026-02-26 | Instalados: google-ads, meta-ads, google-analytics, google-search-console, apollo, apify, social-media-extractor. |
| T-013 | Estilo visual SanchoCMO en Mission Control | `[docs]` | 2026-02-26 | Comic UI: parchment, Bangers, ink borders, flat shadows, textures |
| T-023 | Sistema de selección de modelos multi-tier | `[cost]` | 2026-02-26 | Opus/Sonnet/Haiku por agente. Heartbeats → Haiku. QA → Sonnet. |
| T-025 | Separar tareas sistema vs cliente en MC | `[docs]` | 2026-02-26 | Vista global = todas. Vista cliente = solo [client]. |
| T-016 | Auto-binding Discord channels al crear cliente | `[infra]` | 2026-02-26 | auto-bind.py escrito + probado |
| T-017 | Script new-client.sh | `[infra]` | 2026-02-26 | Script + templates creados |
| T-019 | Health check endpoint / cron | `[infra]` | 2026-02-26 | healthcheck.sh escrito |
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
7. **Próximo ID**: T-037
