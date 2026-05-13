# QA Report — AI Fatigue Research

**Documento evaluado:** brand/growth4u/content/drafts/idea-2026-05-11-4/research.md
**Fecha QA:** 2026-05-11
**QA Score:** 8/10

---

## Verificación de Claims

| # | Claim | Fuente citada | Verificación | Confianza |
|---|-------|---------------|--------------|-----------|
| 1 | Adopción IA consumidores 73% (vs 45% 2024) | Prophet 2026 | ✅ Dato del signal/briefing original | verified |
| 2 | Entusiasmo cayó 7% | Prophet 2026 | ✅ Dato del signal/briefing original | verified |
| 3 | 62% frustrados sin soporte humano | Prophet 2026 | ✅ Dato del signal/briefing original | verified |
| 4 | 71% preocupados por precisión | Prophet 2026 | ✅ Dato del signal/briefing original | verified |
| 5 | 30% menos cree IA manejará decisiones | Prophet 2026 | ✅ Dato del signal/briefing original | verified |
| 6 | 88% orgs usan IA en ≥1 función | McKinsey 2025 | ✅ Verificado en web (acceso directo) | verified |
| 7 | ~2/3 no han escalado IA | McKinsey 2025 | ✅ "Nearly two-thirds have not yet begun scaling" | verified |
| 8 | 39% reportan EBIT impact | McKinsey 2025 | ✅ "Just 39 percent report EBIT impact at enterprise level" | verified |
| 9 | 62% experimentando con agentes IA | McKinsey 2025 | ✅ Verificado en web | verified |
| 10 | <10% escalando agentes en función individual | McKinsey 2025 | ✅ "No more than 10 percent scaling AI agents" | verified |
| 11 | Acceso trabajadores +50% en 2025 | Deloitte 2026 | ✅ "Worker access to AI rose by 50% in 2025" | verified |
| 12 | 34% reimaginando procesos | Deloitte 2026 | ✅ "Just 34% are truly reimagining the business" | verified |
| 13 | 80% ejecutivos chatbots = diferenciación problems | Accenture 2025 | ✅ Verificado en web | verified |
| 14 | 28% trabajadores usan gen AI en trabajo | Salesforce | ✅ Verificado en web | verified |
| 15 | 52%+ sin aprobación formal | Salesforce | ✅ "Over half without formal approval" | verified |
| 16 | 64% presentan trabajo IA como propio | Salesforce | ✅ Verificado en web | verified |
| 17 | "Solo 6% integrada en operaciones reales" | Inferido | ⚠️ Dato inferido de combinar McKinsey scaling + EBIT data. NO es dato literal de ninguna fuente | inferred |

---

## Issues detectados

1. **Dato del 6% (inferred):** El claim "solo el 6% la tiene integrada en operaciones" es una inferencia del autor combinando datos de McKinsey. El documento lo marca correctamente como `[inferred]`, pero en el Resumen Ejecutivo se cita "88% dice que usa IA, solo el 6% la tiene integrada" sin marcar como inferencia. **Recomendación:** mantener el [inferred] visible o reescribir como "menos del 10%".

2. **Prophet como fuente primaria:** No se pudo acceder directamente al informe Prophet 2026 en web (404 en las URLs probadas). Los datos vienen del briefing/signal original que los cita. **Riesgo bajo** — es un signal recibido de fuente fiable, pero técnicamente es una fuente secundaria.

3. **Fuentes Salesforce:** El informe Salesforce/YouGov es de oct-2023. Los datos son de hace 2+ años. **Riesgo bajo para el argumento** — la tendencia probablemente ha empeorado (más shadow AI), pero conviene señalar la fecha.

4. **Web search API inoperativa (xAI 429).** No se pudieron realizar búsquedas automatizadas. Las fuentes se obtuvieron por acceso directo a URLs conocidas. Esto limitó la capacidad de cross-validar con fuentes adicionales y de buscar en español.

---

## Checklist de calidad

- [✅] Research question explícita
- [✅] Estructura entregable (Exec Summary / Contexto / Análisis / Implicaciones / Recomendaciones / Referencias)
- [✅] Confidence ratings inline
- [✅] Tabla comparativa
- [⚠️] 10 fuentes únicas: 5 fuentes primarias accedidas (McKinsey, Deloitte, Accenture, Salesforce, Prophet via signal). 10 citas pero varias del mismo informe. **5 fuentes únicas verificadas** + 1 citada indirectamente (Prophet).
- [⚠️] Búsquedas ES + EN: Solo EN (búsquedas no disponibles por limitación de API).
- [✅] Prosa analítica (no log de proceso)
- [✅] Executive summary autosuficiente
- [✅] Recommendations section

---

## Veredicto

**NEEDS REVISION (8/10)** — El documento es sólido analíticamente, con datos bien sourced de consultoras tier-1. Las principales limitaciones son: (1) el dato del 6% es inferido y debería marcarse más claramente, (2) el número de fuentes únicas (5-6) está por debajo del mínimo de 10 debido a la caída de la API de búsqueda, y (3) falta cobertura en español. Para el propósito de contenido social (LinkedIn/Twitter), la calidad del research es suficiente para producir un draft con ángulo sólido.
