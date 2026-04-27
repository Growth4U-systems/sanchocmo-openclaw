# Content Engine Setup — Growth4U

_Pendiente de regenerar con la nueva versión del skill `content-engine-setup`._

Este documento contendrá:

- **Por qué hicimos esto**: explicación corta del Content Engine y de por qué necesitamos configs por pillar
- **Decisiones por pillar** (P1–P5): qué tipo de noticias buscamos, qué preguntas extraemos de Google (PAA), qué keywords priorizamos, y qué profiles vigilamos para cada pillar
- **Profiles a monitorizar**: resumen del listado unificado en `sources.json` (empresas + founders + voces del sector)
- **Cadencia editorial**: qué canales activos, frecuencia y perfiles publicando
- **Crones conectados**: tabla con cada cron, cuándo corre y qué config consume

## Cómo regenerar

Abre el chat de esta tarea (botón **💬 Abrir chat** en la card de Setup) y pide a Sancho:

> Regenera el setup completo del Content Engine.

Sancho ejecutará el skill `content-engine-setup` que:
1. Lee `content-pillars.md` + Foundation (company-brief, ECPs, brand-voice)
2. Rellena los configs editables (news-prompts, paa-queries, keywords-seed, sources.json profiles, cadence-config.yml)
3. Sobreescribe este documento con la versión narrativa final

## Editar configs sin regenerar

Si solo quieres ajustar un trozo concreto sin pasar por el skill:

- **News prompts** → MC UI → Inputs → 📰 News Prompts
- **People Also Ask** → MC UI → Inputs → ❓ People Also Ask
- **Keywords SEO** → MC UI → Inputs → 🔑 Keywords SEO
- **Profiles a monitorizar** → MC UI → Inputs → 🕵️ Perfiles a monitorizar
- **Cadencia** → MC UI → Inputs → ⏰ Cadencia
