# SanchoCMO — Version 0.1.0

> Versión test. Infraestructura montada, pendiente primer cliente.

**Fecha**: 2026-02-24
**Fase**: Pre-Foundation
**Cliente activo**: Hospital Capilar (pendiente arrancar)

---

## Stack

| Componente | Herramienta | Estado |
|---|---|---|
| Runtime | OpenClaw 2026.2.22-2 | ✅ Running |
| Modelo principal | Claude Opus 4.6 (200k ctx) | ✅ |
| Gateway | LaunchAgent + ws://127.0.0.1:18789 | ✅ Running |
| Acceso remoto | Tailscale serve | ✅ `sancho-cmo.taild48df2.ts.net` |
| Chat | Discord bot SanchoCMO | ✅ Connected |
| DB | Supabase (9 tablas) | ✅ Vacías |
| Email/Cal | gog CLI → Google Workspace | ✅ `alfonso@growth4u.io` |
| Docs | Notion API | ✅ Key configurada |
| Browser | OpenClaw browser tool | ✅ Nativo |
| Imágenes | nano-banana-pro skill | ✅ Disponible |
| Memory | Vector + FTS + MEMORY.md | ✅ |

## Agentes (11)

| Agente | Canal Discord | Modelo | Rol |
|---|---|---|---|
| Sancho | #campaigns, #intelligence, #learning, #admin | Opus | CMO Estratega |
| El Oráculo | #el-toboso | Opus | Brand identity, Foundation |
| El Explorador | #prospecting | Sonnet | Cold outreach pipeline |
| El Redactor | #organic-content | Sonnet | SEO content |
| El Comunicador | #social | Sonnet | Social media, newsletter |
| El Creativo | #design | Sonnet | Assets visuales |
| El Amplificador | #paid-ads | Sonnet | Paid media |
| El Conector | #partners | Sonnet | Alianzas, partnerships |
| El Comercial | #sales | Sonnet | Propuestas, pricing |
| El Arquitecto | #web | Sonnet | Landing pages, CRO |
| El Investigador | #research | Opus | Deep dives, mercados |

## Skills (38)

### Foundation (16 pilares)
company-context, budget-constraints, business-model-audit, self-intelligence,
competitor-intelligence, market-intelligence, existing-customer-data,
niche-discovery-100x, ecp-validation, positioning-messaging, pricing-hooks,
brand-voice, visual-identity, foundation-orchestrator, phase-0-diagnostic, swot-analysis

### Decide (3)
channel-prioritization, content-calendar-planner, outreach-sequence-builder

### Intelligence (5)
daily-pulse, meeting-intelligence, content-miner, pattern-detector, signal-definition

### Content (7)
keyword-research, seo-content, content-atomizer, direct-response-copy,
lead-magnet, email-sequences, newsletter

### Outreach (3)
company-finder, decision-maker-finder, contact-enrichment

### Utilities (4)
insight-to-content-mapper, competitor-alternatives, thief-marketers, nano-banana-pro

## Qué falta para v0.2.0
- [ ] Foundation completa para Hospital Capilar
- [ ] Primer test end-to-end de un workflow completo
- [ ] Heartbeat configurado con checks periódicos
- [ ] Dispatch bot desplegado
- [ ] Primer contenido generado por el sistema
