# TASKS — Sancho Client Tasks

> Tareas específicas de clientes. Las tareas de sistema/infraestructura van en el TASKS.md de Cervantes.

## Cómo funciona

1. **Proponer**: Desde Discord del cliente o directo a Sancho
2. **Sancho registra**: Tarea aquí con estado `📥 propuesta`
3. **Review**: Alfonso (o admin) aprueba/rechaza
4. **Ejecutar**: Solo tareas `✅ aprobada` se ejecutan
5. **Cerrar**: Al completar → `✔️ hecha`

## Estados

| Emoji | Estado | Quién |
|---|---|---|
| 📥 | Propuesta | Cualquiera propone |
| 👀 | En review | Sancho analiza impacto |
| ✅ | Aprobada | Alfonso aprueba |
| ❌ | Rechazada | Alfonso rechaza (con razón) |
| 🔧 | En progreso | Sancho o agente ejecuta |
| ✔️ | Hecha | Completada |
| 🧊 | Congelada | Aparcada |

## Prioridades

| Tag | Significado |
|---|---|
| `P0` | Crítico — bloquea trabajo |
| `P1` | Importante — hacer esta semana |
| `P2` | Normal — cuando toque |
| `P3` | Nice-to-have — backlog |

---

## 📋 Board

### 📥 Propuestas

_ninguna — pendiente arrancar Foundation para Hospital Capilar_

### ✅ Aprobadas

_ninguna_

### 🔧 En Progreso

_ninguna_

### ✔️ Completadas (recientes)

- **T-035** `P2` — URLs obligatorias en market-intelligence. **Cerrada como duplicado** — ya cubierta por Regla Cardinal #11 (P0) en SOUL.md, que aplica a todo. _(2026-03-04)_
- **T-037** `P1` — Links clickeables obligatorios al referenciar archivos en Discord (Mission Control URL). Regla 12 añadida a SOUL.md. _(2026-02-27)_

_Las tareas T-001 a T-012 fueron de setup del sistema y ahora viven en el TASKS.md de Cervantes._

### 🔄 Recurrentes

- **R-001** `P1` — **Morning Metrics — Multi-Client**
  - Cron: L-V 08:30 Madrid
  - Script: `scripts/morning-metrics.sh {slug}`
  - Destino: **#insights** del guild de cada cliente
  - Clientes activos: Growth4U (Meta Ads + GHL)
  - Pendientes: HC, Paymatico, Masabo, Masavo (esperando conexión de APIs)
  - Estado: ✅ Funcionando (cron ok, publicando diariamente en #insights)

### 🧊 Congeladas

_ninguna_

---

## Reglas

1. **Solo tareas de cliente aquí.** Infraestructura/skills/sistema → Cervantes.
2. **Sancho puede proponer** pero no auto-aprobarse.
3. **Cambios menores** (typos, formatting) no necesitan tarea.
4. **Próximo ID**: T-100 (rango 100+ para tareas de cliente)
