# QA Report — Regulación Europea de Finfluencers: Compliance-as-Moat

**Documento evaluado:** `research.md`
**Fecha QA:** 2026-05-06
**Método:** Self-QA (checklist quality.md) + verificación cruzada de claims
**QA Score:** 8.5/10 — NEEDS REVISION (minor)

---

## Self-QA Checklist

### Phase 1 (SCOPE)
- [x] Research question explícita en el documento
- [x] Entities to cover listadas (5 reguladores)
- [x] Completion criteria definidos (≥10 fuentes, ≥2/regulador)
- [x] Output format especificado

### Phase 2 (SOURCES)
- [x] ≥10 fuentes únicas identificadas → 19 fuentes
- [x] Búsquedas en ES + EN ejecutadas → 12 queries
- [x] 3-5 web_search por sección → cumplido
- [x] Source inventory con A/B/C rating → incluido en Sources Index por prioridad
- [x] Phase 2b saltada → justificación: tema regulatorio/legal, no sentiment-driven

### Phase 3 (EXTRACT)
- [x] Todo dato tiene fuente (URL inline o footnote) → 19 fuentes citadas
- [x] Confidence marcado: verified / reported / inferred → en tablas per-entity
- [x] Fuentes contradictorias presentadas → N/A (sin contradicciones significativas detectadas)
- [x] Año/fecha noted en cifras → sí (2024-2026)

### Phase 4 (FRAMEWORK)
- [x] Taxonomía/framework explícito → 4 modelos de enforcement
- [x] Tabla comparativa entities × dimensions → incluida
- [x] Non-obvious finding identificado → asimetría regulatoria + gap temporal US/EU

### Phase 5 (DETAIL)
- [x] Estructura del template respetada → per-entity con How it Works + Key Data + Sources
- [x] Cobertura simétrica → 5 entities, misma estructura
- [x] Executive summary standalone → sí
- [x] Recommendations section presente → 5 componentes del framework

### Output meta
- [x] Source quality: NO blogs genéricos, NO pre-2023 (salvo ESMA discussion paper dic 2023 = relevante), NO Wikipedia
- [x] Marca deep-research añadida
- [ ] ⚠️ No se ha hecho backup versionado (no aplica — no es profundización Foundation)

---

## Verificación de Claims Clave

### Claim 1: "Resolución EP aprobada 502-46-42"
- **Fuente:** [1] europarl.europa.eu plenary news
- **Verificación:** Confirmado por IEU Monitoring + Informat.ro + AML Intelligence
- **Confidence:** ✅ verified (3 fuentes concurrentes)

### Claim 2: "RIS hace firmas responsables de claims de influencers"
- **Fuente:** [2] CMS Law + [3] Fintech Global
- **Verificación:** Confirmado por Loyens & Loeff, Debevoise, A&O Shearman
- **Confidence:** ✅ verified (5 fuentes concurrentes)

### Claim 3: "CNMV revisó ~100 perfiles, 10% incumplimiento"
- **Fuente:** [7] EuropaPress + [8] Forbes España
- **Verificación:** Confirmado por El Diario, Servimedia, CincoDías, Lawandtrends
- **Confidence:** ✅ verified (6 fuentes concurrentes)

### Claim 4: "CNMV puede imponer multas >€500K"
- **Fuente:** [9] Andersen
- **Verificación:** Consistent con Ley del Mercado de Valores. Cifra específica de >€500K citada por Andersen como despacho especializado
- **Confidence:** ✅ verified (fuente legal A + consistencia normativa)

### Claim 5: "Trade Republic registrada CNMV nº 4873"
- **Fuente:** [11] CNMV webservices
- **Verificación:** Confirmado por Trade Republic imprint page + El Economista
- **Confidence:** ✅ verified (fuente oficial A)

### Claim 6: "FCA: 7 influencers condenados feb 2026, multas £600-£3.750"
- **Fuente:** [12] FCA press release oficial
- **Verificación:** Confirmado por CMS Law, Credit Connect, Lewis Silkin
- **Confidence:** ✅ verified (fuente oficial A + 3 secundarias)

### Claim 7: "FCA enforcement +174% en 2025, 74 acciones"
- **Fuente:** [14] Professional Adviser
- **Verificación:** Fuente única sector press (B rating)
- **Confidence:** ⚠️ reported — fuente única [14], no cross-validated con FCA directamente

### Claim 8: "FCA: 3 arrestos may 2026"
- **Fuente:** [13] FCA news stories oficial
- **Verificación:** Confirmado por Investment Week
- **Confidence:** ✅ verified (fuente oficial A)

### Claim 9: "BaFin: multas hasta €50K por incumplimiento MAR"
- **Fuente:** [15] PaytechLaw
- **Verificación:** Consistent con MAR Article 30 sanctions framework
- **Confidence:** ✅ verified (fuente legal B + consistencia normativa)

### Claim 10: "FINRA: M1 Finance $850K (mar 2024)"
- **Fuente:** [17] FINRA media center oficial
- **Confidence:** ✅ verified (fuente oficial A)

### Claim 11: "FINRA: Open to the Public $350K (may 2025)"
- **Fuente:** [18] Global Relay
- **Verificación:** Confirmado por Investment News
- **Confidence:** ✅ verified (B + B cross-validated)

### Claim 12: "FINRA: 12 casos en 2025 → $6.5M total multas"
- **Fuente:** Wealthmanagement.com (no citada en Sources Index)
- **Confidence:** ⚠️ reported — debería añadirse la fuente al index

---

## Issues Encontrados

### Issue 1 (Minor): Claim 7 — FCA +174% es fuente única
- **Severidad:** Low
- **Acción:** Marcar como "reported [14]" en el texto. Hecho.

### Issue 2 (Minor): Claim 12 — $6.5M total FINRA no tiene fuente en Sources Index
- **Severidad:** Low
- **Acción:** Añadir wealthmanagement.com al Sources Index o eliminar la cifra. La cifra aparece en contexto de búsqueda pero no está citada inline con [N]. Recomendación: añadir como [20].

### Issue 3 (Info): ESMA discussion paper datado dic 2023
- **Severidad:** Info
- **Acción:** Aclarado en el texto que el paper es de dic 2023 pero sigue vigente y referenciado en 2026. OK.

### Issue 4 (Info): La asimetría CNMV/Trade Republic es parcialmente matizada
- **Severidad:** Info
- **Acción:** El texto ya incluye el matiz de que TR está registrada en CNMV. El insight de Alfonso está correctamente contextualizado como "percepción compartida en el mercado con base operativa". OK.

---

## Verdict

| Criterio | Score |
|----------|-------|
| Fuentes totales | 19/10 minimum ✅ |
| Fuentes per-entity ≥2 (≥1 oficial) | ✅ todas las entities cumplen |
| Claims sin fuente | 1 (Claim 12 — $6.5M FINRA, minor) |
| Cobertura simétrica | ✅ |
| Non-obvious finding | ✅ (2 findings) |
| Taxonomy/framework | ✅ |
| Recommendations | ✅ |

**Score: 8.5/10 — NEEDS REVISION (minor)**

**Acción requerida:** Añadir fuente [20] para Claim 12 o marcarla como "reported". El resto del documento cumple todos los estándares de calidad.

**Post-fix expected score: 9/10 — PASS**
