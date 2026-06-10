# Hydration Map — self-intelligence

> Campos que ya existen en company-context. Leer antes de scrapear.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo esta skill | Tipo mapeo | Notas |
|-------------|---------------|-------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | Para búsqueda de perfiles |
| company-context | url_primary | digital_profiles[0] | exacto | URL base para scraping |
| company-context | urls_social | digital_profiles | exacto | Perfiles ya identificados — NO re-buscar |
| company-context | elevator_pitch | (contexto) | exacto | Para comparar con Autopercepción |
| company-context | product_description | (contexto) | exacto | Para analizar coherencia producto-mensaje |
| company-context | tone_keywords | tone_profile (seed) | interpretar | Punto de partida para análisis de tono |
| company-context | brand_values | (contexto) | exacto | Para evaluar coherencia valores-comunicación |
| company-context | industry_vertical | (contexto) | exacto | Para buscar reviews en plataformas correctas |
| company-context | current_channels | (contexto) | exacto | Saber dónde scrapear |

## Campos genuinamente nuevos (siempre ejecutar)

| Campo | Por qué no existe upstream | Acción |
|-------|--------------------------|--------|
| digital_profiles (completo) | company-context solo tiene los declarados, no los descubiertos | Discovery de TODOS los perfiles |
| company_research (deep) | Requiere deep research dedicado | skill `/deep-research` (Hamete) |
| Autopercepción (Lens 1) | Análisis propio de esta skill | Scraping + análisis web/social |
| Terceros (Lens 2) | Análisis propio de esta skill | Reviews, menciones, prensa |
| Consumidores (Lens 3) | Análisis propio de esta skill | Reviews, foros, social listening |
| Síntesis + Viability | Análisis propio de esta skill | Triangulación de las 3 lentes |

## Ejemplo de presentación hidratada

```
"De tu Company Context ya tengo:
  • Web principal: hospitalcapilar.com ✅
  • Perfiles sociales declarados: Instagram, LinkedIn, YouTube ✅
  • Industria: Salud capilar ✅
  • Elevator pitch: [extracto] ✅

Voy a usar esto como punto de partida. Además buscaré perfiles
no declarados (Trustpilot, Google Reviews, foros, etc.)

¿Hay algún perfil o plataforma que debería revisar especialmente?"
```

## Nota

Self-intelligence es un skill de ANÁLISIS — no pregunta mucho, scrappea y analiza. La hydration aquí es más sobre "no perder tiempo buscando lo que ya se sabe" que sobre "no re-preguntar". Los perfiles ya descubiertos en company-context se usan directamente.
