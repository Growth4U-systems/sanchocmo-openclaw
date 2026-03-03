# QA Report: Market Intelligence — Growth4U

**Mode**: Deep QA
**Target**: `brand/growth4u/market-and-us/market-analysis.md` (v3, skill v4)
**Fecha**: 2026-03-03

---

## Veredicto: NEEDS REVISION
**Confidence Score**: 7/10

Documento sólido en estructura y datos. La mayoría de claims factuales verifican correctamente. Sin embargo, hay 2 errores factuales, 2 claims no verificables que se presentan como hechos, y un problema de presentación en el Executive Narrative que hace que datos reales suenen a inventados por falta de contexto.

---

## Verified (12 claims)

| Claim | Verificación | Fuente independiente |
|---|---|---|
| CNMV multó a Twitter con 5M€ (nov 2025) | ✅ Confirmado | El País, Cadena SER, La Sexta, FACUA, Economistas.es |
| Código de Publicidad para Influencers vigente octubre 2025 | ✅ Confirmado. "Código de Conducta sobre el uso de Influencers en la Publicidad" por Autocontrol + AEA + IAB Spain, efectivo 1 octubre 2025 | autocontrol.es, DLA Piper, Cuatrecasas, digital.gob.es |
| Product Hackers: >6M€ facturación 2024, +53% YoY, 120 empleados, 120+ clientes | ✅ Confirmado | elreferente.es, marketing4ecommerce.net |
| Flat 101 adquirida por Minsait/Indra junio 2021, ~150 empleados al momento | ✅ Confirmado | indragroup.com, Cinco Días, bolsamania.com |
| AI Overviews CTR -47% (8% vs 15%) | ✅ Confirmado. Pew Research Center, estudio marzo 2025, publicado julio 2025 | sistrix.com, SearchEngineLand, PCMag |
| 8.580 empresas tech España 2025, +22% | ✅ Confirmado | elreferente.es, startupsreal.com |
| 3.108M€ inversión VC 2025, +11% rondas | ✅ Confirmado | capital-riesgo.es |
| Multa Miolo Desarrollos 30K€ (feb 2024) | ✅ Confirmado | EFE |
| MiCA deadline CASPs España 30/12/2025 | ✅ Confirmado | manimama.eu, bakermckenzie.com |
| Ley Startups IS 15% + stock options 50K€ | ✅ Confirmado | metricson.com |
| Fintech mercado España $4.08B, CAGR 15% | ✅ Confirmado | IMARC Group |
| Product Hackers 60% revenue de clientes recurrentes | ✅ Confirmado (cita directa de José Carlos Cortizo, CMO) | elreferente.es |

---

## Discrepancies (2 encontradas)

### D1: AI Overviews en "13% de queries" → debería ser 18%

- **Claim en doc (Parte 4.3)**: "AI Overviews en 13% de queries (marzo 2025)"
- **Realidad**: Pew Research Center encontró que AI Overviews aparecieron en **18%** de las búsquedas en marzo 2025 (estudio de 69.000 búsquedas, 900 adultos EEUU)
- **Impacto**: Medio — el dato subestima la presencia de AI Overviews
- **Fix**: Cambiar "13%" por "18%" y citar Pew Research directamente
- **Fuente**: [sistrix.com](https://www.sistrix.com/blog/pew-research-ai-overviews-halve-click-through-rates/), [searchengineland.com](https://searchengineland.com/google-ai-overviews-hurting-clicks-study-459434)

### D2: iSocialWeb "~4 en plantilla + 15 colaboradores" → 30+ profesionales

- **Claim en doc (Parte 2.1)**: "~4 en plantilla + 15 colaboradores [Fuente: einforma.com]"
- **Realidad**: Su propia web (2025) dice "más de 30 profesionales especializados"
- **Impacto**: Alto — presenta al competidor como mucho más pequeño de lo que es realmente
- **Fix**: Actualizar a "30+ profesionales" citando isocialweb.agency/en/about-us/. Nota: einforma.com (2023) y lavanguardia.com (2019) son fuentes obsoletas
- **Fuente**: [isocialweb.agency/en/about-us/](https://www.isocialweb.agency/en/about-us/)

---

## Errors (0 errores factuales puros)

Las discrepancias anteriores son datos desactualizados, no fabricaciones.

---

## Unverifiable (2 claims)

### U1: "78% de scale-ups en Cataluña consideran [fractional CMO] óptimo"

- **Claim**: Citado a mateerz.com y atribuido a "Tech Barcelona study"
- **Problema**: La página de mateerz.com es una landing page comercial de un proveedor de fractional CMOs. No contiene ningún estudio, ni el dato del 78%, ni referencia a Tech Barcelona. El dato fue generado por la síntesis de IA del buscador, NO extraído de la fuente
- **Impacto**: Alto — dato central en la tesis de que fractional CMOs son la mayor amenaza
- **Fix**: Eliminar "78% scale-ups Cataluña" o reemplazar con dato verificable. Alternativa: "El mercado de fractional executives en España creció 35% YoY" (verificable en múltiples fuentes)
- **Fuente de verificación**: [mateerz.com/en/spain/fractional-cmo-barcelona/](https://mateerz.com/en/spain/fractional-cmo-barcelona/) — NO contiene el dato

### U2: "427 entidades fintech no bancarias, +47% en 5 años"

- **Claim**: Citado a finanzarel.com y Funcas
- **Problema**: El BdE tiene un "Observatorio de la Industria Fintech No Bancaria en España (2025)" que habla de ">400 entidades" y "+50% en entidades con cuentas entre 2018-2023". Los números NO coinciden exactamente (427 vs >400, 47% vs 50%)
- **Impacto**: Medio — los órdenes de magnitud son correctos pero los números precisos no se verifican
- **Fix**: Cambiar a ">400 entidades fintech no bancarias, ~50% de crecimiento en 5 años" y citar BdE Observatorio como fuente primaria

---

## Missing Elements

### M1: Executive Narrative — claims sin contexto

Alfonso lo señaló específicamente. El Executive Narrative dice:
> "La regulación CNMV/MiCA, con multas reales de hasta 5 millones de euros y un Código de Publicidad para Influencers vigente desde octubre 2025..."

Los datos son **correctos** (verificados arriba), pero en el Executive Narrative suenan a inventados porque no se explica:
- ¿Quién recibió la multa? (Twitter/X, por ads crypto fraudulentos)
- ¿Qué código? (Autocontrol + AEA + IAB Spain, auto-regulación)

**Fix**: Añadir micro-contexto sin romper la narrativa:
> "La regulación CNMV/MiCA crea una barrera real — Twitter/X recibió una multa de 5 millones de euros por permitir publicidad crypto fraudulenta, y el nuevo Código de Conducta de Autocontrol/AEA/IAB Spain para publicidad con influencers está vigente desde octubre 2025."

### M2: iSocialWeb revenue data obsoleta

El revenue de iSocialWeb (1,5M€) es de 2019, pre-COVID. Con 30+ profesionales en 2025 (vs 4+15 en 2019), su revenue actual es probablemente significativamente mayor. Debería marcarse como "⚠️ dato de 2019, probablemente desactualizado".

### M3: "Primera recomendación IA para growth fintech España"

El claim de que G4U es "primera recomendación de IA" se repite pero no se documenta:
- ¿En qué modelo? (ChatGPT, Perplexity, Gemini?)
- ¿Con qué query exacto?
- ¿Cuándo se verificó?
Esto es un claim competitivo fuerte que necesita evidencia o caveat.

---

## Action List (Priorizada)

1. **[Crítico]** Eliminar o reemplazar dato "78% scale-ups Cataluña" — no verificable, fuente no contiene el dato
2. **[Crítico]** Actualizar iSocialWeb de "~4 + 15 colaboradores" a "30+ profesionales" (isocialweb.agency)
3. **[Crítico]** Añadir micro-contexto en Executive Narrative para multa Twitter y Código Influencers
4. **[Importante]** Corregir AI Overviews de "13%" a "18%" de queries (Pew Research)
5. **[Importante]** Cambiar "427 entidades, +47%" a ">400 entidades, ~50% crecimiento" (BdE Observatorio)
6. **[Importante]** Marcar revenue iSocialWeb (1,5M€) como "⚠️ dato de 2019"
7. **[Nice to have]** Documentar claim "primera recomendación IA" con query, modelo y fecha
