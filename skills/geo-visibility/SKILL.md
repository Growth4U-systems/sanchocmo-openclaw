---
name: geo-visibility
description: "Analiza la visibilidad GEO (AI visibility) de una marca: cómo la citan y mencionan los modelos de IA (Gemini, ChatGPT, Perplexity) frente a competidores, por nicho y subnicho. Produce mention_rate, posición media, sentimiento, URLs citadas y comparación competitiva. Use when: 'analiza mi GEO', 'visibilidad en IA', 'cómo me cita ChatGPT', 'AI visibility'. NOT for: SEO técnico, SERP de Google, creación de contenido."
metadata:
  author: Alfonso + Cervantes
  version: '1.0'
  system: SanchoCMO
  status: parked
  extracted_from: trust-engine (geo-analysis module)
  deprecated_origin: SAN-186
---

# GEO Visibility — Análisis de visibilidad en IA

> **⚠️ PARKED SKILL** — Extraída del módulo `geo-analysis` del Trust Engine (deprecado en SAN-186).
> NO está cableada a UI, dispatch-map, pillar-manifest ni `SKILL_OWNER_MAP`. Es metodología
> preservada, pendiente de re-homing (ticket follow-up: cablear como antena de channel-loop o skill on-demand).
> Las rutas de input/output (`brand/{slug}/...`) son placeholders a confirmar al re-homing.

Analiza cómo los modelos de IA citan y mencionan a la marca frente a sus competidores,
cruzando objetivo × subnicho × propuesta de valor.

## MANDATORY MINIMUMS
- **≥7 prompts por nicho** (7 categorías × subniches)
- **≥2 providers** (web_search para Gemini + al menos 1 más)
- **TODOS los nichos** (no un subconjunto)
- **Total mínimo: 14 combinaciones prompt-provider por nicho** (7 prompts × 2 providers)
- **Cobertura de subnicho: cada subnicho DEBE tener ≥2 prompts**

## 1. Generación de prompts

**Fórmula: `{objetivo} × {subnicho} × {propuesta_de_valor}` = prompt**

Para CADA nicho Y CADA subnicho, generar prompts en 7 categorías:

```
discovery:      "Busco {subnicho_service} en {market}, ¿qué me recomiendas?"
recommendation: "Recomiéndame {solution} para {subnicho_specific_problem} en {market}"
comparison:     "Compara {subnicho_solutions} en {market}: opciones y precios"
alternatives:   "Alternativas a {known_solution} para {subnicho} en {market}"
problem:        "Tengo {subnicho_ECP_problem}. ¿Qué opciones tengo?"
authority:      "¿Quién es líder/experto en {subnicho} en {market}?"
content_gap:    "Guía completa para {subnicho_action} en {market}"
```

**CRÍTICO**: los prompts genéricos de nicho se pierden verticales enteros.
Ej: "plataforma de pagos para franquicias" → 0 medios de fitness.
Pero: "plataforma para centralizar cobros recurrentes de cadena de gimnasios con 20+ centros"
→ 15 medios nuevos (Palco23, CMDSport, etc.). Almacena TODOS los prompts antes de consultar.

## 2. Ejecución de consultas

```
FOR EACH prompt:
  Provider 1 — Gemini (vía web_search):
    web_search(prompt) → Extraer: cuerpo de texto + citas
  Provider 2 — Elegir UNO:
    A) ChatGPT API ($OPENAI_API_KEY): curl chat/completions
    B) Claude (sessions_spawn, run mode, timeout corto)
    C) Perplexity ($PERPLEXITY_API_KEY): curl chat/completions
    D) Fallback: re-run web_search con el prompt ligeramente reformulado

  Para CADA respuesta, parsear:
    - Todas las menciones de marca (nombre, posición 1-indexed, sentimiento, cita de contexto)
    - Todas las URLs/dominios citados
    - Si el cliente fue mencionado y CÓMO (qué se dijo de él)
```

## 3. Análisis

```
Por marca:  mention_rate, avg_position, sentiment (pos/neutral/neg), mentioned_as (temas/contextos)
Por nicho:  qué marcas dominan, cuáles son invisibles, qué dominios se citan más
Cross-nicho: client_visibility_overall (%), competitor_comparison (tabla de visibilidad)
```

## 4. Output (URLs > dominios)
Cada run captura: **URLs citadas** (no solo dominios), **menciones de marca con cita textual**,
y **clasificación de dominio** (editorial, directorio, competidor, etc.).

## QUALITY GATE
- ✅ ≥14 runs prompt-provider por nicho · ≥2 providers · TODOS los nichos
- ✅ Todos los subnichos con ≥2 prompts dedicados
- ✅ Menciones de marca parseadas (no texto crudo) · URLs citadas (no solo dominios)
- ✅ client_visibility (%) con denominador real · comparación de ≥3 competidores · breakdown por subnicho
- ❌ FAIL si <8 runs totales · si solo 1 provider · si algún subnicho tiene 0 prompts · si las citas solo tienen dominios sin URL

## Learnings heredados (Paymatico, Mar 2026)
- **#1/#2/#8 Subnichos**: keywords y prompts por subnicho; prompts = objetivo × subnicho × propuesta de valor.
- **#5 URLs > dominios**: output siempre con URLs específicas de artículo, no solo dominios.
- **#12 Filtro mercado/idioma**: excluir dominios de otros mercados/idiomas automáticamente.
