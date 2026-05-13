# Cross-Thread Continuity Protocol

> Los hilos de Discord crean sesiones aisladas en OpenClaw. Este protocolo resuelve la pérdida de contexto entre hilos.

## Problema

Cada hilo de Discord genera una sesión independiente. Un agente que participa en el hilo A no tiene contexto de lo que pasó en el hilo B, incluso si ambos son del mismo canal y del mismo cliente.

## Solución

Mantener un registro de hilos en `memory/discord-threads.md` que actúa como índice de continuidad semántica.

## Estructura del registro

Cada hilo relevante se registra con:
- **Thread ID**: ID de Discord
- **Canal padre**: de dónde viene
- **Cliente**: slug del cliente (si aplica)
- **Participantes**: quiénes están en la conversación
- **Resumen**: de qué trata y dónde quedó
- **Decisiones**: acuerdos o conclusiones clave
- **Estado**: activo | resuelto | abandonado
- **Última actualización**: fecha

Secciones separadas: hilos activos / hilos resueltos.

## Protocolo

1. **Al crear un hilo** o participar en uno nuevo → registrar entrada en `memory/discord-threads.md`
2. **Cuando hay una decisión importante** en un hilo → actualizar resumen/decisiones
3. **Al resolver un tema** → mover a la sección "resueltos"
4. **Cuando alguien referencia otro hilo** → buscar en el archivo con `memory_search` y recuperar contexto
5. **No registrar hilos triviales** — solo los que tienen decisiones, contexto o continuidad relevante

## Separación de concerns

- **Este archivo** (`_system/output/cross-thread-continuity.md`): la metodología — por qué, cómo, cuándo
- **`memory/discord-threads.md`**: los datos concretos — IDs, resúmenes, decisiones de cada hilo real

## Qué NO registrar

- Hilos de cron output (Daily Pulse, Meeting Intelligence) — son informativos, no conversacionales
- Hilos donde solo se publica contenido sin ida y vuelta
- Hilos ya completados sin decisiones pendientes
