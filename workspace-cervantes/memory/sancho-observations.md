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
