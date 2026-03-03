# Hydration Map — competitor-intelligence

> Leer upstream para no preguntar lo obvio y empezar a investigar directamente.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | Para comparar vs competitors |
| company-context | industry_vertical | (búsqueda) | exacto | Keywords para descubrir competitors |
| company-context | elevator_pitch | (comparación) | exacto | Benchmark messaging |
| company-context | differentiator_10x | (comparación) | exacto | Qué comparar |
| company-context | b2b_b2c | (filtro) | exacto | Competitors del mismo tipo |
| company-context | revenue_model | (comparación) | exacto | Modelo similar/diferente |
| company-context | pricing_tiers | (comparación) | exacto | Para pricing landscape |
| company-context | markets_served | (filtro) | exacto | Competitors en mismos mercados |
| company-context | current_channels | (comparación) | exacto | Para channel comparison |
| positioning (si existe) | primary_angle | (comparación) | exacto | Posicionamiento a comparar |

## Campos genuinamente nuevos (siempre investigar/preguntar)

| Campo | Por qué no existe upstream | Método |
|-------|--------------------------|--------|
| competitors (lista) | Descubrimiento propio | "¿Quiénes son vuestros principales competidores?" + research |
| Per-competitor profiles | No existe | Scraping + deep research |
| Autopercepción (Lens 1) | Análisis propio | Web/social scraping de cada competitor |
| Terceros (Lens 2) | Análisis propio | Reviews, prensa, menciones |
| Consumidores (Lens 3) | Análisis propio | Reviews, foros, social |
| Battle Cards | Síntesis propia | Triangulación de 3 lentes |
| Vulnerabilities | Análisis propio | Gap analysis |

## Ejemplo de presentación hidratada

```
"De tu Company Context sé que:
  • Industria: [X] ✅
  • Modelo: [B2B/B2C], [revenue_model] ✅
  • Mercados: [geography] ✅
  • Tu diferenciador: [differentiator_10x] ✅

Antes de investigar, necesito saber:
  1. ¿Quiénes consideráis vuestros principales competidores? (directos e indirectos)
  2. ¿Hay algún competidor emergente que os preocupe?

Con eso arranco el análisis completo (perfiles, 3 lentes, battle cards)."
```

## Nota

Competitor-intelligence pregunta poco — mayormente investiga. La hydration evita re-preguntar industria, mercado, modelo. La única pregunta genuinamente nueva es "¿quiénes son vuestros competidores?" que solo el cliente puede seed (luego el skill descubre más).
