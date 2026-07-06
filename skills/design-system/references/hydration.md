# Hydration Map — visual-identity

> Visual identity hereda la personalidad verbal y la convierte en visual.

## Fuentes upstream

| Doc upstream | Campo upstream | → Uso en esta skill | Tipo mapeo | Notas |
|-------------|---------------|---------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | |
| company-context | url_primary | Visual analysis source | exacto | Analizar identidad visual actual |
| company-context | urls_social | Visual analysis sources | exacto | Coherencia visual cross-channel |
| company-context | brand_values | Visual mood direction | interpretar | Valores → personalidad visual |
| company-context | industry_vertical | Reference context | exacto | Benchmarks visuales del sector |
| company-context | b2b_b2c | Visual style direction | interpretar | B2B=limpio/corporativo, B2C=expresivo |
| voice-profile | three_adjectives | Visual personality | interpretar | Verbal adjectives → visual adjectives |
| voice-profile | tone_spectrum | Visual tone | interpretar | Tono verbal → tono visual |
| voice-profile | words_to_use | Visual vocabulary | interpretar | Palabras → motifs/elementos |
| voice-profile | do_this_not_that | Visual do/don't | interpretar | Verbal rules → visual rules |
| positioning | primary_angle | Visual story | interpretar | Ángulo de marca → narrativa visual |
| positioning | USPs | Visual emphasis | interpretar | Qué destacar visualmente |
| assets (si existe) | brand_assets | Existing visual assets | exacto | Logo, colores, tipografías existentes |

## Campos genuinamente nuevos (siempre generar/preguntar)

| Campo | Modo Quick | Modo Full |
|-------|-----------|-----------|
| Current visual audit | Análisis de URL | Análisis cross-channel profundo |
| Style discovery (Step 0) | 5 preguntas o URL analysis | Brian Castle workflow completo |
| Visual World | N/A | Moodboard + referentes |
| Idea Mapping | N/A | Visual concepts → design system |
| Aesthetic | N/A | Colors, typography, grid, imagery |
| Child skills | N/A | ui-system, visual-generator, deck-creator |

## Ejemplo de presentación hidratada

```
"De upstream ya tengo:

  🎤 Voice: [three_adjectives] — esto guía el tono visual ✅
  🎯 Positioning: [primary_angle] — esto guía la narrativa visual ✅
  🌐 URLs para analizar: [url_primary + socials] ✅
  🏭 Sector: [industry] — para benchmarks visuales ✅

**Quick mode**: Analizo tu web + voice → Visual Snapshot
**Full mode**: Brian Castle workflow → Visual World + Design System + Child Skills

¿Quick o Full?"
```
