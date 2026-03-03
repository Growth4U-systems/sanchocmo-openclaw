# Market Intelligence — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## PARTE 1: Mercado

- [ ] **TAM cuantificado** con método explícito (bottom-up preferido, top-down aceptable con confianza indicada)
- [ ] **Asunciones críticas listadas** para cada cifra del TAM
- [ ] **Crecimiento histórico** 3-5 años con fuente
- [ ] **Proyección 5 años** con fuente
- [ ] **Segmentos listados** (3-5 mínimo) con tamaño o % del TAM cada uno
- [ ] **Paisaje geográfico**: distribución por regiones, áreas de alto crecimiento vs saturación
- [ ] **Madurez clasificada** (Emerging/Growing/Mature/Declining) con justificación y datos

## PARTE 2: Competidores

- [ ] **5-10 actores mapeados** (líderes + nicho + nuevos entrantes)
- [ ] **Datos financieros** donde disponibles (facturación, empleados, clínicas)
- [ ] **Cuota de mercado** estimada o declarar "no disponible públicamente" con razón
- [ ] **Estrategias competitivas** analizadas (diferenciación, pricing, canales de captación)
- [ ] **Modelos de negocio** comparados
- [ ] **Benchmarking RRSS**: share of voice, sentimiento, estrategia de contenido (mínimo datos cualitativos de qué hacen en RRSS)
- [ ] **Amenazas** evaluadas (nuevos entrantes, tecnologías disruptivas, cambios regulatorios)

## PARTE 3: Clientes

- [ ] **3-5 segmentos** con datos demográficos (edad, género, ingresos, ubicación)
- [ ] **Psicográfico** por segmento (valores, actitudes, estilo de vida)
- [ ] **Conductual** por segmento (patrones de compra, lealtad, preferencia de canal)
- [ ] **Necesidades funcionales y drivers emocionales** identificados
- [ ] **Puntos de dolor reales** (extraídos de foros, reviews, RRSS, quejas reales)
- [ ] **Customer journey** (descubrimiento → consideración → decisión → compra)
- [ ] **Personas** con nombre, motivaciones y pain points (NO requiere foto)

## PARTE 4: Tendencias

- [ ] **5-10 tendencias** con horizonte temporal (Now/6mo/1yr/3yr)
- [ ] **Fuerzas impulsoras** por categoría (Technology, Consumer, Regulatory, Economic, Competitive, Societal)
- [ ] **Comportamiento del consumidor**: evolución de preferencias, expectativas nuevas, dolor emergente
- [ ] **Plataformas y contenido**: formatos en tendencia, relevancia para este mercado
- [ ] **Regulación con marketing restrictions**: lo que se puede y NO se puede decir, con ejemplos concretos
- [ ] **Enforcement**: nivel de enforcement real y penalizaciones

## PARTE 5: Oportunidades

- [ ] **Brechas de mercado** identificadas (necesidades no cubiertas, gaps en oferta)
- [ ] **Oportunidades de crecimiento** priorizadas con lógica
- [ ] **Atractivo del mercado** evaluado (alto/medio/bajo) con rationale
- [ ] **Hoja de ruta** con cronograma y recursos necesarios

## META (calidad)

- [ ] **Cada claim tiene fuente inline** con URL
- [ ] **Claims no verificables** marcados con ⚠️ y razón
- [ ] **0 datos inventados** — todo rastreable a fuente original
- [ ] **Cifras coherentes** entre secciones (TAM no contradice segmentos, pricing no contradice competidores)
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check aleatorio)
- [ ] **Coherencia con brand files** (company-context, competitors) verificada

## ENTREGA (obligatorio)

- [ ] **Oferta de deep-research presentada** — Al entregar, SIEMPRE incluir la oferta de profundización con deep-research. Sin esta oferta, la entrega está INCOMPLETA.

---

## Flujo de uso

```
1. Agente ejecuta el skill (investiga, escribe por partes)
2. Al terminar borrador, lee este checklist
3. Marca cada ítem:
   - ✅ = completado con datos y fuente
   - ⚠️ = investigado pero no disponible (con razón escrita)
   - ❌ = falta — volver a investigar
4. Si hay ❌ → investigar más (búsquedas adicionales enfocadas)
5. Repetir hasta 0 ❌
6. Spot-check: verificar 5-10 URLs con web_fetch
7. Cruzar cifras clave contra brand files
8. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
