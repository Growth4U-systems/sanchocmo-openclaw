# Client Context Isolation — MANDATORY

> **P0 Rule**: Todo output publicado en un canal de Discord de un cliente debe contener ÚNICAMENTE información relevante para ese cliente. CERO filtraciones de contexto interno.

---

## Regla Principal

Antes de publicar CUALQUIER cosa en un canal de Discord de un cliente:

1. **Identifica el cliente** → Lee `clients.json`, busca el guild del canal destino
2. **Filtra el contenido** → Solo incluye información del scope del cliente (ver abajo)
3. **Verifica** → Revisa que NO contenga nada de la lista PROHIBIDA

---

## Contenido PERMITIDO por cliente

Para cada cliente, el output debe limitarse a:

| Tipo | Qué incluir |
|------|------------|
| **Noticias sector** | Noticias del sector/industria del cliente (según `brand/company-context.md`) |
| **Competidores** | Solo los competidores definidos en `brand/competitors.md` del cliente |
| **Métricas** | Solo métricas de campañas de ESE cliente |
| **Señales mercado** | Tendencias relevantes al sector del cliente |
| **Insights** | Extraídos de fuentes del cliente (sus meetings, su Slack, sus datos) |
| **Contenido** | Propuestas de contenido para ESE cliente |

---

## Contenido PROHIBIDO — NUNCA publicar en canales de cliente

| Categoría | Ejemplos |
|-----------|----------|
| **Tareas internas** | TASKS.md, PRDs, tareas de sistema, backlogs |
| **Agentes/Sistema** | Spawning de Escudero/Rocinante, sessions_spawn, sessions_send |
| **Config/Skills** | Cambios de skills, actualizaciones de SOUL.md, BRAIN.md |
| **Logs del sistema** | Errores, bugs, crashes, heartbeats, cron logs |
| **Infraestructura** | Tailscale, base de datos, LaunchAgents, Gateway status |
| **Otros clientes** | Datos, nombres, métricas, estrategias de otros clientes |
| **Reglas internas** | Reglas de hilos Discord, protocolos de dispatch, workflow rules |
| **Costes** | Tokens, costes por agente, pricing de APIs |
| **Desarrollo** | Commits, deploys, code changes, PRs |

---

## Aplicación Transversal

Esta regla aplica a TODOS los skills/crons que publican en Discord:

- **Daily Pulse** → Solo insights del sector del cliente, sus competidores, sus métricas
- **Meeting Intelligence** → Solo meetings del cliente
- **Signal Monitor** → Solo señales relevantes al mercado del cliente
- **Content proposals** → Solo contenido para ese cliente
- **Cualquier cron/skill futuro** → Misma regla

---

## Cómo identificar el cliente

```
1. Lee clients.json
2. Match guild ID del canal destino con client.guild
3. Usa client.paths.brand para cargar contexto del cliente
4. Si no hay match → NO PUBLICAR (log error interno)
```

---

## Checklist pre-publicación

Antes de enviar output a un canal de cliente, verifica:

- [ ] ¿Contiene SOLO información del sector/industria del cliente?
- [ ] ¿Los competidores mencionados son los del cliente (no de otro)?
- [ ] ¿No menciona tareas internas, agentes, skills, o sistema?
- [ ] ¿No menciona otros clientes?
- [ ] ¿No contiene logs, errores, o info de infraestructura?
- [ ] ¿El tono es profesional/marketing, no técnico/sistema?

Si algún check falla → **NO PUBLICAR**. Filtra o regenera.

---

*Regla establecida: 2026-02-27 — P0 por Alfonso. Violación = incidente crítico.*
