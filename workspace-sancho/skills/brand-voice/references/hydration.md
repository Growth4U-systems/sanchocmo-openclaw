# Hydration Map — brand-voice

> Brand voice se construye SOBRE el positioning. Hereda identidad + posicionamiento.

## Fuentes upstream

| Doc upstream | Campo upstream | → Campo esta skill | Tipo mapeo | Notas |
|-------------|---------------|-------------------|------------|-------|
| company-context | company_name | (contexto) | exacto | |
| company-context | elevator_pitch | (contexto) | exacto | Para generar ejemplos coherentes |
| company-context | brand_values | voice guardrails | exacto | Valores → restricciones de tono |
| company-context | tone_keywords | three_adjectives (seed) | exacto | Si ya existen, validar |
| company-context | non_negotiables | words_to_avoid (seed) | interpretar | Lo que no quieren → lo que no dicen |
| company-context | b2b_b2c | tone direction | interpretar | B2B=más formal, B2C=más cercano |
| company-context | content_themes | examples_by_type (contexto) | exacto | Temas para generar ejemplos reales |
| company-context | urls_social | source_materials | exacto | URLs para analizar voz actual |
| positioning | primary_angle | messaging DNA | exacto | El ángulo define qué se comunica |
| positioning | USPs | key messages | exacto | Lo que la voz necesita transmitir |
| positioning | messaging_playbook | tone + hooks | exacto | Hooks + estilo ya definidos |
| positioning | per_ecp_messaging | per-ECP voice shifts | exacto | Cómo adaptar voz por audiencia |
| voice-profile (si existe) | three_adjectives | three_adjectives | exacto | Versión anterior a actualizar |
| voice-profile | tone_spectrum | tone_spectrum | exacto | Validar o refinar |
| voice-profile | words_to_use/avoid | words_to_use/avoid | exacto | Base existente |

## Campos genuinamente nuevos (siempre generar/preguntar)

| Campo | Modo Quick | Modo Full |
|-------|-----------|-----------|
| three_adjectives | Inferir de URL o preguntar Q1 | Extraer de análisis profundo |
| tone_spectrum | Inferir de URL o preguntar Q2-Q3 | 5+ dimensiones con scoring |
| signature_patterns | Generar de análisis | Análisis cross-channel profundo |
| do_this_not_that | Generar | Generar + per-ECP variations |
| examples_by_type | Generar 3 (social, email, LP) | Generar per-channel + per-ECP |
| AI Brand Kit | N/A (Quick no lo genera) | Documento completo |
| Voice Test (5 checks) | N/A | Generar y validar |

## Ejemplo de presentación hidratada

```
"De upstream ya tengo:

  🏢 Identidad: [elevator_pitch] ✅
  🎯 Positioning: [primary_angle] ✅
  💬 Keywords de tono (company-context): [tone_keywords] ⚠️ validar
  🚫 Non-negotiables: [non_negotiables] ✅
  📱 URLs para analizar: [urls_social] ✅

**Quick mode**: Analizo tus URLs + positioning → te presento Voice Snapshot
**Full mode**: Profundizo con per-ECP adaptations + AI Brand Kit

¿Quick o Full? (Quick se hace en ~30min, Full en ~2-3h)"
```
