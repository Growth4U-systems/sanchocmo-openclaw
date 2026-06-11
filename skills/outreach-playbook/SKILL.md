---
name: outreach-playbook
description: "Generate and update the Outreach Playbook for a client. Defines discovery methods, sequence templates, and outreach stack based on Foundation ECPs, Atalaya contacts, and Trust Engine media/partner intelligence."
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/go-to-market/positioning/positioning.current.md
- brand/{slug}/market-and-us/competitors/sources.json
- brand/{slug}/strategic-plan/strategic-plan.current.md
context_writes:
- brand/{slug}/outreach-playbook/outreach-playbook.current.md
- brand/{slug}/outreach-playbook/discovery-guide.md
- brand/{slug}/outreach-playbook/sequence-templates.md
---

# Outreach Playbook Generator

> Genera y actualiza el Outreach Playbook del cliente basándose en Foundation ECPs, Atalaya, Trust Engine y research.

## Workflow

### 1. Read Context
- Company brief: qué vendemos
- ECPs: a quién contactamos, pain points
- Positioning: messaging y ángulo
- Brand voice: tono para emails/DMs
- Strategic Plan: qué canales de outreach, objetivos

### 2. Research
- WebSearch: best practices cold email/LinkedIn outreach en el sector
- Analizar Atalaya contacts detectados (si existen)
- Trust Engine: medios, partners, influencers identificados

### 3. Generate outreach-playbook.current.md
- Stack: herramientas (Instantly, Apollo, etc.)
- Dominios configurados para cold email
- Canales: email, LinkedIn DM, teléfono
- Volumen y cadencia

### 4. Generate discovery-guide.md
- Pipeline de descubrimiento por ECP
- Dónde buscar, criterios, señales de compra
- Herramientas por paso

### 5. Generate sequence-templates.md
- Estructura base multi-canal (7 toques, 14 días)
- Niveles de personalización (L1-L4)
- Variantes por señal de compra
- GDPR compliance

### 6. If updating
- Compare con datos nuevos de Atalaya/Trust Engine
- Actualizar discovery-guide con nuevas fuentes
- Refinar secuencias basándose en Performance Analysis (reply rates)
