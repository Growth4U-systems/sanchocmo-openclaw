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

- [ ] **Tier 2 check**: value criteria existentes revisados antes de crear nuevos
- [ ] **Criteria generados** (funcional + emocional, 5 dimensiones)
- [ ] **Naming correcto** (noun phrases, 2-5 palabras, mismo nivel de abstracción)
- [ ] **Scoring 0-5** para cada competidor + "Do Nothing"
- [ ] **Clasificación**: Red Ocean (avg 4-5) / No Market (avg 0-1) / Opportunity Zone (avg 2-3)
- [ ] **Top 3-5 Opportunity Zones** identificadas

## Step 5: Asset Mapping

- [ ] **Tier 2 check**: assets existentes revisados antes de crear nuevos
- [ ] **TODOS los assets mapeados** (features, team, skills, knowledge, technology, location)
- [ ] **Qualifier vs Differentiator** clasificado por asset
- [ ] **Cada asset conectado** a un Value Criterion del Step 4
- [ ] **Sin palabras vagas** (no "empower", "elevate" — specific)

## Step 6: Benefit-Proof Pairing

- [ ] **Cada asset tiene**: competitive advantage + user benefit + proof
- [ ] **Proofs son específicos** (testimonial, screenshot, tutorial, case study — no genéricos)
- [ ] **Cada proof incluye mensaje específico** adaptado al ECP
- [ ] **Tipos de proof variados** (no solo "testimonials" para todo)

## Step 7: Final Positioning & Messaging Playbook

- [ ] **UVP extraído** de la evidence (core value promise, 1 frase)
- [ ] **4-5+ USPs** con posicionamiento único cada uno
- [ ] **Messaging table bilingual** (EN + ES)
- [ ] **Cada fila tiene**: Message Category, Hypothesis, Value Criteria, Objective, Final Message EN, Final Message ES
- [ ] **Copy es**: claro, empático, actionable, benefit-driven
- [ ] **Cada mensaje conectado** a un Value Criterion

## Tier 2 Document Management

- [ ] **Value Criteria**: sin duplicados cross-niche
- [ ] **Assets**: sin duplicados cross-niche
- [ ] **Cross-references** actualizadas entre documentos

## Output

- [ ] **Summary generado** (opportunity zones, diferenciadores, UVP, top 3 messages)
- [ ] **Lite criteria met**: Steps 1-4 + 3 assets + UVP + 3 USPs

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/positioning/current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada claim de positioning** tiene evidence trail (value criteria → asset → proof)
- [ ] **0 claims sin proof** — todo respaldado
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check de fuentes)
- [ ] **Coherencia con brand files** (ecps.md, competitors.md, self-intel)
- [ ] **Copy no promete** lo que el producto no puede entregar (cruzar con self-intel Lens 3)
- [ ] **Mensajes bilingual** son nativos (no traducciones literales)

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
