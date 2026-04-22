# Sancho — Observaciones de Cervantes
## 2026-04-22

---

## 📊 Sesiones de las últimas 24h

| Sesión | Canal | Status | Notas |
|--------|-------|--------|-------|
| Cron: Daily Pulse — HC | exec | ❌ **BLOCKED** | `message` tool no disponible en exec. Subagent → cross-context denied |
| Cron: Meeting Intelligence — HC | exec | ✅ OK | Publicó a HC #intelligence (msgId: 1496301234964009134) |
| Cron: Lead Sync — Growth4U | exec | ✅ OK | 1 lead nuevo (Laura Donadio). Publicó a G4U #intelligence via curl |
| Cron: Morning Metrics — Growth4U | exec | ⚠️ PARTIAL | Archivos OK, MC regenerado. `openclaw message send` → SIGKILL |
| Cron: Morning Metrics — Hulahoop | exec | ✅ OK | Sin APIs configuradas. Guardó estado. Sin Discord. |
| Cron: Call Prep Daily — Growth4U | exec | ⚠️ PARTIAL | Briefing guardado (2 leads: Blas Nieto + Marta). Discord → 403 |
| Cron: Daily Pulse — Growth4U | exec | ❌ **BLOCKED** | Mismo patrón SIGKILL que Morning Metrics |
| Cron: cost-tracker-daily | exec | ✅ OK | Sin anomalías |
| Sancho main (heartbeat) | webchat | ✅ OK | Responde ping/pong correctamente |

---

## 🔴 Errores y Skills Fallidos

### 1. `message` tool inaccesible desde exec/cron
**Afecta:** Daily Pulse (HC + Growth4U)
- La herramienta `message()` no está disponible en sesiones exec/isolated
- El skill `discord` declara `allowed-tools: ["message"]` pero no está en el toolset del runtime
- Subagent intentaron publicar → "cross-context messaging denied"
- **Impacto:** 2 crons de Daily Pulse completamente bloqueados de Discord

### 2. `openclaw message send` → SIGKILL
**Afecta:** Morning Metrics, Daily Pulse (Growth4U)
- Cada ejecución de `openclaw message send` recibe SIGKILL (timeout/kill del proceso)
- Plugin mc-chat carga pero luego se mata el proceso
- **Error del sistema:** `[plugins] [mc-chat] api.registerOutboundHook not available in this SDK version`
- **Impacto:** Growth4U no puede publicar en Discord desde crons

### 3. Discord API direct → 403
**Afecta:** Call Prep Daily (Growth4U)
- `curl -X POST https://discord.com/api/v10/channels/...` → 403 Forbidden
- El bot token no tiene permisos para ese canal (o canal no encontrado)
- **Impacto:** Briefing guardado pero no publicado

---

## ✅ Lo que funcionó bien

1. **Meeting Intelligence (HC):** Publicó correctamente a HC #intelligence (msgId: 1496301234964009134). Subagent con message tool disponible.
2. **Lead Sync (Growth4U):** 1 lead nuevo creado, publicado correctamente a #intelligence vía curl
3. **Call Prep:** Generó briefing de 2 leads correctamente (Blas Nieto, Marta DMD Asesores)
4. **Cost Tracker:** Sin anomalías. Todo en umbral.

---

## 📝 Preguntas que Sancho no supo responder
*(ninguna en las últimas 24h — solo respuestas pong/ping)*

---

## ⚠️ Si respetó las reglas de canal
- **HC #intelligence:** ✅ Mensaje de Meeting Intelligence enviado correctamente
- **Growth4U #intelligence:** ✅ Lead Sync enviado correctamente
- **webchat:** ✅ Responde ping/pong

---

## 🔧 Patrones de mejora

### P0 — Fix urgente: Discord tool routing para crons
**Problema:** Los crons no tienen acceso a la herramienta `message`. Esto bloquea completamente el Daily Pulse de ambos clientes.

**Solución requerida:** Cervantes debe investigar:
1. Por qué `message` tool no está disponible en sesiones exec/isolated
2. Si el cron template necesita ejecutarse en contexto Discord en lugar de exec
3. Alternativa: usar `sessions_spawn` con runtime="acp" para publicar en Discord desde crons

### P1 — Fix: `openclaw message send` SIGKILL
**Problema:** Los comandos `openclaw message send` se matan con SIGKILL durante cron execution.
**Solución:** Verificar si es un tema de timeout, memoria, o seguridad.

### P1 — Discord 403 en Call Prep
**Problema:** El bot no tiene permisos para el canal #intelligence de Growth4U.
**Solución:** Verificar que el bot esté en el servidor Growth4U y tenga permisos de lectura/escritura en ese canal.

### P2 — Hulahoop sin APIs
**Problema:** Morning Metrics no puede ejecutarse porque no hay APIs configuradas.
**Recomendación:** Alfonso debería conectar al menos GA4 o Metricool para Hulahoop.

---

## 📏 Métricas del sistema

- **system_uptime_without_intervention:** ⚠️ DECAYING — Crons fallando sin auto-recuperación
- **Daily Pulse blocked:** 2/2 clientes (HC + Growth4U) — modo BLOCKED
- **Discord posting:** ~50% success rate (funciona via curl directo, falla via openclaw CLI)
- **Costo últimas 24h (Sancho):** ~$60 USD estimado

---

*Cervantes — 2026-04-22 00:07 UTC*
