<!-- version: 1 | fecha: 2026-03-04 | autor: Sancho | status: draft -->

# Quiz Diagnóstico Capilar — Arquitectura v1
> Hospital Capilar | Tratamientos | MOFU → Evergreen Funnel

---

## Filosofía

**Todo es hipótesis hasta que los datos digan lo contrario.**

El quiz es el inicio de un embudo evergreen — no cierra la venta, cualifica + captura + activa secuencias personalizadas. La conversión real ocurre post-quiz (página resultado + email sequence + deadline).

---

## Arquitectura General

```
[Tráfico] → [Quiz 5-6 preguntas ~90s] → [Captura datos] → [Página resultado por ECP]
                                                                    ↓
                                                          [Secuencia email x ECP]
                                                          [Deadline Funnel 72h]
                                                          [Retargeting por segmento]
```

---

## LAS PREGUNTAS

### Q1: Sexo
> **"¿Cuál es tu sexo?"**

| Opción | Tag |
|--------|-----|
| Hombre | `sexo:hombre` |
| Mujer | `sexo:mujer` |

**Por qué**: Bifurca todo el flujo. Los problemas, el messaging, los ECPs y las objeciones son completamente distintos entre hombre y mujer.

---

### Q2: Edad
> **"¿Cuántos años tienes?"**

| Opción | Tag |
|--------|-----|
| 18-25 | `edad:18-25` |
| 26-35 | `edad:26-35` |
| 36-45 | `edad:36-45` |
| 46-55 | `edad:46-55` |
| 56+ | `edad:56+` |

**Por qué**: Determina ECP (joven asustado vs adulto), messaging (madre paga vs decide solo), y criterio médico (candidatura a cirugía, tratamiento hormonal).

---

### Q3: ¿Qué te preocupa? (condicional por sexo)
> **"¿Cuál es tu principal preocupación con tu pelo?"**

**Si HOMBRE:**

| Opción | Tag | ECP candidato |
|--------|-----|---------------|
| Se me cae el pelo / pierdo densidad | `problema:caida-densidad` | ECP1 o ECP3 |
| Las entradas retroceden | `problema:entradas` | ECP1 o ECP3 |
| Me operé y el pelo sigue cayendo | `problema:post-cirugia` | ECP5 |
| Tuve mala experiencia en otra clínica | `problema:mala-experiencia` | ECP4 |
| Problemas en el cuero cabelludo (caspa, granos, irritación) | `problema:cuero-cabelludo` | DERIVACIÓN |

**Si MUJER:**

| Opción | Tag | ECP candidato |
|--------|-----|---------------|
| Noto que pierdo densidad / se me ve el cuero cabelludo | `problema:densidad-mujer` | ECP2 |
| Se me cae desde el embarazo / parto | `problema:postparto` | ECP6 |
| Creo que es hormonal (tiroides, ovarios, menopausia) | `problema:hormonal` | ECP2 |
| Se me cae por estrés y no para | `problema:estres` | ECP2 |
| Problemas en el cuero cabelludo (caspa, granos, irritación) | `problema:cuero-cabelludo` | DERIVACIÓN |

**Por qué**: Identifica el ECP primario. La opción "cuero cabelludo" filtra casos no tratables por HC (dermatológicos) — pero capturamos el lead igualmente.

---

### Q4: Tiempo con el problema
> **"¿Hace cuánto notas este problema?"**

| Opción | Tag | Señal |
|--------|-----|-------|
| Menos de 3 meses | `tiempo:<3m` | Temprano / posible efluvio temporal |
| 3-12 meses | `tiempo:3-12m` | Activo, buscando solución |
| 1-3 años | `tiempo:1-3a` | Crónico, frustrado |
| Más de 3 años | `tiempo:3a+` | Muy crónico, máxima frustración |

**Por qué**: Combinar con Q5 determina urgencia y frustración. Más tiempo + más intentos fallidos = score más alto.

---

### Q5: ¿Qué has probado? (multi-select)
> **"¿Qué has probado hasta ahora? (puedes marcar varias)"**

| Opción | Tag | Señal |
|--------|-----|-------|
| Nada todavía | `probado:nada` | Temprano en el journey |
| Champú anticaída / suplementos (Pilexil, Olistic, biotina...) | `probado:otc` | Nivel 1, probablemente frustrado |
| Minoxidil | `probado:minoxidil` | Nivel 2 — señal fuerte ECP1 |
| Finasteride / Dutasteride | `probado:finasteride` | Nivel 3 — informado, posibles side effects |
| Tratamientos en clínica (PRP, mesoterapia, láser...) | `probado:clinica` | Ya invirtió €€€ |
| Trasplante capilar | `probado:trasplante` | ECP5 directo |
| Otro tratamiento médico | `probado:otro` | Catch-all |

**Por qué**: La combinación de Q4 + Q5 es el indicador más fuerte de intent y frustración. Alguien que lleva 2 años con minoxidil sin resultado es un lead caliente.

---

### Q6: Captura de datos
> **"Para enviarte tu diagnóstico personalizado y las opciones que tenemos para ti:"**

| Campo | Obligatorio |
|-------|:-----------:|
| Nombre | ✅ |
| Email | ✅ |
| Teléfono | ✅ |
| ¿Cerca de qué clínica te queda mejor? | ✅ |

**Opciones de ubicación:**
- Madrid
- Murcia
- Pontevedra
- A Coruña *(próxima apertura)*
- Móstoles *(próxima apertura)*
- Albacete *(próxima apertura)*
- Valladolid *(próxima apertura)*
- Burgos *(próxima apertura)*
- Valencia *(próxima apertura)*
- Otra ciudad

**Por qué**: Captura DESPUÉS de las preguntas de engagement (commitment & consistency bias — ya invirtió tiempo, no quiere perderlo). El teléfono es crítico por el modelo de call center de HC.

---

## LÓGICA DE SEGMENTACIÓN (Decision Tree)

### Paso 1: Detectar ECP

```
SI problema = cuero-cabelludo → DERIVACIÓN DERMATOLÓGICA
SI problema = post-cirugia O probado incluye trasplante → ECP5 "Post-Cirugía Sin Plan"
SI problema = mala-experiencia → ECP4 "Quemado por Clínicas"
SI sexo = mujer Y problema = postparto → ECP6 "Mujer Postparto"
SI sexo = mujer Y (problema = hormonal O densidad-mujer O estres) → ECP2 "Mujer Hormonal"
SI sexo = hombre Y edad = 18-25 Y probado = nada O otc → ECP3 "Joven Asustado"
SI sexo = hombre Y probado incluye minoxidil O finasteride → ECP1 "Frustrado del Minoxidil"
SI sexo = hombre Y (problema = caida-densidad O entradas) → ECP1 (default hombre)
ELSE → ECP1 (fallback)
```

### Paso 2: Calcular Lead Score

| Factor | Puntos |
|--------|--------|
| Tiempo >1 año | +20 |
| Tiempo >3 años | +30 |
| Probó minoxidil/finasteride | +15 |
| Probó tratamientos en clínica | +20 |
| Probó trasplante | +25 |
| Mujer + hormonal | +15 |
| Edad 26-45 (sweet spot económico) | +10 |
| Ubicación = clínica operativa | +15 |
| Ubicación = próxima apertura | +5 |
| Ubicación = otra ciudad | -20 |
| Nada probado + <3 meses | -15 |

**Score ranges:**
- **HOT (60+)**: Ruta directa a CTA de conversión
- **WARM (30-59)**: Ruta con educación + CTA
- **COLD (0-29)**: Ruta de nurturing largo
- **GEOGRAPHIC OUT (<0)**: Waitlist

### Paso 3: Asignar Destino

| ECP | Score | Destino | CTA Principal |
|-----|-------|---------|---------------|
| ECP1 Frustrado | HOT | Consulta €195 | "Reserva tu diagnóstico integral — por fin sabrás qué te pasa y qué funciona para TU caso" |
| ECP1 Frustrado | WARM | Llamada + Nurturing | "Te llamamos para explicarte cómo funciona nuestro diagnóstico" |
| ECP2 Mujer Hormonal | HOT | Consulta €195 | "Tu pelo habla de tu salud. Nuestro diagnóstico incluye analítica hormonal completa" |
| ECP2 Mujer Hormonal | WARM | Llamada | "Hablemos — te explicamos cómo cruzamos tu historial hormonal con tu pelo" |
| ECP3 Joven Asustado | HOT | Llamada | "Habla con nuestro equipo — te explicamos si es momento de actuar o de esperar" |
| ECP3 Joven Asustado | WARM/COLD | Nurturing | "Te enviamos una guía con todo lo que necesitas saber sobre la caída en tus 20s" |
| ECP4 Quemado | HOT | Llamada | "Sabemos que has tenido una mala experiencia. Te escuchamos sin compromiso" |
| ECP4 Quemado | WARM | Nurturing trust | "Lee cómo trabajamos — sin presión, sin sorpresas, sin consultas gratis disfrazadas de venta" |
| ECP5 Post-Cirugía | HOT | Bono directo / Consulta | "Tu inversión quirúrgica necesita un plan de mantenimiento. Consulta + plan desde €195" |
| ECP5 Post-Cirugía | WARM | Llamada | "Te explicamos cómo proteger los resultados de tu trasplante" |
| ECP6 Postparto | HOT | Consulta €195 | "¿Es efluvio temporal o algo más? Solo un diagnóstico puede decírtelo" |
| ECP6 Postparto | WARM | Nurturing | "El 50% de madres pierde pelo postparto. Te explicamos cuándo preocuparse y cuándo no" |
| DERIVACIÓN | Cualquiera | Contenido + derivación | "Tu caso parece dermatológico. Te recomendamos visitar un dermatólogo, pero aquí tienes info útil" |
| GEOGRÁFICO OUT | Cualquiera | Waitlist | "Aún no estamos en tu ciudad, pero estamos abriendo 6 clínicas en 2026. Apúntate para ser el primero" |

---

## SUPUESTOS MÉDICOS (hipótesis a validar con equipo HC)

| # | Supuesto | Base | Riesgo si es falso | Cómo validar |
|---|----------|------|--------------------| -------------|
| S1 | Problemas de cuero cabelludo (caspa, dermatitis, granos) = NO apto para tratamiento HC, es dermatológico | Dato de Discovery (Óscar): "no habría posibilidad de venta cruzada" | Perdemos leads que SÍ podrían beneficiarse de consulta | Preguntar al equipo médico: ¿algún caso de cuero cabelludo que SÍ derive en tratamiento HC? |
| S2 | Alopecia areata y frontal fibrosante = NO cross-sell a tratamiento, pero SÍ interesa la consulta €195 | Dato Discovery: "nos interesa que paguen la consulta médica para diagnóstico" | Routing erróneo — no las detectamos en el quiz (son diagnósticos médicos) | No filtrar en quiz — el médico lo determina en consulta. El quiz no puede diagnosticar esto |
| S3 | Mujer postparto = SIEMPRE a consulta (puede ser efluvio temporal O AGA subyacente revelada) | Práctica médica estándar + dato HC: mujeres = 40-50% de tratamientos | Mandar a nurturing a alguien que necesita atención → pierde pelo innecesariamente | El quiz ruta a consulta si >6 meses postparto; a nurturing si <3 meses |
| S4 | Mujeres con problema hormonal = producto estrella de HC, zero competencia | Niche discovery v1: "NADIE posiciona para mujer en España" + HC ya hace 40%+ tratamientos en mujeres | Que un competidor lance antes y capture el mercado | Velocidad de ejecución — lanzar messaging mujer ASAP |
| S5 | Hombre joven 18-25 = madre influye/decide → messaging debe incluir a la madre | Dato Discovery: "en hombres jóvenes, la madre influye y decide" | Messaging solo al joven, madre no ve valor → no convierte | Testear: secuencia con contenido "para compartir con tu familia" vs sin |
| S6 | €195 es el precio correcto para consulta diagnóstica | Dato HC: precio actual. Gerardo quiere testear €195/€100/€50 | Precio demasiado alto = baja conversión. Precio bajo = percepción no-premium | A/B test precio en Variante B del quiz |
| S7 | Post-cirugía (operados en Turquía o competidores) = alta disposición a pagar | Niche discovery: "ahorro inicial → coste mayor a largo plazo" | Que esperen "consulta gratis" como en su clínica anterior | Testear: bono mantenimiento directo vs consulta €195 primero |
| S8 | "Quemados por clínicas" necesitan trust antes de booking — la llamada convierte mejor que booking directo | Lógica: desconfianza alta + reviews obsesivos | Que la llamada sea percibida como "otra clínica que me va a presionar" | Testear: llamada con script de escucha vs booking directo con social proof heavy |
| S9 | Ubicación = factor eliminatorio (no se desplazan fuera de zona) | Dato Discovery: "los que estén fuera de ubicaciones objetivo no están dispuestos a desplazarse" | Perder leads de ciudades medianas que SÍ viajarían a Madrid | Testear: ofrecer teleconsulta/videoconsulta a "otra ciudad" |
| S10 | Captura de datos después de las preguntas (no al inicio) convierte mejor | Principio psicológico: commitment & consistency (Cialdini) | Que la gente abandone en Q3-Q4 sin haber dejado datos | Testear: email en Q2 (early gate) vs Q6 (late gate) |

---

## POST-QUIZ: Páginas de Resultado por ECP

Cada ECP recibe una página de resultado única con:

### Estructura común:
1. **Headline personalizado** con el "diagnóstico" del quiz
2. **Validación**: "No eres el único — X% de personas con tu perfil..."
3. **El problema real** (educación — por qué lo que probaste no funcionó)
4. **La solución HC** (USPs relevantes para ese ECP)
5. **Prueba social** específica (reviews, dato, caso de éxito)
6. **CTA principal** (según destino asignado)
7. **CTA secundario** (opción de menor compromiso)
8. **Deadline** (temporizador personalizado si aplica)

### Ejemplo — ECP1 "Frustrado del Minoxidil":

> **"Tu perfil: llevas [X tiempo] luchando contra la caída con [lo que probaste]. El problema no es tu pelo — es que nadie te ha diagnosticado correctamente."**
>
> El 40-60% de personas no responden a minoxidil. Llevas [tiempo] probando algo que puede que nunca funcione para tu caso. ¿Por qué? Porque nadie te ha hecho una tricoscopía + analítica hormonal para saber QUÉ tipo de alopecia tienes.
>
> **En Hospital Capilar diagnosticamos la causa real en 1 sesión:**
> - Tricoscopía (microscopio capilar)
> - Analítica hormonal completa
> - 30 minutos con tu médico (siempre el mismo)
> - Pauta de tratamiento personalizada
>
> **Todo por €195.** Has gastado más que eso en productos que no funcionan.
>
> ⭐ Trustpilot 4.8/5 · +4.500 pacientes · Mismo médico siempre
>
> [CTA: RESERVA TU DIAGNÓSTICO — €195]
> [CTA secundario: Prefiero que me llaméis primero]

### Ejemplo — ECP6 "Mujer Postparto":

> **"Lo que te pasa tiene nombre: efluvio telógeno postparto. Pero la pregunta importante es si es solo eso o hay algo más."**
>
> El 50% de madres pierde pelo después del parto. En la mayoría de casos es temporal. Pero en algunos, el embarazo revela una alopecia subyacente que necesita tratamiento.
>
> Solo un diagnóstico médico con analítica hormonal puede diferenciarlos. Y cuanto antes lo sepas, antes puedes actuar.
>
> **Nuestro diagnóstico incluye analítica hormonal** — la pieza que tu ginecólogo y tu dermatólogo no cruzan.
>
> [CTA: RESERVA TU DIAGNÓSTICO — €195]
> [CTA secundario: Quiero saber más antes de decidir]

---

## POST-QUIZ: Secuencias de Email por ECP

Cada ECP tiene su propia secuencia de 5-7 emails activada al completar el quiz.

### Estructura común (5 emails en 7 días):

| Día | Email | Objetivo |
|-----|-------|----------|
| 0 (inmediato) | "Tu diagnóstico + qué significa" | Valor + primer CTA |
| 1 | "Por qué [lo que probaste] no funcionó" | Educación + reframe |
| 3 | "Caso real: [paciente similar a ti]" | Social proof específica |
| 5 | "Las 3 objeciones que seguro tienes" | Manejo de objeciones |
| 7 | "Última oportunidad: [oferta con deadline]" | Urgencia + cierre |

### Secuencias específicas:

**ECP1 "Frustrado"**: Minoxidil no funciona para todos → Por qué necesitas diagnóstico → Caso: "2 años con minoxidil, en 1 consulta cambiaron mi plan" → Objeciones: precio, tiempo, "otro más que me vende" → Deadline

**ECP2 "Mujer Hormonal"**: Tu pelo habla de tu salud → Por qué tu dermatólogo no conecta los puntos → Caso: mujer hormonal diagnosticada correctamente → Objeciones: "es cosa de hombres", "ya fui a 3 médicos" → Deadline

**ECP3 "Joven Asustado"**: ¿Es momento de preocuparse? (gancho: SÍ) → Qué pasa si esperas vs actúas ahora → Contenido "para compartir con tu familia" → Objeciones: "soy muy joven", precio → Guía descargable (sin deadline — nurture largo)

**ECP4 "Quemado"**: Entendemos tu desconfianza → Por qué nuestra consulta NO es una venta disfrazada → Reviews reales de pacientes que vinieron de [competidor] → Objeciones: "todas son iguales", precio → Invitación a llamar sin compromiso

**ECP5 "Post-Cirugía"**: Tu trasplante necesita un plan → Qué pasa sin mantenimiento (datos) → Caso: paciente post-Turquía con plan integral → Objeciones: "ya gasté mucho", "mi clínica debería cubrirlo" → Oferta bono mantenimiento

**ECP6 "Postparto"**: Efluvio vs AGA: la diferencia importa → Por qué "ya pasará" no siempre es verdad → Caso: madre que descubrió AGA subyacente → Objeciones: lactancia, tiempo, "es normal" → Deadline consulta

---

## QUÉ TESTEAR Y EN QUÉ ORDEN (priorizado por impacto)

| # | Hipótesis | Test | Métrica | Prioridad |
|---|-----------|------|---------|-----------|
| **H1** | Quiz corto (5 preguntas) tiene mayor tasa de completado que largo (8+) | A/B: 5 pregs vs 8 pregs | Completion rate | 🔴 P0 — testear primero |
| **H2** | Captura email en Q3 (early gate) recupera más leads que en Q6 (late gate) | A/B: early vs late | Leads capturados totales | 🔴 P0 |
| **H3** | Página de resultado personalizada por ECP convierte más que genérica | A/B: 6 páginas resultado vs 1 genérica | CTA click rate | 🔴 P0 |
| **H4** | Deadline personalizado 72h post-quiz aumenta booking de consulta | A/B: con deadline vs sin deadline | Consultas reservadas en 72h | 🟡 P1 |
| **H5** | Secuencia email por ECP convierte más que secuencia genérica | A/B: segmentada vs genérica | Email → consulta conversion | 🟡 P1 |
| **H6** | Precio consulta €195 vs €100 vs gratis afecta calidad del lead (no-show, conversión a bono) | A/B/C: 3 precios | No-show rate + conversión consulta→bono | 🟡 P1 |
| **H7** | Llamada comercial convierte mejor que booking directo para ECP4 (quemados) | A/B: CTA "te llamamos" vs "reserva" | Consultas realizadas | 🟢 P2 |
| **H8** | Para ECP3 (joven), contenido "para compartir con tu familia" acelera la decisión | A/B: email con bloque madre vs sin | Time to conversion | 🟢 P2 |
| **H9** | Videoconsulta para leads fuera de zona geográfica genera revenue | Piloto: ofrecer videoconsulta a "otra ciudad" | Revenue + conversion rate | 🟢 P2 |
| **H10** | Pre-quiz video (30s) de médico HC aumenta trust y completado del quiz | A/B: con video intro vs sin | Completion rate + lead quality | 🟢 P2 |

---

## TRACKING (eventos GTM para GA4)

| Evento | Trigger | Parámetros |
|--------|---------|------------|
| `quiz_start` | Carga de Q1 | `source`, `medium`, `campaign` |
| `quiz_q1_complete` | Responde Q1 | `sexo` |
| `quiz_q2_complete` | Responde Q2 | `edad` |
| `quiz_q3_complete` | Responde Q3 | `problema` |
| `quiz_q4_complete` | Responde Q4 | `tiempo` |
| `quiz_q5_complete` | Responde Q5 | `probado` (array) |
| `quiz_lead_captured` | Envía Q6 | `ecp`, `score`, `ubicacion` |
| `quiz_result_shown` | Carga página resultado | `ecp`, `destino` |
| `quiz_cta_primary_click` | Click CTA principal | `ecp`, `destino`, `cta_type` |
| `quiz_cta_secondary_click` | Click CTA secundario | `ecp`, `destino`, `cta_type` |
| `quiz_abandoned` | Exit sin completar | `last_question`, `sexo` |

---

## MODELO ECONÓMICO (hipótesis)

### Escenario conservador (mes 2-3)
```
Tráfico al quiz: 2.000 visitas/mes
Tasa completado quiz: 40% → 800 leads
Distribución por destino:
  - Consulta €195: 40% → 320 leads
  - Llamada: 30% → 240 leads
  - Nurturing: 20% → 160 leads
  - Waitlist/derivación: 10% → 80 leads

Conversión lead → consulta reservada: 25% → 80 consultas (directo) + 15% de llamadas → 36 consultas = 116 consultas
No-show ajustado (objetivo 30% vs actual 47%): 70% se presentan → 81 consultas realizadas
Conversión consulta → bono: 50% → 40 bonos
Revenue bonos: 40 × €820 = €32.800
Revenue consultas: 81 × €195 = €15.795
Total: ~€48.600/mes
```

### Escenario optimista (mes 4-6, con tests ganados)
```
Tráfico: 3.000 visitas/mes
Completado: 50% → 1.500 leads
Consultas reservadas: 200
No-show: 25% → 150 realizadas
Conversión bono: 50% → 75 bonos
Revenue: (75 × €820) + (150 × €195) = €61.500 + €29.250 = ~€90.750/mes
```

**⚠️ TODO esto son hipótesis. Los números reales se construyen con datos del mes 1.**

---

## SIGUIENTE PASO

1. **Validar supuestos médicos** (S1-S10) con equipo HC
2. **Priorizar**: ¿empezamos con quiz completo o MVP de 3 preguntas?
3. **Wireframes** en GHL con Ramiro
4. **Copy** de las 6 páginas de resultado
5. **Configurar** email sequences en GHL
6. **Setup tracking** GTM/GA4
7. **Lanzar MVP** → medir → iterar

<!-- Self-QA: DRAFT | 2026-03-04 | Pendiente validación equipo HC -->
