---
name: ope-canvas
description: "One-Page Endgame (OPE) Canvas — Síntesis estratégica en 14 secciones: Obvious Choice, ICP, Core Problem, Core Product, Geography, Channels, Moats, Endgame, Core Values, Core Capabilities, Strategy Choice, Year/Quarter/Monthly Picture. Use when: starting Foundation after La Empresa pillars are complete, creating strategic snapshot before market analysis, Power Hour prep with client. Based on ProductLed framework by Wes Bush."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: ope-canvas
  depends_on: company-context, business-model, budget, self-intelligence
  updated: '2026-02-27'
context_required:
- brand/{slug}/company-context/current.md
- brand/{slug}/business-model/current.md
- brand/{slug}/budget/current.md
- brand/{slug}/market-and-us/self/current.md
- brand/{slug}/market-and-us/market/current.md
- brand/{slug}/market-and-us/competitors/current.md
- brand/{slug}/go-to-market/positioning/shared/messaging-summary.md
- brand/{slug}/intelligence/meetings/*.md
context_writes:
- brand/{slug}/market-and-us/ope-canvas/current.md
---

# OPE Canvas (One-Page Endgame)

> Síntesis estratégica en 1 página: visión, ICP, propuesta de valor, moats, canales y endgame. Puente entre "entender la empresa" y "analizar el mercado".

**Input**: Los 4 pilares de La Empresa (company-context, business-model, budget, self-intelligence) + documentación del cliente
**Output**: OPE Canvas completo → `brand/{slug}/market-and-us/ope-canvas/current.md`

## References

| Archivo | Cuándo leer | Contenido |
|---------|------------|-----------|
| [hydration.md](references/hydration.md) | **SIEMPRE** — Step 0 obligatorio | Mapeo de campos upstream → esta skill |
| [prompt.md](references/prompt.md) | **SIEMPRE** — las 14 secciones detalladas | Instrucciones por sección, qué incluir, qué evitar |
| [checklist.md](references/checklist.md) | **Antes de entregar** — self-QA | Checklist de calidad |
| [concepts.md](references/concepts.md) | Si necesitas el framework de Moats o reglas de oro | Definiciones, errores comunes, proceso |

---

## Flujo de Ejecución

### 0. Context Hydration (OBLIGATORIO — antes de cualquier pregunta)
- Lee `_system/skills/context-hydration-protocol.md` para el patrón genérico
- Lee `references/hydration.md` para el mapeo específico de esta skill
- Lee TODOS los docs en `context_required`
- Pre-rellena campos según hydration_map
- Presenta datos heredados al usuario: "De [fuente] ya tengo X. ¿Correcto?"
- Solo pregunta campos listados en "Campos genuinamente nuevos"

### 0. Verificar Prerequisites
- Confirmar que company-context, business-model, budget y self-intelligence están `approved`
- Si falta alguno → informar al usuario qué falta y no continuar

### 1. Recopilar TODA la Información Disponible
**Lee TODOS los documentos existentes del cliente, no solo los 4 de La Empresa:**
```
brand/{slug}/company-context/current.md            ← standalone: identidad
brand/{slug}/business-model/current.md             ← standalone: modelo
brand/{slug}/budget/current.md                     ← standalone: budget
brand/{slug}/market-and-us/self/current.md
brand/{slug}/market-and-us/market/current.md       ← si existe
brand/{slug}/market-and-us/competitors/current.md     ← si existe
brand/{slug}/go-to-market/positioning/shared/messaging-summary.md ← si existe
brand/{slug}/market-and-us/ope-canvas/briefing.md ← si existe (datos pre-validados)
brand/{slug}/intelligence/meetings/*.md ← notas de reuniones
```
- **REGLA CRÍTICA**: Si un dato está en CUALQUIERA de estos docs, NO lo pongas como DUDA. Extráelo y úsalo.
- Solo marca DUDA lo que realmente no está en ningún documento
- Preguntar al usuario si tiene documentación adicional (decks, métricas, propuestas)

### 2. Generar Draft del OPE Canvas
- Lee `references/prompt.md` para las 14 secciones
- Para cada sección: extraer y sintetizar de la documentación existente
- **REGLA: NUNCA inventes datos.** Si no está en la documentación → marca `🔴 DUDA: [qué falta]`
- Solo extrae y acomoda información existente — es una síntesis, no un ejercicio creativo

### 3. Presentar al Usuario para Validación
- Mostrar el canvas completo con las 14 secciones
- Listar todas las DUDAs encontradas
- Preguntar: "Estas DUDAs son tus preguntas para la Power Hour con el cliente. ¿Quieres resolver alguna ahora?"

### 4. Power Hour (opcional)
- Si el usuario quiere resolver DUDAs → ir una por una
- Actualizar el canvas con las respuestas
- Repetir hasta que el usuario apruebe

### 5. Versión Final
- Incorporar todo el feedback
- Verificar con `references/checklist.md` (Self-QA)

## Cross-Pillar Data Flow

```
INPUTS (La Empresa):
  company-context/current.md → Obvious Choice, Core Product, Core Values, Core Capabilities
  business-model/current.md  → Core Product, Geography, Strategy Choice, Endgame
  budget/current.md          → Year/Quarter/Monthly Picture
  self-intelligence/current.md → Moats, Core Capabilities, Strategy Choice

OUTPUTS (alimenta El Mercado):
  ope-canvas/current.md → ICP y Moats informan competitor-intelligence
  ope-canvas/current.md → Geography y Channels informan market-intelligence
  ope-canvas/current.md → Core Problem e ICP informan niche-discovery-100x
```

## 📁 Almacenamiento (OBLIGATORIO)

```
brand/{slug}/market-and-us/ope-canvas/
├── current.md      ← Versión activa
├── v1.md           ← Primera versión
├── history.json    ← Log de versiones
└── qa-log.md       ← Registro de QA
```

## 🔬 Profundizar con Deep Research

Si el usuario quiere profundizar en alguna sección (ej: Moats, ICP, Endgame):
> "¿Quieres que investigue más a fondo [sección]? Puedo usar `/deep_research` para buscar datos de mercado, benchmarks y casos similares."
