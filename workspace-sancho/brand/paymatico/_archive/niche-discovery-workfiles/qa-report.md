# QA Report: ECPs (Exact Customer Profiles) — Paymático

**Mode**: Deep QA  
**Target**: `brand/paymatico/go-to-market/niche-discovery/current.md`  
**Fecha**: 2026-03-04

---

## Veredicto: NEEDS REVISION
**Confidence Score**: 7/10

Documento sólido en estructura, profundidad de análisis y evidencia cualitativa. Sin embargo, contiene **2 errores matemáticos en cálculo de SAM** que requieren corrección inmediata, **1 inconsistencia interna** entre resumen y detalle, y **1 dato de mercado que necesita actualización**. El análisis cualitativo (dolor, alternativas, canales, voces) es fuerte y bien evidenciado.

---

## ✅ Verified (12 claims)

1. **AEF 2024**: 1.384 cadenas, 78.255 establecimientos, 27.623M EUR facturación — ✅ Confirmado ([AEF Informe 2024](https://www.aefranquicia.es/wp-content/uploads/2024/07/Informe-AEF-La-Franquicia-en-Espana-2024.pdf))
2. **INE EEPG 2023**: 60.976 empresas en grupos, 67% cifra negocios, 43,5% empleo — ✅ Confirmado ([INE EEPG](https://www.ine.es/dyngs/Prensa/EEPG2023.htm))
3. **EAFIs CNMV**: 154 entidades (96 EAFs + 58 EAFNs) a inicios 2026 — ✅ Confirmado ([CNMV Boletín I-2025](https://www.cnmv.es/DocPortal/Publicaciones/Boletin/Boletin_I_2025_ES_vf.pdf))
4. **Notarios España**: 2.800+ — ✅ Confirmado ([Consejo General Notariado, nov 2025](https://www.notariado.org/portal/consejo-general-del-notariado))
5. **Mollie España**: Lanzamiento 20 noviembre 2025 — ✅ Confirmado ([Mollie News](https://www.mollie.com/es/news/mollie-lanza-espana))
6. **Conciliación bancaria manual = 30% tiempo contable** — ✅ Confirmado ([Botkers](https://www.botkers.com/blog/automatizacion-de-conciliacion-bancaria))
7. **Regalías franquicia 4-12% ventas brutas** — ✅ Confirmado ([Midas Franchise](https://franquiciamidas.es/actualidad/royalties-que-son-y-como-se-calculan/))
8. **50% franquiciados reportan falta comunicación** — ✅ Referenciado en múltiples fuentes trade press
9. **EAFIs no pueden custodiar fondos** — ✅ Confirmado por CNMV ficha oficial
10. **Mollie delayed routing ≤90 días** — ✅ Confirmado ([Mollie docs](https://docs.mollie.com/docs/connect-marketplaces-split-payments-with-delayed-routing))
11. **DORA obliga ciberseguridad para entidades financieras** — ✅ Confirmado ([FinReg360](https://finreg360.com/el-2023-traera-nuevos-cambios-normativos-para-asesores-y-gestores/))
12. **Crecimiento franquicias**: +0,6% cadenas, +1,3% establecimientos, +2,5% facturación — ✅ Confirmado AEF 2024

---

## ❌ Errors (2 encontrados)

### Error 1: SAM ECP-1 Franquicias — Error Matemático
- **Error**: Documento dice "SAM: 400 cadenas × €1.000/mes × 12 = **384M EUR/año**"
- **Corrección**: 400 × €1.000 × 12 = **€4,8M/año**, NO €384M. El valor de €384M procede del Market Analysis (80.000 establecimientos × €400/mes × 12) y es un TAM a nivel de establecimiento, no SAM a nivel de cadena.
- **Fuente**: Cálculo aritmético
- **Fix sugerido**: O bien (a) corregir la fórmula a "80.000 establecimientos × €400/mes × 12 = 384M EUR/año TAM" y calcular SAM como subconjunto, o bien (b) usar el cálculo correcto por cadena: "400 cadenas × €1.000/mes × 12 = **€4,8M/año SAM**" (que es más realista como mercado capturable en los primeros años). **El primer año realista de €180K-300K ARR es más coherente con el SAM de €4,8M (3-6% penetración) que con €384M (0,05% penetración).**

### Error 2: SAM ECP-2 Corporates — Inconsistencia Resumen vs Detalle
- **Error**: Resumen dice "SAM: 240M EUR/año" pero el detalle calcula "20.000 × €1.500/mes × 12 = **360M EUR/año**"
- **Corrección**: Las cifras no cuadran. O el SAM es 240M (como aparece en Market Analysis y SWOT) o es 360M (como calcula el detalle).
- **Fuente**: Inconsistencia interna del documento
- **Fix sugerido**: El cálculo detallado (20.000 × €1.500 × 12 = 360M) es correcto aritméticamente. El "240M" del Market Analysis usaba diferentes assumptions (120.000 empresas × €2.000/mes ARPU × segmentación diferente). **Elegir uno y hacerlo consistente en todo el documento.** Recomiendo el 360M del cálculo bottom-up del ECP (más riguroso) o el más conservador ~240M del Market Analysis si se reduce el target a ~13.000 empresas.

---

## ⚠️ Discrepancies (2 encontradas)

### Discrepancy 1: SGIICs — Número Potencialmente Desactualizado
- **Claim**: 119 SGIICs registradas
- **Realidad**: Registros CNMV muestran números de registro hasta 297 para SGIICs a octubre 2025. El número de SGIICs **activas** puede ser ~120-130 (tras bajas y fusiones), pero el dato "119" puede ser de una fecha específica (feb 2025).
- **Impacto**: Bajo — no cambia significativamente el TAM del ECP-3
- **Fix sugerido**: Cambiar a "~120-130 SGIICs activas (CNMV, datos variables según altas/bajas)" o citar la fecha exacta del dato.

### Discrepancy 2: "Target accesible" de franquicias — 400-500 cadenas con 10+ establecimientos
- **Claim**: 400-500 cadenas con 10+ establecimientos
- **Realidad**: El informe AEF no desglosa por número de establecimientos. De 1.384 cadenas totales, 1.144 son nacionales. La estimación "400-500 con 10+" es razonable pero no verificable directamente con datos públicos.
- **Impacto**: Medio — afecta al sizing del target
- **Fix sugerido**: Marcar como estimación: "~400-500 cadenas con 10+ establecimientos (estimación — AEF no publica desglose por tamaño de red)". Considerar solicitar dato a AEF directamente.

---

## 🔍 Unverifiable (3 claims)

1. **Cash pooling bancario: 6-12 meses setup, €10K-50K** — Dato plausible pero no verificable públicamente. Basado en conocimiento de mercado, no fuente publicada.
2. **Dolor cuantificado: €130K-450K/año por cadena de franquicia** — Estimación compuesta, cada componente tiene diferentes niveles de confianza. No hay benchmark público para "coste total de gestión fragmentada de pagos en franquicias."
3. **0 soluciones de escrow digital regulado en España** — Claim de competitive intelligence. Verificado contra competidores conocidos pero puede existir player no identificado en nicho legal/notarial.

---

## 📋 Missing Elements

1. **Customer validation quotes reales** — Las "voces del mercado" citadas son de fuentes secundarias (trade press, abogados). Faltan testimonios directos de potenciales clientes de cada ECP. Recomendación: entrevistas con 2-3 prospects por ECP.

2. **Competitive response analysis** — ¿Qué pasa si Mollie lanza cuentas programables en 12 meses? ¿Qué pasa si MONEI ataca franquicias? Falta sección "What if" por ECP.

3. **Win/loss criteria por ECP** — ¿Qué definimos como "ganamos este ECP"? ¿# de clientes? ¿ARR? ¿Market share? Sin KPIs de éxito, no podemos medir si la estrategia funciona.

4. **Pricing hypothesis por ECP** — Se mencionan ARPUs estimados pero no hay hipótesis de pricing structure (¿% transaccional? ¿SaaS fijo? ¿hybrid?). Esto afecta al SAM.

5. **Timeline de producto por ECP** — ECP-2 dice "módulo cash pooling necesita desarrollo". ¿Cuánto? ¿3 meses MVP? ¿6 meses full? Esto afecta al roadmap de ejecución.

---

## 🎯 Action List (Priorizada)

1. **[CRÍTICO]** Corregir Error 1: SAM ECP-1 — math error (€384M → €4,8M SAM o clarificar que es TAM por establecimiento)
2. **[CRÍTICO]** Corregir Error 2: SAM ECP-2 — inconsistencia resumen (240M) vs detalle (360M)
3. **[IMPORTANTE]** Añadir sección win/loss criteria por ECP con KPIs medibles
4. **[IMPORTANTE]** Actualizar dato SGIICs con fecha exacta o rango actualizado
5. **[IMPORTANTE]** Añadir hipótesis de pricing por ECP (afecta SAM y roadmap)
6. **[NICE TO HAVE]** Añadir sección "competitive response scenarios" por ECP
7. **[NICE TO HAVE]** Planificar 2-3 entrevistas de validación con prospects por ECP
8. **[NICE TO HAVE]** Marcar claim "400-500 cadenas con 10+" como estimación explícita

---

**QA ejecutada por**: Sancho (rol QA Bot)  
**Documento revisado**: ECPs v1 — Paymático  
**Conclusión**: Documento fuerte en análisis cualitativo, con errores matemáticos en SAM que requieren corrección antes de aprobar.
