# Observaciones de Sancho — Historial

## 2026-03-02 10:00 AM — Lunes

### Panorama general (últimas 24h)
- **19 sesiones activas** (8 Discord, 4 crons, 3 heartbeats, 4 otras)
- **Canales Discord:** #soporte, #research, #intelligence, #general (Growth4U), #quién-soy (Growth4U), #onboarding (Growth4U)
- **Crons ejecutados:** Daily Pulse, Weekly Synthesis, Regenerar Dashboard, Memory Maintenance
- **Estado:** ✅ Operacional, bajo actividad de fin de semana

---

### ✅ Lo que funciona bien

**1. Heartbeats operativos y proactivos**
- Heartbeat de 01:09 AM detectó 5 emails sin leer
- Alertó correctamente sobre 2 emails urgentes: MWC Barcelona (registration code expiring) + Martin Fila (Google Sheets comment)
- Creó memory/2026-03-02.md (first heartbeat of day)
- **Observación:** gog CLI tuvo problemas de sintaxis al principio (`gog gmail inbox` → error), pero Sancho iteró hasta encontrar el comando correcto (`gog gmail search "is:unread"`)

**2. Daily Pulse ejecutado impecablemente**
- Cron lanzado a las 09:00 AM
- Analizó 9 canales Discord (150 mensajes escaneados)
- Generó JSON estructurado con insights categorizados (pain points, feature requests, success stories, trends)
- **Publicó en Discord siguiendo el patrón de hilos** (alerta corta → crea hilo → contenido dentro)
- Identificó correctamente 3 pain points, 2 feature requests, 2 success stories, 3 trends

**3. Respeto a reglas de Discord**
- **Hilos creados correctamente** en todas las interacciones (#research skill question, #general presentación, #soporte feedback)
- **NO_REPLY usado correctamente** después de publicar en hilos
- **Sin texto entre tool calls** — cumple la regla de Discord

**4. Crons funcionando**
- Regenerar Dashboard: ejecutado correctamente (41 tareas, 25 eventos, 10/15 pilares)
- Memory Maintenance: actualizó MEMORY.md con eventos recientes (27-28 Feb)
- Weekly Synthesis: lanzado sin errores

**5. Respuestas con contexto claro**
- Martin preguntó sobre niche-discovery-100x → Sancho explicó la skill con detalles (qué hace, prerequisitos, oferta de ejecución)
- Alfonso preguntó "quién eres" en servidor Growth4U → Sancho se presentó correctamente y explicó que el cliente activo es Growth4U

---

### ⚠️ Áreas de mejora detectadas

**1. gog CLI — problema recurrente no investigado proactivamente**
- El problema de gog CLI aparece en Daily Pulse como "pain point HIGH" (fallando desde hace días)
- Sancho **documenta y alerta** sobre el problema, pero **no lo investiga**
- En el heartbeat de 01:09, Sancho intentó varios comandos de gog hasta encontrar el correcto (indica falta de familiaridad con la CLI)
- **Recomendación:** Sancho debería ejecutar `gog auth status` en próximo heartbeat e intentar re-auth si necesario. Si falla, escalar a mí.

**2. Pregunta sin responder en #research**
- Martin preguntó sobre niche-discovery-100x
- Sancho respondió correctamente en un hilo
- Pero el Daily Pulse lo marcó como "pregunta sin responder" porque no vio la respuesta en el análisis de mensajes
- **Causa probable:** El análisis de Discord del Daily Pulse no leyó los hilos, solo los mensajes principales del canal
- **Impacto:** Bajo (no afecta funcionalidad, solo precisión del reporte)

---

### 📊 Patrones observados

**1. Adopción del patrón de hilos**
- Alfonso pidió el 1-Mar que todos los outputs de crons vayan en hilos
- Sancho lo implementó inmediatamente en Daily Pulse (2-Mar)
- Test cron ejecutado exitosamente el 1-Mar con output en hilo
- **Patrón ahora estándar:** alerta corta en canal → crea hilo → contenido completo dentro

**2. Bajo uso de canales especializados**
- Solo #soporte y #research tienen actividad en últimas 24h
- #general, #brand, #campaigns, #content, #intelligence, #onboarding, #paid-ads sin actividad
- **Causa probable:** Sistema recién configurado, usuarios todavía no usan todos los canales

**3. Sistema en fase de refinamiento**
- Alfonso iterando sobre workflows de output (hilos, formato, canales)
- Sancho adaptándose rápidamente a feedback
- Infraestructura estable, ajustes cosméticos/de UX

---

### 🔍 Skills usadas en últimas 24h
- `daily-pulse` (cron) ✅
- `regenerate.py` (dashboard) ✅
- `memory-maintenance` (cron) ✅
- `gog` (heartbeat email checks) ⚠️ con problemas de sintaxis

### 🚫 Errores o fallos
- **Ningún error crítico detectado**
- **Tool calls todos exitosos** (excepto timeouts en gog al principio del heartbeat, resueltos con retry)
- **No hay evidence de reglas rotas** (hilos, NO_REPLY, etc.)

---

### 📋 Acciones recomendadas

**P1 — Investigar gog CLI proactivamente**
- Sancho debería ejecutar `gog auth status` en próximo heartbeat
- Si falla, intentar re-autenticar
- Si persiste, documentar error completo y escalar a Cervantes

**P2 — Daily Pulse debería leer hilos además de mensajes principales**
- Actualmente solo lee mensajes top-level de cada canal
- Debería leer también hilos recientes (últimas 24h) para no marcar preguntas como "sin responder" cuando la respuesta está en un hilo

**P3 — Onboarding de canales especializados**
- Considerar recordar a usuarios qué canales existen y para qué sirven
- Posible que onboarding de clientes esté incompleto

---

### 🎯 Conclusión
**Estado general: ✅ EXCELENTE**

Sancho está funcionando muy bien. Respeta reglas, ejecuta crons correctamente, responde con contexto, y se adapta rápido a feedback. El único problema recurrente (gog CLI) es de infraestructura, no de Sancho, y debería investigarlo proactivamente en vez de solo documentarlo.

**Nada urgente requiere notificación a Alfonso.**

---

## 2026-03-03 10:00 AM — Martes

### Panorama general (últimas 24h)
- **12+ sesiones activas** (Discord + crons)
- **Canales Discord:** #soporte, #06-market-intelligence, #docu-no-encontrado, #deep-research-como-parte-de-los-skills, #05-ope-canvas, #onboarding, #profundizar-en-self-intelligence, #intelligence
- **Crons intentados:** Daily Pulse, Regenerar Dashboard, Meeting Intelligence, Heartbeat
- **Estado:** ⚠️ Degradado por rate limiting (infra, no Sancho)

---

### ✅ Lo que funciona bien

**1. Conversaciones con Alfonso — excelente comprensión**
- #profundizar-en-self-intelligence: Sancho mostró comprensión profunda del patrón de documentos (investigaciones + summaries + referencias). Explicó correctamente la diferencia entre Company Brief (doc vivo que crece) vs Market & Us (docs de investigación + summary + SWOT)
- Alfonso validó: "¿Voy bien ahora?" → sí

**2. Autocorrección de errores**
- #06-market-intelligence: Alfonso preguntó por un doc en ruta antigua
- Sancho detectó que el archivo se quedó en la ruta antigua tras reestructuración
- **Autocorregido:** Reescribió el deep research en la ruta correcta con el doble de contenido (50 fuentes vs 20, 55KB vs 26KB)

**3. Reglas de canal respetadas**
- ✅ Patrón de hilos en #intelligence (Daily Pulse outputs)
- ✅ NO_REPLY después de envíos a hilos
- ✅ Respuestas en canales correctos

**4. Foundation progressing**
- Pilares 6-15 ejecutándose: Market Intelligence, Competitor Intelligence, SWOT Analysis completados en #onboarding

---

### ⚠️ PROBLEMA CRÍTICO — Rate Limiting (INFRA, no Sancho)

**Síntomas:**
- **Heartbeat** (09:26 AM): 3x 429 rate_limit_error con Haiku
- **Daily Pulse** (09:00 AM): 3x 429 rate_limit_error con Sonnet  
- **Regenerar Dashboard** (~08:00 AM): 3x overloaded_error con Opus
- **#soporte**: 3x 429 rate_limit_error

**Causa:** Anthropic API tiene rate limits activos. Los crons que usan Anthropic (Sonnet/Opus/Haiku) fallan sistemáticamente.

**Impacto:**
- ❌ Heartbeats no pueden hacer checks proactivos (email, calendar)
- ❌ Daily Pulse no se ejecuta (insights de Discord perdidos)
- ❌ Meeting Intelligence no se ejecuta
- ✅ Discord conversaciones funcionan (usan OpenAI delivery-mirror, no Anthropic)

**Observación:** Esto es un problema de infraestructura, NO de Sancho. Cuando las requests llegan a ejecutarse (usan delivery-mirror), Sancho responde perfectamente.

---

### 📊 Patrones observados

**1. Delivery mirror funcionando bien**
- Cuando Anthropic falla, OpenAI delivery-mirror toma el control automáticamente
- Mensajes en Discord fueron entregados correctamente vía mirror
- Sancho no nota la diferencia (el sistema rutea transparente)

**2. Fallback no implementado para crons**
- Los crons usan modelos Anthropic directamente
- No tienen fallback a OpenAI cuando Anthropic falla
- **Recomendación:** Considerar hacer los crons más robustos con retry o fallback

---

### 📋 Acciones recomendadas

**P0 — Rate limiting Anthopic (investigación de Cervantes)**
- Verificar estado de cuenta Anthropic
- Considerar añadir fallback a OpenAI para crons
- O espaciar crons para evitar saturación

**P1 — gog CLI (desde ayer)**
- Todavía sin investigar proactivamente por Sancho
- gog CLI sigue bloqueando heartbeats de email/calendar
- Esta observación ya se hizo ayer, sin acción

---

### 🎯 Conclusión
**Estado: ✅ Sancho bien, ⚠️ Infraestructura mal**

Sancho está funcionando correctamente. El rate limiting es un problema de infraestructura (Anthopic), no de Sancho. Las conversaciones con Alfonso fueron excelentes (comprensión profunda, autocorrección).

**REQUIERE ATENCIÓN:** Rate limiting afecta heartbeats y crons. No es bloqueo total (Discord funciona), pero la capacidad proactiva de Sancho está degradada desde hace ~3 horas.

---

