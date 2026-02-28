# ICP & 100x Niche Discovery — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Step 1: Problem Scraping

- [ ] **50+ raw problem statements** recopilados
- [ ] **Fuentes primarias usadas** (Reddit, Quora, Twitter/X, review sites, foros)
- [ ] **Fuentes fallback activadas** si primarias insuficientes (LinkedIn, competitor reviews, conferencias)
- [ ] **Keywords de búsqueda** derivados de market/product/sector

## Step 2: JTBD Structuring

- [ ] **CADA problema estructurado** en formato JTBD (Problem, Why, Persona, Alternatives)
- [ ] **50+ problemas JTBD-formatted** listos para filtrar
- [ ] **Lenguaje real del usuario** preservado (no reescrito en jerga interna)

## Step 3: Triple Filter

### Filter 1: SWOT
- [ ] **Alineación con Strengths** evaluada por problema
- [ ] **Debilidades competidoras** cruzadas (Opportunities del SWOT)
- [ ] **Cada problema scored** (PASS/PARTIAL/FAIL)

### Filter 2: ICP
- [ ] **Persona match** evaluado por problema
- [ ] **Reachability** evaluada (¿podemos llegar a esta persona?)
- [ ] **Fit largo plazo** considerado (¿queremos este tipo de cliente?)

### Filter 3: Product
- [ ] **Capacidad de solución** evaluada (¿resolvemos esto HOY?)
- [ ] **Comparación vs alternativas** realizada
- [ ] **Core vs stretch** clasificado

- [ ] **15-25 problemas** pasan los 3 filtros

## Step 4: Clustering → ECPs

- [ ] **3-7 ECPs** identificados (< 3 = muy estrecho, > 7 = poco clustered)
- [ ] **Cada ECP tiene**: nombre descriptivo, core JTBD, persona snapshot, alternativas actuales, why we win, market size estimado
- [ ] **Clustering coherente** (misma persona + mismo problema + mismo contexto + mismos canales)

## Step 5: Scoring & Prioritización

- [ ] **Pain Score (1-10)** asignado por ECP con justificación
- [ ] **Reachability (1-10)** asignado por ECP con justificación
- [ ] **Market Size (1-10)** asignado por ECP con justificación
- [ ] **Ranking final** generado (priorizado por reachability como tiebreaker)
- [ ] **Recomendación** de 1-3 ECPs para empezar con justificación

## Customer Data Integration (si existe)

- [ ] **Datos de CRM/analytics** incorporados (o marcado "no existen")
- [ ] **Top segment por LTV** identificado
- [ ] **Churn patterns** documentados
- [ ] **Datos reales** usados para VALIDAR (no reemplazar) scraped data

## Output

- [ ] **Summary generado** (problemas analizados → estructurados → filtrados → ECPs)
- [ ] **Top 3 ECPs** con scores y justificación
- [ ] **Lite criteria met**: 50+ scraped + Triple Filter + 3-7 ECPs + prioritización

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/niche-discovery/current.md`
- [ ] **Versionado** correcto (v1.md, history.json)
- [ ] **Link generado** para el usuario

## META (calidad)

- [ ] **Cada problema tiene fuente** (URL del foro, review, post)
- [ ] **0 problemas inventados** — todos extraídos de fuentes reales
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check de fuentes)
- [ ] **Coherencia con brand files** (SWOT, product-analysis, company-context)
- [ ] **Scores justificados** (no arbitrarios — cada score tiene razón escrita)
- [ ] **Multi-market ECPs** identificados si empresa opera en múltiples países

---

## Flujo de uso

```
1. Agente ejecuta Steps 1-5
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — volver a investigar
4. Si hay ❌ → investigar más
5. Spot-check: verificar 5-10 URLs con web_fetch
6. Cruzar contra brand files (SWOT, competitors, product-analysis)
7. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
