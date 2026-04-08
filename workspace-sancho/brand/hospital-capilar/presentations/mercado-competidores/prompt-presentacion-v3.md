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

---

## ESTRUCTURA DE SLIDES (33 slides)

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

---

### SECCIÓN 01: EL MERCADO

#### Divider (Slide 3)
- Section slide navy: "01 — El Mercado"

#### España: Epicentro Europeo de la Alopecia (Slide 4)
- 4 cards en grid:
  - 44,5% hombres con alopecia (1º Europa, 2º mundial)
  - 40% mujeres afectadas
  - ~20M españoles afectados (10,4M hombres + 9,6M mujeres)
  - 25% jóvenes 18-24 años con caída activa
- Tabla ranking: España 44,5% > Rep. Checa ~43% > Alemania ~41% > Francia ~39% > Italia ~38%
- Fuente: Medihair 2025, Mundo Farmacéutico, INE 2024, Svenson, This Medical

#### Dimensionamiento del Mercado — TAM (Slide 5)
- Two-col layout:
  - Left: 3 cards stacked:
    - Mercado General Cuidado Capilar España: €2.000M (+8,9% 2024, proyección 2030: €2.520M) — Stanpa, Professional Beauty
    - Tratamientos Pérdida Cabello España: €276M (+12,1% 2024, CAGR 7,05% hasta 2031) — Grand View Research, Mordor Intelligence [HIGHLIGHT]
    - Trasplante Capilar España: €63,8M (CAGR 13,5% → €281M en 2035) — Market Research Future, Just One
  - Right: Navy box cálculo bottom-up:
    - 20M afectados × 10-15% buscan tratamiento = 2-3M clientes potenciales × ARPU €820-1.200/año
    - = €1.640M - €3.600M TAM bottom-up
    - Warning: "Solo 10-15% buscan tratamiento médico hoy. Mercado subdesarrollado."

#### Proyecciones de Crecimiento (Slide 6)
- Tabla: Cuidado capilar profesional €1.705M→€2.520M ~6,8% | Tratamientos pérdida cabello €276M→€370M 4,1-7,05% | Trasplante €63,8M→€180M+ 13,5%
- 3 cards: +12,1% crecimiento tratamientos 2024 | +50% demanda injertos | 7,05% CAGR España (más alto Europa)

#### Segmentos del Mercado (Slide 7)
- 4 cards grid-2:
  1. Tratamientos Médicos No Quirúrgicos [FOCO HC] — €276M+, +12,1%, mesoterapia/PRP/medicación, margen 90%, potencial ALTO
  2. Cirugía / Trasplante Capilar — €63,8M, +13,5%, alto ticket €3K-9K, potencial MUY ALTO
  3. Productos OTC / DTC — ~€200M+, Olistic 700K+, ciclo fallo 2-4 años → pipeline, potencial MEDIO
  4. Servicios Estéticos / Peluquería — parte €1.705M, sin regulación, potencial BAJO-MEDIO

#### Madurez del Mercado (Slide 8)
- Visual indicator: Emergente → [⭐ Crecimiento] → Maduro → Declive
- Tabla evidencia: crecimiento rápido, competencia aumentando, educación en curso, fragmentación alta, innovación activa
- Navy box implicación estratégica: diferenciación, speed to market, category education, foco captura share

#### Perfil de la Demanda del Mercado (Slide 9)
- 3 cards: Hombres jóvenes (20-35) | Mujeres (25-55) | Operados en mantenimiento
- Warning: "Estos son perfiles de demanda del mercado, NO nichos validados para HC"
- Navy box: 70% españoles no sabe qué es alopecia areata. OTC = pipeline.

#### Tendencias Clave (Slide 10)
- Tabla 7 tendencias con dirección, horizonte e impacto HC:
  - Low-dose oral minoxidil — AHORA — Oportunidad
  - Demanda latente crece — AHORA — Oportunidad
  - Regulación publicidad más estricta — 6 meses — Amenaza/Oportunidad
  - Consolidación PE-backed — 1 año — Amenaza
  - DTC/telemedicina — AHORA-1 año — Amenaza (pipeline)
  - Nuevos fármacos (PP405, Clascoterone) — 3 años — Oportunidad futuro
  - Terapias celulares — 2-3 años — Oportunidad futuro

#### Regulación (Slide 11)
- Two-col: Prohibido vs Permitido
  - ❌ Nombres fármacos en ads, "cura calvicie", antes/después Google Ads, influencers endorsing
  - ✅ Protocolos propios HRT/CRT, testimonios reales + disclaimer, contenido educativo, antes/después en RRSS
- Navy box: "HRT y CRT inmunes a restricciones farmacológicas. Regulación más dura = más ventaja HC."
- Fuente: BOE RD 1907/1996, Sanidad.gob.es draft 2024

#### Validación Mercado (Slide 12) — question-slide
- 8 preguntas:
  1. ¿10-15% afectados buscan tratamiento es realista?
  2. ¿ARPU €820-1.200/año es correcto? Ticket medio real?
  3. ¿Cambio en perfil de edad? ¿Más jóvenes?
  4. ¿Pacientes post-Turquía? ¿Cuántos/mes?
  5. ¿Protocolos HRT y CRT llevan esos nombres?
  6. ¿Distribución hombres/mujeres en tratamientos?
  7. ¿Perfiles pacientes más frecuentes?
  8. ¿Motivo consulta más frecuente? ¿El que más ha crecido?

---

### SECCIÓN 02: LOS COMPETIDORES

#### Divider (Slide 13)
- Section slide navy: "02 — Los Competidores"

#### Landscape Competitivo (Slide 14)
- Tabla 7 rows (6 competidores + HC):

| Competidor | Tipo | Clínicas | Facturación | Foco | Reviews | Amenaza |
|---|---|---|---|---|---|---|
| Insparya | Directo | 5 | €20,7M | Cirugía (hero) | 3.8/5 TP | ALTO |
| Svenson | Directo | 31 | €17,4M | Mix (estético) | Baja TP | MEDIO |
| IMD | Directo | **21** | N/D | Estética (mujeres) | Mixtas | MEDIO |
| Medical Hair | Directo | **10+** | N/D | Mix low-cost | 4.9/5 ⚠️ | MEDIO |
| Capilclinic | Directo | 3 (2 ES + 1 TR) | N/D | Cirugía (SEO) | 4.5/5 TP | BAJO |
| Olistic | Indirecto DTC | 0 | **€27M** | Suplemento | Mixtas | BAJO ≈ pipeline |
| 🏥 Hospital Capilar | — | 3 → 9 | — | Tratamientos médicos | **4.8/5 TP** | — |

- Hallazgo clave: "Ningún competidor ha construido marca ESPECÍFICA para tratamientos no quirúrgicos"

#### Mapa de Posicionamiento (Slide 15)
- 2 ejes: Enfoque Médico Riguroso ↔ Enfoque Estético/Cosmético (vertical) × Tratamientos Core ↔ Cirugía Core (horizontal)
- HC en cuadrante superior-izquierdo (Tratamientos + Médico) — ÚNICO, cuadrante vacío highlighted
- Insparya: superior-derecho (Médico + Cirugía)
- Capilclinic: inferior-derecho (Estético + Cirugía)
- Svenson: inferior-izquierdo (Estético + Tratamientos)
- Medical Hair: centro-derecho (Mix + Cirugía)
- IMD: inferior-izquierdo (Estético + Tratamientos)

#### Battle Card: Insparya (Slide 16)
- **Subtítulo:** Líder percibido — €20,7M facturación
- Two-col:
  - Left:
    - Datos: €20,7M 2024 (-13% vs 2023), 5 clínicas, 33.000+ pacientes, 15.000+ trasplantes, I+D €2M/año, Trustpilot 3.8/5, CR7 embajador
    - Vulnerabilidades: enfoque comercial agresivo, seguimiento superficial, falta transparencia precios, "estafadores"/"imagen y humo"
  - Right:
    - Estrategia: "Referente mundial salud capilar" con CR7. Cirugía = hero. Tratamientos complemento. Marketing agresivo Meta/Google.
    - Cómo ganarles: "Tratamiento primero, cirugía si hace falta", transparencia total, seguimiento tricoscopía 3 meses, competir en tratamientos no cirugía
- Fuentes: El Confidencial, Trustpilot, Google Reviews, análisis Lens 3

#### Battle Card: Svenson (Slide 17)
- **Subtítulo:** Red más amplia — €17,4M — Post-reestructuración
- Two-col:
  - Left:
    - Datos: €17,4M 2024, 31 centros 25 provincias, proyecta +26% 2025 (NK5), pricing €1.795-2.695, Trustpilot baja, 54 años en España
    - Vulnerabilidades: NO son médicos = esteticistas, post-concurso acreedores, tratamientos no cumplen, reclamaciones OCU, instalaciones antiguas
  - Right:
    - Estrategia: "Líder europeo salud capilar", marca histórica, mix cirugía+tratamientos+estética, diagnóstico gratuito → venta agresiva
    - Cómo ganarles: "Médicos de verdad", tricoscopía+analítica vs cosmético, centro moderno vs anticuado, HC €820 vs Svenson €1.295-2.695
- Fuentes: El Economista, OCU, svenson.es

#### Battle Card: Capilclinic (Slide 18)
- **Subtítulo:** SEO King — España + Turquía
- Two-col:
  - Left:
    - Datos: Facturación N/D, 3 clínicas (Madrid, Barcelona + Estambul/Florence Nightingale), Trustpilot 4.5/5 (180 reviews), FUE Zafiro/DHI/Min Time FUE, packs €2.990-5.990, SEO fortísimo
    - Vulnerabilidades: NO vende tratamientos standalone, meso solo en Pack Gold/XL, sin protocolo médico independiente, modelo low-cost tipo Turquía, sin analítica hormonal
  - Right:
    - Estrategia: SEO-first + pricing competitivo. "Cirugía accesible calidad europea". Modelo dual España-Turquía. Tratamientos = add-on post-quirúrgico.
    - Cómo ganarles: NO compite en tratamientos (mundos separados), HC captura ANTES de cirugía, operados Capilclinic necesitan mantenimiento → oportunidad, competir en SEO keywords tratamientos (vacías)
- Fuentes: capilclinic.es, Trustpilot

#### Battle Card: Medical Hair (Slide 19)
- **Subtítulo:** Red nacional expansiva — 10+ sedes — Low-cost
- Two-col:
  - Left:
    - Datos: Facturación N/D, 10+ sedes (Madrid, BCN, Valencia, Zaragoza, Murcia, Vigo, A Coruña, San Sebastián, Benidorm, Bilbao), Reviews 4.9/5 (1.570+) ⚠️ dudas autenticidad, +25 años, mesoterapia €70/sesión (outlier bajo), injerto FUE desde €2.990
    - Vulnerabilidades: €70/sesión = menor calidad/personalización, dudas autenticidad reviews, alta rotación personal, sin analítica hormonal, modelo satélite = dilución calidad
  - Right:
    - Estrategia: Cobertura geográfica agresiva + pricing competitivo. Consulta gratuita + financiación. Mix cirugía + tratamientos. FUE Zafiro + fórmulas personalizadas.
    - Cómo ganarles: "Calidad médica > precio bajo", protocolo HRT/CRT con seguimiento vs genérico, reputación verificable (HC 4.8 auténtico vs 4.9 dudoso), especialización > generalismo
- Fuentes: medicalhair.es, Trustindex.io, foroalopecia.com

#### Battle Card: IMD (Slide 20)
- **Subtítulo:** Red estética masiva — 21 clínicas — Foco femenino
- Two-col:
  - Left:
    - Datos: Facturación N/D, 21 clínicas (Madrid, BCN, Valencia, Sevilla, Murcia, Oviedo, Bilbao, Alicante, Málaga, Mallorca, Valladolid, Córdoba, Vigo), 260.000+ pacientes, 300+ estudios, tratamientos €1.200-2.000, injerto desde €2.500
    - Vulnerabilidades: NO son médicos = enfoque estético (láser, ozono, radiofrecuencia), sin analítica hormonal, Reddit: "Láser + vitaminas por €1.200; dermatólogo lo resolvió por €120", Trustpilot: paciente €2.000 sin resultados, ex-empleado: "función principal era comercial", alta rotación
  - Right:
    - Estrategia: Red más amplia sector (21). Diagnóstico gratuito → venta presencial agresiva. Mix estético. Foco mujeres. Prótesis/integración capilar.
    - Cómo ganarles: "Médicos de verdad" analítica hormonal REAL, tratamiento causa vs síntoma, precio justo (HC €820 vs IMD €1.200-2.000), transparencia vs venta agresiva, captar mujeres: "Tu alopecia tiene causa hormonal — tratémosla"
- Fuentes: imdermatologico.com, Reddit r/askspain, Trustindex.io, ex-empleados

#### Battle Card: Olistic (Slide 21)
- **Subtítulo:** DTC Giant — €27M facturación — Pipeline, NO enemigo
- Two-col:
  - Left:
    - Datos: €27M facturación 2023, Serie A €6M (Iris Ventures 2022), 700.000+ clientes, #1 farmacias España, Top 100 Rising European Startups 2025 (VivaTech), BeautyMatter Future50 2026, suscripción €30-60/mes, TikTok #OlisticHair 10M+ views
    - Limitaciones (no vulnerabilidades): no trata causa, sin supervisión médica, Reddit: "sobrepreciados, opiniones pagadas", ciclo fallo 1-2 años, no puede ofrecer procedimientos médicos
  - Right:
    - Estrategia: DTC + suscripción. Influencers, TikTok, UGC, farmacias. Nutracéutico "ciencia". Target jóvenes 20-35.
    - Relación con HC (Pipeline, No Enemigo): 700K × ciclo fallo = pipeline masivo, cuando suplemento no basta → buscan médico, oportunidad contenido "¿Cuándo un suplemento ya no es suficiente?", potencial alianza/referral, no competir — capturar churn
- Fuentes: El Economista, VivaTech, Iris Ventures, olisticscience.com, Reddit

#### Heatmap de Features (Slide 22)
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

#### Landscape de Pricing (Slide 23)
- Tabla comparativa 6 clínicas × pricing mesoterapia/PRP/bonos/modelo:

| Clínica | Meso/sesión | Bono meso | PRP/sesión | Bono PRP | Modelo |
|---|---|---|---|---|---|
| 🏥 HC | ~€205 | €820/4 ses HRT | ~€205 | €820/4 ses CRT | Publicado |
| Insparya | ⚠️ €150-300 | No publicado | ⚠️ €150-300 | No publicado | Opaco |
| Svenson | €224/ses | €1.795/8 ses | Incluido | Neovital €2.695, 360Complete €1.295 | Publicado |
| Capilclinic | — | Solo paquetes cirugía | — | Solo paquetes cirugía | No vende standalone |
| Medical Hair | €70/ses | No publicado | No publicado | No publicado | Sesión suelta |
| IMD | ⚠️ €150-300 | ⚠️ ~€1.200 | ⚠️ €150-300 | No publicado | Opaco |

- Referencia mercado: PRP €150-300/ses, bonos 3 PRP €420-540, 5 PRP+Dut €950-1.150
- 2 cards: Ventaja HC pricing transparente + Oportunidad publicar bonos en web

#### Vulnerabilidades Transversales (Slide 24)
- 4 cards:
  1. Enfoque Comercial Agresivo (Insparya, IMD, Svenson) → HC gana con transparencia
  2. Seguimiento Deficiente Post-Tratamiento → HC diferencia con partnership largo plazo
  3. No Son Médicos (Svenson, IMD, Olistic) → HC: "Médicos de verdad"
  4. Cero Contenido Educativo Serio → HC lidera con contenido médico + autoridad

#### Opportunity Gaps (Slide 25)
- 6 cards:
  1. Tratamientos como Core Product [CUADRANTE VACÍO] — primer mover advantage
  2. Gap de Confianza [DIFERENCIACIÓN] — HC 4.8/5 vs sector criticado
  3. Post-Turquía Sin Seguimiento [DEMANDA HUÉRFANA] — miles sin mantenimiento
  4. Contenido Educativo Serio = Cero [AUTORIDAD] — espacio vacío TikTok/Reels
  5. Pipeline DTC → Clínica [700K+ CLIENTES] — Olistic churn
  6. Diagnóstico Accesible [LOW BARRIER] — HC €50-195 vs Svenson €595, IMD €1.200

#### Validación Competidores (Slide 26) — question-slide
- 6 preguntas:
  1. ¿Coincidís con mapa posicionamiento? ¿Falta competidor?
  2. ¿Pacientes mencionan Insparya o Svenson? ¿A quién comparan?
  3. ¿Heatmap features correcto?
  4. ¿Recibís pacientes de otras clínicas insatisfechos? ¿De cuáles?
  5. ¿Precios Svenson e IMD correctos?
  6. ¿Qué valoran MÁS de HC vs competencia?

---

### SECCIÓN 03: NOSOTROS (HC)

#### Divider (Slide 27)
- Section slide navy: "03 — Nosotros (HC)"

#### Reputación (Slide 28)
- 3 cards: 4.8/5 Trustpilot (75 reviews) | 95% satisfacción trasplantes | +4.000 pacientes
- Two-col:
  - Lo que más valoran: Dr. Pilo/Soto/Leone/Galaviz, comunicación cercana, naturalidad resultados, proceso impecable, soporte completo
  - Tabla Trustpilot: HC 4.8 vs Insparya 3.8 vs Svenson Baja
  - Warning: "100% reviews son de cirugía. Cero reviews de tratamientos."

#### Fortalezas Confirmadas (Slide 29)
- 6 cards grid-3:
  1. Enfoque Médico Genuino — tricoscopía + analítica hormonal + pauta personalizada
  2. PMF Probado: +88% sin Marketing — 971→1.828 tratamientos/año
  3. Margen 90% — tratamientos vs 40% cirugía
  4. Cross-sell Natural — tratamiento → cirugía → mantenimiento
  5. Expansión Financiada — €3,5M Inveready+Trainera, 3→9 clínicas
  6. Transparencia Radical — FAQ "tratamientos NO hacen crecer pelo nuevo"

#### Gaps (Slide 30)
- 6 cards grid-2:
  1. Web 100% Cirugía-First — H1 "expertos en injerto", tratamientos secundarios [RED]
  2. Sin Funnel Dedicado Tratamientos — no landing, no quiz, no paid [RED]
  3. No-Shows Altísimos — Madrid 47%, Murcia 40%, Pontevedra 25% [RED]
  4. Contenido Social = 0% Tratamientos — 100% cirugía, cero reviews [RED]
  5. Gaps Operativos — falta comercial + médico [ORANGE]
  6. Pricing No Público — bonos €820 no en web, sin programa referidos [ORANGE]
- Diagnóstico: "HC tiene producto y reputación, pero NO infraestructura digital ni equipo para capturar mercado tratamientos a escala."

#### Validación Nosotros (Slide 31) — question-slide
- 7 preguntas:
  1. ¿+88% crecimiento correcto y actualizado?
  2. ¿No-shows 47% Madrid siguen igual?
  3. ¿Cuántos tratamientos/mes ahora? ¿Capacidad máxima?
  4. ¿% recomendación vs búsqueda propia?
  5. ¿Ya hay comercial dedicado tratamientos?
  6. ¿Acuerdo publicar precios bonos web?
  7. ¿Razón principal no-shows?

---

### SECCIÓN 04: SWOT + ESTRATEGIA

#### Divider (Slide 32)
- Section slide navy: "04 — SWOT + Estrategia"

#### SWOT Overview (Slide 33)
- Grid 2×2 colores:
  - **Fortalezas (green):** Reputación 4.8/5, enfoque médico, PMF +88%, margen 90%, cross-sell 90% operables, €3,5M expansión, protocolos HRT/CRT, transparencia radical
  - **Debilidades (red):** Web cirugía-first, sin funnel, no-shows 47%, falta comercial+médico, social 0% tratamientos, cero reviews, pricing oculto, sin referidos
  - **Oportunidades (blue):** Cuadrante vacío, mercado +12,1%, 20M afectados, demanda latente, pipeline DTC 700K, TikTok vacío, post-Turquía, gap confianza
  - **Amenazas (yellow):** Insparya lanza tratamientos, regulación publicidad, consolidación PE, DTC/telemedicina, nuevos fármacos 3-5 años, Turquía low-cost, restricciones Google Ads, price sensitivity

#### Estrategias Ofensivas SO (Slide 34)
- 4 cards grid-2:
  - ⭐ SO1: Treatment-First Positioning [ICE 8.7] [HIGHLIGHT] — Landing /tratamientos + pricing
  - SO2: Digital Content Engine [ICE 8.0] — 20 videos testimonios + educativos
  - SO3: Post-Turkey Rescue [ICE 7.0] — Landing + €2K/mes Google Ads
  - SO4: Referral Machine [ICE 7.7] — Programa referidos 17%→30%

#### Estrategias Defensivas + Transformativas (Slide 35)
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

#### Plan de Acción Priorizado ICE (Slide 36)
- Tabla 6 rows:
  1. Treatment-First Positioning — ICE 8.7 — Landing + pricing
  2. Construir Funnel — ICE 8.3 — Quiz MVP + paid piloto
  3. Reviews Tratamientos — ICE 8.3 — 30 pacientes + solicitud
  4. Digital Content Engine — ICE 8.0 — 20 videos
  5. Contenido Social — ICE 8.0 — 12 posts/mes tratamientos
  6. Medical Authority Shield — ICE 8.0 — Auditoría compliance
- Navy box: Objetivo +€50K/mes incremental 6 meses. Inversión Fase 1: €30-50K.

#### Top 3 Próximas 2 Semanas (Slide 37)
- 3 acciones numeradas con cyan circles:
  1. Lanzar Landing /tratamientos + Quiz — Growth4U + Ramiro, Semana 1-2
  2. Solicitar 30 Reviews Tratamientos — HC Comercial, Semana 1
  3. Grabar 10 Videos Cortos — HC Contenido + Growth4U, Semana 1-2

#### Validación Final (Slide 38) — question-slide
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

#### Próximos Pasos (Slide 39)
- Navy box: "Siguiente fase: Definir nichos pacientes prioritarios (ECPs) CON EL EQUIPO"
- 3 cards: Perfil pacientes actuales | Capacidad operativa | Preferencias estratégicas
- "Este es un paso colaborativo"

#### Resumen (Slide 40)
- Section slide navy con 3 líneas:
  - "HC tiene los mejores fundamentals del sector"
  - "El mercado está en crecimiento y el cuadrante está vacío"
  - "Los gaps son de ejecución, no de producto ni mercado"
- Box: "Speed to market es crítico. Capturar el cuadrante antes de que la competencia reaccione."

#### Fuentes (Slide 41)
- Two-col listado 20+ fuentes:
  1-10: Stanpa, Grand View Research, Market Research Future, Mordor Intelligence, Professional Beauty, Medihair, INE, Forbes España, El Confidencial, El Economista
  11-20: Trustpilot, BOE RD 1907/1996, Pfizer España, National Geographic ES, Olistic Science, Reddit, Svenson.es, Redacción Médica, Just One, OCU

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
