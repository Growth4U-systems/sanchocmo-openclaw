<!-- version: 2 | fecha: 2026-03-04 | autor: Sancho | status: draft -->
<!-- Cambio vs v1: quiz largo (12-14 preguntas) para engagement + 3 frames CTA -->

# Quiz Diagnóstico Capilar — Arquitectura v2
> Hospital Capilar | Tratamientos | MOFU → Evergreen Funnel
> Quiz largo (12-14 preguntas, ~3-4 min) con micro-educación entre preguntas

---

## Filosofía v2

Quiz largo ≠ formulario. Es una **experiencia diagnóstica** donde el usuario siente que le están evaluando de verdad. Cada pregunta construye:
1. **Datos** para segmentar (preguntas 1-6)
2. **Confianza** via micro-educación (preguntas 7-10)
3. **Disposición** para el CTA (preguntas 11-14)

**Todo sigue siendo hipótesis a testear.**

---

## Arquitectura General v2

```
[Tráfico] → [Quiz 12-14 preguntas ~3-4min]
                    │
                    ├── Preguntas 1-6: IDENTIFICACIÓN (quién eres, qué te pasa)
                    ├── Preguntas 7-10: PROFUNDIDAD + EDUCACIÓN (impacto, conocimiento, micro-tips)
                    ├── Preguntas 11-13: DISPOSICIÓN (expectativas, inversión, formato)
                    └── Pregunta 14: CAPTURA (datos de contacto)
                              │
                              ↓
                    [Página resultado personalizada por ECP]
                              │
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
              [PAYWALL]  [BOOKING]  [CALLBACK]
              Paga bono   Agenda     Te llamamos
              directo    consulta
                              │
                              ↓
                    [Secuencia email x ECP]
                    [Deadline Funnel 72h]
                    [Retargeting por segmento]
```

---

## BLOQUE 1: IDENTIFICACIÓN (Preguntas 1-6)

> Objetivo: saber quién es, qué le pasa, cuánto tiempo, qué ha probado → asignar ECP

### Q1: Sexo
> **"Empecemos. ¿Cuál es tu sexo?"**
> *Diseño: 2 botones grandes con icono*

| Opción | Tag |
|--------|-----|
| Hombre | `sexo:hombre` |
| Mujer | `sexo:mujer` |

---

### Q2: Edad
> **"¿En qué rango de edad estás?"**

| Opción | Tag |
|--------|-----|
| 18-25 | `edad:18-25` |
| 26-35 | `edad:26-35` |
| 36-45 | `edad:36-45` |
| 46-55 | `edad:46-55` |
| 56+ | `edad:56+` |

---

### Q3: ¿Qué te preocupa? (condicional por sexo)
> **"¿Cuál es tu principal preocupación con tu pelo?"**

**Si HOMBRE:**

| Opción | Tag | ECP |
|--------|-----|-----|
| Se me cae el pelo / pierdo densidad | `problema:caida-densidad` | ECP1/3 |
| Las entradas retroceden | `problema:entradas` | ECP1/3 |
| Me operé y el pelo sigue cayendo | `problema:post-cirugia` | ECP5 |
| Tuve mala experiencia en otra clínica | `problema:mala-experiencia` | ECP4 |
| Problemas en el cuero cabelludo (caspa, granos, irritación) | `problema:cuero-cabelludo` | DERIVACIÓN |

**Si MUJER:**

| Opción | Tag | ECP |
|--------|-----|-----|
| Noto que pierdo densidad / se me ve el cuero cabelludo | `problema:densidad-mujer` | ECP2 |
| Se me cae desde el embarazo / parto | `problema:postparto` | ECP6 |
| Creo que es hormonal (tiroides, ovarios, menopausia, píldora) | `problema:hormonal` | ECP2 |
| Se me cae mucho más de lo normal (estrés, cambio de estación...) | `problema:caida-general` | ECP2 |
| Problemas en el cuero cabelludo (caspa, granos, irritación) | `problema:cuero-cabelludo` | DERIVACIÓN |

---

### Q4: Tiempo con el problema
> **"¿Hace cuánto notas este problema?"**

| Opción | Tag | Señal |
|--------|-----|-------|
| Menos de 3 meses | `tiempo:<3m` | Temprano |
| 3-12 meses | `tiempo:3-12m` | Activo |
| 1-3 años | `tiempo:1-3a` | Crónico |
| Más de 3 años | `tiempo:3a+` | Muy crónico |

---

### Q5: ¿Qué has probado? (multi-select)
> **"¿Qué has probado hasta ahora para frenar la caída? (puedes marcar varias)"**

| Opción | Tag |
|--------|-----|
| Nada todavía | `probado:nada` |
| Champú anticaída / suplementos (Pilexil, biotina, Olistic...) | `probado:otc` |
| Minoxidil | `probado:minoxidil` |
| Finasteride / Dutasteride | `probado:finasteride` |
| Tratamientos en clínica (PRP, mesoterapia, láser...) | `probado:clinica` |
| Trasplante capilar | `probado:trasplante` |
| Otro tratamiento médico | `probado:otro` |

---

### Q6: Contexto médico (condicional)
> *Solo aparece si aplica*

**Si mujer + hormonal/densidad/caida-general:**
> **"¿Tienes alguna de estas condiciones? (puedes marcar varias)"**

| Opción | Tag |
|--------|-----|
| Ovarios poliquísticos (SOP/PCOS) | `condicion:pcos` |
| Problemas de tiroides | `condicion:tiroides` |
| Menopausia o perimenopausia | `condicion:menopausia` |
| Dejé anticonceptivos recientemente | `condicion:post-aco` |
| Anemia o déficit de hierro | `condicion:anemia` |
| Ninguna de estas / No lo sé | `condicion:desconocida` |

**Si problema = post-cirugia:**
> **"¿Dónde te operaste?"**

| Opción | Tag |
|--------|-----|
| En Hospital Capilar | `cirugia-en:hc` |
| En otra clínica en España | `cirugia-en:españa` |
| En Turquía | `cirugia-en:turquia` |
| En otro país | `cirugia-en:otro` |

**Si problema = mala-experiencia:**
> **"¿En qué clínica fue?"**

| Opción | Tag |
|--------|-----|
| Insparya | `clinica-previa:insparya` |
| Svenson | `clinica-previa:svenson` |
| Medical Hair | `clinica-previa:medicalhair` |
| IMD (Instituto Médico Dermatológico) | `clinica-previa:imd` |
| Dorsia | `clinica-previa:dorsia` |
| Otra | `clinica-previa:otra` |

---

## BLOQUE 2: PROFUNDIDAD + EDUCACIÓN (Preguntas 7-10)

> Objetivo: engagement, impacto emocional, micro-educación que construye confianza

### Q7: Impacto en tu vida
> **"¿Cuánto te afecta este problema en tu día a día?"**

| Opción | Tag | Score |
|--------|-----|-------|
| Poco — me preocupa pero no me limita | `impacto:bajo` | +5 |
| Bastante — evito ciertas situaciones o peinados | `impacto:medio` | +10 |
| Mucho — afecta mi autoestima y mi vida social | `impacto:alto` | +20 |
| Es lo que más me preocupa de mi salud ahora mismo | `impacto:critico` | +25 |

> 💡 **Micro-tip después de Q7:** *"La pérdida de pelo afecta a la autoestima del 75% de las personas que la sufren. No estás solo/a."*

---

### Q8: Nivel de conocimiento
> **"¿Sabes qué tipo de alopecia tienes?"**

| Opción | Tag |
|--------|-----|
| Sí, me lo diagnosticó un médico | `conocimiento:diagnosticado` |
| Creo saberlo pero no tengo diagnóstico formal | `conocimiento:sospecha` |
| No tengo ni idea | `conocimiento:ninguno` |

> 💡 **Micro-tip después de Q8:** *"Existen más de 20 tipos de alopecia con tratamientos distintos. Sin un diagnóstico preciso, cualquier tratamiento es una apuesta."*

---

### Q9: ¿Qué te haría actuar?
> **"¿Qué necesitarías para dar el siguiente paso?"**

| Opción | Tag |
|--------|-----|
| Saber exactamente qué tengo y qué opciones hay | `motivacion:diagnostico` |
| Ver resultados de personas como yo | `motivacion:prueba-social` |
| Que un médico me explique mi caso sin presión | `motivacion:confianza` |
| Que el precio sea razonable | `motivacion:precio` |

> 💡 **Micro-tip después de Q9:** *"En Hospital Capilar, la primera consulta incluye tricoscopía + analítica hormonal + 30 minutos con tu médico. Un diagnóstico real, no una consulta comercial."*

---

### Q10: ¿Te preocupan los efectos secundarios?
> *Condicional: solo si probado incluye minoxidil/finasteride O sexo=hombre*
> **"¿Te preocupan los efectos secundarios de los tratamientos capilares?"**

| Opción | Tag |
|--------|-----|
| Sí, mucho — es lo que me frena | `efectos:preocupado` |
| Algo, pero estoy dispuesto/a si hay supervisión médica | `efectos:moderado` |
| No especialmente | `efectos:no-preocupado` |

> 💡 **Micro-tip después de Q10:** *"Los efectos secundarios de tipo sexual del finasteride oral se dan en un porcentaje mínimo de pacientes y son reversibles. Además, existen alternativas sin esos efectos. Un médico especialista te puede explicar todas las opciones."*

**Si la Q10 no aplica, mostrar Q10b:**

### Q10b: ¿Has consultado algún profesional?
> **"¿Has visitado algún profesional por este tema?"**

| Opción | Tag |
|--------|-----|
| No, es la primera vez que busco ayuda profesional | `profesional:nunca` |
| Sí, un dermatólogo general | `profesional:dermatologo` |
| Sí, otra clínica capilar | `profesional:clinica` |
| Sí, mi médico de cabecera | `profesional:cabecera` |

> 💡 **Micro-tip después de Q10b:** *"El 80% de las personas que consultan por caída de pelo reciben una receta genérica de minoxidil en menos de 5 minutos. Un diagnóstico integral lleva 30 minutos porque hay mucho más que mirar."*

---

## BLOQUE 3: DISPOSICIÓN (Preguntas 11-13)

> Objetivo: calibrar el CTA correcto (paywall, booking, callback)

### Q11: Expectativas
> **"¿Qué resultado esperas conseguir?"**

| Opción | Tag |
|--------|-----|
| Frenar la caída — que no vaya a más | `expectativa:frenar` |
| Recuperar densidad sin cirugía | `expectativa:densidad` |
| Saber si necesito cirugía o tratamiento | `expectativa:diagnostico` |
| Mantener los resultados de mi cirugía | `expectativa:mantenimiento` |

---

### Q12: Disposición a invertir
> **"¿Cuánto estarías dispuesto/a a invertir al mes en el cuidado de tu pelo si vieras resultados?"**

| Opción | Tag | Señal |
|--------|-----|-------|
| Menos de €50/mes | `inversion:<50` | Price-sensitive |
| €50-150/mes | `inversion:50-150` | Sweet spot tratamiento |
| €150-300/mes | `inversion:150-300` | Alto valor |
| Lo que sea necesario si funciona | `inversion:abierto` | Alto valor, alta frustración |

> 💡 **Micro-tip después de Q12:** *"La mayoría de personas que buscan solución para su caída han gastado entre €200 y €1.000 en productos sin diagnóstico previo. Un diagnóstico correcto es lo primero — todo lo demás viene después."*

---

### Q13: Formato preferido
> **"¿Cómo te gustaría dar el siguiente paso?"**

| Opción | Tag | → CTA Frame |
|--------|-----|-------------|
| Quiero reservar una consulta presencial | `formato:presencial` | BOOKING |
| Prefiero que me llamen para explicarme | `formato:llamada` | CALLBACK |
| Quiero empezar ya — si hay un plan, lo quiero | `formato:directo` | PAYWALL |
| Necesito más información antes de decidir | `formato:info` | NURTURING |

---

## BLOQUE 4: CAPTURA (Pregunta 14)

### Q14: Datos de contacto
> **"¡Ya casi está! Para preparar tu diagnóstico personalizado, necesitamos tus datos:"**

| Campo | Obligatorio | Nota |
|-------|:-----------:|------|
| Nombre | ✅ | |
| Email | ✅ | |
| Teléfono | ✅ | Clave para call center HC |
| ¿Cerca de qué clínica te queda mejor? | ✅ | Dropdown con clínicas |

**Opciones de ubicación:**
- Madrid
- Murcia
- Pontevedra
- A Coruña *(próxima apertura 2026)*
- Móstoles *(próxima apertura 2026)*
- Albacete *(próxima apertura 2026)*
- Valladolid *(próxima apertura 2026)*
- Burgos *(próxima apertura 2026)*
- Valencia *(próxima apertura 2026)*
- Otra ciudad

---

## LÓGICA DE SEGMENTACIÓN

### Paso 1: Asignar ECP (misma lógica v1)

```
SI problema = cuero-cabelludo → DERIVACIÓN DERMATOLÓGICA
SI problema = post-cirugia O probado incluye trasplante → ECP5
SI problema = mala-experiencia → ECP4
SI sexo = mujer Y problema = postparto → ECP6
SI sexo = mujer Y (problema = hormonal O densidad-mujer O caida-general) → ECP2
SI sexo = hombre Y edad = 18-25 Y probado = nada O otc → ECP3
SI sexo = hombre Y probado incluye minoxidil O finasteride → ECP1
SI sexo = hombre Y (problema = caida-densidad O entradas) → ECP1 (default)
ELSE → ECP1 (fallback)
```

### Paso 2: Lead Score (ampliado con Bloque 2-3)

| Factor | Puntos |
|--------|--------|
| **Bloque 1 — Identificación** | |
| Tiempo >1 año | +20 |
| Tiempo >3 años | +30 |
| Probó minoxidil/finasteride | +15 |
| Probó tratamientos en clínica | +20 |
| Probó trasplante | +25 |
| Mujer + condición hormonal identificada | +15 |
| Edad 26-45 | +10 |
| Ubicación = clínica operativa | +15 |
| Ubicación = próxima apertura | +5 |
| Ubicación = otra ciudad | -20 |
| Nada probado + <3 meses | -15 |
| **Bloque 2 — Profundidad** | |
| Impacto alto/crítico (Q7) | +15 |
| Sin diagnóstico formal (Q8) | +10 |
| Motivación = diagnóstico (Q9) | +10 |
| Efectos secundarios = moderado (Q10) | +5 |
| **Bloque 3 — Disposición** | |
| Inversión 50-150 o 150-300 | +10 |
| Inversión "lo que sea necesario" | +20 |
| Formato = presencial | +15 |
| Formato = directo ("quiero empezar ya") | +25 |
| Formato = info ("necesito más info") | -10 |

**Score ranges:**
- **HOT (80+)**: CTA de alta conversión (paywall o booking directo)
- **WARM (40-79)**: CTA medio (booking o callback)
- **COLD (0-39)**: Nurturing + contenido
- **GEOGRAPHIC OUT (<0)**: Waitlist

### Paso 3: Determinar CTA Frame

La decisión del CTA combina ECP + Score + Q13 (formato preferido):

```
SI problema = cuero-cabelludo:
    → DERIVACIÓN (contenido + recomendación dermatólogo + captura email)

SI ubicación = otra ciudad:
    → WAITLIST (+ opción videoconsulta como test)

SI formato = llamada O ECP = 4 (quemados):
    → FRAME C: CALLBACK (te llamamos en 24h)

SI formato = info O score < 40:
    → FRAME D: NURTURING (email sequence + contenido educativo)

SI formato = presencial O directo Y score >= 40 Y ubicación = operativa:
    → FRAME A o B (según test activo):
      - Test A: consulta de pago (€195/€100/€50)
      - Test B: consulta gratis
      (A/B split al 50% para medir revenue por lead)
```

> **⚠️ Frame A vs B se testean en paralelo como A/B split.** El mismo perfil puede caer en pago o gratis aleatoriamente. Esto es la única forma limpia de medir el impacto real del precio en el funnel completo (booking → show → bono → revenue).

---

## LOS 3 FRAMES DE CTA (todos son hipótesis a testear)

> **Principio clave:** No podemos vender el plan de tratamiento online — requiere diagnóstico médico presencial. El quiz SIEMPRE converge a llevar al paciente a clínica. La variable es: ¿cómo lo llevamos y cuánto le cobramos por la consulta?

### Frame A: CONSULTA DE PAGO — "Reserva tu diagnóstico"
> *Test: ¿cobrar la consulta filtra mejor y reduce no-shows?*

**Página resultado:**
> "Tu diagnóstico preliminar: [resumen personalizado por ECP]. El siguiente paso es confirmarlo con un diagnóstico médico presencial."

**CTA:**
> **"Reserva tu Consulta de Diagnóstico — €[PRECIO]"**
> Selector de clínica (pre-filled con Q14) + selector de fecha/hora
> Checkout + booking integrado

**Precios a testear en A/B/C:**
- €195 (precio actual HC)
- €100 (punto medio)
- €50 (entrada accesible)

**CTA secundario:**
> "Prefiero que me llaméis primero" → pasa a Frame C

**Métricas clave:**
- Booking rate (quiz completado → agenda + paga)
- Show rate (pagó → se presenta)
- Conversión consulta → bono
- Revenue por lead del quiz
- No-show rate

---

### Frame B: CONSULTA GRATIS — "Te esperamos en clínica"
> *Test: ¿eliminar la barrera de pago genera más volumen neto que el que se pierde en no-shows?*

**Página resultado:**
> "Tu diagnóstico preliminar: [resumen personalizado]. Hemos preparado una consulta gratuita para ti."

**CTA:**
> **"Agenda tu Consulta Gratuita"**
> Selector de clínica + fecha/hora
> Sin checkout — booking directo

**Riesgos conocidos:**
- No-show actual sin barrera de pago: 47% Madrid, 40% Murcia
- Posible menor conversión consulta → bono (lead menos comprometido)
- Mayor carga de agenda en clínica sin garantía de revenue

**Métricas clave (las mismas que Frame A para comparar):**
- Booking rate
- Show rate
- Conversión consulta → bono
- Revenue por lead del quiz
- No-show rate

**⚠️ La métrica que decide: REVENUE POR LEAD DEL QUIZ**
```
Frame A: menos bookings × mayor show rate × mayor conversión = ¿más o menos revenue?
Frame B: más bookings × menor show rate × menor conversión = ¿más o menos revenue?
No lo sabemos. Lo medimos.
```

---

### Frame C: CALLBACK — "Te llamamos"
> *Para: quemados (ECP4), indecisos, formato=llamada, o CTA secundario de Frame A/B*

**Página resultado:**
> "Tu diagnóstico preliminar: [resumen personalizado]. Entendemos que quieras hablar con alguien antes de decidir."

**CTA:**
> **"Solicita que te llamemos — sin compromiso"**
> "Un asesor de Hospital Capilar te llamará en menos de 24h para resolver tus dudas."

**Para ECP4 (quemados) — copy específico:**
> "Sabemos que ya tuviste una experiencia negativa en [clínica previa]. No vamos a presionarte. Solo queremos escucharte y explicarte cómo trabajamos."

**El call center agenda la consulta (con o sin pago — según el test que esté activo para Frame A/B).**

---

### Frame D: NURTURING — "Recibe tu guía"
> *Trigger: score COLD + formato info*

**Página resultado:**
> "Tu diagnóstico preliminar: [resumen educativo]. Parece que estás empezando a explorar opciones. Te hemos preparado una guía con todo lo que necesitas saber."

**CTA:**
> **"Descarga tu Guía Personalizada"**
> PDF por ECP con información educativa + CTAs suaves dentro del documento

**Entra en secuencia de nurturing larga (14 días). Objetivo final: agendar consulta.**

---

## PÁGINAS DE RESULTADO POR ECP

> Cada página se construye dinámicamente con datos del quiz: nombre, tiempo, qué probó, clínica previa, etc. El CTA cambia según el frame activo (A/B/C/D).

### ECP1 — "El Frustrado del Tratamiento"
> (hombre, probó minoxidil/finasteride, >3 meses)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Llevas [tiempo] tratando tu caída capilar con [lo que probaste] sin los resultados que esperabas.**

Esto es más común de lo que piensas — el 40-60% de personas no responden a minoxidil. Y en muchos casos, el problema no es el producto sino que **nunca se diagnosticó correctamente la causa de tu caída**.

Sin una tricoscopía y analítica hormonal, cualquier tratamiento es una apuesta.

**Te recomendamos: un diagnóstico integral presencial** donde nuestro equipo médico evalúa tu caso con microscopio capilar + analítica completa + valoración médica personalizada. En 30 minutos sabrás exactamente qué tienes y qué opciones reales hay.

`[CTA según frame activo A/B/C]`

---

### ECP2 — "La Mujer Hormonal"
> (mujer, hormonal/densidad/estrés)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Tu caída de pelo está probablemente conectada a un desbalance hormonal que nadie ha evaluado en relación con tu pelo.**

La caída femenina por causa hormonal (SOP, tiroides, menopausia, post-anticonceptivos) es una de las menos diagnosticadas correctamente. Los dermatólogos tratan el pelo, los ginecólogos tratan las hormonas — pero nadie cruza ambas cosas.

**Te recomendamos: una consulta diagnóstica que incluye analítica hormonal completa** cruzada con un estudio capilar con microscopio. Es la pieza que falta entre tu pelo y tu salud.

`[CTA según frame activo A/B/C]`

---

### ECP3 — "El Joven Preocupado"
> (hombre 18-25, temprano, poco probado)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Estás empezando a notar señales de caída y quieres saber si es momento de actuar o de esperar.**

Buena noticia: actuar temprano es la mejor decisión que puedes tomar con la alopecia. Cuanto antes se diagnostica, más opciones tienes y mejores resultados se consiguen.

Mala noticia: la caída capilar NO se frena sola. Si llevas [tiempo] notándolo, es probable que progrese.

**Te recomendamos: hablar con nuestro equipo** para entender tu caso concreto. Nada de presión — solo que sepas dónde estás y qué opciones existen a tu edad.

`[CTA según frame activo A/B/C]`

---

### ECP4 — "El Quemado por Clínicas"
> (mala experiencia previa)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Ya pasaste por una experiencia negativa en [clínica previa] y entendemos que tengas dudas.**

Lo primero: lo sentimos. Sabemos que hay clínicas que prometen mucho y entregan poco. No es lo que hacemos.

Hospital Capilar es un centro médico especializado — no un centro estético. Aquí no hay "consultas gratuitas" que son ventas disfrazadas. Hay médicos que te diagnostican con datos y te dicen la verdad, te guste o no.

**Te recomendamos: que hables con nosotros sin compromiso.** Preferimos que nos preguntes todo lo que necesites antes de tomar cualquier decisión.

`[CTA: Frame C (callback) siempre para este perfil]`

---

### ECP5 — "El Post-Cirugía"
> (se operó, pelo sigue cayendo)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Te realizaste un trasplante capilar [en dónde] y necesitas un plan para proteger tu inversión.**

Un trasplante capilar sin plan de mantenimiento pierde resultados con el tiempo. El pelo trasplantado no se cae, pero el pelo nativo sigue sometido a los mismos factores que causaron la caída original.

**Te recomendamos: un diagnóstico para evaluar el estado actual** de tu pelo nativo y diseñar un plan de mantenimiento personalizado que proteja los resultados de tu cirugía.

`[CTA según frame activo A/B/C]`

---

### ECP6 — "La Mujer Postparto"
> (caída desde embarazo/parto)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Estás perdiendo pelo desde tu embarazo o parto y necesitas saber si es temporal o algo más.**

El efluvio postparto afecta al 50% de madres y en la mayoría de casos es temporal. Pero en algunas mujeres, el embarazo revela una alopecia subyacente (AGA) que estaba oculta y necesita tratamiento.

La diferencia entre ambos solo la puede determinar un diagnóstico con analítica hormonal.

**Te recomendamos: un diagnóstico que cruce tu perfil hormonal con tu estudio capilar.** Si es efluvio temporal, te lo decimos y te ahorras preocupaciones. Si es algo más, actuamos a tiempo.

`[CTA según frame activo A/B/C]`

---

### DERIVACIÓN — Cuero cabelludo
> (caspa, granos, irritación)

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: Lo que describes parece un problema dermatológico del cuero cabelludo más que una caída capilar.**

Problemas como la dermatitis seborreica, la caspa severa o las inflamaciones del cuero cabelludo requieren un enfoque dermatológico específico que no es nuestra especialidad.

**Te recomendamos: visitar un dermatólogo** que pueda evaluar tu cuero cabelludo directamente.

Si después del tratamiento dermatológico notas que sigues perdiendo pelo, puede que haya un problema capilar adicional. En ese caso, estaremos aquí.

`[CTA: suscripción a contenido educativo + email ya capturado]`

---

### WAITLIST — Fuera de zona geográfica

*"Gracias por tus respuestas, [nombre]."*

**Tu perfil: [resumen según ECP asignado]. Pero todavía no tenemos clínica cerca de ti.**

Estamos abriendo 6 nuevas clínicas en 2026 (A Coruña, Móstoles, Albacete, Valladolid, Burgos, Valencia). Si te apuntas, serás el primero en enterarte cuando abramos en tu zona — y tendrás acceso prioritario.

`[CTA: "Avísame cuando abráis cerca"]`
`[CTA secundario: "¿Ofrecéis videoconsulta?" → test H10]`

---

## POST-QUIZ: Secuencias de Email por ECP (actualizado)

### Estructura para Frame 1 (PAYWALL) y Frame 2 (BOOKING):

| Día | Email | Objetivo |
|-----|-------|----------|
| 0 (inmediato) | Confirmación + diagnóstico preliminar + recordatorio de acción | Reforzar decisión / activar los que no completaron |
| 1 | "Por qué [lo que probaste] no te funcionó — y qué sí puede funcionar" | Educación + reframe |
| 2 | Caso de éxito: paciente real similar a su ECP | Social proof |
| 3 | "Las 3 dudas que siempre nos preguntan" (objeciones por ECP) | Manejo objeciones |
| 4 | Recordatorio: "Tu diagnóstico te está esperando" + deadline | Urgencia |
| 5 | Último email: "¿Necesitas hablar con alguien?" + opción callback | Safety net |

### Estructura para Frame 3 (CALLBACK):

| Día | Email | Objetivo |
|-----|-------|----------|
| 0 | "Te llamaremos en las próximas 24h" + qué esperar | Setting expectations |
| 1 (post-llamada) | Resumen de la llamada + CTA booking | Conversión |
| 3 | Si no contestó: "Intentamos llamarte — ¿cuándo te va bien?" | Re-engage |
| 5 | Caso de éxito + CTA booking | Social proof push |
| 7 | "Seguimos aquí cuando estés listo/a" | Soft close |

### Estructura para Frame 4 (NURTURING):

| Día | Email | Objetivo |
|-----|-------|----------|
| 0 | Guía personalizada (PDF adjunto) | Valor inmediato |
| 3 | "¿Sabías que...?" — dato educativo por ECP | Engagement |
| 5 | "Así funciona un diagnóstico capilar integral" (video del proceso) | Familiarización |
| 7 | Caso de éxito: alguien que empezó igual que tú | Social proof |
| 10 | "3 señales de que es momento de actuar" | Urgencia suave |
| 14 | "¿Listo/a? Tu consulta te está esperando" + CTA booking | Conversión |

---

## SUPUESTOS MÉDICOS (mismos v1, referencia rápida)

| # | Supuesto | Status |
|---|----------|--------|
| S1 | Cuero cabelludo = dermatológico, no HC | ⏳ Pendiente validar |
| S2 | Alopecia areata/fibrosante no detectable en quiz | ⏳ Pendiente validar |
| S3 | Postparto = siempre consulta (puede ocultar AGA) | ⏳ Pendiente validar |
| S4 | Mujeres hormonales = producto estrella HC, zero competencia | ⏳ Pendiente validar |
| S5 | Joven 18-25 = madre influye en decisión | ⏳ Pendiente validar |
| S6 | €195 es el precio correcto para consulta | ⏳ Testear |
| S7 | Post-cirugía = alta disposición a pagar | ⏳ Pendiente validar |
| S8 | Quemados necesitan trust antes de booking | ⏳ Testear |
| S9 | Ubicación = factor eliminatorio | ⏳ Testear (videoconsulta) |
| S10 | Captura tarde (Q14) convierte mejor que temprano | ⏳ Testear |

---

## HIPÓTESIS A TESTEAR (actualizado v2)

| # | Hipótesis | Métrica | Prioridad |
|---|-----------|---------|-----------|
| H1 | Quiz 12-14 preguntas tiene completion rate >50% con micro-tips | Completion rate | 🔴 P0 |
| H2 | Micro-tips entre preguntas aumentan engagement (scroll depth, time on quiz) | Time + completion | 🔴 P0 |
| H3 | Página resultado personalizada por ECP tiene mayor CTR que genérica | CTA click rate | 🔴 P0 |
| H4 | 3 frames CTA (paywall/booking/callback) convierten más que 1 CTA único | Total conversiones | 🔴 P0 |
| H5 | Deadline 72h aumenta conversión en Frame 1 y 2 | Bookings en 72h vs 7d | 🟡 P1 |
| H6 | Email sequence por ECP tiene mejor open rate y CTR que genérica | Open + CTR + conversión | 🟡 P1 |
| H7 | Consulta pago (€195/€100/€50) vs gratis: ¿cuál genera más revenue por lead? | Revenue por lead, show rate, conversión bono | 🔴 P0 |
| H8 | Para ECP4 (quemados), callback convierte 2x vs booking directo | Consultas realizadas | 🟢 P2 |
| H9 | Pre-quiz video 30s de médico aumenta trust y completion | Completion rate | 🟢 P2 |
| H10 | Videoconsulta para "otra ciudad" genera revenue | Revenue + show rate | 🟢 P2 |
| H11 | Copy "para compartir con tu familia" en ECP3 (joven) acelera decisión | Time to conversion | 🟢 P2 |
| H12 | Nombrar clínica previa en ECP4 (personalización) aumenta trust | CTR en CTA | 🟢 P2 |

---

## TRACKING GTM/GA4 (actualizado)

| Evento | Trigger | Parámetros |
|--------|---------|------------|
| `quiz_start` | Carga Q1 | `source`, `medium`, `campaign` |
| `quiz_q[N]_complete` | Responde pregunta N | Valor de respuesta |
| `quiz_block2_start` | Carga Q7 | `ecp_assigned` (ya segmentado) |
| `quiz_block3_start` | Carga Q11 | `lead_score_partial` |
| `quiz_lead_captured` | Envía Q14 | `ecp`, `score`, `ubicacion`, `frame` |
| `quiz_result_shown` | Carga página resultado | `ecp`, `frame_type` |
| `quiz_cta_click` | Click CTA | `frame_type`, `cta_variant` |
| `quiz_paywall_complete` | Pago completado | `amount`, `product` |
| `quiz_booking_complete` | Booking confirmado | `clinica`, `fecha` |
| `quiz_callback_requested` | Callback solicitado | `ecp` |
| `quiz_abandoned` | Exit sin completar | `last_question`, `sexo`, `ecp_partial` |
| `quiz_micro_tip_seen` | Micro-tip renderizado | `tip_id`, `question` |

---

## MODELO ECONÓMICO v2 (hipótesis — todo a validar)

> No hay paywall de bono. Todo converge a consulta → bono se vende en clínica post-diagnóstico.

### Escenario con consulta de pago (Frame A @ €195)
```
Tráfico al quiz: 2.000 visitas/mes
Completado quiz: 35% → 700 leads

Frame A (pago €195): 50% del split → 350 leads
  - Booking rate: 20% → 70 consultas agendadas
  - Show rate: 80% (hipótesis: pagar reduce no-show) → 56 realizadas
  - Conversión consulta→bono: 50% → 28 bonos

Revenue Frame A:
  - Consultas: 56 × €195 = €10.920
  - Bonos: 28 × €820 = €22.960
  Total Frame A: €33.880
  Revenue por lead: €33.880 / 350 = €96,80/lead
```

### Escenario con consulta gratis (Frame B)
```
Frame B (gratis): 50% del split → 350 leads
  - Booking rate: 40% (hipótesis: más sin barrera) → 140 consultas agendadas
  - Show rate: 55% (hipótesis: no-show similar al actual) → 77 realizadas
  - Conversión consulta→bono: 35% (hipótesis: menos comprometidos) → 27 bonos

Revenue Frame B:
  - Consultas: €0
  - Bonos: 27 × €820 = €22.140
  Total Frame B: €22.140
  Revenue por lead: €22.140 / 350 = €63,26/lead
```

### Comparativa (hipótesis)
```
Frame A (pago €195): €96,80/lead → €33.880/mes
Frame B (gratis):     €63,26/lead → €22.140/mes
                      ─────────────────────────
Diferencia:           +53% revenue por lead con pago

PERO: todo esto son hipótesis. Puede que:
- Frame B genere 60% booking rate (no 40%)
- Frame B tenga 45% conversión a bono (no 35%)
- Frame A tenga 15% booking rate (no 20%)
→ Y los números se inviertan completamente.

POR ESO SE TESTEA.
```

### + Frames C y D (aplicable a ambos)
```
Frame C (callback): 25% de leads → 175
  - Convierte a consulta: 30% → 52 consultas
  - Show rate: 65% → 34 realizadas
  - Bono: 40% → 14 bonos → €11.480

Frame D (nurturing): 10% de leads → 70
  - Convierte en 30 días: 10% → 7 consultas → 5 bonos → €4.100

TOTAL ESTIMADO (Frame A activo): €33.880 + €11.480 + €4.100 = ~€49.460/mes
TOTAL ESTIMADO (Frame B activo): €22.140 + €11.480 + €4.100 = ~€37.720/mes
```

---

## PRÓXIMOS PASOS

1. ✅ **Philippe valida** arquitectura + preguntas + frames
2. ⏳ **Validar supuestos médicos** con equipo HC (Óscar/Gerardo)
3. ⏳ **Wireframes** en GHL con Ramiro
4. ⏳ **Copy** de 6 páginas de resultado + 4 variantes de CTA
5. ⏳ **Configurar** email sequences (6 ECPs × 4 frames = 24 variantes → simplificar a 6 ECPs × 2 tracks)
6. ⏳ **Setup tracking** GTM/GA4
7. ⏳ **Integrar** Deadline Funnel
8. ⏳ **Lanzar MVP** → medir → iterar

<!-- Self-QA: DRAFT v2.1 | 2026-03-04 | Corregido: sin paywall de bono, frames como A/B test, €195 es hipótesis | Pendiente validación equipo HC + Philippe -->
