# TASKS — Cervantes Change Management

> Archivo único de tareas. Sistema + clientes, todo aquí.
> Usa tags de cliente (`[client-slug]`) para filtrar por cliente.
> Tareas sin tag de cliente = tareas de sistema/infra.

## Cómo funciona

1. **Proponer**: Cualquiera dice "quiero cambiar X" (webchat, Discord #admin)
2. **Cervantes registra**: Creo la tarea aquí con estado `📥 propuesta`
3. **Review**: Admin revisa y aprueba/rechaza
4. **Ejecutar**: Solo tareas `✅ aprobada` se ejecutan
5. **Cerrar**: Al completar → `✔️ hecha` + entrada en CHANGELOG.md

## Estados

| Emoji | Estado | Quién |
|---|---|---|
| 📥 | Propuesta | Cualquiera propone |
| 👀 | En review | Cervantes analiza impacto |
| ✅ | Aprobada | Admin aprueba |
| ❌ | Rechazada | Admin rechaza (con razón) |
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

### ✅ Aprobadas (listas para ejecutar)

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|

### 🔧 En Progreso

| ID | Tarea | Cat | Pri | Propuesto | Notas |
|---|---|---|---|---|---|

### ✔️ Completadas (recientes)

| ID | Tarea | Cat | Fecha | Notas |
|---|---|---|---|---|

### 🧊 Congeladas

_ninguna_

### 🗑️ Descartadas

| ID | Tarea | Cat | Fecha | Razón |
|---|---|---|---|---|

### ❌ Rechazadas

_ninguna_

---

## Reglas

1. **Todo cambio al sistema pasa por aquí.** Sin excepción.
2. **Cervantes puede proponer tareas** pero no auto-aprobarse.
3. **Cambios menores** (typos, formatting) no necesitan tarea — van directo.
4. **Tareas completadas** generan entrada en CHANGELOG.md automáticamente.
5. **Tags de cliente**: `[client-slug]` en la columna Cat o Notas. Sin tag = sistema.
6. **Un solo archivo**: Todo aquí. MC filtra por tag de cliente.
7. **Próximo ID**: T-001
