# Company Context — Conceptos y Metodología

> Definiciones, criterios y edge cases. El agente consulta esto cuando necesita clarificar.

---

## Lite vs Deep Criteria

**Lite done** (mínimo para que downstream arranque):
- Core Three respondidas (what/want/believe)
- URL analizada (si existe)
- Business model clasificado (B2B/B2C/hybrid + revenue model)
- Al menos 1 goal cuantificado o direccional

**Deep done** (comprensivo):
- Todo Lite cumplido
- Business model completamente clasificado con revenue streams
- Goals cuantificados con números (no solo "grow")
- Visión documentada (3-5 años)
- Brand values/pillars articulados
- Canales de adquisición actuales mapeados con volumen aproximado
- Constraints y non-negotiables documentados

---

## Edge Cases

### Pre-launch (sin URL, sin clientes)
- Saltar URL inference
- Foco en Core Three + Business Model + Vision
- Marcar cobertura como "pre-launch" — downstream pillars se adaptan

### Pivot o rebrand
- Capturar AMBOS contextos (old y new)
- Flag: "La empresa está en transición de [old] a [new]. Usar [new] para estrategia."
- Contexto old útil para competitor-intel y market-intel

### Múltiples productos/servicios
- Crear un Context Profile por producto si son distintos (diferente ICP, diferente pricing)
- Crear uno unificado si comparten audiencia
- Preguntar: "¿Quieres que trabaje la estrategia para [A], [B], o el negocio completo?"

### Cliente con docs existentes
- Extraer y mapear al schema
- NO descartar — referenciar como "previous strategy" para tracking de evolución
- Preguntar: "¿Quieres que parta de esta base o empezamos de cero?"

---

## Re-Entry Behavior

Al volver a actualizar company-context (ej. tras 3 meses de ejecución):

1. Cargar perfil existente
2. Destacar lo que podría haber cambiado: "Han pasado X semanas. ¿Ha cambiado algo en [goals/product/team]?"
3. Foco en campos que más evolucionan: goals, channels, volume, team
4. Actualizar perfil y propagar cambios a downstream pillars que consumieron campos cambiados

---

## Coverage Calculation

```
coverage = filled_required_fields / total_required_fields * 100

Lite threshold: all REQUIRED + all Lite fields filled
Deep threshold: all REQUIRED + all Lite + all Deep fields filled
```

Fields "optional" no cuentan para cobertura — se capturan si están disponibles pero no bloquean progresión.

---

## Context Tiering

- **Tier 1 (siempre cargado)**: elevator_pitch, b2b_b2c, revenue_model, goal_3_6_months, differentiator_10x, industry_vertical (~100 palabras en system prompt)
- **Tier 2 (cargado cuando relevante)**: Full profile (todas las secciones)
- **Tier 3 (raw)**: Source URLs, timestamps de extracción, validation log
