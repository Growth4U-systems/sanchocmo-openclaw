# Sancho Observations - 2026-03-12

## Sesiones Activas (últimas 24h)

| Canal | Tipo | Actividad |
|-------|------|-----------|
| g-1481562944256082004 | Discord | Daily Pulse |
| #conexiones-apis-y-mcps | Discord | Tunnel Tailscale, fixing mobile JS |
| #métricas-y-kpis | Discord | Métricas + metrics-collector task |
| #monitoreo-recurrente | Discord | Heartbeat check |
| g-1481554981269278772 | Discord | Growth4U metrics analysis |
| g-1477741644789842031 | Discord | Growth4U #intelligence |

## Errores/Skills que fallaron

### 1. Error LLM "thinking blocks cannot be modified"
- **Cuándo**: En #métricas-y-kpis al procesar un mensaje
- **Estado**: Error de API, no de skill
- **Consecuencia**: Sesión truncada

### 2. Morning Metrics publicado 3 veces
- **Cuándo**: 11-12 marzo en #intelligence Growth4U
- **Problema**: 
  - Datos publicados directamente al canal (no en hilo)
  - Cron corrió 3 veces (23:54, 00:13, 07:30)
  - Sesión principal interfería con el cron
- **Fix aplicado**: 
  - Cambiado a sessionTarget: isolated
  - Cambiado a Sonnet 4.5 (antes MiniMax)
  - Prompt reescrito para seguir patrón de hilo correctamente

### 3. JS roto en Mission Control (mobile)
- **Problema**: String roto en clipboard.writeText hacia fallback todo el JS
- **Fix**: Sancho reescribió la función copyGogUrl()
- **Estado**: ✅ Arreglado

## Preguntas que no supo responder
- Ninguna detectada

## Respeto a reglas de canal

### ✅ Correcto:
- En #conexiones-apis-y-mcps: ответил solo con código, sin largas explicaciones
- En #métricas-y-kpis: mantuvo tema de infraestructura de métricas

### ❌ Problema detectado:
- Morning Metrics no siguió el patrón de hilo (datos fuera de hilo)
- **Ya corregido** por Sancho mismo

## Patrones de mejora

### Positivos:
1. **Proactividad**: Detectó y arregló el bug JS de mobile él solo
2. **Comunicación**: Informó a Alfonso de cada fix
3. **Delegación**: Spawned Escudero para metrics-collector skill (task complejo)
4. **Fix rápido**: Identificó el problema del cron y lo arregló

### Áreas a mejorar:
1. **Errores LLM**: El error "thinking blocks cannot be modified" apareció 2 veces - revisar configuración
2. **Cron jobs**: Memory Maintenance falló (edit en MEMORY.md falló)

## Estado Crons

| Cron | Estado | Notas |
|------|--------|-------|
| funnel-watchdog | ✅ ok | |
| healthcheck | ✅ ok | |
| Regenerar Dashboard | ✅ ok | |
| image-optimizer | ✅ ok | |
| update-skills | ✅ ok | |
| cost-tracker-daily | ✅ ok | |
| Morning Metrics | ✅ ok | Fix aplicado |
| Daily Pulse | ✅ ok | |
| Memory Maintenance | ❌ error | Edit falló en MEMORY.md |
| Weekly Synthesis | ✅ ok | |

## Notas adicionales
- metrics-collector skill fue creada por Escudero (subagent)
- Guillermo ( Philippe) sigue en onboarding
- OpenClaw caído brevemente el 10-mar (detectado por Sancho)
