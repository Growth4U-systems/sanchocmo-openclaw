# Deep Research — Concepts & Methodology

## Pattern

Skill rápido genera draft → usuario pide "profundizar" → deep-research amplía con datos verificados → output reemplaza original.

## Trigger Words
- "profundizar", "deep-research", "más detalle", "investigar más", "ampliar"

---

## Source Quality Rules

**Priority (high to low):**
1. Consultoras (Statista, IBISWorld, Grand View Research, McKinsey, Deloitte)
2. Prensa especializada (sector-specific)
3. Publicaciones oficiales (INE, Eurostat, Census Bureau, BLS)
4. SEC filings, earnings calls, investor presentations
5. Artículos académicos (Google Scholar)

**NOT accepted:** Blogs genéricos, artículos sin fecha, fuentes pre-2023, Wikipedia (except for links to primary sources)

---

## Citation Format

**Inline**: `dato relevante [1]` or `dato relevante [Fuente: Título](url)`

**Final section**:
```
## Fuentes
[1] Título completo — Organización (YYYY-MM). url
[2] ...
```

**Sin fuente**: `⚠️ Estimación sin fuente verificada: dato`
**Fuente única**: `⚠️ Fuente única [1]: dato`

---

## Preservation Rules

- **RESPETAR estructura exacta** del documento original
- Secciones se EXPANDEN, no se eliminan ni reordenan
- Template fields (TAM, SAM, tablas) se mantienen
- Output = **drop-in replacement** del original

---

## Comunicación Durante Ejecución

1. **Al iniciar**: "🔬 Lanzando deep-research sobre `{doc}`. 3-5 minutos..."
2. **Progreso**: "📊 Investigando sección: {nombre}... ({N} fuentes)"
3. **Al completar**: "✅ {N} fuentes verificadas, {M} secciones ampliadas."

---

## Edge Cases

- **Documento muy largo (>5000 palabras)**: Investigar sección por sección, priorizar sin fuente
- **Idioma mixto**: Buscar en ambos idiomas, presentar en idioma del documento
- **Sector nicho sin fuentes**: Documentar gap, buscar mercados proxy
- **Fuentes contradictorias**: Presentar rango, usar estimación conservadora
- **Ya fue profundizado**: Verificar marca `<!-- deep-research: ... -->`, ofrecer segunda pasada enfocada en gaps
