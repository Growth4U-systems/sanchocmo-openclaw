# TASKS — Cervantes Change Management

> Sistema, infraestructura, skills, agentes. Todo lo que hace que Sancho funcione.
> Las tareas de cliente van en el TASKS.md de cada Sancho.

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
| T-014 | Panel de APIs en Mission Control (globales + por cliente) | `[docs]` | P2 | Alfonso 2026-02-24 | Sección que muestre estado de todas las APIs. Dos niveles: globales (Anthropic, OpenRouter, Brave, OpenClaw) y por cliente (Notion, Supabase, Slack, Apollo, etc.). Estado: ✅/❌/⚠️. Detección automática desde .env/openclaw.json. |
| T-018 | Supabase RLS policies por agente | `[infra]` | P2 | Sancho 2026-02-24 | init-rls.sql: 12 roles PostgreSQL, 68 RLS policies, función auth por API key/header. |
| T-024 | Auditar e instalar skills de ClawHub | `[skill]` | P1 | Sancho 2026-02-24 | Fase 1: google-ads, meta-ads, GA, GSC, apollo. Fase 2: linkedin, ahrefs, landing-page-gen, x-twitter. Fase 3: social-sentiment, competitor-monitor, n8n. + built-in: sag, summarize, blogwatcher. |
| T-025 | Separar tareas sistema (Cervantes) vs cliente (Sancho) en MC | `[docs]` | P1 | Alfonso 2026-02-25 | Vista global = tareas de Cervantes. Vista cliente = tareas del Sancho de ese cliente. Actualizar regenerate.py y mission-control.html. |

### ✅ Aprobadas (listas para ejecutar)

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|
| T-010 | Migrar Mission Control a Next.js | `[docs]` | P2 | Alfonso 2026-02-24 | Reemplazar HTML estático por Next.js con API routes, CRUD tareas en vivo, Foundation progress, SSR. ÚLTIMA — cuando lo estático esté estable. |
| T-013 | Estilo visual SanchoCMO en Mission Control | `[docs]` | P2 | Alfonso 2026-02-24 | Identidad visual: colores, tipografía, logo/icono, ilustraciones via nano-banana-pro. Favicon, header branding, estilo coherente. |
| T-015 | Dispatch bot real (discord.js) | `[flow]` | P1 | Sancho 2026-02-24 | Bot Node.js separado. Reacción ✅ en #campaigns → parsea → crea threads en canales de agentes → cada agente recibe brief. Stack: discord.js v14, dotenv, PM2. |
| T-016 | Auto-binding Discord channels al crear cliente | `[infra]` | P2 | Sancho 2026-02-24 | Script que lee canales del guild via Discord API, matchea por nombre, genera bindings, actualiza openclaw.json. |
| T-017 | Script new-client.sh | `[infra]` | P1 | Sancho 2026-02-24 | Crear workspace de cliente: directorio, subdirs, symlinks, .env.template, sources.json vacío. Input: slug. Output: workspace listo. |
| T-019 | Health check endpoint / cron | `[infra]` | P1 | Sancho 2026-02-24 | Cron cada 6h: Gateway, Discord bot, gog auth, Notion, Supabase, Tailscale, crons. Falla → alerta #admin. OK → silencio. |
| T-020 | Backup automático de datos de cliente | `[infra]` | P1 | Sancho 2026-02-24 | git init + commit nocturno, o rsync, o Google Drive. Retención 30 días. Alerta si >48h sin backup. |
| T-021 | Multi-client routing en crons | `[infra]` | P2 | Sancho 2026-02-24 | Crons leen clients.js, iteran clientes activos, ejecutan con contexto correcto, publican en Discord correcto. |
| T-022 | Métricas de coste por cliente | `[cost]` | P2 | Sancho 2026-02-24 | Dashboard MC: tokens Anthropic, herramientas externas, Supabase. Coste/mes, breakdown por agente, tendencia, alertas. |
| T-023 | Sistema de selección de modelos multi-tier | `[cost]` | P1 | Alfonso 2026-02-24 | 4 tiers: Opus ($15/$75), Sonnet ($3/$15), Haiku ($0.80/$4), MiniMax ($0.30/$1.10). Asignar por agente/cron. Fallback chain. Ahorro estimado 50-60%. |
| T-026 | Sancho Start iterativo (onboarding conversacional) | `[flow]` | P1 | Alfonso 2026-02-26 | Convertir sancho-start en flujo pregunta-respuesta. Una pregunta → una respuesta → siguiente pregunta. |
| T-027 | Docsify + Cloudflare Pages para docs fundacionales | `[infra]` | P1 | Alfonso 2026-02-26 | Montar Docsify sobre brand/ + hostear en Cloudflare Pages (gratis). Proteger con Cloudflare Access. |
| T-028 | Foundation iterativa con aprobación por pilar | `[flow]` | P1 | Alfonso 2026-02-26 | Documento por documento. Presentar → validar → guardar → siguiente. |
| T-029 | GTM sigue flujo de campañas, no dump en brand/ | `[flow]` | P1 | Alfonso 2026-02-26 | Campaña en tabla → dispatch briefs → ejecución → QA → publicar. brand/ intocable. Incluye crear gtm-orchestrator skill. |
| T-030 | Skill funnel-architect | `[skill]` | P1 | Alfonso 2026-02-26 | Diseñar funnels de cualificación y conversión (quiz, webinar, consultation). Integrado en gtm-orchestrator DAG. |
| T-031 | Context Matrix enforcement en skills | `[flow]` | P1 | Alfonso 2026-02-26 | CONTEXT_REQUIRED + CONTEXT_WRITES en 44 skills. Regla en SOUL.md para Escuderos. Script de validación. |

### ✔️ Completadas (recientes)

| ID | Tarea | Cat | Fecha | Notas |
|---|---|---|---|---|
| T-001 | Setup inicial completo (gateway, discord, tailscale, gog, notion) | `[infra]` | 2026-02-24 | v0.1.0 |
| T-002 | BRAIN.md copiado al workspace | `[brain]` | 2026-02-24 | 1,384 líneas |
| T-003 | Discord allowlist configurada | `[infra]` | 2026-02-24 | User ID Alfonso |
| T-004 | CHANGELOG.md + VERSION.md + Mission Control | `[docs]` | 2026-02-24 | Dashboard HTML estático |
| T-005 | Sistema de tareas (TASKS.md) | `[docs]` | 2026-02-24 | Este archivo |
| T-006 | Mission Control HTML con tareas, multi-cliente, guía | `[docs]` | 2026-02-24 | Dashboard completo estático |
| T-007 | Skills legibles + proponer cambio desde Mission Control | `[docs]` | 2026-02-24 | Panel lateral + skills-data.js |
| T-008 | Nav contextual (global vs cliente) | `[docs]` | 2026-02-24 | Foundation/Campañas solo con cliente |
| T-009 | Script regeneración automática del dashboard | `[infra]` | 2026-02-24 | regenerate.py + agents-data.js |
| T-011 | Heartbeat configurado — checks periódicos | `[infra]` | 2026-02-24 | HEARTBEAT.md + heartbeat-state.json |
| T-012 | Dispatch map — auto-dispatch a agentes en Discord | `[flow]` | 2026-02-24 | dispatch-map.json con channel IDs |

### 🧊 Congeladas

_ninguna_

### ❌ Rechazadas

_ninguna_

---

## Reglas

1. **Todo cambio al sistema pasa por aquí.** Sin excepción.
2. **Cervantes puede proponer tareas** pero no auto-aprobarse.
3. **Cambios menores** (typos, formatting) no necesitan tarea — van directo.
4. **Tareas completadas** generan entrada en CHANGELOG.md automáticamente.
5. **Tareas de cliente van en el TASKS.md del Sancho de ese cliente.**
6. **Próximo ID**: T-026
