# Positioning & Messaging — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.
> **REPETIR por cada ECP procesado.**

---

## Step 1: Niche Deep Research

- [ ] **Deep research enfocado** en el ECP específico (no genérico de mercado)
- [ ] **Problem space investigado** (cómo la gente lo experimenta, soluciones existentes, unmet needs)
- [ ] **Documento de referencia** generado para alimentar Steps 2-7

## Step 2: Mini Competitor Analysis for Niche

- [ ] **4 categorías de competidores** analizadas (Type A/B/C/D)
- [ ] **Features relevantes para el ECP** detalladas por competidor
- [ ] **Fricción operacional** analizada (visibility, automation, segmentation)
- [ ] **Fricción emocional** analizada (motivación, presión, satisfacción de progreso)

## Step 3: Own Company Analysis for Niche

- [ ] **Company overview** (historia, modelo, UVP, features principales)
- [ ] **In-depth functional review** para el ECP (features que soportan el ECP_why_features)
- [ ] **User flow end-to-end** documentado
- [ ] **Reducción de fricción** por feature analizada

## Step 4: Value Criteria + Competitive Scoring

- [ ] **Tier 2 check**: criteria existentes en `shared/value-criteria.md` revisados antes de crear nuevos
- [ ] **Deduplicación**: ningún criteria nuevo es >80% similar a uno existente
- [ ] **Criteria generados** (funcional + emocional, 5 dimensiones)
- [ ] **Naming correcto** (noun phrases, 2-5 palabras, mismo nivel de abstracción)
- [ ] **UNA sola tabla consolidada** con ALL criteria + scores + ECPs como links
- [ ] **Justification por criteria** (párrafo independiente de ECP: qué significa y por qué importa)
- [ ] **Importance weight (1-10)** asignado a cada criteria
- [ ] **Scoring 0-5** para cada competidor + "Do Nothing"
- [ ] **Score explanations POR CRITERIA** (no agrupados por ECP): detalle por competidor con evidencia
- [ ] **Scores que cambian por ECP** anotados INLINE en la explicación del criteria
- [ ] **ECPs como links** en la tabla (ej: `[1](../ecp1-slug/ecp1-slug-current.md)`)
- [ ] **Clasificación**: Red Ocean (avg 4-5) / No Market (avg 0-1) / Opportunity Zone (avg 2-3)
- [ ] **Top 3-5 Opportunity Zones** identificadas

## Step 5: Asset Mapping

- [ ] **Tier 2 check**: assets existentes revisados antes de crear nuevos
- [ ] **TODOS los assets mapeados** (features, team, skills, knowledge, technology, location)
- [ ] **Qualifier vs Differentiator** clasificado por asset
- [ ] **Cada asset conectado** a un Value Criteria del Step 4
- [ ] **Sin palabras vagas** (no "empower", "elevate" — specific)

## Step 6: Benefit-Proof Pairing

- [ ] **Cada asset tiene**: competitive advantage + user benefit + proof
- [ ] **Proofs son específicos** (testimonial, screenshot, tutorial, case study — no genéricos)
- [ ] **Cada proof incluye mensaje específico** adaptado al ECP
- [ ] **Tipos de proof variados** (no solo "testimonials" para todo)

## Step 6.5: Objection Neutralization (NUEVO)

- [ ] **Conversion barriers extraídas** del company-brief
- [ ] **CADA barrera tiene**: reframe + mensaje neutralizador + proof
- [ ] **Mensajes son empáticos** (reconocen la objeción, no la ignoran)
- [ ] **Proofs son específicos** (no genéricos tipo "nuestros clientes nos adoran")
- [ ] **Conexión a Assets** del Step 5 cuando aplica

## Step 7: Final Positioning & Messaging Playbook (Pain-Activated)

- [ ] **UVP extraído** de la evidence (core value promise, 1 frase)
- [ ] **4-5+ USPs** con posicionamiento único cada uno
- [ ] **1-2+ mensajes anti-objeción** integrados del Step 6.5
- [ ] **Messaging table en idioma del cliente** (SOUL.md principio 7)
- [ ] **2 formatos por mensaje**: versión corta (ads) + versión landing (story-driven)
- [ ] **Framework Dolor (=Value Criteria) → Diagnóstico (=insight) → Puente (=Asset)** aplicado en cada mensaje landing
- [ ] **Cada fila tiene**: Categoría, Hipótesis, Value Criteria, Objetivo, Versión Corta, Versión Landing
- [ ] **Copy es**: visceral, específico, reconocible — NO genérico, NO funcional
- [ ] **Cada mensaje conectado** a un Value Criteria
- [ ] **A/B variants generadas** (si el cliente lo solicitó)

## Tier 2 Document Management

- [ ] **Value Criteria**: sin duplicados cross-niche
- [ ] **Assets**: sin duplicados cross-niche
- [ ] **Cross-references** actualizadas entre documentos

## Output

- [ ] **Summary generado** (opportunity zones, diferenciadores, UVP, top 3 messages)
- [ ] **Lite criteria met**: Steps 1-4 + 3 assets + UVP + 3 USPs

## Step 9: Positioning DAG Review (Gate de calidad)

- [ ] **DAG Review ejecutada** usando `references/positioning-dag-review.md`
- [ ] **Storytelling Coherence**: 5/5 ⭐
- [ ] **Value Criteria Coverage**: 5/5 ⭐ (sin duplicados, con justificación + importance)
- [ ] **Asset Validity**: 5/5 ⭐ (todos reales, sin duplicados)
- [ ] **Messaging Alignment**: 5/5 ⭐
- [ ] **Orphan/Duplicate Health**: 5/5 ⭐ (orphans investigados, duplicados mergeados)
- [ ] **Objection & Legal Coverage**: 5/5 ⭐ (todas objeciones cubiertas, 0 violaciones legales, datos con fuente)
- [ ] **OVERALL**: 5/5 ⭐
- [ ] **Action items CRITICAL**: 0 pendientes
- [ ] **Action items IMPORTANT**: 0 pendientes

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Shared docs actualizados**: `brand/{{slug}}/positioning/shared/value-criteria.md` + `assets.md`
- [ ] **Per-ECP guardado en** `brand/{{slug}}/positioning/{ecp-slug}/{ecp-slug}-current.md`
- [ ] **Per-ECP empieza por JTBD** (sin narrativa de deep research)
- [ ] **Links bidireccionales**: shared → ECPs (links en tabla) + ECP → shared (refs en header)
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## Verificación Legal (BLOQUEANTE)

- [ ] **Restricciones legales leídas** del company-brief (`{{legal_constraints}}`)
- [ ] **CERO violaciones**: ningún nombre de fármaco/producto restringido aparece en copy
- [ ] **CERO claims prohibidos**: no se hacen afirmaciones médicas/legales no permitidas
- [ ] **Cada violación encontrada** fue corregida y documentada (original → versión compliant)

## Verificación de Datos Estadísticos (OBLIGATORIO)

- [ ] **Cada cifra/porcentaje/estadística** tiene `[Fuente](url)` inline
- [ ] **Datos sin fuente verificada** están marcados como `~estimación sin fuente verificada`
- [ ] **CERO datos numéricos sin atribución** en el output final

## META (calidad)

- [ ] **Cada claim de positioning** tiene evidence trail (value criteria → asset → proof)
- [ ] **0 claims sin proof** — todo respaldado
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check de fuentes)
- [ ] **Coherencia con brand files** (ecps.md, competitors.md, self-intel)
- [ ] **Copy no promete** lo que el producto no puede entregar (cruzar con self-intel Lens 3)
- [ ] **TODAS las objeciones del brief** están cubiertas por al menos 1 mensaje

---

## Flujo de uso

```
1. Agente ejecuta Steps 1-7 por cada ECP
2. Al terminar cada ECP, lee este checklist
3. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — volver a investigar
4. Si hay ❌ → investigar más / refinar messaging
5. Spot-check: verificar 5-10 URLs con web_fetch
6. Cruzar claims contra self-intel Lens 3 (¿prometemos lo que entregamos?)
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
