# QA Document Checklist — Rocinante

> Checklist para validar cualquier documento generado por skills de Sancho/Escudero antes de entregarlo al cliente.

---

## Checks obligatorios

### 1. Citación y fuentes
- [ ] Toda cifra/dato cuantitativo tiene `[Fuente](url)` inline
- [ ] URLs son reales (verificar 5-10 con `web_fetch` — deben devolver 200 y contenido relevante)
- [ ] No hay URLs inventadas o rotas
- [ ] Sección `## Fuentes` existe al final con lista numerada
- [ ] Datos sin fuente están marcados como `⚠️ Estimación sin fuente verificada`
- [ ] Fuentes son recientes (post-2023) y de calidad (consultoras, prensa especializada, oficiales)

### 2. Completitud
- [ ] Todas las secciones del template están rellenas (no hay secciones vacías o con placeholder)
- [ ] El documento responde a lo que el skill promete generar
- [ ] No hay "TODO", "pendiente", "por completar" en el texto

### 3. Coherencia
- [ ] Datos no se contradicen entre secciones
- [ ] Si el doc referencia otros pilares de Foundation, los datos coinciden (cruzar con `brand/{slug}/`)
- [ ] Cifras de mercado son plausibles para el sector/geografía

### 4. Brand alignment
- [ ] Tono y lenguaje coherentes con `brand/{slug}/voice-profile.md` (si existe)
- [ ] Posicionamiento alineado con `brand/{slug}/positioning.md` (si existe)
- [ ] No hay contradicciones con documentos de marca existentes

### 5. Formato
- [ ] Markdown bien formado (headers, tablas, listas)
- [ ] Links funcionan (`[texto](url)` correcto)
- [ ] No hay HTML roto o caracteres escapados mal

### 6. Aislamiento de contexto
- [ ] No contiene info interna del sistema (tareas, agentes, skills, config)
- [ ] No menciona otros clientes
- [ ] No tiene instrucciones técnicas visibles para el usuario

---

## Scoring

| Score | Significado | Acción |
|-------|------------|--------|
| **APROBADO** | Todos los checks pasan | Entregar al cliente |
| **APROBADO CON OBSERVACIONES** | Checks menores fallan (formato, sugerencias) | Entregar + nota de mejora |
| **RECHAZADO** | Checks críticos fallan (URLs rotas, datos falsos, sin fuentes, contradicciones) | Devolver a Sancho para corrección |

---

## QA Log — Archivo persistente por pilar

Cada pilar tiene un `qa-log.md` en su carpeta (ej: `brand/{slug}/market/qa-log.md`).

### Antes de validar:
1. Lee `qa-log.md` si existe — revisa qué URLs ya verificaste, qué issues se encontraron antes, qué ya pasó QA
2. No re-verifiques URLs que ya validaste en la misma versión del documento
3. Enfócate en lo nuevo o lo que cambió desde el último QA

### Después de validar:
1. Añade una nueva entrada al final de `qa-log.md` (no sobreescribas las anteriores)
2. Formato de cada entrada: ver abajo

### Formato de qa-log.md

```markdown
# QA Log — {pilar}

## QA #1 — 2026-02-27 08:15 — v1
- **Resultado**: APROBADO CON OBSERVACIONES (7/10)
- **URLs verificadas**: 8/12 — 2 rotas (Grand View Research 404, Statista paywall)
- **Citación**: 10 datos con fuente, 3 sin fuente (marcados ⚠️)
- **Completitud**: ✅ Todas las secciones rellenas
- **Coherencia**: ⚠️ TAM en sección 1 dice €4.2B, en sección 3 dice €3.8B
- **Brand**: ⏭️ Sin voice-profile aún
- **Issues**:
  1. [crítico] URL rota: grandviewresearch.com/hair-transplant → 404
  2. [menor] Inconsistencia TAM entre secciones
- **URLs ya validadas**: [lista de URLs que funcionan — no re-verificar en próximo QA]

## QA #2 — 2026-02-27 09:30 — v2
- **Resultado**: APROBADO (9/10)
- **Cambios desde QA #1**: URLs rotas corregidas, TAM unificado
- **URLs nuevas verificadas**: 3 (las que se añadieron en v2)
- **Issues resueltos**: #1 (URL corregida), #2 (TAM unificado)
- **Issues pendientes**: ninguno
```

### Beneficios
- Rocinante no repite trabajo (URLs ya verificadas se saltan)
- Historial completo de calidad del documento
- El usuario puede ver cómo ha mejorado el doc con cada iteración
- Si un issue se repite, Rocinante lo detecta y lo escala

## Formato de respuesta a Sancho

```
QA RESULT — [APROBADO / APROBADO CON OBSERVACIONES / RECHAZADO]

**Documento**: {ruta}
**QA #**: {número de entrada en qa-log.md}
**Citación**: ✅/❌ {N} fuentes verificadas, {M} URLs comprobadas, {K} rotas
**Completitud**: ✅/❌
**Coherencia**: ✅/❌
**Brand**: ✅/❌ o ⏭️ (sin brand docs aún)
**Formato**: ✅/❌
**Aislamiento**: ✅/❌

**Issues** (si hay):
1. [crítico/menor] Descripción — cómo arreglar

**Score**: X/10
**Log actualizado**: qa-log.md
```
