# SEO/GEO Partner.ai — Aprendizajes de Paymatico (Marzo 2026)

> Fuente: Philippe, trabajo de campo con Paymatico. 12 aprendizajes para mejorar Trust Engine.
> Guardado como referencia para v7 de la skill.

## Mapeo: Aprendizaje → Cambio en Skill

| # | Aprendizaje | Módulo afectado | Cambio requerido |
|---|---|---|---|
| 1 | Keywords por subnicho | init + keywords + serp | config.json necesita `subniches` por nicho |
| 2 | GEO prompts por subnicho | geo | Prompts = objetivo × subnicho × propuesta valor |
| 3 | Gap analysis modo densidad | gaps | Nuevo modo: densidad de menciones, no solo presencia/ausencia |
| 4 | Taxonomía compartida de dominios | gaps + recs + influencers | `_system/domain-taxonomy.json` compartido cross-client |
| 5 | URLs de artículos > dominios | serp + geo + influencers | Output siempre con URLs específicas, no solo dominios |
| 6 | Score compuesto GEO+SERP | gaps + recs | `(GEO_citas × peso) + (SERP_apariciones × peso) + (num_IAs × peso)` |
| 7 | Job recovery y timeouts | run-state + full | Timeout 15min, recovery al re-ejecutar |
| 8 | Subnichos como campo estructurado | init | Campo "subniches" en config con prioridad + keywords seed |
| 9 | Filtrado automático 3 pasos | influencers + recs | Raw → Filtrada → Accionable, con tipo de colaboración |
| 10 | Importar contexto del cliente | init | Leer notas de reuniones / docs internos si existen |
| 11 | Auto-generar keywords desde competidores | keywords | `{cliente} vs {comp}`, `alternativas a {comp}`, `{comp} opiniones` |
| 12 | Filtro mercado/idioma | init + serp + geo | Excluir dominios de otros mercados automáticamente |
