# Niche Discovery v4.0 — Output Schema

## Outputs

El skill produce 2 archivos:

| Archivo | Propósito | Consumen |
|---------|-----------|----------|
| `problems.md` | Audit trail — de dónde salió cada ECP | Referencia interna, QA |
| `ecps.md` | Acción — ECPs con reachability descubierta | positioning-messaging, channel-prioritization |

## ECP Schema (ecps.md)

### Campos por ECP

| Campo | Tipo | Descripción |
|-------|------|-------------|
| name | string | Descriptivo, basado en NECESIDAD. ❌ "Solo Technical Founder" ✅ "Necesita growth system repetible" |
| core_need | string | El "I want to" del JTBD. Debe poder decirlo 50 personas distintas sin cambiar una palabra. |
| trigger | string | Qué les hace buscar solución AHORA. Momento específico. |
| problems_included | string[] | IDs de problems en problems.md que forman este cluster |
| unified_problem | string | Resumen del problema unificado (mezcla de los problems del cluster, en sus palabras) |
| why | string | Por qué este problema les importa — consecuencias económicas, emocionales, operativas |
| jtbd_statement | string | "Cuando [situación], quiero [motivación], para poder [resultado]" |
| hypothesis | string | "Creemos que [quienes tienen necesidad] se frustran por [problema], lo que les obliga a [workaround]..." |
| alternatives | string | Qué hacen HOY (incluyendo "no hacer nada", manuales, competidores específicos) |
| trust_map | object | Influencers, newsletters, comunidades, eventos, podcasts — NOMBRES específicos |
| search_map | object | Keywords: awareness, consideración, decisión |
| channel_map | object | Canales primarios (trust+search convergen) + secundarios, con acciones concretas |
| why_we_win | string | Ventaja específica para esta necesidad |
| founder_moat_badge | string | "🏆 ALTO" / "⭐ MEDIO" / "—" + justificación |
| pain_score | 2-99 | Frecuencia, willingness to pay, intensidad emocional |
| pain_explanation | string | 200-400 chars: por qué esta nota (frecuencia foros, WTP, consecuencias económicas) |
| reachability_score | 2-99 | Evidence-based: 76-99 = 2+ canales primarios, 51-75 = 1 primario + secundarios, 21-50 = solo secundarios, 2-20 = sin canales |
| reachability_explanation | string | 200-400 chars: canales descubiertos, convergencia trust×search, tamaño comunidades |
| sam_score | 2-99 | Tamaño mercado alcanzable (normalizado) |
| sam_explanation | string | 200-400 chars: cifra absoluta, fuentes, método, tendencia |
| ecp_score | float | Pain × 0.35 + Reachability × 0.40 + SAM × 0.25 |

### Trust Map Structure

```json
{
  "influencers": ["Nombre Apellido (plataforma, seguidores)", ...],
  "newsletters": ["Newsletter Name (frecuencia, audiencia)", ...],
  "communities": ["Nombre (plataforma: Slack/Discord/Reddit/etc)", ...],
  "events": ["Nombre Evento (ciudad, frecuencia)", ...],
  "podcasts": ["Nombre Podcast (host, audiencia)", ...]
}
```

### Search Map Structure

```json
{
  "awareness": ["keyword 1", "keyword 2", ...],
  "consideration": ["keyword 1", "keyword 2", ...],
  "decision": ["keyword 1", "keyword 2", ...]
}
```

### Channel Map Structure

```json
{
  "primary": [
    {
      "channel": "Nombre específico (plataforma)",
      "why_primary": "Trust + Search convergen aquí porque...",
      "action": "Acción concreta con contexto"
    }
  ],
  "secondary": [
    {
      "channel": "Nombre específico",
      "type": "trust_only | search_only",
      "action": "Acción concreta"
    }
  ]
}
```

**QA**: Un canal genérico ("LinkedIn") NO es válido. Debe incluir: plataforma específica + contexto + acción concreta.

## Problem Schema (problems.md)

### Campos por Problem

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | int | Número secuencial |
| statement | string | El problema en palabras del usuario |
| why | string | Por qué les importa |
| persona | string | Descripción de quién lo tiene (no arquetipo) |
| alternatives | string | Qué hacen hoy |
| source | string | Tipo de fuente (ver Valid Source Types) |
| source_url | string | URL de la fuente |
| engagement | string | Score/votes/likes de la fuente |
| jtbd_statement | string | "Cuando [situación], quiero [motivación], para poder [resultado]" |
| swot_filter | PASS/PARTIAL/FAIL | Resultado del filtro SWOT |
| solution_filter | PASS/PARTIAL/FAIL | Resultado del Solution Filter |
| product_filter | 1-5 | Score del Product Filter |

## Storage Tiers

| Tier | Contenido | Uso |
|------|-----------|-----|
| Tier 1 | ECPs: name, core_need, channel_map.primary, scoring, founder_moat | Carga downstream (positioning-messaging consume esto) |
| Tier 2 | Full ECPs: trust_map, search_map, channel_map completo + problems filtrados | Referencia completa |
| Tier 3 | Raw problems + sources + scraping logs | Audit trail |

## Cross-Pillar Data Flow

| Data | Consumed By |
|------|-------------|
| ECPs (name, core_need, channel_map) | positioning-messaging (messaging por ECP), channel-prioritization |
| Trust Map por ECP | channel-prioritization (input directo), content-workflow |
| Search Map por ECP | keyword-research, seo-content |
| Problems filtrados | positioning-messaging (voces reales para copy) |
| Founder Moat badges | positioning-messaging (diferenciación) |

## Valid Source Types

### B2C/SMB Sources
- `"reddit"`, `"quora"`, `"twitter"`, `"community-forum"`, `"g2-review"`, `"capterra-review"`, `"trustpilot-review"`, `"app-store-review"`

### B2B Enterprise Sources
- `"case-study"`, `"job-posting"`, `"earnings-call"`, `"conference-agenda"`, `"linkedin"`, `"trade-publication"`, `"regulatory"`, `"expert-interview"`, `"micro-interview"`

### Foundation Harvest Sources
- `"competitor-intelligence-lens3"`, `"market-intelligence"`, `"self-intelligence-lens3"`
