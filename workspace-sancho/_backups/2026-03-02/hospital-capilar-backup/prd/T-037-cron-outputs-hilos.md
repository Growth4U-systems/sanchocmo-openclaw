# PRD: Cron Outputs Siempre en Hilos
> **ID**: T-037 | **Prioridad**: P1 | **Estado**: Aprobada | **Autor**: Alfonso | **Fecha**: 2026-03-01

---

## 1. Problema

Los cron jobs (observación semanal, daily pulse, meeting intelligence, thief marketer) publican su output directamente en el canal de Discord. Esto:
- Ensucian el canal con mensajes largos
- Rompen la regla de hilos obligatorios (SOUL.md, regla 10 + regla cardinal 2)
- Dificultan la lectura cuando hay múltiples outputs acumulados
- No permiten conversación contextual sobre el output (si quiero comentar algo, se mezcla con el canal)

## 2. Solución

Todo cron job que publique en Discord debe seguir el patrón de hilos:

```
1. Enviar mensaje corto al canal (título + resumen de 1 línea)
2. Crear hilo desde ese mensaje
3. Publicar contenido completo dentro del hilo
```

## 3. Alcance

### Cron jobs afectados
| Cron Job | Canal actual | Frecuencia |
|----------|-------------|------------|
| Observación semanal | #soporte | Sábados 10:00 |
| Daily Pulse | #soporte | L-V 09:00 |
| Meeting Intelligence | #soporte | L-V 18:00 |
| Weekly Synthesis | #soporte | Lunes 10:00 |
| Thief Marketer | #brand | Miércoles 08:00 (disabled) |
| Memory Maintenance | interno | Domingos 22:00 (sin output Discord) |

**Excluidos**: Memory Maintenance (no publica en Discord, es interno).

### Lo que NO cambia
- El contenido de los outputs no cambia
- Los canales destino no cambian
- La frecuencia y schedule no cambian

## 4. Requisitos Funcionales

### RF-01: Mensaje ancla en canal
- El cron job publica un mensaje corto en el canal con formato:
  - Emoji + título del report + fecha
  - Ejemplo: `📊 Observación semanal — 1 mar 2026`
  - Ejemplo: `📰 Daily Pulse — 3 mar 2026`
  - Máximo 1 línea

### RF-02: Creación de hilo
- Se crea un hilo desde el mensaje ancla usando `message(action=thread-create, messageId=<ancla>)`
- Nombre del hilo = título del report
- Auto-archive: 4320 min (3 días, default Discord)

### RF-03: Contenido en hilo
- El output completo se publica dentro del hilo via `message(action=send, target=<thread_id>)`
- Si el output es muy largo, se divide en múltiples mensajes dentro del hilo (límite Discord: 2000 chars)

### RF-04: Sin respuesta en canal
- Después de crear hilo y publicar contenido, la respuesta del agente es `NO_REPLY`
- Cero texto entre tool calls (regla TOOLS.md)

## 5. Flujo Técnico

```
Cron se dispara
  → Agente genera el output
  → message(action=send, channel=discord, target=<canal>, message="📊 Título — fecha")
  → Captura messageId del resultado
  → message(action=thread-create, channel=discord, messageId=<messageId>, threadName="Título — fecha", message="<contenido completo>")
  → NO_REPLY
```

## 6. Implementación

### Paso 1: Crear `_system/discord-thread-protocol.md`
Protocolo centralizado con TODOS los patrones de hilos en Discord:
- Patrón 1: Respuesta a mensaje de usuario (ya en TOOLS.md)
- Patrón 2: Delegación a Escudero (ya en TOOLS.md)
- **Patrón 3: Cron job output (NUEVO)**
  ```
  Cron se dispara
    → message(action=send, target=<canal>, message="📊 Título — fecha")
    → Captura messageId
    → message(action=thread-create, messageId=<messageId>, threadName="Título", message="<contenido>")
    → NO_REPLY
  ```
- Patrón 4: Resultado de subagente (ya en TOOLS.md)

### Paso 2: NO tocar TOOLS.md ni SOUL.md
⚠️ TOOLS.md "Discord Mechanics" funciona bien tras sesión de debugging del 28 feb. No migrar, no modificar.
SOUL.md regla cardinal 2 se queda como está.
`_system/discord-thread-protocol.md` es COMPLEMENTO (patrón cron), no reemplazo.

### Paso 3: Actualizar cron job prompts
Cada cron job refuerza la instrucción en su `text`: "Publica resultado en hilo (ver discord-thread-protocol.md)".

## 7. Criterios de Aceptación

- [ ] Observación semanal publica en hilo (no directamente en canal)
- [ ] Daily Pulse publica en hilo
- [ ] Meeting Intelligence publica en hilo
- [ ] Weekly Synthesis publica en hilo
- [ ] Thief Marketer (cuando se active) publica en hilo
- [ ] Canal queda limpio: solo mensajes ancla de 1 línea
- [ ] Contenido completo visible al abrir el hilo
- [ ] El patrón funciona sin intervención manual

## 8. Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| El agente olvida crear hilo en un cron | Media | Reforzar en SOUL.md + prompt del cron |
| Mensaje ancla excede 1 línea | Baja | Regla explícita: máximo emoji + título + fecha |
| Thread-create falla (Discord API) | Baja | Fallback: publicar en canal directamente |

---

## Fuentes
- Feedback Alfonso 2026-02-26 (#soporte): "Los resultados de cron los publiqué sin hilo"
- Feedback Alfonso 2026-03-01 (#soporte): "Este tipo de mensajes deberían ser hilos"
- SOUL.md regla 10: "Toda conversación nueva en un canal de Discord se inicia creando un hilo"
- MEMORY.md: "Hilos SIEMPRE — incluso para cron jobs"
