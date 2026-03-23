---
name: idea-generation
description: "Recurring cross-channel intelligence engine that generates content ideas and contact opportunities. Use when: a recurring task fires (via cron), user asks 'generate ideas', 'busca ideas', 'qué contenido crear', 'find partners', 'find influencers', or after Trust Engine / audit completes. Reads Foundation data + active recurring tasks config + multiple sources (PAA, SERP gaps, competitor content, signals, trending). Outputs ideas to idea_bank JSON files + notifies Discord #intelligence. Triggers: 'idea generation', 'generate ideas', 'busca ideas de contenido', 'find contacts', 'run intelligence', 'ejecuta idea generation'."
metadata:
  author: Growth4U
  version: '1.0'
  system: SanchoCMO
  phase: Execution
  depends_on: company-context, niche-discovery-100x, brand-voice
  chains_to: seo-content, content-atomizer, social-content, partner-finder
  context_required:
    - brand/{slug}/company-brief/current.md
    - brand/{slug}/go-to-market/ecps/current.md
    - brand/{slug}/brand-voice/current.md
    - brand/{slug}/idea-generation/recurring-tasks.json
    - brand/{slug}/sources.json
  context_writes:
    - brand/{slug}/idea-generation/ideas.json
    - brand/{slug}/idea-generation/recurring-tasks.json
---

# Idea Generation — Intelligence Engine

> "Las ideas sin sistema son chispas. Con sistema, son fuego." — Sancho

Este skill es el **runner** del Idea Generation System. Se ejecuta:
1. Via **cron** (recurrente, por cada cliente activo)
2. Via **usuario** ("genera ideas para X")
3. Via **trigger automático** (post-audit, post-Trust Engine)

**Output**: Ideas depositadas en `brand/{slug}/idea-generation/ideas.json` + notificación Discord.

---

## Step 0: Load Context

```
1. Read brand/{slug}/sources.json → get channel IDs, cron config
2. Read brand/{slug}/company-brief/current.md → business context
3. Read brand/{slug}/go-to-market/ecps/current.md → target audience
4. Read brand/{slug}/brand-voice/current.md → tone (for evaluating relevance)
5. Read brand/{slug}/go-to-market/positioning/*/current.md → angles, USPs
6. Read brand/{slug}/market-and-us/competitors/current.md → competitor list
7. Read brand/{slug}/idea-generation/recurring-tasks.json → active tasks
8. Read brand/{slug}/idea-generation/ideas.json → existing ideas (avoid duplicates)
```

**If Foundation is incomplete**: minimum = company-brief + ECPs. Without these, STOP: "Foundation incompleta. Necesito al menos company-brief y ECPs."

---

## Step 1: Determine What to Run

### Mode A: Cron execution (recurring task)
Read `recurring-tasks.json`. For each task with `status: "active"`:
- Check if it's due based on schedule
- Execute the sources defined in `task.config.sources`
- Use `task.config.queries` as seed queries if provided

### Mode B: Manual execution (user request)
User specifies what they want:
- "Genera ideas de contenido" → run content sources
- "Busca partners" → run contact sources
- "Ejecuta todas las tareas" → run all active recurring tasks
- Specific task: "Ejecuta la tarea de PAA" → run that one

### Mode C: Post-process trigger
After an audit or Trust Engine run → extract actionable ideas from results.

---

## Step 2: Execute Sources

Run applicable sources based on the task config. Each source produces raw idea candidates.

### Content Sources

#### 2.1 PAA (People Also Ask)
```
For each ECP keyword/topic:
  → web_search("{keyword}") 
  → Extract "People Also Ask" questions from results
  → Each PAA = potential content idea
  → Classify: goal (awareness/consideration/conversion), theme (educativo/faq/comparativo)
  → Suggest channels based on format (long-form → blog, question → blog+twitter, visual → instagram)
```

#### 2.2 SERP Gap Analysis
```
For each target keyword:
  → web_search("{keyword}")
  → Analyze top 10 results: what topics do they cover?
  → Identify gaps: what's NOT covered well?
  → Each gap = content idea with high priority
  → Source: seo_geo
```

#### 2.3 Competitor Content Monitoring
```
For each competitor URL (from Foundation):
  → web_fetch competitor blog/resources page
  → Extract recent article titles + topics
  → Identify: what are they writing about that we're not?
  → Each new competitor topic = content idea
  → Source: competitor
```

#### 2.4 Trending Topics
```
For the client's industry/niche:
  → web_search("latest trends {industry} {year}")
  → web_search("{industry} news this week")
  → Extract trending topics relevant to the business
  → Each trend = content idea (theme: trending, goal: awareness)
  → Source: signal
```

#### 2.5 Trust Engine Output (if available)
```
Read brand/{slug}/trust-engine/content-ideas.json (if exists)
  → Import as ideas with source: trust_engine
```

#### 2.6 Meeting Notes (if available)
```
Read brand/{slug}/intelligence/meetings/ recent files
  → Extract content-worthy insights
  → Source: meeting
```

### Contact Sources

#### 2.7 Partner/Media Discovery
```
For each target keyword:
  → web_search("{keyword} blog guest post")
  → web_search("{keyword} podcast interview")
  → web_search("top {industry} blogs")
  → Extract: site name, URL, contact info (if visible), relevance
  → type: contact, target_channel: partners or medios
```

#### 2.8 Influencer Discovery
```
For each ECP:
  → web_search("top {niche} influencers instagram")
  → web_search("{niche} linkedin thought leaders")
  → web_search("{niche} youtube channels")
  → Extract: name, platform, follower count (if visible), relevance
  → type: contact, target_channel: influencers
```

---

## Step 3: Deduplicate & Score

```
For each raw idea candidate:
  1. Check against existing ideas in ideas.json:
     - Compare title similarity (>80% = duplicate, skip)
     - Compare description overlap
  2. Calculate priority_score (0-100):
     Content ideas:
       - Keyword volume signal: high demand topics → +20
       - Gap size: bigger gap vs competitors → +25
       - Brand alignment: matches positioning → +20
       - Freshness: trending/timely → +15
       - ECP relevance: matches target audience → +20
     Contact ideas:
       - Domain authority / follower count → +25
       - Niche relevance → +30
       - Accessibility (contact info visible) → +20
       - Competitor presence (they already work with competitors) → +25
  3. Auto-assign goal and theme if not set (LLM classification)
  4. Suggest channels (multi-select) based on content type
```

---

## Step 4: Save Ideas

```python
# Load existing ideas
ideas = read("brand/{slug}/idea-generation/ideas.json") or []

# Add new ideas
for idea in new_ideas:
    idea.id = uuid()
    idea.status = "new"
    idea.created_at = now()
    idea.task_id = recurring_task_id (if from cron) or null
    ideas.append(idea)

# Save
write("brand/{slug}/idea-generation/ideas.json", ideas)

# Update recurring task stats
if from_cron:
    task.last_run_at = now()
    task.ideas_generated += len(new_ideas)
    # Calculate next_run_at based on schedule
    save recurring-tasks.json
```

---

## Step 5: Notify Discord

Publish summary to the client's #intelligence channel.

```
1. Read sources.json → get intelligence channel ID
2. Create summary message:

"💡 Idea Generation — {date}
📝 {N} nuevas ideas de contenido | 👥 {M} nuevos contactos

Top ideas:
• [título 1] (score: 85) — 📰📸💼
• [título 2] (score: 72) — 📰🐦
• [título 3] (score: 68) — 📸💼

👉 Revisa y aprueba en Mission Control: {MC_LINK}"

3. Send to channel, create thread with full details
4. In thread: list ALL new ideas grouped by type (content/contact)
```

**Thread pattern** (obligatory):
```
message(action=send, target=intelligence_channel_id, message=summary)
  → capture messageId
message(action=thread-create, channelId=intelligence_channel_id, messageId=messageId, threadName="💡 Ideas — YYYY-MM-DD")
  → capture threadId
message(action=send, target=threadId, message=full_details)
```

---

## Step 6: Auto-suggestion (post-process)

If this run was triggered by a completed process (audit, content generation, etc.):

```
"✅ Proceso completado. He generado {N} ideas nuevas.
¿Quieres crear una tarea recurrente para esto?
• Nombre sugerido: "{task_name}"
• Frecuencia sugerida: cada {X} días
• Fuentes: {sources_used}

Responde 'sí' para crearla."
```

If user confirms → create entry in recurring-tasks.json + create OpenClaw cron.

---

## Cron Integration

When a recurring task is created (from Strategic Plan or manually in MC):

```
cron(action=add, job={
  name: "Idea Gen — {client_name} — {task_name}",
  schedule: { kind: "cron", expr: "{cron_expression}", tz: "Europe/Madrid" },
  sessionTarget: "isolated",
  payload: {
    kind: "agentTurn",
    message: "Ejecuta idea-generation para {slug}. Tarea específica: {task_id}. Lee brand/{slug}/idea-generation/recurring-tasks.json y ejecuta solo la tarea con id={task_id}. Publica resultados en Discord #intelligence del cliente."
  },
  delivery: { mode: "none" }
})
```

---

## Output Schema

### Content Idea
```json
{
  "id": "uuid",
  "type": "content",
  "title": "Guía completa: FUE vs FUT en 2026",
  "description": "Artículo comparativo detallado basado en gap detectado en SERP. Top 10 no cubren diferencias de recuperación ni costes reales.",
  "channels": ["blog", "instagram", "linkedin"],
  "source": "seo_geo",
  "goal": "consideration",
  "theme": "comparativo",
  "status": "new",
  "priority_score": 82,
  "source_data": {
    "keywords": ["fue vs fut", "mejor técnica trasplante"],
    "serp_gap": "Ningún resultado en top 10 compara tiempos de recuperación",
    "competitor_coverage": ["clinica-x.com covers FUE only"]
  },
  "task_id": "recurring-task-uuid-or-null",
  "approved_at": null,
  "approved_by": null,
  "created_at": "2026-03-22T23:00:00Z"
}
```

### Contact Idea
```json
{
  "id": "uuid",
  "type": "contact",
  "title": "Blog 'Salud y Bienestar' — Guest post opportunity",
  "description": "Blog con DA 45, publica artículos sobre tratamientos estéticos. Aceptan guest posts. Contacto visible en About page.",
  "target_channel": "medios",
  "source": "seo_geo",
  "status": "new",
  "priority_score": 71,
  "source_data": {
    "url": "https://saludybienestar.com",
    "contact": "editor@saludybienestar.com",
    "relevance": "Publican sobre tratamientos capilares"
  },
  "task_id": null,
  "approved_at": null,
  "approved_by": null,
  "created_at": "2026-03-22T23:00:00Z"
}
```

---

## Self-QA

1. ¿Se leyó Foundation completa antes de generar?
2. ¿Se verificaron duplicados contra ideas existentes?
3. ¿Cada idea tiene: id, type, title, description, source, status, priority_score, created_at?
4. ¿Content ideas tienen: channels (array), goal, theme?
5. ¿Contact ideas tienen: target_channel (string)?
6. ¿Se calculó priority_score para cada idea?
7. ¿Se actualizó recurring-tasks.json con last_run_at e ideas_generated?
8. ¿Se notificó en Discord #intelligence con patrón de hilo?
9. ¿Se incluyó link a Mission Control en la notificación?
10. ¿Se aplicó client-context-isolation (solo info de este cliente)?

---

## Relación con otros skills

| Acción | Skill |
|--------|-------|
| **Alimenta** | Trust Engine output, audit results, signal-monitor, daily-pulse, thief-marketer |
| **Produce** | ideas.json (consumed by MC UI + execution skills) |
| **Triggerea** (al aprobar idea) | seo-content (blog), social-content (IG/LI/TW), partner-finder (contacts), outreach-sequence-builder (outreach) |
| **Se configura desde** | strategic-plan (Paso 8.5), Mission Control (Tareas Recurrentes UI) |
