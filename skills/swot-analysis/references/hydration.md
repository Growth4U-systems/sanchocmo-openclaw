# Hydration Map — swot-analysis

> SWOT es PURA SÍNTESIS. Si upstream está completo, NO hay preguntas. Solo validación.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo SWOT | Tipo mapeo | Notas |
|-------------|---------------|-------------|------------|-------|
| self-intelligence | strengths (evidenced) | strengths[] | exacto | S del SWOT |
| self-intelligence | weaknesses (evidenced) | weaknesses[] | exacto | W del SWOT |
| self-intelligence | core_message | (contexto) | exacto | Para evaluar coherencia |
| self-intelligence | channel_consistency | weaknesses[] (si gaps) | interpretar | Gaps → debilidad |
| self-intelligence | viability_score | (contexto) | exacto | Si <3, S/W muy desbalanceado |
| competitors | vulnerabilities | opportunities[] | interpretar | Vulnerabilidad competitor = oportunidad |
| competitors | battle_cards | (contexto) | exacto | Para cruzar S vs competitor W |
| competitors | dominant_strategies | threats[] (si nos superan) | interpretar | Estrategias competitor = amenaza |
| market | tam + growth | opportunities[] | interpretar | Mercado creciente = oportunidad |
| market | threats | threats[] | exacto | Amenazas de mercado |
| market | regulatory | threats[] o opportunities[] | interpretar | Regulación puede ser ambas |
| market | trends | opportunities[] | interpretar | Tendencias alineadas = oportunidad |
| market | maturity | (contexto) | exacto | Mercado maduro vs emergente cambia SWOT |

## Campos genuinamente nuevos (solo si upstream incompleto)

| Campo | Cuándo preguntar | Pregunta sugerida |
|-------|-----------------|-------------------|
| strengths (extras) | Si self-intel tiene <3 fortalezas | "¿Hay fortalezas que no aparecen en tu análisis digital?" |
| weaknesses (extras) | Si self-intel tiene <3 debilidades | "¿Hay debilidades internas que no son visibles online?" |
| user_validated | SIEMPRE | "¿Confirmas este SWOT? ¿Añadirías/quitarías algo?" |

## Ejemplo de presentación hidratada

```
"He sintetizado tu SWOT cruzando self-intelligence, competitors y market:

💪 Fortalezas (de self-intelligence):
  • S1: [fortaleza] — evidencia: [fuente]
  • S2: ...

⚠️ Debilidades (de self-intelligence):
  • W1: [debilidad] — evidencia: [fuente]
  • W2: ...

🎯 Oportunidades (de market + competitor vulnerabilities):
  • O1: [oportunidad] — fuente: [market trend / competitor gap]
  • O2: ...

🔴 Amenazas (de market threats + competitor strengths):
  • T1: [amenaza] — fuente: [market / competitor]
  • T2: ...

¿Confirmas? ¿Hay algo interno que no sea visible online que debería incluir?"
```

## Nota

Si los 3 upstream (self-intelligence, competitors, market) están en status "approved", SWOT debería poder generarse con 0 preguntas. Solo se valida con el usuario al final. Si algún upstream falta → degradación: generar con lo que hay y flaggear gaps.
