---
name: company-context
description: "Company profiling: identity, product, business model, goals, current state, brand culture, team. Use when: onboarding a new client, updating an existing client profile, capturing who the company is and what they want. Strategy: Infer → Validate → Complete. Produces a structured Company Context Profile that feeds ALL downstream pillars. NOT for: market analysis (use market-intelligence), competitor research (use competitor-intelligence), or brand voice definition (use brand-voice)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '4.0'
  system: SanchoCMO
  phase: '1'
  pillar: company-context
  layer: '0'
  updated: '2026-02-27'
  changes: v4 — Restructured per skill-creator principles. SKILL.md lean. Concepts/methodology moved to references.
context_required: []
context_writes:
- brand/{slug}/company-brief/current.md (section: Company Identity)
- brand/{slug}/operational/learnings.md
---

# Company Context

> Captura QUIÉN es la empresa, QUÉ quieren y POR QUÉ existen. Bedrock de todos los pillars downstream.

**Input**: URL, documentos, conversación con cliente
**Output**: Company Context Profile → `brand/{slug}/company-context/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [prompt.md](references/prompt.md) | **SIEMPRE** — fuente de verdad del output | Estrategia Infer→Validate→Complete, preguntas, formato |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA obligatorio | Ítems de verificación por sección |
| [concepts.md](references/concepts.md) | Si necesitas recordar criterios Lite/Deep, edge cases | Definiciones, conversation design, re-entry |
| [schema.md](references/schema.md) | Si necesitas el schema campo por campo | Estructura de datos del output |

---

## Flujo de Ejecución

### 1. Inferir primero (~5-15 min, autónomo)
- Scrape website: homepage, about, pricing, blog, meta tags
- Check social profiles: LinkedIn, Twitter/X, Instagram
- Analiza documentos existentes (pitch deck, brand guide)
- Pre-rellena el Context Profile con atribución de fuente por campo

### 2. Validar con el usuario (~5 min)
- Presenta el perfil inferido agrupado (no campo por campo)
- ✅ para alta confianza, ⚠️ para media, blank para desconocido
- El usuario corrige lo incorrecto

### 3. Completar gaps (~10-20 min, conversacional)
- Lee `references/prompt.md` para las preguntas priorizadas
- Pregunta SOLO lo que falta, agrupado por tema, máx 3-4 a la vez
- Explica el POR QUÉ de cada pregunta

### 4. Generar Profile Summary
- 3 párrafos: qué hacen / estado actual / hacia dónde van
- Almacena como Tier 1 context (siempre cargado)

### 5. Self-QA (OBLIGATORIO)
- Lee `references/checklist.md`
- Revisa CADA ítem contra tu documento
- Si hay ❌ → investiga más o pregunta al usuario
- Repite hasta 0 ❌ (todo ✅ o ⚠️ justificado)
- Metadata: `<!-- Self-QA: PASS | fecha | items: X✅ Y⚠️ 0❌ -->`

### 6. Guardar con versionado
- Ruta: `brand/{slug}/company-context/current.md`
- Si ya existe → backup como `v{N+1}.md`, sobreescribe `current.md`, actualiza `history.json`
- Link: `{MC_BASE_URL}/docs/brand/{slug}/company-context/current.md`

---

## Cross-Pillar Data Flow

| Dato | Lo consume |
|------|-----------|
| Elevator pitch + producto | positioning-messaging, brand-voice, content |
| Business model + revenue | business-model-audit, pricing-hooks |
| Goals + timeline | foundation-orchestrator (Lite vs Deep), phase routing |
| Markets/geografía | market-intelligence, competitor-intelligence |
| Canales actuales + volumen | diagnostic scoring (Traffic + Revenue) |
| Valores + constraints | brand-voice, content guardrails |
| Visión | positioning-messaging (narrative largo plazo) |

---

## Profundizar con Deep Research

Al entregar, añade:

```
📊 **¿Quieres profundizar?**
Puedo lanzar deep-research para ampliar con más fuentes y validación cruzada.
→ Escribe **"profundizar"** para continuar.
```

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{{slug}}/company-context/
├── current.md      ← versión activa
├── v1.md, v2.md... ← versiones anteriores
├── history.json    ← log de versiones
└── qa-log.md       ← historial de QA
```

1. Identifica slug desde systemPrompt (`[CLIENTE: ... | slug: ...]`)
2. Si existe `current.md` → backup como `v{N+1}.md`, pide confirmación
3. Si no existe → crea carpeta + `current.md` + `v1.md` + `history.json`
4. Link: `{MC_BASE_URL}/docs/brand/{slug}/company-context/current.md`
