# Market Intelligence — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

## TIERS DE PRIORIDAD
- **P0 (bloqueante)**: Si falta alguno, NO SE ENTREGA. Investigar hasta resolver.
- **P1 (importante)**: Debería estar. ⚠️ aceptable con justificación.
- **P2 (nice-to-have)**: Mejora calidad pero no bloquea entrega.

---

## PRIMARY SOURCE VERIFICATION (P0 — bloqueante)

- [ ] **Cada competidor scrapeado** — `web_fetch` en su dominio propio (homepage mínimo)
- [ ] **Pricing de fuente primaria** — viene de `/pricing` del competidor, NO de artículos
- [ ] **Features de fuente primaria** — viene de `/features` del competidor, NO de artículos
- [ ] **Posicionamiento de fuente primaria** — viene de su homepage/tagline textual
- [ ] **Claims cross-checked** — ningún claim sobre competidor basado SOLO en terceros
- [ ] **Fuentes secundarias marcadas** — si algún dato viene solo de artículo → `[⚠️ fuente secundaria]`

---

## STORYTELLING (P2)

- [ ] **Executive Narrative** existe al principio del documento (Parte 0)
  - ✅ 1 página máximo, narrativa pura, CERO tablas
  - ✅ Estructura: Situación → Tensión → Oportunidad
  - ✅ Quien lea solo esto entiende el 80% del análisis

- [ ] **Cada sección tiene apertura narrativa** (2-3 párrafos antes de datos/tablas)
  - ✅ Explica QUÉ vamos a ver y POR QUÉ importa

- [ ] **Cada subsección/tabla tiene cierre interpretativo**
  - ✅ Párrafo "So what?" después de cada tabla/datos
  - ✅ Párrafo "Implicación" que dice qué hacemos con esto

- [ ] **Transiciones entre PARTES** (1→2, 2→3, 3→4, 4→5)
  - ✅ Párrafo puente que conecta lo anterior con lo siguiente
  - ✅ El documento fluye como argumento continuo, no secciones aisladas

- [ ] **Tono de presentación**
  - ✅ Escrito para CEO, no para analista
  - ✅ Frases como "Esto significa que...", "La oportunidad está en...", "El riesgo es..."
  - ✅ Evita lenguaje académico/técnico

- [ ] **Cierre final** del documento
  - ✅ 1-2 párrafos conclusivos que cierran la historia completa

---

## PARTE 1: Mercado (P0/P1)

- [ ] **TAM cuantificado** con método explícito (bottom-up preferido, top-down aceptable con confianza indicada) **(P0)**
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

## SLIDE SUMMARY (P1)

- [ ] **Bloque `## Slide Summary` existe** al final del informe (antes de Fuentes)
- [ ] **YAML válido** — parseable con `yaml.parse()`
- [ ] **hero_metrics** — total_entities, entity_label, tam_annual, ecosystem_value, ecosystem_label
- [ ] **market_profile** — maturity, maturity_signal, growth_historical, growth_projected, growth_source
- [ ] **verticals** — 4-6 con name, tam, cagr (o null), source, entities
- [ ] **competitive_landscape** — concentration, total_players, top_3 (name + share), white_space
- [ ] **trends** — 3+ trends, cada uno con: trend, insight, data, horizon, impact, winners, losers, action
- [ ] **regulatory** — risk_level (semáforo), key_constraint, marketing_impact
- [ ] **opportunity** — primary, gap, timing, risk
- [ ] **sam = null** — NO calcular SAM aquí (lo hace niche-discovery)
- [ ] **Coherente con el informe** — cada dato del slide rastreable a una sección del documento

## META (calidad) (P0)

- [ ] **Cada claim tiene fuente inline** con URL **(P0)**
- [ ] **Claims no verificables** marcados con ⚠️ y razón **(P0)**
- [ ] **0 datos inventados** — todo rastreable a fuente original **(P0)**
- [ ] **Cifras coherentes** entre secciones (TAM no contradice segmentos, pricing no contradice competidores) **(P0)**
- [ ] **5-10 URLs verificadas** con web_fetch (spot-check aleatorio) **(P1)**
- [ ] **Coherencia con brand files** (company-context, competitors) verificada **(P1)**

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
