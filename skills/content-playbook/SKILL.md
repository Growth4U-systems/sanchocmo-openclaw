---
name: content-playbook
description: "Generate and update the Content Playbook for a client. Defines content pillars, hooks, formats, and cadence based on Atalaya intelligence, Trust Engine SEO data, and Foundation context."
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/brand-book/brand-voice/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/go-to-market/positioning/current.md
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/atalaya/config.json
- brand/{slug}/strategic-plan/current.md
context_writes:
- brand/{slug}/content-playbook/current.md
- brand/{slug}/content-playbook/pillars.md
- brand/{slug}/content-playbook/writing-guide.md
---

# Content Playbook Generator

> Genera y actualiza el Content Playbook del cliente basándose en inteligencia de Atalaya, Trust Engine y Foundation.

## Workflow

### 1. Read Context
- Company brief: quién es, qué hace
- Brand voice: tono y estilo
- ECPs: a quién le hablamos
- Positioning: ángulo diferenciador
- Competitors: qué contenido hacen
- Strategic Plan: qué canales, qué objetivos
- Atalaya config: perfiles seguidos, scans previos

### 2. Research (si es primera generación)
- WebSearch: best practices de contenido en el sector del cliente
- WebSearch: mejores hooks de LinkedIn/Twitter/IG para el nicho
- Analizar Atalaya scans previos (si existen) en `atalaya/profiles-scan/`

### 3. Generate current.md
- Stack de contenido: web, blog, redes con handles
- Herramientas de publicación configuradas
- Cadencia por canal (frecuencia, mejores días/horas)

### 4. Generate pillars.md
- 3-5 pilares validados con datos
- Distribución recomendada (% por pilar)
- Mapping pilar → funnel stage (TOFU/MOFU/BOFU)

### 5. Generate writing-guide.md
- Hooks por plataforma con ejemplos
- Formatos efectivos con benchmarks
- Voz y tono refinados desde brand-voice

### 6. If updating (not first generation)
- Read existing Playbook docs
- Compare with new Atalaya data
- Update ONLY data sections (hooks, benchmarks) automatically
- Propose pillar/strategy changes for approval
