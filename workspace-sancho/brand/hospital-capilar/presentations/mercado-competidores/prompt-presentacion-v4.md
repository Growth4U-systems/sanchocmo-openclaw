# Prompt: Presentación "Análisis de Mercado y Competidores" — Hospital Capilar

> **Objetivo:** Generar una presentación HTML con Reveal.js (theme white) para una sesión de trabajo de ~2 horas con el equipo de Hospital Capilar. La presentación debe ser sintética pero bien documentada, con fuentes visibles en cada slide, preguntas de validación para el equipo, y diseño profesional tipo consultoría.

---

## INSTRUCCIONES DE DISEÑO

- **Framework:** Reveal.js 5.1.0 CDN (`https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/`)
- **Theme:** White base, custom CSS
- **Font:** Montserrat (Google Fonts)
- **Paleta:**
  - Navy: #1B2A4A (textos principales, headers)
  - Cyan: #00BFD6 (acentos, highlights, progress bar)
  - Cyan light: #E6F9FB (fondos highlight)
  - Gray bg: #F5F7FA (cards)
  - Gray text: #6B7B8D (subtítulos)
  - Gray dark: #4A5568 (body text)
  - Green: #2ECC9B (positivo)
  - Red: #E74C3C (negativo)
  - Orange: #F39C12 (warning)
  - Blue: #2E5BFF (neutro)

- **Componentes reutilizables (CSS classes):**
  - `.card` / `.card-highlight` — tarjetas con border-radius 12px
  - `.card-grid-2` / `.card-grid-3` / `.card-grid-4` — grids
  - `.big-num` — números grandes cyan
  - `.label` — etiquetas uppercase pequeñas
  - `.tag` / `.tag-green` / `.tag-red` / `.tag-orange` / `.tag-cyan` / `.tag-blue` — pills
  - `.navy-box` — caja fondo navy con texto blanco
  - `.section-slide` — divisores de sección (fondo navy, número grande cyan)
  - `.question-slide` — slides de validación (fondo cyan-light, icono 🤔)
  - `.validation-box` — caja de preguntas con borde dashed cyan
  - `.two-col` / `.three-col` — layouts columnas
  - `.source` — fuentes en itálica pequeña gris
  - `.badge-alto` / `.badge-medio` / `.badge-bajo` — badges de amenaza
  - `.hm-yes` / `.hm-partial` / `.hm-no` — heatmap colors
  - `.swot-grid` / `.swot-cell` / `.swot-s` / `.swot-w` / `.swot-o` / `.swot-t` — SWOT grid

- **Reveal config:** hash:true, slideNumber:'c/t', width:1100, height:700, transition:'fade', center:false, navigationMode:'linear'
- **Texto alineado a la izquierda** (no centrado) excepto en cover y section slides.
- **Cada slide DEBE tener fuente visible** al pie (class `.source`).
- **Leyenda global** (incluir en slide metodología y footer): 📊 = verificado | ⚠️ = estimación | 💡 = insight | 🔴 = requiere decisión

---

## ESTRUCTURA DE SLIDES (~47 slides)

### PORTADA (Slide 1)
- Header: "Hospital Capilar × Growth4U"
- Título: "Análisis de Mercado y Competidores"
- Subtítulo: "Tratamientos capilares no quirúrgicos en España"
- "Sesión de trabajo y validación con el equipo — Marzo 2026"
- Footer: ⏱️ ~2 horas | 📋 Validación + Q&A | 📊 4 bloques

### AGENDA (Slide 2)
- 4 bloques numerados (01-04):
  1. El Mercado — TAM, segmentos, crecimiento, prevalencia, tendencias
  2. Los Competidores — Battle cards, mapa posicionamiento, vulnerabilidades, heatmap features
  3. Nosotros (HC) — Auto-análisis 3 lentes, reputación, gaps digitales, posición actual
  4. SWOT + Estrategia — SWOT, TOWS, plan de acción priorizado ICE
- Nota: "Cada bloque incluye preguntas de validación para el equipo"

### QUÉ HEMOS ANALIZADO — Metodología (Slide 3) ← NUEVO
- 4 cards grid-4 con big-num:
  - **43** fuentes verificadas
  - **9** competidores analizados
  - **232** anuncios en Meta Ads Library
  - **14** estrategias TOWS generadas
- Two-col:
  - Left card "Investigación realizada":
    - **Market Intelligence:** Tamaño, segmentos, tendencias del mercado capilar
    - **Self-Intelligence:** 8 plataformas analizadas (web, RRSS, reviews, SEO)
    - **Competitor Intel:** 9 competidores en profundidad + Meta Ad Library
    - **Consumer Sentiment:** Foros, Reddit, reviews, OCU
  - Right card "Fuentes utilizadas":
    - **Primarias:** Sessions Discovery, Form Cliente, PDFs HC, Reunión Gerardo
    - **Market Research:** MRFR, Grand View, Mordor Intelligence, Bonafide
    - **Digital:** Meta Ad Library, Trustpilot, Google Reviews, OCU
    - **Regulación:** BOE, AEMPS, Sanidad.gob.es — 5 normativas clave
- Footer bar gray: "📊 = verificado | ⚠️ = estimación | 💡 = insight | 🔴 = requiere decisión"

---

### SECCIÓN 01: EL MERCADO

#### Divider (Slide 4)
- Section slide navy: "01 — El Mercado"

#### España: Epicentro Europeo de la Alopecia (Slide 5)
- 4 cards en grid:
  - 44,5% hombres con alopecia (1º Europa, 2º mundial)
  - 40% mujeres afectadas
  - ~20M españoles afectados (10,4M hombres + 9,6M mujeres)
  - 25% jóvenes 18-24 años con caída activa
- Tabla ranking: España 44,5% > Rep. Checa ~43% > Alemania ~41% > Francia ~39% > Italia ~38%
- Fuente: Medihair 2025, Mundo Farmacéutico, INE 2024, Svenson, This Medical

#### Dimensionamiento del Mercado — TAM (Slide 6)
- Two-col layout:
  - Left: 3 cards stacked:
    - Mercado General Cuidado Capilar España: €2.000M (+8,9% 2024, proyección 2030: €2.520M) — Stanpa, Professional Beauty
    - Tratamientos Pérdida Cabello España: €276M (+12,1% 2024, CAGR 7,05% hasta 2031) — Grand View Research, Mordor Intelligence [HIGHLIGHT]
    - Trasplante Capilar España: €63,8M (CAGR 13,5% → €281M en 2035) — Market Research Future, Just One
  - Right: Navy box cálculo bottom-up:
    - 20M afectados × 10-15% buscan tratamiento = 2-3M clientes potenciales × ARPU €820-1.200/año
    - = €1.640M - €3.600M TAM bottom-up
    - Warning: "Solo 10-15% buscan tratamiento médico hoy. Mercado subdesarrollado."

#### Proyecciones de Crecimiento (Slide 7)
- Tabla con columnas **Segmento | Tamaño actual | Proyección | CAGR | Nota**:
  - Cuidado capilar profesional | €1.705M | €2.520M (2030) | ~6,8% | Mercado paraguas
  - **Tratamientos pérdida cabello** | **€276M** | **€370M (2031)** | **7,05%** | **FOCO HC — más grande en €** [HIGHLIGHT]
  - Trasplante capilar | €63,8M | €180M+ (2035) | 13,5% | Más rápido en %, pero base 4× menor
- Navy box: **"💡 ¿Por qué trasplante crece más en %?"** — Trasplante parte de una base 4× menor (€63,8M vs €276M). Crece más rápido en porcentaje, pero tratamientos crece MÁS en euros absolutos/año. Para HC, tratamientos es el mercado más grande Y más rentable (margen 90%)."
- 2 cards: 7,05% CAGR España tratamientos (más alto Europa) | +12,1% crecimiento tratamientos 2024

#### Segmentos del Mercado (Slide 8)
- 4 cards grid-2:
  1. Tratamientos Médicos No Quirúrgicos [FOCO HC] — €276M+, +12,1%, mesoterapia/PRP/medicación, margen 90%, potencial **MUY ALTO** [HIGHLIGHT]
  2. Cirugía / Trasplante Capilar — €63,8M, +13,5% (base menor), alto ticket €3K-9K, potencial ALTO
  3. Productos OTC / DTC — ~€200M+, Olistic 700K+, ciclo fallo 2-4 años → pipeline, potencial MEDIO
  4. Servicios Estéticos / Peluquería — parte €1.705M, sin regulación, potencial BAJO-MEDIO

#### Madurez del Mercado (Slide 9)
- Visual indicator: Emergente → [⭐ Crecimiento] → Maduro → Declive
- Tabla evidencia con columnas **Indicador | Dato | Fuente**:
  - Crecimiento mercado tratamientos | +12,1% anual (2024) | Grand View Research
  - Aumento consultas injerto capilar | +50% en demanda de consultas (dato de búsquedas/consultas, NO de mercado) | Forbes España, Medihair
  - Competencia | 9 players directos en España, PE entrando (NK5→Svenson) | Análisis propio
  - Educación consumidor | 70% no sabe qué es alopecia areata | Pfizer España
  - Fragmentación | Ningún player >6% cuota | Estimación propia
- Navy box implicación estratégica: diferenciación, speed to market, category education, foco captura share

#### Pacientes y Regulación (Slide 10) ← REEMPLAZA perfil demanda genérico
- 4 cards grid-4 con icon-circles:
  - **👨 Hombre Reactivo** (35-55) — Calvicie visible. **44% autoestima afectada.**
  - **👩 Mujer Silenciosa** (25-55) — Caída hormonal (postparto, menopausia). **75% consultas AP = mujeres.**
  - **📱 Joven Preventivo** (18-34) — Primeros signos. **TikTok primero, médico después.**
  - **🔄 Mantenimiento** — Post-cirugía, cross-sell. **Alto LTV, ya confía en HC.**
- Two-col regulación:
  - Left card borde rojo "❌ NO podemos decir":
    - Garantizar resultados ("Recuperarás tu pelo")
    - Mencionar fármacos por nombre → Usar **CRT, HRT**
    - Antes/después sin consentimiento + disclaimers
    - Presionar con "descuento solo hoy"
  - Right card borde verde "✅ SÍ podemos decir":
    - "Diagnóstico incluye tricoscopía + analítica hormonal"
    - "Trustpilot 4.8/5 — 95% satisfacción"
    - Contenido educativo sobre ciencia de tratamientos
    - "Procedimientos los realiza un médico" (Ley Sara)
- Navy box: **"💡 La Ley Sara (sept 2024) es POSITIVA para HC"** — Eleva barreras de entrada. 70% españoles no sabe qué es alopecia areata. Demanda latente. OTC (Olistic 700K+) = pipeline: 1-2 años sin resultado → buscan clínica.

#### Tendencias Clave (Slide 11)
- Tabla 7 tendencias con dirección, horizonte e impacto HC:
  - Low-dose oral minoxidil — AHORA — Oportunidad
  - Demanda latente crece — AHORA — Oportunidad
  - Regulación publicidad más estricta — 6 meses — Amenaza/Oportunidad
  - Consolidación Private Equity (fondos de inversión comprando clínicas, ej: NK5 Partners → Svenson) — 1 año — Amenaza
  - DTC/telemedicina — AHORA-1 año — Amenaza (pipeline)
  - Nuevos fármacos (PP405, Clascoterone) — 3 años — Oportunidad futuro
  - Terapias celulares — 2-3 años — Oportunidad futuro

#### Validación Mercado (Slide 12) — question-slide
- 7 preguntas:
  1. ¿10-15% afectados buscan tratamiento es realista?
  2. ¿Cambio en perfil de edad? ¿Más jóvenes?
  3. ¿Pacientes post-Turquía? ¿Cuántos/mes?
  4. ¿Protocolos HRT y CRT llevan esos nombres?
  5. ¿Distribución hombres/mujeres en tratamientos?
  6. ¿Los 4 perfiles de pacientes (Reactivo, Silenciosa, Preventivo, Mantenimiento) les resuenan?
  7. ¿Motivo consulta más frecuente? ¿El que más ha crecido?

---

### SECCIÓN 02: LOS COMPETIDORES

#### Divider (Slide 13)
- Section slide navy: "02 — Los Competidores"

#### Landscape Competitivo (Slide 14)
- Tabla 10 rows (9 competidores + HC):

| Competidor | Tipo | Clínicas | Facturación | Foco | Reviews | Amenaza |
|---|---|---|---|---|---|---|
| Insparya | Directo | 5 ES + 10 int. | €20,7M | Cirugía (hero) | 3.8/5 TP | ALTO |
| Svenson | Directo | 31 | €17,4M | Mix (estético) | Baja TP | MEDIO |
| IMD | Directo | **21** | N/D | Estética (mujeres) | Mixtas | MEDIO |
| Medical Hair | Directo | **10+** | N/D | Mix low-cost | 4.9/5 ⚠️ | MEDIO |
| Capilclinic | Directo | 3 (2 ES + 1 TR) | N/D | Cirugía (SEO) | 4.5/5 TP | BAJO |
| **FUEXPERT** | Directo | 1 | N/D | Cirugía premium | Positivas | BAJO |
| **Pedro Jaén** | Directo | 1 | N/D | Derma + capilar | Alta | BAJO |
| **Dorsia** | Directo | Múltiples | N/D | Estética general | Mixtas | BAJO |
| Olistic Science (marca) | Indirecto DTC | 0 | **€27M** | Suplemento capilar | Mixtas | BAJO ≈ pipeline |
| 🏥 Hospital Capilar | — | 3 → 9 | — | **Medicina capilar integral** (cirugía + tratamientos) | **4.8/5 TP** | — |

- Hallazgo clave: "Ningún competidor ha construido marca ESPECÍFICA para tratamientos no quirúrgicos"

#### Mapa de Posicionamiento: CIRUGÍA (Slide 15) ← NUEVO: 2 mapas separados
- 2 ejes: Premium ↔ Accesible (vertical) × Generalista ↔ Especialista (horizontal)
- 10 competidores mapeados:
  - **FUEXPERT:** Premium + Especialista (esquina superior derecha)
  - **HC:** Premium + Especialista (cerca de FUEXPERT)
  - **Pedro Jaén:** Premium + Generalista (derma amplio)
  - **Insparya:** Premium-medio + Especialista
  - **Castellana:** Medio + Generalista
  - **Dorsia:** Accesible + Generalista
  - **IMD:** Accesible-medio + Generalista
  - **Capilclinic:** Accesible + Especialista
  - **Svenson:** Accesible + Generalista
  - **Medical Hair:** Accesible + Especialista
- Mensaje: **"En cirugía, HC está bien posicionado: especializado + premium. Pero el mapa está LLENO."**

#### Mapa de Posicionamiento: TRATAMIENTOS (Slide 16) ← NUEVO
- 2 ejes: Enfoque Médico ↔ Enfoque Estético (vertical) × Sin tratamientos core ↔ Tratamientos como producto (horizontal)
- HC en cuadrante superior derecho (Médico + Tratamientos como producto) — **SOLO, cuadrante vacío highlighted con dashed border cyan**
- Pedro Jaén: Médico + Sin tratamientos core
- Insparya: Médico-bajo + Sin tratamientos core
- IMD: Estético + Tratamientos (pero no médicos)
- Svenson: Estético + Sin core
- Dorsia: Estético + Sin core
- Medical Hair: Estético + Sin core
- Mensaje: **"HC es el ÚNICO que combina enfoque médico REAL + tratamientos como producto CORE"**

#### Battle Card: Insparya (Slide 17)
- **Subtítulo:** Líder percibido — €20,7M facturación
- Two-col:
  - Left:
    - Datos: €20,7M 2024 (-13% vs 2023), 5 clínicas ES + 10 internacionales, 33.000+ pacientes, 15.000+ trasplantes, I+D €2M/año, Trustpilot 3.8/5, CR7 embajador
    - Vulnerabilidades con **citas reales**:
      - Google: *"Te tratan como ganado. Doctor diferente cada revisión."*
      - OCU: *"Seguimiento nefasto, imposible hablar con alguien después de pagar."*
      - Foro: *"Publicidad engañosa, resultados no como prometen."*
      - 170 anuncios activos Meta — **100% cirugía, 0 tratamientos**
  - Right:
    - Estrategia: "Referente mundial salud capilar" con CR7. Cirugía = hero. Tratamientos complemento. Marketing agresivo Meta/Google.
    - Cómo ganarles: "Tratamiento primero, cirugía si hace falta", transparencia total, seguimiento tricoscopía 3 meses, competir en tratamientos no cirugía
- Fuentes: El Confidencial, Trustpilot, Google Reviews, OCU, Meta Ad Library, análisis Lens 3

#### Battle Card: Svenson (Slide 18)
- **Subtítulo:** Red más amplia — €17,4M — Post-reestructuración
- Two-col:
  - Left:
    - Datos: €17,4M 2024, 31 centros 25 provincias, proyecta +26% 2025 (NK5 Partners), pricing €1.795-2.695, Trustpilot baja, 54 años en España
    - Vulnerabilidades con **citas reales**:
      - **NO son médicos = esteticistas**
      - Post-concurso acreedores → marca dañada (existe svenson-responde.es)
      - Google: *"Muy agresivos comercialmente. Presionan para firmar en la primera visita."*
      - OCU: *"Falta de transparencia total en precios."*
      - Instalaciones "antiguas" en algunos centros
  - Right:
    - Estrategia: "Líder europeo salud capilar", marca histórica, mix cirugía+tratamientos+estética, diagnóstico gratuito → venta agresiva
    - Cómo ganarles: "Médicos de verdad", tricoscopía+analítica vs cosmético, centro moderno vs anticuado, HC €820 vs Svenson €1.295-2.695
- Fuentes: El Economista, OCU, svenson.es, svenson-responde.es

#### Battle Card: Capilclinic (Slide 19)
- **Subtítulo:** SEO King — España + Turquía
- Two-col:
  - Left:
    - Datos: Facturación N/D, 3 clínicas (Madrid, Barcelona + Estambul/Florence Nightingale), Trustpilot 4.5/5 (180 reviews), FUE Zafiro/DHI/Min Time FUE, packs €2.990-5.990, SEO fortísimo
    - Vulnerabilidades: NO vende tratamientos standalone, meso solo en Pack Gold/XL, sin protocolo médico independiente, modelo low-cost tipo Turquía, sin analítica hormonal
  - Right:
    - Estrategia: SEO-first + pricing competitivo. "Cirugía accesible calidad europea". Modelo dual España-Turquía. Tratamientos = add-on post-quirúrgico.
    - Cómo ganarles: NO compite en tratamientos (mundos separados), HC captura ANTES de cirugía, operados Capilclinic necesitan mantenimiento → oportunidad, competir en SEO keywords tratamientos (vacías)
- Fuentes: capilclinic.es, Trustpilot

#### Battle Card: Medical Hair (Slide 20)
- **Subtítulo:** Red nacional expansiva — 10+ sedes — Low-cost
- Two-col:
  - Left:
    - Datos: Facturación N/D, 10+ sedes (Madrid, BCN, Valencia, Zaragoza, Murcia, Vigo, A Coruña, San Sebastián, Benidorm, Bilbao), Reviews 4.9/5 (1.570+) ⚠️ dudas autenticidad, +25 años, mesoterapia €70/sesión (outlier bajo), injerto FUE desde €2.990
    - Vulnerabilidades: €70/sesión = menor calidad/personalización, dudas autenticidad reviews, alta rotación personal, sin analítica hormonal, modelo satélite = dilución calidad
  - Right:
    - Estrategia: Cobertura geográfica agresiva + pricing competitivo. Consulta gratuita + financiación. Mix cirugía + tratamientos. FUE Zafiro + fórmulas personalizadas.
    - Cómo ganarles: "Calidad médica > precio bajo", protocolo HRT/CRT con seguimiento vs genérico, reputación verificable (HC 4.8 auténtico vs 4.9 dudoso), especialización > generalismo
- Fuentes: medicalhair.es, Trustindex.io, foroalopecia.com

#### Battle Card: IMD (Slide 21)
- **Subtítulo:** Red estética masiva — 21 clínicas — Foco femenino
- Two-col:
  - Left:
    - Datos: Facturación N/D, 21 clínicas (Madrid, BCN, Valencia, Sevilla, Murcia, Oviedo, Bilbao, Alicante, Málaga, Mallorca, Valladolid, Córdoba, Vigo), 260.000+ pacientes, 300+ estudios, tratamientos €1.200-2.000, injerto desde €2.500
    - Vulnerabilidades con **citas reales**:
      - NO son médicos = enfoque estético (láser, ozono, radiofrecuencia)
      - Sin analítica hormonal
      - Reddit: *"Láser + vitaminas por €1.200; dermatólogo lo resolvió por €120"*
      - Trustpilot: paciente €2.000 sin resultados
      - Ex-empleado: *"función principal era comercial"*
      - Alta rotación
  - Right:
    - Estrategia: Red más amplia sector (21). Diagnóstico gratuito → venta presencial agresiva. Mix estético. Foco mujeres. Prótesis/integración capilar.
    - Cómo ganarles: "Médicos de verdad" analítica hormonal REAL, tratamiento causa vs síntoma, precio justo (HC €820 vs IMD €1.200-2.000), transparencia vs venta agresiva, captar mujeres: "Tu alopecia tiene causa hormonal — tratémosla"
- Fuentes: imdermatologico.com, Reddit r/askspain, Trustindex.io, ex-empleados

#### Battle Card: Olistic Science (Slide 22)
- **Subtítulo:** Marca de suplementos capilares DTC — €27M facturación — Pipeline, NO enemigo
- Two-col:
  - Left:
    - Datos: €27M facturación 2023, Serie A €6M (Iris Ventures 2022), 700.000+ clientes, #1 farmacias España, Top 100 Rising European Startups 2025 (VivaTech), BeautyMatter Future50 2026, suscripción €30-60/mes, TikTok #OlisticHair 10M+ views
    - Limitaciones (no vulnerabilidades): no trata causa, sin supervisión médica, Reddit: "sobrepreciados, opiniones pagadas", ciclo fallo 1-2 años, no puede ofrecer procedimientos médicos
  - Right:
    - Estrategia: DTC + suscripción. Influencers, TikTok, UGC, farmacias. Nutracéutico "ciencia". Target jóvenes 20-35.
    - Relación con HC (Pipeline, No Enemigo): 700K × ciclo fallo = pipeline masivo, cuando suplemento no basta → buscan médico, oportunidad contenido "¿Cuándo un suplemento ya no es suficiente?", potencial alianza/referral, no competir — capturar churn
- Fuentes: El Economista, VivaTech, Iris Ventures, olisticscience.com, Reddit

#### Heatmap de Features (Slide 23)
- Tabla 8 features × 7 players (HC + 5 competidores directos):

| Feature | HC | Insparya | Svenson | Capilclinic | Medical Hair | IMD |
|---|---|---|---|---|---|---|
| Tricoscopía digital | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ |
| **Analítica hormonal** | **✅** | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Mesoterapia (HRT) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| PRP (CRT) | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ |
| Medicación oral prescrita | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Protocolo integrado** | **✅** | ⚠️ | ❌ | ❌ | ⚠️ | ❌ |
| Seguimiento crónico | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ |
| Cross-sell cirugía | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

- Key: ✅=Confirmado, ⚠️=Parcial, ❌=No disponible
- "HC es el ÚNICO con stack completo: analítica hormonal + protocolo integrado + seguimiento crónico + cross-sell"

#### Comparativa de Precios COMPLETA (Slide 24) ← REEMPLAZA pricing anterior
- Tabla 9 competidores + Turquía con columnas: **FUE | Consulta | Tratamientos | Modelo pricing**

| Competidor | Precio FUE | Consulta | Tratamientos | Modelo |
|---|---|---|---|---|
| FUEXPERT | ~€10.000 | €250 | — | Premium |
| Insparya | €4.000-6.000 | Gratis | — | Opaco |
| 🏥 **Hospital Capilar (actual)** | **€3.145+** | **Gratis** | **Bono ~€820** | **Publicado** |
| 🏥 **Hospital Capilar (test)** | — | **€195 (test diagnóstico: tricoscopía + analítica hormonal)** | **Bono €820 + €195** | **En prueba** |
| Capilclinic | €2.990-5.990 | Gratis | — | Solo packs |
| Dorsia | ~€4.000 | Gratis | — | Opaco |
| Medical Hair | €2.699-3.600 | Gratis | Meso €70/ses | Low-cost |
| Svenson | — | Gratis | Meso €1.795/8ses | Publicado |
| IMD | desde €2.500 | Gratis | ~€1.200 packs | Opaco |
| *Turquía* | €1.500-2.500 | — | — | Low-cost |

- **Navy box — hipótesis a testear (🔴 requiere decisión):**
  - Título: "🔴 Consulta de pago: ¿€195 como test diagnóstico?"
  - Texto: "Estamos testeando la consulta de €195 como diagnóstico con tricoscopía + analítica hormonal. La hipótesis: filtra pacientes serios y posiciona como servicio médico real. Pero es un TEST — hay que validar con datos si convierte mejor o peor que la consulta gratuita."
  - Warning: "Esto es una prueba. Si no convierte, se revierte."

#### Vulnerabilidades Transversales (Slide 25)
- 4 cards:
  1. Enfoque Comercial Agresivo (Insparya, IMD, Svenson) → HC gana con transparencia
  2. Seguimiento Deficiente Post-Tratamiento → HC diferencia con partnership largo plazo
  3. No Son Médicos (Svenson, IMD, Olistic) → HC: "Médicos de verdad"
  4. Cero Contenido Educacional Serio → HC lidera con contenido médico + autoridad

#### Opportunity Gaps — Detallado (Slides 26-27) ← EXPANDIDO a 2 slides

**Slide 26: Gaps estratégicos (los 3 más grandes)**
- 3 cards grandes con contexto:
  1. **Cuadrante Vacío: Tratamientos como Core Product**
     - Ningún competidor en España ha construido marca + funnel + contenido dedicado a tratamientos no quirúrgicos como producto principal
     - HC ya tiene PMF (+88% sin marketing), margen 90%, y protocolos propios (HRT/CRT)
     - Ventana de oportunidad: Insparya podría pivotar (tienen I+D €2M/año), Svenson se está reestructurando
     - **Acción:** Primer mover advantage — quien capture este cuadrante primero gana 2-3 años de ventaja
  2. **Gap de Confianza del Sector**
     - Reviews negativas MASIVAS en Insparya (3.8 TP), IMD (Reddit devastador), Svenson (OCU)
     - HC tiene 4.8/5 Trustpilot — la mejor reputación del sector
     - **Pero:** 0 reviews de tratamientos, solo cirugía. Hay que construir prueba social específica
     - **Acción:** Programa de reviews tratamientos (30 pacientes → 50+ reviews en 6 meses)
  3. **Demanda Huérfana Post-Turquía/Post-Cirugía**
     - Miles de operados en Turquía (€1.500-2.500) SIN seguimiento médico
     - Pelo nativo sigue cayendo sin tratamiento post-cirugía
     - Operados en Capilclinic, Medical Hair también sin mantenimiento
     - **Acción:** Landing específica "¿Operado y sin seguimiento?" + Google Ads €2K/mes

**Slide 27: Gaps de ejecución (3 más)**
- 3 cards grandes con contexto:
  4. **White Space TOTAL en Contenido Educacional Capilar**
     - TikTok: 0 clínicas con contenido médico-capilar serio en España
     - 0 KOLs (Key Opinion Leaders) capilares — **49% de consumidores compran tras ver tutorial**
     - YouTube: canales de derma genéricos, ninguno especializado en alopecia médica
     - **Acción:** Doctores de HC como KOLs — 3 videos/semana TikTok + Reels (resultados en 3-6 meses)
  5. **Pipeline DTC → Clínica: 700K+ clientes Olistic Science**
     - Olistic Science (marca de suplementos, €27M facturación) tiene 700K+ clientes
     - Ciclo de fallo nutracéutico: 1-2 años → buscan solución médica real
     - Contenido "¿Cuándo un suplemento ya no es suficiente?" captura ese churn
     - **Acción:** SEO + contenido educacional + potencial alianza/referral con Olistic
  6. **Mujer = Mercado Invisible**
     - 40% mujeres españolas con alopecia (9,6M), 75% consultas AP = mujeres
     - 0% del contenido HC dirigido a mujeres, 0 landings, 0 testimonios
     - Competidores: solo IMD tiene algo de foco femenino (pero con modelo estético, no médico)
     - **Acción:** Vertical mujer: "Tu alopecia tiene causa hormonal — tratémosla" — analítica hormonal como diferenciador

#### Validación Competidores (Slide 28) — question-slide
- 7 preguntas:
  1. ¿Coincidís con los DOS mapas de posicionamiento? ¿Falta competidor?
  2. ¿Pacientes mencionan Insparya o Svenson? ¿A quién comparan?
  3. ¿Heatmap features correcto?
  4. ¿Recibís pacientes de otras clínicas insatisfechos? ¿De cuáles?
  5. ¿Precios Svenson e IMD correctos?
  6. ¿Qué valoran MÁS de HC vs competencia?
  7. ¿Las citas de reviews os resuenan? ¿Oís cosas similares?

---

### SECCIÓN 03: NOSOTROS (HC)

#### Divider (Slide 29)
- Section slide navy: "03 — Nosotros (HC)"

#### SEO + RRSS: Fortaleza y Oportunidad (Slide 30) ← NUEVO
- 4 cards grid-4:
  - **6.915%** ROI SEO orgánico — CAC €25 · Conv. 28,8%
  - **213%** ROI Google Ads — CAC €563
  - **164%** ROI Meta Ads — CAC €668
  - **0** Influencers capilares — White space en TikTok [borde dashed rojo]
- Two-col:
  - Left card "🔍 SEO — Arma secreta":
    - Posición 1-3 en keywords de cirugía capilar
    - ROI 6.915%: CAC €25 — **10× mejor que Meta**
    - ⚠️ **Gap:** 'tratamiento capilar' y 'alopecia mujer' = ausentes
  - Right card "📱 RRSS — White space total":
    - TikTok: 0 clínicas con contenido médico-capilar
    - Influencers: 0 KOLs capilares — **49% compran tras tutorial**
    - IG 16K | TikTok 1.5K | YT 813 — todo cirugía

#### El Gap Crítico: 100% Cirugía en Comunicación (Slide 31) ← NUEVO
- Tabla canal × cirugía vs tratamientos:

| Canal | Cirugía | Tratamientos |
|---|---|---|
| Web | 80% | 20% |
| Instagram | 90% | 10% |
| TikTok | 85% | 15% |
| YouTube | 90% | 10% |
| **Landing pages trat.** | — | **0** [ROJO] |
| **Ads tratamientos** | €33K/mes, 100% cirugía | **0** [ROJO] |
| **Contenido mujer** | — | **0** [ROJO] |
| **Testimonios trat.** | — | **0** [ROJO] |

- Navy box: **"💡 La paradoja"** — "**152 tratamientos/mes SIN inversión. Margen 90% vs 40%.** Los tratamientos ya superan a las cirugías en volumen, pero reciben 0% de la inversión en comunicación."

#### Reputación (Slide 32)
- 3 cards: 4.8/5 Trustpilot (75 reviews) | 95% satisfacción trasplantes | +4.000 pacientes
- Two-col:
  - Lo que más valoran: Dr. Pilo/Soto/Leone/Galaviz, comunicación cercana, naturalidad resultados, proceso impecable, soporte completo
  - Tabla Trustpilot: HC 4.8 vs Insparya 3.8 vs Svenson Baja
  - Warning: "100% reviews son de cirugía. Cero reviews de tratamientos."

#### Fortalezas Confirmadas (Slide 33)
- 6 cards grid-3:
  1. Enfoque Médico Genuino — tricoscopía + analítica hormonal + pauta personalizada
  2. PMF Probado: +88% sin Marketing — 971→1.828 tratamientos/año
  3. Margen 90% — tratamientos vs 40% cirugía
  4. Cross-sell Natural — tratamiento → cirugía → mantenimiento
  5. Expansión Financiada — €3,5M Inveready+Trainera, 3→9 clínicas
  6. Transparencia Radical — FAQ "tratamientos NO hacen crecer pelo nuevo"

#### Gaps (Slide 34)
- 6 cards grid-2:
  1. Web 100% Cirugía-First — H1 "expertos en injerto", tratamientos secundarios [RED]
  2. Sin Funnel Dedicado Tratamientos — no landing, no quiz, no paid [RED]
  3. No-Shows Altísimos — Madrid 47%, Murcia 40%, Pontevedra 25% [RED]
  4. Contenido Social = 0% Tratamientos — 100% cirugía, cero reviews [RED]
  5. Gaps Operativos — falta comercial + médico [ORANGE]
  6. Pricing No Público — bonos €820 no en web, sin programa referidos [ORANGE]
- Diagnóstico: "HC tiene producto y reputación, pero NO infraestructura digital ni equipo para capturar mercado tratamientos a escala."

#### Validación Nosotros (Slide 35) — question-slide
- 4 preguntas:
  1. ¿Los doctores estarían dispuestos a hacer contenido en cámara (TikTok/Reels)?
  2. ¿Hay consentimientos firmados de pacientes de tratamiento para testimonios?
  3. ¿Se puede lanzar programa de reviews automatizado (email/SMS post-consulta)?
  4. ¿El dato de €3.5M VC: lo podemos usar en marketing?

---

### SECCIÓN 04: SWOT + ESTRATEGIA

#### Divider (Slide 36)
- Section slide navy: "04 — SWOT + Estrategia"

#### SWOT Overview (Slides 37-38) ← EXPANDIDO a 2 slides con contexto

**Slide 37: Fortalezas y Debilidades (interno)**
- Two-col:
  - Left "✅ Fortalezas" (fondo green claro):
    - **Reputación verificada (4.8/5 Trustpilot)** — La mejor del sector. Insparya 3.8, Svenson baja. Reviews reales, no infladas.
    - **Enfoque médico genuino** — Único con tricoscopía + analítica hormonal + protocolo integrado. Diferenciador estructural.
    - **PMF probado sin marketing (+88%)** — De 971 a 1.828 tratamientos/año sin inversión en marketing de tratamientos. La demanda existe.
    - **Margen 90% tratamientos** — vs 40% cirugía. Cada tratamiento es 2× más rentable por euro.
    - **Cross-sell natural** — 90% de pacientes de tratamiento son operables. Tratamiento → cirugía → mantenimiento = lifecycle completo.
    - **SEO ROI 6.915%** — CAC €25, conversión 28,8%. Canal más eficiente del sector.
    - **Expansión financiada (€3,5M)** — Inveready + Trainera. 3→9 clínicas en 2026.
    - **Protocolos propios (HRT/CRT)** — Inmunes a restricciones de nombres farmacológicos.
  - Right "❌ Debilidades" (fondo red claro):
    - **Web 100% cirugía-first** — H1 "expertos en injerto capilar". Tratamientos enterrados en navegación secundaria.
    - **Sin funnel dedicado tratamientos** — 0 landings, 0 quiz, 0 paid ads. El canal más rentable (SEO) no tiene keywords de tratamientos.
    - **No-shows 47% Madrid** — Casi 1 de cada 2 citas no se presenta. Pérdida directa de capacidad + revenue.
    - **Comunicación 100% cirugía** — Instagram 90%, TikTok 85%, YouTube 90% = todo cirugía. €33K/mes de ads = 100% cirugía.
    - **Cero reviews de tratamientos** — Las 75 reviews Trustpilot son de cirugía. Sin prueba social para tratamientos.
    - **Gaps operativos** — Falta comercial dedicado a tratamientos + capacidad médica en nuevas sedes.
    - **Pricing oculto** — Bonos €820 no publicados en web. Sin programa de referidos activo.

**Slide 38: Oportunidades y Amenazas (externo)**
- Two-col:
  - Left "🔵 Oportunidades" (fondo blue claro):
    - **Cuadrante vacío en tratamientos médicos** — Ningún competidor combina enfoque médico real + tratamientos como producto core. HC puede ser first mover.
    - **Mercado en crecimiento (+12,1%)** — €276M creciendo a 7,05% CAGR. España = mayor prevalencia alopecia en Europa.
    - **Demanda latente: 20M afectados** — Solo 10-15% buscan tratamiento médico. 70% no sabe qué es alopecia areata. Educación = activación.
    - **Pipeline DTC: Olistic Science 700K+ clientes** — Ciclo fallo 1-2 años → buscan solución médica. HC puede capturar ese churn.
    - **TikTok vacío** — 0 clínicas con contenido médico-capilar. 0 KOLs capilares. 49% compran tras tutorial.
    - **Post-Turquía sin seguimiento** — Miles de operados sin mantenimiento. Pelo nativo sigue cayendo.
    - **Ley Sara (sept 2024) positiva** — Eleva barreras de entrada. Favorece a clínicas con médicos reales.
  - Right "⚠️ Amenazas" (fondo yellow claro):
    - **Insparya puede pivotar a tratamientos** — €2M/año I+D, 5 clínicas, marca posicionada. Si lanza línea de tratamientos con CR7, captura mercado rápido.
    - **Consolidación Private Equity** — NK5 Partners compró Svenson (+26% proyectado). Fondos de inversión entrando = más capital, más agresividad.
    - **Regulación publicidad más estricta** — Restricciones antes/después, claims, nombres fármacos. Puede limitar canales de adquisición.
    - **DTC/telemedicina creciendo** — Olistic, Keeps, Hims. Modelo suscripción digital. Captura pacientes antes de que lleguen a clínica.
    - **Turquía low-cost** — €1.500-2.500 FUE. Presión de precios constante en cirugía (menos en tratamientos).
    - **Nuevos fármacos 3-5 años** — PP405, Clascoterone. Pueden cambiar el landscape terapéutico.

#### Estrategias Ofensivas SO (Slide 39)
- 4 cards grid-2:
  - ⭐ SO1: Treatment-First Positioning [ICE 8.7] [HIGHLIGHT] — Landing /tratamientos + pricing
  - SO2: Digital Content Engine [ICE 8.0] — 20 videos testimonios + educativos
  - SO3: Post-Turkey Rescue [ICE 7.0] — Landing + €2K/mes Google Ads
  - SO4: Referral Machine [ICE 7.7] — Programa referidos 17%→30%

#### Estrategias Defensivas + Transformativas (Slide 40)
- Two-col:
  - Defensivas (ST):
    - ST1: Medical Authority Shield [ICE 8.0] — Naming HRT/CRT, compliance
    - ST2: Transparencia vs Venta Agresiva [ICE 7.3] — Pricing público
    - ST3: Escalar Antes de Consolidación [ICE 6.7] — 9 clínicas 2026
  - Transformativas (WO):
    - WO1: Construir Funnel Tratamientos [ICE 8.3] [HIGHLIGHT] — Quiz→Landing→Consulta→Bono
    - WO2: Contenido Social Tratamientos [ICE 8.0] — TikTok 3x/semana
    - WO3: Reducir No-Shows [ICE 7.3] — Secuencia pre-consulta 47%→25%
    - WO4: Reviews de Tratamientos [ICE 8.3] — 30 pacientes, 50+ reviews 6 meses

#### Plan de Acción Priorizado ICE (Slide 41)
- Tabla 6 rows:
  1. Treatment-First Positioning — ICE 8.7 — Landing + pricing
  2. Construir Funnel — ICE 8.3 — Quiz MVP + paid piloto
  3. Reviews Tratamientos — ICE 8.3 — 30 pacientes + solicitud
  4. Digital Content Engine — ICE 8.0 — 20 videos
  5. Contenido Social — ICE 8.0 — 12 posts/mes tratamientos
  6. Medical Authority Shield — ICE 8.0 — Auditoría compliance
- Navy box: Objetivo +€50K/mes incremental 6 meses. Inversión Fase 1: €30-50K.

#### Top 3 Próximas 2 Semanas (Slide 42)
- 3 acciones numeradas con cyan circles:
  1. Lanzar Landing /tratamientos + Quiz — Growth4U + Ramiro, Semana 1-2
  2. Solicitar 30 Reviews Tratamientos — HC Comercial, Semana 1
  3. Grabar 10 Videos Cortos — HC Contenido + Growth4U, Semana 1-2

#### Validación Final (Slide 43) — question-slide
- 7 preguntas:
  1. ¿Falta fortaleza o debilidad?
  2. ¿Acuerdo posicionamiento "Treatment-First"?
  3. ¿Priorización estrategias correcta?
  4. ¿+€50K/mes en 6 meses: ambicioso, realista o conservador?
  5. ¿Riesgos no contemplados?
  6. ¿Decisiones internas pendientes?
  7. ¿Qué segmentos con más potencial?

---

### CIERRE

#### Próximos Pasos (Slide 44)
- Navy box: "Siguiente fase: Definir nichos pacientes prioritarios (ECPs) CON EL EQUIPO"
- 3 cards: Perfil pacientes actuales | Capacidad operativa | Preferencias estratégicas
- "Este es un paso colaborativo"

#### Resumen (Slide 45)
- Section slide navy con 3 líneas:
  - "HC tiene los mejores fundamentals del sector"
  - "El mercado está en crecimiento y el cuadrante está vacío"
  - "Los gaps son de ejecución, no de producto ni mercado"
- Box: "Speed to market es crítico. Capturar el cuadrante antes de que la competencia reaccione."

#### Fuentes (Slide 46)
- Two-col listado 20+ fuentes:
  1-10: Stanpa, Grand View Research, Market Research Future, Mordor Intelligence, Professional Beauty, Medihair, INE, Forbes España, El Confidencial, El Economista
  11-20: Trustpilot, BOE RD 1907/1996, Pfizer España, National Geographic ES, Olistic Science, Reddit, Svenson.es, Redacción Médica, Just One, OCU, Meta Ad Library

---

## NOTAS PARA EL LLM

1. **Cada dato debe tener fuente visible** — usar class `.source` al pie del slide
2. **Preguntas de validación** en slides tipo `.question-slide` con `.validation-box`
3. **No inventar datos** — usar exactamente los proporcionados
4. **Diseño consistente** — usar las CSS classes definidas
5. **Texto conciso** — bullets, no párrafos largos
6. **Battle cards** deben ser todas con el mismo formato two-col (datos+vulnerabilidades | estrategia+cómo ganarles)
7. **Navy boxes** para insights estratégicos clave
8. **Highlight cards** (`.card-highlight`) para lo más importante
9. **Tags** para clasificar: verde=positivo, rojo=negativo, naranja=warning, cyan=oportunidad
10. **Slides NO deben estar sobrecargados** — si hay mucho contenido, dividir en 2 slides
11. **Citas de reviews reales** en battle cards — usar *itálica* para las citas textuales
12. **Leyenda global** — incluir referencia en slide metodología
13. **2 mapas de posicionamiento** separados — uno para Cirugía (mapa lleno) y otro para Tratamientos (HC solo)
14. **Pricing unificado** — tabla con FUE + Consulta + Tratamientos en un solo slide
15. **"La consulta de €195"** es un TEST, no una estrategia confirmada — presentar como hipótesis a validar con datos
16. **"Olistic"** siempre referirse como **Olistic Science** (marca) para evitar confusión con "holístico"
17. **"Educacional"** en vez de "edu" o "educativo" — usar siempre "educacional"
18. **SWOT con contexto** — cada punto del SWOT lleva explicación de 1-2 líneas, no solo bullets sueltos
19. **Opportunity Gaps desarrollados** — cada gap lleva: descripción del problema, dato de soporte, acción concreta
