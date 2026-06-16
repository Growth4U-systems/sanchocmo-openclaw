# Presentation Summary Protocol

> Estándar de sistema para que cualquier documento de cliente pueda convertirse en presentación con frontend-slides.

## Cuándo añadir

Todo documento `{carpeta}-current.md` que sea **presentable al cliente** debe incluir una sección `## Presentation Summary` al final. Aplica a:

- `strategic-plan/strategic-plan-current.md`
- `go-to-market/positioning/*/*-current.md`
- `market-and-us/competitors/competitors-current.md`
- `market-and-us/market/market-current.md`
- `market-and-us/swot/swot-current.md`
- `go-to-market/pricing/pricing-current.md`
- Cualquier otro documento que el usuario pueda querer presentar

Documentos internos/operacionales (stack.md, registry.json) NO llevan Presentation Summary.

## Formato

```markdown
## Presentation Summary
<!-- Generado para frontend-slides. Estilo: Electric Studio + visual identity del cliente. -->

### slide:title
company: [nombre]
title: [título del documento]
subtitle: [una línea de contexto]

### slide:[nombre-seccion]
headline: [título de la slide — max 8 palabras]
highlights:
  - [bullet 1] — [source: "[doc](ruta-relativa)"]
  - [bullet 2] — [source: "[doc](ruta-relativa)"]
  - [bullet 3]
<!-- Max 6 bullets por slide. Si hay más → dividir en slides -->

### slide:[nombre-seccion]
headline: [título]
metric:
  name: [qué medimos]
  baseline: [valor actual]
  target: [valor objetivo]
  source: "[doc](ruta-relativa)"

### slide:next
headline: [CTA o siguiente paso]
cta: [acción que pedimos al usuario]
```

## Reglas

1. **Max 6 bullets por slide** — si hay más, dividir en múltiples `### slide:` blocks
2. **Cada dato con source** — link relativo al documento origen. Formato: `source: "[nombre](ruta)"`
3. **Headlines cortos** — max 8 palabras, lenguaje directo
4. **Arco narrativo** — las slides deben contar una historia de principio a fin
5. **Sin info interna** — no incluir verificaciones de capacidad, logs de proceso, metadata de skills
6. **Adaptado al cliente** — el lenguaje del Presentation Summary debe ser el del cliente, no jerga interna de SanchoCMO

## Arco narrativo estándar

Los documentos varían pero el arco general es:

```
1. Contexto   → "Esto es quién eres / de qué va esto"
2. Situación  → "Aquí estás hoy"
3. Problema   → "Esto es lo que te frena / la oportunidad"
4. Solución   → "Esto es lo que proponemos"
5. Plan       → "Así lo vamos a hacer"
6. Métricas   → "Así sabremos si funciona"
7. Siguiente  → "¿Aprobamos?"
```

No todos los documentos tienen los 7 bloques. Adaptar al contenido.

## Generación de presentación

Cuando el usuario pide presentación de un documento:

1. Leer el `## Presentation Summary` del documento
2. Leer visual identity del cliente (`brand-identity/visual-identity/visual-identity-current.md`) si existe → extraer colores
3. Usar estilo base Electric Studio + colores del cliente
4. Ejecutar frontend-slides con las slides definidas
5. Incluir links "Ver detalle →" en cada slide que tenga `source`
6. Guardar HTML en `brand/{slug}/presentations/{nombre}.html`
7. Servir via MC: `{MC_BASE_URL}/portal/{mcToken}/docs/presentations/{nombre}.html`
