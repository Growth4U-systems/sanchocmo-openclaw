# Guía de Optimización de Tokens — SanchoCMO

> Investigación: Last30days (Reddit 10 threads, X 23 posts, YouTube 4 videos) + web (docs OpenClaw, blogs, papers)
> Fecha: 2026-03-05
> Foco: Infraestructura — cambios que reducen tokens sin cambiar cómo usas el sistema

---

## 🔴 IMPACTO ALTO — Cambios de Config (ahorro estimado: 40-60%)

### 1. Activar Prompt Caching de Anthropic
**Estado actual:** `cacheRetention` NO configurado en ningún modelo (vacío `{}`)
**Problema:** Sin cache, el system prompt completo (~5-10K tokens) se reprocesa en CADA request a precio completo.
**Solución:**
```yaml
agents.defaults.models:
  "anthropic/claude-opus-4-6":
    params:
      cacheRetention: "long"   # 1h TTL — cache reads = 10% del precio input
  "anthropic/claude-sonnet-4-5":
    params:
      cacheRetention: "long"
```
**Ahorro:** Los cache reads cuestan **10% del precio de input**. Con un system prompt de ~8K tokens que se envía en cada turno, ahorras ~90% en esos tokens recurrentes.
**Fuente:** [OpenClaw Prompt Caching docs](https://docs.openclaw.ai/reference/prompt-caching), @zehcyriac en X

### 2. Heartbeat Keep-Warm para Cache
**Estado actual:** Heartbeat cada 3h, cache TTL implícito ~5min (Anthropic short default)
**Problema:** Si activas `cacheRetention: "long"` (1h), el cache expira entre heartbeats.
**Solución:**
```yaml
agents.defaults.heartbeat:
  every: "55m"   # Justo por debajo del TTL de 1h
```
**Efecto:** Cada heartbeat (en MiniMax, barato) mantiene el cache caliente para Opus. Cuando llega un request real, los ~8K tokens del system prompt ya están cacheados.
**Trade-off:** Más heartbeats (de 8/día a 26/día), pero cada uno usa MiniMax (prácticamente gratis).

### 3. Reducir Thinking Level
**Estado actual:** `thinkingDefault: "high"` — TODOS los agentes usan pensamiento alto
**Problema:** Los thinking tokens se facturan como **output tokens** (Opus output: $75/M). Thinking "high" puede generar 2-5K tokens de pensamiento por respuesta.
**Solución:**
```yaml
agents.defaults.thinkingDefault: "medium"  # o "low" para tareas simples
```
O mejor, **por agente:**
- Sancho (estrategia): `"high"` — necesita razonamiento profundo
- Cervantes (infra): `"medium"` — tareas más procedurales
- Escudero (contenido): `"low"` o `"medium"` — genera, no razona
- Rocinante (QA): `"medium"`

**Ahorro estimado:** 30-50% en output tokens por respuesta

### 4. Model Routing — Usar Sonnet/Haiku para Tareas Simples
**Estado actual:** Sancho y Cervantes ambos en Opus ($15 input / $75 output por M tokens)
**Sonnet:** $3 input / $15 output — **5x más barato**
**Haiku:** $0.80 input / $4 output — **~19x más barato**

**Oportunidades:**
- **Escudero ya usa Sonnet** ✅
- **Rocinante ya usa Sonnet** ✅
- **Cervantes podría bajar a Sonnet** para tareas de infra rutinarias
- **Heartbeats ya usan MiniMax** ✅

**Acción:** Evaluar si Cervantes necesita Opus o Sonnet es suficiente.

---

## 🟡 IMPACTO MEDIO — Reducir System Prompt (ahorro: 15-30%)

### 5. Adelgazar Bootstrap Files
**Estado actual:** OpenClaw inyecta en cada request:
- `AGENTS.md` (~3K tokens) — reglas genéricas, muchas aplican a todos los agentes
- `SOUL.md` (~2.5K tokens) — identidad + reglas cardinales
- `TOOLS.md` (~1.5K tokens) — mecánicas Discord + notas locales
- `MEMORY.md` (~2K tokens) — historial de decisiones
- `IDENTITY.md` (~200 tokens)
- `USER.md` (~300 tokens)
- `HEARTBEAT.md` (~300 tokens)
- **TOTAL: ~10K tokens inyectados en CADA request**

**Acciones:**
1. **MEMORY.md → Solo las últimas decisiones activas.** Archivar todo lo que ya no es accionable. El historial de setup de Feb-2026 ya no aporta valor en cada request.
2. **AGENTS.md → Mover a docs de referencia.** Las reglas de AGENTS.md que son genéricas de OpenClaw no necesitan ir en cada prompt. Dejar solo lo específico de SanchoCMO.
3. **TOOLS.md → Comprimir.** Los ejemplos de "What Goes Here" y secciones vacías gastan tokens. Solo dejar las notas reales.
4. **`bootstrapMaxChars`** — Actualmente 20K (default). Si recortas los archivos, puedes bajarlo a 12-15K como safety net.

**Fuente:** [OpenClaw Token Use docs](https://docs.openclaw.ai/reference/token-use), @koylanai en X ("protocol layer that routes to focused context")

### 6. Reducir Skill Descriptions
**Estado actual:** 38 skills registradas. Cada una inyecta nombre + descripción en el system prompt.
**Problema:** Muchas descriptions son largas (100+ palabras). El skill list completo puede ser ~3-5K tokens.

**Acciones:**
1. **Acortar descriptions** — Máximo 1-2 líneas por skill. La instrucción detallada está en SKILL.md que se carga on-demand.
2. **Desactivar skills que no se usan** — ¿Se usan todas las 38? Si hay skills experimentales o en desarrollo, desactivarlas reduce el prompt.

### 7. Channel SystemPrompts — Deduplicar
**Estado actual:** 56+ canales con systemPrompts casi idénticos (solo cambia el slug del cliente y el nombre del canal).
**Nota:** Estos NO se inyectan todos a la vez — solo el del canal activo. Pero cada uno es ~200-500 tokens.
**Optimización futura:** Si OpenClaw soporta templates para systemPrompts, se podría reducir la repetición en config.

---

## 🟢 IMPACTO OPERATIVO — Hábitos y Workflows

### 8. Session Management
- **`/compact`** antes de que la sesión crezca mucho — comprime el historial
- **`session.reset.idleMinutes: 480`** (8h actual) — considerar bajar a 240 (4h) para sesiones que ya no necesitas
- **`contextPruning.mode: "cache-ttl"`** ya activo ✅ — buen setup

### 9. Delegation = Token Savings
Cada vez que Sancho delega a Escudero (Sonnet), ahorras 5x vs hacer todo en Opus. Maximizar delegación de:
- Generación de contenido largo
- Research que no necesita razonamiento estratégico profundo
- Tareas paralelas independientes

### 10. Batch API para Tareas No-Urgentes
Anthropic ofrece Batch API a **50% del precio**. Para crons nocturnos (daily pulse, signal monitoring), evaluar si OpenClaw puede rutear al batch endpoint.

---

## 📊 Resumen de Acciones por Prioridad

| # | Acción | Esfuerzo | Ahorro Est. | Config Change |
|---|--------|----------|-------------|---------------|
| 1 | Activar cacheRetention: "long" | 1 min | 20-30% input | ✅ |
| 2 | Heartbeat keep-warm (55m) | 1 min | Mejora cache | ✅ |
| 3 | Reducir thinkingDefault | 1 min | 30-50% output | ✅ |
| 4 | Cervantes → Sonnet | 1 min | 5x en infra | ✅ |
| 5 | Adelgazar MEMORY.md | 15 min | 10-15% input | Manual |
| 6 | Acortar skill descriptions | 30 min | 5-10% input | Manual |
| 7 | Adelgazar AGENTS.md + TOOLS.md | 15 min | 5-10% input | Manual |
| 8 | Bajar bootstrapMaxChars | 1 min | Safety net | ✅ |

---

## 🔗 Fuentes

- [OpenClaw Token Use](https://docs.openclaw.ai/reference/token-use)
- [OpenClaw Prompt Caching](https://docs.openclaw.ai/reference/prompt-caching)
- r/ClaudeAI: "Is there any smart way to reduce Claude usage" (4 Mar 2026)
- r/LLMDevs: "Two and a Half Methods to Cut LLM Token Costs" (4 Mar 2026)
- r/LLMDevs: "What fills the context window" (26 Feb 2026)
- @OtsoVeistera/@thetokenco (YC W26): compresión de prompts pre-LLM
- @zehcyriac: "Implement Context Caching — cut costs by up to 90%"
- @koylanai: "protocol layer that routes to focused context"
- @ziwenxu_: "Run local LLM for heartbeats and save tokens"
- RunVecta blog: "Two and a Half Methods to Cut LLM Token Costs"
- Medium/Tom Smykowski: "I Traced Every Token in OpenClaw and Cut My Bill by 90%"
