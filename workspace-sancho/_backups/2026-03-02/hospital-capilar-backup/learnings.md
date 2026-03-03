# Learnings — Hospital Capilar

> Patrones confirmados, decisiones clave, y qué hacer diferente. Actualizado cada semana.

---

## 📊 Principios Confirmados

### 1. **Calidad > Velocidad**
- **Pattern:** Día 26-feb salté Foundation orchestrator + DAG por velocidad → trabajo incorrecto, tuve que rehacerlo
- **Pattern:** Market-intelligence tuvo 5 iteraciones (27-feb) porque primeras versiones no seguían prompt al 100%
- **Pattern:** Docs regenerados con self-QA completo (28-feb) pasaron QA de Rocinante sin problemas (9/10, 8.5/10)
- **Confirmed:** Self-QA + checklists >> velocidad sin proceso. NO saltar pasos. Leer skill completa + checklist + ejecutar al 100%.

### 2. **Self-QA > External QA para docs internos**
- **Pattern:** Rocinante QA (26-feb) detectaba síntomas (URLs malas, números incorrectos) pero no root cause (prompt incompleto)
- **Pattern:** Self-QA con checklist (28-feb) → Rocinante aprobó docs con 9/10, 8.5/10
- **Decisión:** Self-QA mandatory, Rocinante optional (solo external content o on-demand)
- **Confirmed:** Self-QA at skill level es más efectivo que external QA agent para Foundation docs.

### 3. **Skill-Creator Principles son Standard**
- **Pattern:** Market-intelligence reestructurado (27-feb) siguiendo skill-creator: SKILL.md lean, references rich
- **Pattern:** Todos los docs regenerados con estructura clara pasaron QA (28-feb)
- **Decisión:** Cervantes añadió checklists a 13 Foundation skills
- **Confirmed:** Lean SKILL.md + rich references = ejecución clara. Este es el standard.

### 4. **Context Isolation es Crítico**
- **Pattern:** Casi filtré info interna en #brand (26-feb) → Regla cardinal 0a: "Output Discord = SOLO info del cliente"
- **Confirmed:** NUNCA mencionar info interna/sistema/otros clientes en Discord. Context Matrix define qué leer por skill.

### 5. **Threads Siempre en Discord**
- **Pattern:** Alfonso pidió (01-mar) "outputs de crons en hilos". Test cron demostró que funciona.
- **Confirmed:** Todo output Discord → crear hilo primero (thread-create), luego publicar dentro (send to thread_id). NUNCA publicar directo en canal.

### 6. **Honestidad de Herramientas**
- **Regla 09 añadida (27-feb):** "NUNCA afirmar haber usado herramienta que no ejecutaste."
- **Confirmed:** Si uso web_search en vez de Apify, decir exactamente eso. Transparency sobre fuentes.

---

## 🔧 Decisiones Clave de la Semana (25-feb → 02-mar)

| Decisión | Fecha | Contexto | Impacto |
|----------|-------|----------|---------|
| **Self-QA replaces Rocinante** para docs internos | 28-feb | Rocinante QA detectaba síntomas, no root cause | SOUL.md rule 0e actualizada |
| **Skill restructuring** siguiendo skill-creator principles | 27-feb | Market-intelligence reestructurado, Alfonso aprobó | Cervantes añadió checklists a 13 Foundation skills |
| **Versionado protocol** establecido | 28-feb | v1-backup.md, history.json, Self-QA tags | Todos los docs regenerados con versioning completo |
| **Threads siempre** en Discord | 01-mar | Alfonso: "outputs de crons en hilos" | Patrón implementado en todos los crons |
| **Context Matrix enforcement** | 26-feb | Evitar cargar todo brand/ | Cada skill solo lee archivos relevantes |

---

## 📈 Qué Cambió Esta Semana

### Proceso de Trabajo
- **Antes:** "Hacer rápido" — saltar pasos, improvisar
- **Ahora:** "Hacer bien con checklist" — leer skill completa, seguir DAG, self-QA mandatory

### QA Approach
- **Antes:** Rocinante QA externo para todo
- **Ahora:** Self-QA skill-level para docs internos, Rocinante optional para external content

### Skill Structure
- **Antes:** Monolitos, prompts largos, referencias mezcladas
- **Ahora:** Lean SKILL.md + rich references (concepts.md, checklist.md, schema.md, prompt.md)

### Discord Output
- **Antes:** Mensajes directos en canal
- **Ahora:** Threads siempre (crear hilo → publicar dentro)

### Quality Bar
- **Antes:** "Bueno suficiente"
- **Ahora:** "100% prompt compliance" (checklist + self-QA)

---

## ⚠️ Errores Cometidos (y No Repetir)

### 1. Saltar Foundation Orchestrator (26-feb)
- **Error:** Ejecuté Foundation Lite yo mismo + salté directo a GTM sin seguir DAG
- **Debió ser:** sancho-start → foundation-orchestrator → gate check → Phase 2
- **Learning:** NUNCA saltar fases. Seguir el flujo del sistema.

### 2. No Usar Supabase (26-feb)
- **Error:** Todo a archivos markdown, Supabase vacío
- **Debió ser:** Context Lake en DB, archivos como cache de lectura
- **Learning:** Supabase es Context Lake oficial (pendiente de implementar)

### 3. No Seguir el DAG (26-feb)
- **Error:** Hice positioning sin SWOT → ICP 100x primero
- **Debió ser:** Respetar dependencias Layer 0 → 1 → 2 → 3 → 4 → 5
- **Learning:** Las dependencias existen por algo. Seguir el DAG.

### 4. Interpretar "Sí" como "Haz Todo" (26-feb)
- **Error:** Alfonso dijo "sí" y yo interpreté que quería Foundation Lite + GTM de golpe
- **Debió ser:** Hacer Foundation Lite, mostrar status board, gate check, LUEGO preguntar
- **Learning:** "Sí" no significa "haz todo". Hacer ESE paso, luego preguntar.

### 5. Rocinante QA sin Self-QA primero (26-feb)
- **Error:** Enviar docs a Rocinante sin self-QA previo → 5 iteraciones
- **Debió ser:** Self-QA con checklist primero, luego Rocinante
- **Learning:** Self-QA es gate antes de Rocinante. No saltarlo.

---

## 🎯 Qué Hacer Diferente (Going Forward)

| # | Acción | Por Qué | Cuando |
|---|--------|---------|--------|
| 1 | **Leer skill completa + checklist ANTES** de ejecutar | Evitar prompt incompleto (market-intelligence 5 iteraciones) | Siempre |
| 2 | **Nunca saltar pasos del DAG** | Foundation orchestrator → gate checks → Phase 2 | Foundation pillars |
| 3 | **Self-QA con checklist mandatory** antes de publicar/enviar | QA en skill level >> external QA | Todos los Foundation docs |
| 4 | **Threads siempre en Discord** | Crear hilo primero, publicar dentro | Todo output Discord |
| 5 | **Context Matrix** — solo leer archivos relevantes | No cargar todo brand/ | Todos los skills |
| 6 | **Resolver Google Workspace auth** | Health checks fallando desde 24-feb, bloquea heartbeats | Próximo heartbeat |

---

## 🔄 Trends & Patterns (Semana 25-feb → 02-mar)

### Productivity
- **Día más productivo:** 28-feb (7+ documentos regenerados, brand-voice ejecutado, calendario mayo, SEO content, visual-identity, positioning review)
- **Día más iterativo:** 27-feb (market-intelligence 5 versiones, learnings importantes sobre calidad)

### Quality
- **Self-QA adoption:** 100% en docs regenerados (28-feb) — 0 fallos en Rocinante QA
- **Checklist compliance:** market-intelligence v4 (27-feb) alcanzó 100% prompt compliance después de restructuring

### Technical Issues
- **Google Workspace caído:** Health checks fallando desde 24-feb. Alertas funcionan pero problema persiste.
- **Low channel usage:** Solo #soporte tiene actividad significativa. #research, #content, #campaigns sin actividad (01-mar, 02-mar).

---

## 📝 Micro-Insights (Daily Pulse)

### 25-feb
- Hospital Capilar pagó 12.100€ a Growth Systems Now SL (confirma relación activa)
- Mid-week G4U sync con equipo completo

### 26-feb
- LinkedIn pipeline: 33 ideas backlog + 20 drafts listos
- Nuevas oportunidades cliente: Influentia, Orbyn
- Engagement externo: Robert S (MarketFunnelsEdge) notó comentario de Alfonso

### 27-feb
- Sin actividad en fuentes configuradas

### 02-mar
- Google Workspace sigue caído (impacta heartbeats)
- Alfonso: "outputs de crons en hilos siempre"
- Martin preguntó skill niche-discovery-100x (sin respuesta visible)
- Bajo uso canales especializados (#research, #content, #campaigns)

---

## 🚀 Próximos Pasos

1. **Investigar Google Workspace auth** — próximo heartbeat ejecutar `gog auth status` y re-autenticar si necesario
2. **Modificar crons** para que creen hilos automáticamente (daily pulse, meeting intelligence, health checks)
3. **Responder a Martin** en #research sobre niche-discovery-100x
4. **Considerar recordar a usuarios** qué canales existen y para qué sirven (bajo uso de canales especializados)
5. **Implementar Supabase** como Context Lake oficial (pendiente desde 26-feb)

---

**Última actualización:** 2026-03-02 (síntesis semanal)  
**Próxima revisión:** 2026-03-09 (síntesis semanal)
