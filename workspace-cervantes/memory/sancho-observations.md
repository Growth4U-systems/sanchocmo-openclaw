# Observaciones Sancho — 2026-04-01

## Sesiones (últimas 24h): ~38 sesiones activas

| Canal | Tipo | Estado | Notes |
|-------|------|--------|-------|
| Discord | #onboarding (Criptan) | ✅ done | Alfonso pidió link MC → Sancho generó mcToken y entregó URL |
| Discord | #api-alarife-error-500 (Brain) | ✅ done | Martin pidió relay a Paymatico → ejecutado correctamente |
| Discord | #web (Paymatico) | ✅ done | Verificó noindex tag en LP Fitness. Sesión cara: $12, 218K tokens acumulados |
| Discord | #intelligence (HC) | ✅ | Daily Pulse publicado — 0/9 canales con actividad humana |
| Discord | #insights (G4U) | ✅ | Morning Metrics con análisis de Meta Ads + 24 contactos sin fuente |
| Discord | #nuevo-cliente-criptan (Brain) | ✅ done | Setup completado, 17 carpetas/archivos |
| MC Chat | Criptan (×7 sesiones) | ✅ | strategy, recurring, task:t01 — onboarding activo |
| MC Chat | Growth4U (×5 sesiones) | ✅ | general, metrics-setup, recurring, competitor-analysis, atalaya |
| Cron | Daily Pulse (HC) | ✅ $0.94 | Sin actividad humana en HC |
| Cron | Morning Metrics Multi-Client | ✅ $1.25 | G4U report OK, HC/Paymatico/Masavo sin APIs |
| Cron | Call Prep (G4U) | ✅ $2.60 | Solo reuniones internas, sin leads GHL mañana |
| Cron | cost-tracker-daily (Sancho) | ✅ $1.65 | Sin anomalías, primer día del mes |
| Cron | Regenerar Dashboard | ✅ $2.43 | 54 tareas, 100 eventos, 35/81 pilares |
| Cron | Daily Metrics Collector | ⚠️ running | Abortado 1×, re-triggered, still "running" |
| Cron | update-skills | ⚠️ running | Abortado + Connection error — no completó |
| Cron | memory-compact-monthly | ⚠️ running | SIGTERM durante generación de summary — incompleto |
| Cron | Meeting Intelligence | ✅ $1.14 | Sin reuniones nuevas desde 18/03 |
| Cron | Lead Sync (G4U) | ❌ FAILED | 8+ overloaded_error consecutivos, nunca ejecutó |
| Heartbeat | Sancho | ✅ | Email + Calendar OK |

## Errores / Fallos

1. **Anthropic `overloaded_error` — epidemia nocturna** ⚠️ NUEVO
   - Entre ~22:00-00:00 UTC del 31/03 hubo un brote masivo de errores 529
   - Afectó: Lead Sync (8+ errores, FAILED), Sancho heartbeat (3 errores), Criptan #onboarding (2 errores), cervantes main (1 error)
   - **Lead Sync nunca ejecutó** — todas las retries fallaron por overloaded
   - No es un error de Sancho, es upstream (Anthropic API capacity)

2. **Crons zombie "running"** ⚠️ NUEVO
   - `update-skills`: aborted + connection error, status "running" pero sin actividad
   - `memory-compact-monthly`: SIGTERM mataron el proceso durante summary generation, status "running"
   - `Daily Metrics Collector`: aborted 1×, re-triggered, status "running"
   - Estos crons no se recuperaron del abort/error y quedaron en estado zombie

3. **Paymatico #web — sesión hinchada** ⚠️ persistente
   - 218K tokens, $12.05 — sesión acumulativa sin compact
   - Es la sesión más cara de las últimas 24h por mucho

4. **Morning Metrics — 3 clientes sin APIs** ⚠️ persistente
   - HC, Paymatico, Masavo saltados por falta de APIs

## Preguntas sin respuesta

- Ninguna. Alfonso preguntó por MC link de Criptan → resuelto. Martin pidió relay → resuelto.

## Reglas de canal

✅ **MC Chat**: Responde directo sin message tool — correcto en todas las sesiones
✅ **Discord**: Usa message tool correctamente, hilos cuando corresponde
✅ **Client isolation**: Datos de cada cliente solo en sus canales
✅ **Exec warning**: Sancho mostró advertencia al ejecutar exec desde guild de cliente (Criptan #onboarding) — buen cumplimiento de Rule 13

## Patrones de mejora

1. **🟢 Call Prep estable**: Segundo día consecutivo sin error de GHL. Las credenciales se mantienen.

2. **🟢 Criptan onboarding limpio**: Alfonso pidió MC link → Sancho detectó que faltaba mcToken → ofreció generarlo → lo hizo con script Python → entregó URL. Buen flujo proactivo.

3. **🟡 Lead Sync necesita fallback model**: La sesión FALLÓ completamente por Anthropic overload. Si el cron usara un modelo alternativo (Sonnet o incluso un provider distinto), podría haber sobrevivido.

4. **🟡 Crons zombie sin cleanup**: Cuando un cron se aborta o falla con connection error, queda en status "running" indefinidamente. Esto puede causar confusión en monitoring. Necesita un mecanismo de timeout/cleanup.

5. **🟡 Paymatico #web necesita compact urgente**: $12 en una sola sesión con 218K tokens acumulados. Es la sesión más cara del sistema.

6. **🟡 Todos los crons siguen en Opus**: cost-tracker ($1.65), Regenerar Dashboard ($2.43), Morning Metrics ($1.25), Call Prep ($2.60) — todos podrían ser Sonnet sin pérdida de calidad. Tema recurrente desde hace 3 días.

## Métricas del día

- **Sesiones activas**: ~38
- **Clientes con interacción humana**: 2 (Alfonso en Criptan, Martin en Brain→Paymatico)
- **Crons ejecutados OK**: 7/10
- **Crons fallidos/zombie**: 3 (Lead Sync, update-skills, memory-compact)
- **Errores Anthropic overloaded**: 15+ (concentrados en ventana nocturna)
- **Coste estimado 24h**: ~$30-35 (alto por Paymatico #web acumulativa)

## Veredicto

**Día operativo con incidente nocturno de API.** Sancho funcionó bien en las interacciones humanas (Criptan onboarding, Paymatico relay). Los crons diurnos ejecutaron correctamente. El problema fue la ola de `overloaded_error` de Anthropic entre 22:00-00:00 UTC que tumbó Lead Sync y dejó 3 crons zombie. No es un error de Sancho sino de disponibilidad upstream, pero expone la necesidad de: (1) fallback models para crons críticos, (2) cleanup automático de sesiones zombie, (3) compact de sesiones acumulativas.

**No hay urgencias que notificar a Alfonso.** Los issues son infra/upstream, no errores de comportamiento de Sancho.

---

# Observaciones Sancho — 2026-03-31

## Sesiones (últimas 24h): ~25 sesiones activas

| Canal | Tipo | Estado | Notes |
|-------|------|--------|-------|
| Discord | #01-fast-foundation (Masabo) | ✅ done | Layer 1 completa: 3 subagents (Market, Competitor, Self) ejecutados en paralelo |
| Discord | #02-market-analysis (Masabo) | ✅ done | Deep Research con +15 fuentes, Sagrada Familia angle |
| Discord | #03-competitor-analysis (Masabo) | ✅ done | 5 directos + 2 indirectos analizados |
| Discord | #intelligence (Growth4U) | ✅ | Daily Pulse + Morning Metrics + Call Prep |
| MC Chat | Criptan general | ✅ | Configuró 5 cron jobs semanales para Criptan |
| MC Chat | Criptan strategic-plan | ✅ | Lanzó 5 tareas Fase 0 en paralelo (P01-T01, P04-T01, P05-T01, P06-T01, P06-T02) |
| Subagents Criptan | P01-T01 keyword-research | ✅ done | 28 keywords BOFU en 5 clusters |
| Subagents Criptan | P04-T01 linkedin-audit | ✅ done | Auditoría LinkedIn Jorge completa |
| Subagents Criptan | P05-T01 icp-b2b | ✅ done | ICP definido con 7+ criterios |
| Subagents Criptan | P06-T01 social-seo | ✅ done | 55 keywords sociales en 6 clusters |
| Subagents Criptan | P06-T02 visual-style | ✅ done | Guía visual + 4 templates |
| Cron | Daily Pulse (HC) | ✅ | Actividad baja, insights de reunión estratégica |
| Cron | Morning Metrics | ✅ | Growth4U report — 19 contactos sin fuente detectados |
| Cron | Call Prep (G4U) | ✅ | Carlos Garcia / Outzink — match con GHL OK |
| Cron | cost-tracker-daily (Sancho) | ✅ | Sin anomalías |
| Cron | Regenerar Dashboard | ✅ | 66/151 pilares completados |
| Cron | update-skills | ✅ | 11 skills ClawHub actualizados + last30days |
| Cron | Daily Metrics Collector | ✅ | HEARTBEAT_OK |
| Heartbeat | Sancho | ✅ | Email + Calendar check correcto |

## Errores / Fallos

1. **Call Prep — GHL credentials resueltas** ✅ mejora vs ayer
   - Ayer: GHL API 401 + gog no configurado
   - Hoy: Call Prep ejecutó correctamente, encontró match Carlos Garcia Gomez / Outzink
   - Google Calendar funcionó (listó 10 eventos correctamente)

2. **Morning Metrics — 3 clientes sin APIs** ⚠️ persistente
   - HC, Paymatico, Masavo saltados por falta de APIs
   - Conocido, no-bloqueante

3. **Skill execution log vacío** ⚠️ persistente (desde 16/03)
   - skill-improvement-weekly no puede generar análisis sin datos
   - Necesita fix en el logging de ejecuciones de skills

## Preguntas sin respuesta

- Ninguna detectada. Todas las interacciones MC Chat y Discord recibieron respuesta completa.

## Reglas de canal

✅ **MC Chat**: Responde directo sin message tool — correcto
✅ **Discord**: Usa message tool, hilos correctos, menciones cuando apropiado
✅ **Subagent pattern**: 5 subagents lanzados en paralelo para Criptan — excelente uso de concurrencia
✅ **Masabo onboarding**: 3 subagents para Layer 1, todos reportaron en hilos correctos del guild Masabo
✅ **Client isolation**: Criptan datos solo en Criptan, Masabo en Masabo, G4U en G4U

## Patrones de mejora

1. **🟢 Call Prep recuperado**: Ayer fallaba por GHL 401, hoy ejecutó limpiamente con match de lead. Las credenciales se resolvieron.

2. **🟢 Paralelización excelente**: Tanto en Criptan (5 tasks en paralelo) como en Masabo (3 research pillars en paralelo). Esto es eficiencia operativa real.

3. **🟡 Costes altos en Masabo**: La sesión #01-fast-foundation acumuló $4.33 + subagents ($1.08 + $1.38 + $1.15) = ~$7.94 total para Layer 1. Es mucho para un solo cliente nuevo. Considerar usar Sonnet para subagents de research.

4. **🟡 Criptan strategic-plan session**: 129K tokens, $4.64 — sesión pesada. Las 5 tareas de Fase 0 sumaron ~$2.70 adicionales en subagents. Total ~$7.34 para kickoff estratégico.

5. **🟡 Todos los crons en Opus**: cost-tracker, metrics collector, update-skills — todos usan Opus cuando podrían usar Sonnet/Haiku sin pérdida de calidad. Esto ya estaba en la matriz de TOOLS.md pero no se ha implementado.

6. **⚠️ Criptan cron jobs creados en Opus**: Los 5 cron jobs semanales de Criptan no especifican modelo → heredarán Opus. Deberían ser Sonnet o MiniMax para reducir costes.

## Métricas del día

- **Sesiones activas**: ~25
- **Subagents spawned**: 8 (5 Criptan + 3 Masabo)
- **Clientes activos**: 3 (Growth4U, Criptan, Masabo)
- **Errores**: 0 críticos, 2 warnings persistentes
- **Coste estimado 24h**: ~$25-30 (alto por onboarding Criptan + Masabo)

## Veredicto

**Día productivo, sin errores críticos.** Sancho ejecutó correctamente onboarding de Criptan (5 tareas Fase 0) y Masabo (Layer 1 Research completa) en paralelo con los crons rutinarios de Growth4U. La calidad de output es alta — keyword research, auditorías, ICPs, visual style guides. 

**Área de mejora principal**: Costes. Mucho Opus donde bastaría Sonnet. Los cron jobs nuevos de Criptan y los subagents de research son candidatos claros para downgrade de modelo.

---

# Observaciones Sancho — 2026-03-29

## Sesiones (últimas 24h)

| Canal | Tipo | Notes |
|-------|------|-------|
| MC Chat | market-analysis | Respondió correctamente con estado actual (✅ approved, v4) |
| MC Chat | go-to-market-metrics-plan | — |
| MC Chat | visual-identity | — |
| MC Chat | task:p00-sp-t02, t01, project:p00-strategic-plan | — |
| MC Chat | general | Respondió pregunta sobre cómo modificar skills |
| Discord | #10-visual-identity (Growth4U) | Generó 3 variants de logo correctamente |
| Cron | cost-tracker-daily | ✅ |
| Cron | daily-metrics | ✅ |
| Cron | update-skills | running |
| Cron | lead-sync | running (~25h) |

## Errores

- **market-analysis**: Errores 529 (Overloaded) ×3 al inicio — se recuperó y respondió bien
- **Skill execution log**: Solo hay logs hasta 2026-03-16 (no hay registros recientes)

## Patrones

✅ **Bien**: 
- Responde correctamente en MC Chat (no usa message tool)
- En Discord: incluye menciones (@mention), envía medios correctamente
- Usa modelo Opus para tareas complejas, Sonnet/Haiku para crons
- Cost tracking y daily metrics funcionando

⚠️ **Notas**:
- lead-sync cron running ~25h (largo para un sync)
- skill-execution-log sin entradas recientes (posible bug de logging)

## Reglas de canal

✅ Respeta protocolo: MC Chat = texto directo, Discord = message tool

## Veredicto

**Todo OK**. Sin issues urgentes. La sesión de visual-identity fue particularmente limpia (generó logos + versions en una sola pasada).

---

# Observaciones Sancho — 2026-03-30

## Sesiones (últimas 24h): ~20 sesiones activas

| Canal | Tipo | Estado | Notes |
|-------|------|--------|-------|
| Discord | #01-fast-foundation (Masabo) | ✅ done | Creó 3 hilos L1 (Market, Competitor, Self) correctamente |
| Discord | #intelligence (Growth4U) | ✅ | Daily Pulse publicado + Morning Metrics con análisis |
| Discord | #learning (HC) | ✅ | Weekly Synthesis publicada con datos Trust Engine v2 |
| Discord | #lead-intelligence (G4U) | ✅ | Lead Sync completó — 2 leads actualizados con transcripts Whisper |
| Discord | #changelog (Cervantes Brain) | ✅ | Weekly Changelog v2.9.0 + Weekly Summary W13 |
| Discord | #infra (Cervantes Brain) | ✅ | Mejora Continua semanal con 6 propuestas |
| MC Chat | foundation-presentation | ✅ | 151K tokens — sesión pesada pero funcional |
| MC Chat | market-synthesis (G4U) | ✅ done | Detectó estado contradictorio en foundation-state.json |
| Cron | Daily Pulse (HC) | ✅ | 0/9 canales con actividad — correcto |
| Cron | Morning Metrics | ✅ | Growth4U report + acciones sugeridas |
| Cron | Weekly Synthesis | ✅ $0.41 | Síntesis limpia, hilo correcto |
| Cron | Weekly Changelog | ✅ $0.68 | Changelog completo v2.9.0 |
| Cron | Weekly Activity Summary | ✅ | 5 clientes, status preciso |
| Cron | Lead Sync | ✅ $4.95 | 106K tokens acumulados ⚠️ |
| Cron | Call Prep (G4U) | ❌ | GHL API 401 + gog no configurado |
| Cron | cost-tracker-daily | ✅ | HEARTBEAT_OK correcto |
| Cron | Memory Maintenance | ✅ | INDEX regenerado, MEMORY.md actualizado |
| Cron | Regenerar Dashboard | ✅ | mc-data.js + agents-data.js actualizados |
| Cron | mejora-continua-daily | ✅ $0.40 | 4 temas P0/P1 identificados |
| Cron | skill-improvement-weekly | ⚠️ | Sin datos — log vacío últimos 7 días |
| Cron | update-skills | ✅ | OpenClaw 2026.3.28 + 11 skills ClawHub |

## Errores / Fallos

1. **Call Prep — GHL API 401** ⚠️ recurrente
   - GHL API key inválido o expirado → `$GROWTH4U_GHL_API_KEY`
   - Google Calendar (gog) sin configurar → `~/.config/gog/config.json` no existe
   - Sancho manejó bien: notificó en Discord thread con instrucciones claras
   - **Acción necesaria**: Alfonso/Philippe deben regenerar GHL key y autenticar gog

2. **Lead Sync — 106K tokens acumulados** ⚠️
   - Sesión acumulativa sin /compact — cada ejecución es más cara
   - Ya señalado en Token Audit de Cervantes

3. **Skill execution log vacío** ⚠️ persistente
   - Desde 16/03 no se logean ejecuciones → skill-improvement-weekly no puede generar análisis
   - skill-improvement-weekly lo detectó correctamente y pidió activar logging

## Preguntas sin respuesta

- Ninguna detectada. Sancho respondió todas las preguntas en MC Chat y Discord.
- En market-synthesis, detectó estado contradictorio (not-started pero contenido existe) y ofreció 3 opciones al usuario — buen manejo.

## Reglas de canal

✅ **MC Chat**: Responde directo sin message tool
✅ **Discord**: Usa message tool, hilos correctos, menciones cuando apropiado
✅ **Hilo pattern**: Call Prep y otros usan correctamente send→thread-create→send-in-thread
✅ **Masabo onboarding**: Creó hilos en #onboarding del guild correcto (1483424292824940659)
✅ **No mezcla clientes**: HC datos solo en HC canales, G4U en G4U, etc.

## Patrones de mejora

1. **foundation-state.json inconsistente**: market-synthesis marcado "not-started" cuando tiene contenido aprobado. Sancho lo detectó bien pero el root cause es un state reset no controlado. Necesita fix en el código que actualiza foundation-state.
2. **Crons caros en Opus**: Weekly Changelog ($0.68), mejora-continua ($0.40), Lead Sync ($4.95). Los weekly podrían bajar a Sonnet sin pérdida de calidad.
3. **Hospital Capilar inactivo**: 0/9 canales con actividad humana. Último contacto humano: 27 mar (Philippe en #onboarding). El equipo lleva días sin interactuar.
4. **Morning Metrics parcial**: Solo Growth4U tiene APIs configuradas. HC, Paymatico, Masavo saltados. Esto es conocido pero limita el valor del cron.

## Veredicto

**Todo OK — sin urgencias.** Sancho ejecutó correctamente ~20 sesiones en 24h. Buen manejo de errores (Call Prep credentials), detección de inconsistencias (foundation-state), y onboarding limpio de Masabo. Los issues son conocidos y no-bloqueantes: GHL credentials, Lead Sync necesita compact, skill execution log vacío.
