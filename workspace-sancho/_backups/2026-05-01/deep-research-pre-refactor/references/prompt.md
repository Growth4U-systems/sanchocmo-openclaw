# Deep Research — Investigation Process

## Fase 1: Análisis del documento base (~1 min)

1. Lee el documento completo
2. Identifica cada sección y su contenido actual
3. Lista todos los datos/cifras que NO tienen fuente verificada
4. Identifica gaps de información (secciones superficiales o incompletas)

## Fase 2: Investigación profunda (~3-5 min)

Para CADA sección del documento:

1. **Buscar fuentes** — 3-5 `web_search` por sección, en español E inglés
2. **Verificar datos existentes** — Busca confirmación de cifras ya incluidas
3. **Ampliar con datos nuevos** — Datos más granulares (segmento, geografía, año)
4. **Leer fuentes completas** — `web_fetch` en fuentes más relevantes
5. **Validación cruzada** — Cada cifra importante: 2+ fuentes independientes

## Fase 3: Síntesis y escritura (~2 min)

1. Reescribe cada sección manteniendo estructura original
2. Añade datos nuevos descubiertos
3. Incluye `[Fuente](url)` inline para cada dato
4. Marca datos fuente única: `⚠️ Fuente única`
5. Añade sección `## Fuentes` al final con lista numerada completa

## Quality Bar

- **Mínimo 10 fuentes verificadas** por documento
- **Solo URLs visitadas** — NUNCA inventar URLs
- Cada fuente verificada con `web_search` o `web_fetch`
- Buscar en español E inglés
- Múltiples ángulos (general + específico)

## Versionado

1. Backup: `current.md` → `v{N+1}.md`
2. Marca: `<!-- deep-research: YYYY-MM-DD | fuentes: N | búsquedas: M -->`
3. Log: `brand/{slug}/intelligence/research-log.json`

```json
{
  "date": "YYYY-MM-DD",
  "document": "file.md",
  "original_version": "file.v1.md",
  "sources_found": 15,
  "searches_executed": 42,
  "gaps_remaining": ["dato X sin fuente cruzada"],
  "duration_seconds": 180
}
```
