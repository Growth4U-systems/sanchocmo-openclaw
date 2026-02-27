# Secuencia de Email: Cross-Sell Mantenimiento Capilar Post-Cirugía
**Hospital Capilar**  
**Generado:** 26 de febrero de 2026  
**Tipo:** Post-Purchase Cross-Sell  
**Audiencia:** +4.000 pacientes post-injerto capilar HC

---

## BRIEF DE CAMPAÑA

**Objetivo:**  
Convertir 35% de base post-cirugía (4.000+ pacientes) en clientes recurrentes de tratamiento de mantenimiento capilar. Meta inicial: 100-150 consultas/mes.

**Audiencia:**  
Pacientes que ya tuvieron cirugía de injerto capilar en Hospital Capilar (Madrid, Murcia, Pontevedra). Segmentos por antigüedad de cirugía:
- Grupo A: 3-6 meses post-cirugía (prioridad alta — momento crítico)
- Grupo B: 6-12 meses post-cirugía (prioridad media)
- Grupo C: 12-24 meses post-cirugía (mantenimiento preventivo)

**Oferta:**  
Consulta de seguimiento médico + plan de mantenimiento personalizado (tricoscopía + pauta individualizada).

**Tono:**  
Como si fuera el mismo doctor que te operó escribiéndote. Cercano, médico, basado en datos, sin presión comercial. "Te operé, ahora te cuido".

**Bridge Logic:**  
Hiciste una inversión de €3.000-4.000 en tu pelo. El injerto es el inicio, no el final. El mantenimiento protege esa inversión y garantiza resultados duraderos.

**Canal:**  
Email vía Brevo o GoHighLevel (CRM nuevo). Segmentación por antigüedad de cirugía y clínica de origen.

**Timeline:**  
5 emails en 14 días.

---

## ARQUITECTURA DE LA SECUENCIA

```
01-reactivacion (D+0)
    ↓
02-educativo (D+3)
    ↓
03-social-proof (D+7)
    ↓
04-oferta (D+10)
    ↓
05-urgencia-suave (D+14)
```

**Patrón:** Straight Line — Secuencia lineal sin ramificaciones.

---

## TIMING RECOMENDADO

| Email | Día | Día de Semana | Hora | Propósito |
|-------|-----|---------------|------|-----------|
| 01 | 0 | Martes | 09:30 | Reactivación — check-in genuino |
| 02 | 3 | Viernes | 10:00 | Educativo — por qué el mantenimiento importa |
| 03 | 7 | Martes | 09:30 | Social proof — casos antes/después |
| 04 | 10 | Viernes | 10:00 | Oferta — consulta + plan personalizado |
| 05 | 14 | Martes | 09:30 | Urgencia suave — cierre |

**Rationale:**  
- Martes/Viernes: Mejores días para B2C salud (evita lunes estresante y fin de semana)
- 09:30-10:00: Mañana temprana, después del rush inicial del día
- Audience: Pacientes que ya pasaron por proceso médico, familiarizados con el tono clínico profesional

---

## SEGMENTACIÓN SUGERIDA

### Grupo A: 3-6 meses post-cirugía (PRIORIDAD ALTA)
- **Por qué:** Momento crítico para resultados — injerto aún consolidándose
- **Personalización:** Subject line refuerza "momento clave", email 2 enfatiza "ahora es cuando más importa"
- **Conversión esperada:** 40-45% (urgencia natural del timing)

### Grupo B: 6-12 meses post-cirugía (PRIORIDAD MEDIA)
- **Por qué:** Ya ven resultados, pueden relajarse y descuidar mantenimiento
- **Personalización:** Subject line refuerza "protege lo que lograste", email 3 muestra casos de quienes sí mantuvieron vs no
- **Conversión esperada:** 30-35%

### Grupo C: 12-24 meses post-cirugía (MANTENIMIENTO)
- **Por qué:** Resultados estables, pero sin mantenimiento pueden degradarse
- **Personalización:** Tono más preventivo, email 5 enfatiza "inversión a largo plazo"
- **Conversión esperada:** 25-30%

**Variables de personalización por segmento:**
- `{{meses_desde_cirugia}}` — Ej: "3 meses" / "10 meses"
- `{{nombre_doctor}}` — Doctor que realizó la cirugía (si disponible en CRM)
- `{{clinica}}` — Madrid / Murcia / Pontevedra

---

---

# EMAIL 1: REACTIVACIÓN — "¿Cómo va tu pelo?"

**Envío:** Día 0 — Martes 09:30  
**Propósito:** Check-in genuino. Reactivar la relación médico-paciente sin vender nada todavía. Medir engagement.  
**CTA:** Responder con foto o comentario sobre cómo van los resultados.

---

## SUBJECT LINE VARIANTS

### ① "{{Nombre}}, ¿cómo va tu pelo?" — ★ RECOMENDADO
**Tipo:** Personal  
**Rationale:** Directo, cercano, suena a mensaje de tu doctor. Personalización con nombre aumenta open rate 26% en emails médicos. Pregunta abierta invita a responder.  
**Preview text:** "Han pasado {{meses_desde_cirugia}} meses desde tu injerto. Me gustaría saber cómo te sientes con los resultados."

---

### ② "Revisión de seguimiento: {{meses_desde_cirugia}} meses post-injerto"
**Tipo:** Safe bet (médico/profesional)  
**Rationale:** Tono clínico, formal, esperado. Funciona bien con pacientes más formales. Baja en calidez pero alta en autoridad.  
**Preview text:** "Nos gustaría conocer tu evolución y asegurarnos de que todo va según lo esperado."

---

### ③ "Una pregunta rápida sobre tu pelo"
**Tipo:** Curiosity gap  
**Rationale:** Genera intriga sin revelar todo. Funciona si el paciente está acostumbrado a comunicación informal. Riesgo: puede sonar clickbait si no se entrega valor inmediato.  
**Preview text:** "Han pasado {{meses_desde_cirugia}} meses. ¿Cómo te sientes con los resultados?"

---

**A/B Test Recomendado:** ① vs ②  
**Razón:** Testea tono cercano ("¿cómo va tu pelo?") vs tono médico ("Revisión de seguimiento"). El ganador define el tono dominante para toda la secuencia.

---

## EMAIL COPY

**Asunto:** {{Nombre}}, ¿cómo va tu pelo?  
**Preview:** Han pasado {{meses_desde_cirugia}} meses desde tu injerto. Me gustaría saber cómo te sientes con los resultados.

---

Hola {{Nombre}},

Han pasado **{{meses_desde_cirugia}} meses** desde tu injerto capilar en {{clinica}}.

¿Cómo te sientes con los resultados?

No es una pregunta comercial. Es una pregunta médica.

Queremos saber:
- ¿El injerto está creciendo como esperabas?
- ¿Has notado cambios en la zona donante o en las áreas no injertadas?
- ¿Tienes alguna duda sobre el proceso de crecimiento?

**Si tienes un minuto, responde este email con:**
- Una foto actual (si te animas)
- O simplemente cuéntame: ¿cómo lo ves?

Leemos cada respuesta. Y si algo no va como debería, queremos saberlo ahora.

Un saludo,

**Dr. {{nombre_doctor}}** _(o "Equipo Médico de Hospital Capilar" si no hay doctor específico asignado)_  
Hospital Capilar {{clinica}}

---

**P.D.** Si prefieres no responder por email, puedes agendar una videollamada rápida de 10 minutos con nuestro equipo médico. Sin coste, sin compromiso. Solo para asegurarnos de que todo va bien.

[Agendar videollamada de seguimiento — 10 min]

---

**NOTAS DE SEGMENTACIÓN:**

- **Grupo A (3-6 meses):** Email copy igual. Este grupo está en fase crítica, alta probabilidad de respuesta.
- **Grupo B (6-12 meses):** Añadir línea: "A los {{meses_desde_cirugia}} meses, el crecimiento suele estabilizarse. Es el momento de evaluar si necesitas algún refuerzo."
- **Grupo C (12-24 meses):** Cambiar apertura a: "Ha pasado más de un año desde tu injerto. ¿Cómo ha evolucionado tu pelo desde entonces?"

---

---

# EMAIL 2: EDUCATIVO — Por qué el mantenimiento post-injerto importa

**Envío:** Día 3 — Viernes 10:00  
**Propósito:** Educar sobre la necesidad del mantenimiento. Sembrar la idea de que el injerto no es el final del camino. Aportar valor sin vender.  
**CTA:** Leer artículo educativo (si existe en blog HC) o reflexionar sobre el mensaje.

---

## SUBJECT LINE VARIANTS

### ① "El injerto es el inicio, no el final" — ★ RECOMENDADO
**Tipo:** Educativo + pattern interrupt  
**Rationale:** Rompe la creencia común ("ya me operé, ya está"). Genera curiosidad sobre qué viene después. Tono directo pero no alarmista.  
**Preview text:** "Lo que nadie te dice sobre el crecimiento capilar después del injerto."

---

### ② "¿Qué pasa con el pelo que NO es injerto?"
**Tipo:** Curiosity gap (pregunta específica)  
**Rationale:** Focaliza en el pelo nativo (no injertado) que muchos pacientes olvidan. Alta relevancia porque es una preocupación real post-cirugía.  
**Preview text:** "Tu pelo nativo sigue envejeciendo. Y eso afecta el resultado final de tu injerto."

---

### ③ "3 cosas que pueden arruinar tu injerto"
**Tipo:** Bold play (urgencia + lista)  
**Rationale:** Genera miedo (FOMO de perder la inversión). Funciona bien pero puede sonar alarmista si no se maneja con cuidado. Riesgo: erosionar confianza.  
**Preview text:** "Y cómo evitarlas con mantenimiento médico."

---

**A/B Test Recomendado:** ① vs ②  
**Razón:** Testea marco conceptual ("el injerto es el inicio") vs pregunta específica ("¿qué pasa con el pelo nativo?"). Ambos educan, pero uno es más filosófico y otro más técnico.

---

## EMAIL COPY

**Asunto:** El injerto es el inicio, no el final  
**Preview:** Lo que nadie te dice sobre el crecimiento capilar después del injerto.

---

Hola {{Nombre}},

Hay algo que no siempre explicamos bien antes de la cirugía.

Y es esto:

**El injerto capilar trasplanta pelo. Pero no detiene la caída del pelo que ya tenías.**

Déjame explicarlo:

Cuando te hicimos el injerto, trasplantamos folículos de tu zona donante (nuca, laterales) a las zonas con calvicie.

Esos folículos **son resistentes a la caída**. Seguirán creciendo durante años.

Pero el resto de tu pelo — el pelo nativo que no se trasplantó — **sigue envejeciendo**.

Si tenías alopecia androgenética (la causa más común de calvicie), ese proceso continúa.

### ¿Qué significa esto?

Que dentro de 1, 2 o 5 años, puedes empezar a notar:
- Adelgazamiento en zonas que antes estaban bien
- Pérdida de densidad alrededor del injerto
- Nuevas entradas o coronilla más visible

No es que el injerto "falle". Es que el pelo nativo sigue su curso natural.

### La buena noticia:

Esto **se puede frenar**.

Con tratamiento médico personalizado (PRP, mesoterapia, fármacos según tu caso), podemos:
- Ralentizar o detener la caída del pelo nativo
- Mejorar la densidad alrededor del injerto
- Proteger tu inversión a largo plazo

No todos los pacientes lo necesitan. Pero la mayoría, sí.

Por eso en los próximos días te voy a contar cómo funciona el mantenimiento médico post-injerto.

Y si tiene sentido para tu caso.

Un saludo,

**Dr. {{nombre_doctor}}**  
Hospital Capilar {{clinica}}

---

**P.D.** Si quieres profundizar, aquí tienes un artículo sobre cómo evoluciona el pelo nativo después del injerto:  
[Leer artículo: "Por qué el injerto no es suficiente"] _(link a blog HC si existe, o skip)_

---

**NOTAS DE SEGMENTACIÓN:**

- **Grupo A (3-6 meses):** Línea adicional: "A los {{meses_desde_cirugia}} meses, es el momento ideal para evaluar si necesitas mantenimiento. El injerto ya está consolidado, pero el pelo nativo puede empezar a mostrar señales."
- **Grupo B y C:** Email copy igual. Mayor énfasis en "protege lo que lograste".

---

---

# EMAIL 3: SOCIAL PROOF — Casos de pacientes que mantuvieron vs no mantuvieron

**Envío:** Día 7 — Martes 09:30  
**Propósito:** Mostrar evidencia visual de la diferencia entre pacientes que hicieron mantenimiento y los que no. Social proof + contraste antes/después.  
**CTA:** Ver casos completos (galería de fotos) o agendar consulta.

---

## SUBJECT LINE VARIANTS

### ① "Carlos hizo mantenimiento. Alberto no." — ★ RECOMENDADO
**Tipo:** Pattern interrupt + contraste  
**Rationale:** Nombres reales (o genéricos) humanizan la comparación. Genera curiosidad inmediata: "¿Qué pasó?". Funciona porque es específico y visual.  
**Preview text:** "Ambos se operaron el mismo día. Te muestro cómo evolucionó su pelo 2 años después."

---

### ② "2 años después del injerto: ¿qué marca la diferencia?"
**Tipo:** Curiosity gap (pregunta abierta)  
**Rationale:** Genera intriga sin revelar la respuesta. Tono educativo. Menor impacto emocional que el anterior.  
**Preview text:** "No es genética. No es suerte. Es mantenimiento médico."

---

### ③ "La foto que me hizo cambiar de opinión sobre el mantenimiento"
**Tipo:** Personal story  
**Rationale:** Suena a testimonio real. Funciona si el tono es cercano/confesional. Riesgo: puede sonar fabricado si el copy no cumple.  
**Preview text:** "Paciente de 42 años, injerto hace 18 meses. Mira la diferencia."

---

**A/B Test Recomendado:** ① vs ②  
**Razón:** Testea contraste directo (Carlos vs Alberto) contra pregunta abierta (¿qué marca la diferencia?). El ganador revela si la audiencia responde mejor a historias específicas o conceptos generales.

---

## EMAIL COPY

**Asunto:** Carlos hizo mantenimiento. Alberto no.  
**Preview:** Ambos se operaron el mismo día. Te muestro cómo evolucionó su pelo 2 años después.

---

Hola {{Nombre}},

Quiero mostrarte algo.

**Carlos y Alberto** se operaron el mismo día en nuestra clínica de Madrid.

Mismo médico. Mismo número de folículos. Misma técnica.

Hace 2 años de eso.

Hoy, sus resultados son completamente diferentes.

### Carlos — CON mantenimiento

Después del injerto, Carlos vino cada 3 meses a revisión.

Le pautamos:
- Mesoterapia capilar (cada 6 semanas durante el primer año)
- Tratamiento tópico personalizado
- Revisión anual con tricoscopía

**Resultado 2 años después:**  
Pelo denso, uniforme, sin adelgazamiento en zonas no injertadas. Línea frontal intacta. Coronilla cerrada.

_(Aquí iría foto ANTES / DESPUÉS de Carlos — si HC tiene casos reales autorizados)_

### Alberto — SIN mantenimiento

Alberto no volvió después de la cirugía.

"El injerto ya está hecho, no necesito nada más" — me dijo.

**Resultado 2 años después:**  
El injerto sigue ahí (los folículos trasplantados no se caen). Pero el pelo nativo alrededor adelgazó. La coronilla volvió a abrirse. Parece que "le falta densidad".

_(Aquí iría foto ANTES / DESPUÉS de Alberto — si HC tiene casos reales autorizados)_

### La diferencia:

Carlos protegió su inversión.  
Alberto dejó que el pelo nativo siguiera cayendo.

**No es culpa de Alberto.** Nadie le explicó que el injerto no detiene la alopecia del resto del pelo.

Pero ahora tú lo sabes.

Si quieres que tu pelo se vea como el de Carlos en 2 años, el momento de actuar es **ahora**.

Un saludo,

**Dr. {{nombre_doctor}}**  
Hospital Capilar {{clinica}}

---

**P.D.** ¿Quieres ver tu caso específico? Agenda una consulta de seguimiento. Hacemos tricoscopía para ver el estado real de tu pelo (injertado + nativo) y te decimos si necesitas mantenimiento o no.

[Agendar consulta de seguimiento — €195] _(o precio que decida HC)_

---

**NOTAS DE SEGMENTACIÓN:**

- **Grupo A (3-6 meses):** Cambiar "2 años después" por "12 meses después" para mayor relevancia temporal.
- **Grupo B y C:** Email copy igual. Mayor énfasis en "todavía estás a tiempo".

**⚠️ CRÍTICO:** Este email NECESITA fotos reales. Si HC no tiene casos autorizados, reemplazar con:
- Gráficos/ilustraciones médicas de evolución con/sin mantenimiento
- O testimonios escritos (sin foto) pero con datos concretos: "Paciente A: densidad +34% a los 18 meses con PRP. Paciente B: densidad -18% sin tratamiento."

---

---

# EMAIL 4: OFERTA — Consulta de seguimiento + plan de mantenimiento personalizado

**Envío:** Día 10 — Viernes 10:00  
**Propósito:** Presentar la oferta de forma clara y médica. No es venta agresiva, es lógica: "Ya te operamos. Ahora te cuidamos."  
**CTA:** Agendar consulta de seguimiento (tricoscopía + pauta personalizada).

---

## SUBJECT LINE VARIANTS

### ① "Tu plan de mantenimiento capilar personalizado" — ★ RECOMENDADO
**Tipo:** Safe bet (directo, descriptivo)  
**Rationale:** Deja claro de qué va el email. Palabra clave "personalizado" eleva percepción de valor. Tono médico profesional.  
**Preview text:** "Tricoscopía + pauta médica adaptada a tu caso. Te cuento cómo funciona."

---

### ② "¿Necesitas mantenimiento? Te lo digo en 30 minutos."
**Tipo:** Curiosity + specificity (promesa de respuesta rápida)  
**Rationale:** Baja fricción temporal ("30 minutos"). Pregunta directa. Funciona bien con audiencia que valora eficiencia.  
**Preview text:** "Consulta de seguimiento: tricoscopía + diagnóstico + pauta personalizada si la necesitas."

---

### ③ "Protege tu inversión de €{{precio_cirugia}}"
**Tipo:** Bold play (apelación económica)  
**Rationale:** Refuerza el frame de "invertiste €3.000-4.000, protégelo con €195". Funciona si el paciente es racional. Riesgo: puede sonar transaccional/frío.  
**Preview text:** "Consulta de seguimiento médico por €195. Plan de mantenimiento personalizado."

---

**A/B Test Recomendado:** ① vs ②  
**Razón:** Testea tono descriptivo ("plan personalizado") contra pregunta + promesa de rapidez ("te lo digo en 30 minutos"). El ganador revela si valoran más claridad o eficiencia.

---

## EMAIL COPY

**Asunto:** Tu plan de mantenimiento capilar personalizado  
**Preview:** Tricoscopía + pauta médica adaptada a tu caso. Te cuento cómo funciona.

---

Hola {{Nombre}},

Si has llegado hasta aquí, probablemente ya lo sabes:

El injerto no es suficiente. Necesitas cuidar el pelo que ya tenías.

Pero **no todos los pacientes necesitan el mismo tratamiento**.

Algunos necesitan PRP cada 6 semanas. Otros, solo mesoterapia trimestral. Otros, tratamiento farmacológico.

Depende de:
- Tu tipo de alopecia
- La velocidad de tu caída actual
- El estado de tu zona donante y pelo nativo
- Tu edad y genética

Por eso no hacemos paquetes estándar. Hacemos **planes personalizados**.

### Cómo funciona:

**Paso 1: Consulta de seguimiento médico (€195)**

Incluye:
- Tricoscopía digital (análisis del cuero cabelludo con cámara de alta resolución)
- Evaluación del injerto + pelo nativo
- Diagnóstico del estado actual
- Pauta médica personalizada (si necesitas tratamiento)

**Paso 2: Plan de mantenimiento (precio según pauta)**

Si el diagnóstico indica que necesitas tratamiento, te proponemos un plan adaptado a tu caso:
- PRP (plasma rico en plaquetas) — estimula crecimiento
- Mesoterapia capilar — fortalece folículos
- Tratamiento farmacológico (si es necesario)
- Combinación de técnicas

Todo supervisado por el mismo equipo médico que te operó.

**Paso 3: Seguimiento trimestral**

Revisiones cada 3-6 meses para ajustar el tratamiento según evolución.

### ¿Para quién es esto?

**Es para ti si:**
- Quieres que tu injerto se vea bien en 5-10 años, no solo ahora
- Notas que el pelo nativo (no injertado) sigue cayendo
- Valoras tu pelo y quieres proteger la inversión que hiciste

**NO es para ti si:**
- Tu pelo nativo está estable y denso (algunos pacientes no necesitan nada)
- Prefieres esperar y ver qué pasa

Nosotros te decimos en la consulta si lo necesitas o no. **Si no lo necesitas, te lo diremos.**

### Siguiente paso:

Agenda tu consulta de seguimiento. 30 minutos con nuestro equipo médico en {{clinica}}.

[Agendar consulta de seguimiento — €195]

_(O llámanos: {{teléfono_clínica}})_

Un saludo,

**Dr. {{nombre_doctor}}**  
Hospital Capilar {{clinica}}

---

**P.D.** Ya nos conoces. Ya confiaste en nosotros para la cirugía. Ahora deja que cuidemos el resultado a largo plazo.

---

**NOTAS DE SEGMENTACIÓN:**

- **Grupo A (3-6 meses):** Añadir línea: "Estás en el momento ideal para empezar mantenimiento. El injerto ya está consolidado, pero el pelo nativo puede empezar a debilitarse si no lo frenas ahora."
- **Grupo B (6-12 meses):** Línea adicional: "A los {{meses_desde_cirugia}} meses, es el momento de evaluar si necesitas refuerzo. La mayoría de pacientes empiezan a notar cambios en el pelo nativo entre el mes 6 y 12."
- **Grupo C (12-24 meses):** Cambiar tono a preventivo: "Han pasado más de {{meses_desde_cirugia}} meses. Ahora es cuando el mantenimiento marca la diferencia entre resultados estables y degradación gradual."

**⚠️ CRÍTICO:** Este email necesita link de agendamiento funcional (Koibox API integrada en GHL o Brevo).

---

---

# EMAIL 5: URGENCIA SUAVE — "Tu pelo sigue necesitando cuidado"

**Envío:** Día 14 — Martes 09:30  
**Propósito:** Cierre suave sin presión. Última oportunidad de conversión sin crear FOMO artificial. Tono: "Seguimos aquí cuando estés listo".  
**CTA:** Agendar consulta o responder con dudas.

---

## SUBJECT LINE VARIANTS

### ① "Última cosa sobre el mantenimiento capilar" — ★ RECOMENDADO
**Tipo:** Closure (cierre de conversación)  
**Rationale:** Indica que es el último email de la secuencia. Genera sensación de "ahora o nunca" sin ser agresivo. Funciona bien porque respeta al lector.  
**Preview text:** "Y luego volvemos al silencio. Promesa."

---

### ② "¿Agenda consulta o lo dejamos para más adelante?"
**Tipo:** Direct question (cierre binario)  
**Rationale:** Pregunta directa que fuerza una micro-decisión mental. Tono cercano. Funciona si la relación está construida.  
**Preview text:** "Sin presión. Solo quiero saber si es el momento o prefieres esperar."

---

### ③ "El mismo equipo que te operó, ahora cuida tu pelo"
**Tipo:** Emotional callback (recordatorio de confianza)  
**Rationale:** Refuerza el vínculo de confianza ("ya confiaste en nosotros una vez"). Menos urgencia, más conexión. Riesgo: puede sonar redundante si ya se usó antes.  
**Preview text:** "Consulta de seguimiento médico. Cuando estés listo."

---

**A/B Test Recomendado:** ① vs ②  
**Razón:** Testea cierre implícito ("última cosa") contra pregunta directa ("¿agendas o no?"). El ganador revela si prefieren suavidad o claridad binaria.

---

## EMAIL COPY

**Asunto:** Última cosa sobre el mantenimiento capilar  
**Preview:** Y luego volvemos al silencio. Promesa.

---

Hola {{Nombre}},

Este es mi último email sobre el mantenimiento capilar.

No quiero ser pesado. Solo quiero asegurarme de que tienes toda la información.

**Aquí está todo lo que te conté en una semana:**

1️⃣ El injerto trasplanta pelo, pero no detiene la caída del pelo nativo.

2️⃣ Pacientes que hicieron mantenimiento médico mantienen resultados densos y uniformes a largo plazo. Los que no, ven adelgazamiento gradual alrededor del injerto.

3️⃣ Ofrecemos consulta de seguimiento médico (€195): tricoscopía + diagnóstico + pauta personalizada si la necesitas.

**Y ahora la decisión es tuya.**

### Opción A: Agendar consulta

Si quieres proteger tu inversión y ver cómo está tu pelo realmente (injerto + nativo), agenda aquí:

[Agendar consulta de seguimiento — €195]

_(O llámanos: {{teléfono_clínica}})_

### Opción B: Dejarlo para más adelante

No pasa nada. Seguimos aquí cuando estés listo.

Simplemente ten en cuenta: **cuanto antes empiezas el mantenimiento, más fácil es frenar la caída**.

Esperar 2-3 años puede significar que necesites tratamiento más intensivo (o incluso un segundo injerto).

### Opción C: No lo necesitas

Si tu pelo nativo está estable, denso, sin señales de adelgazamiento, quizás no necesites nada.

En ese caso, ignora este email. Y si algún día notas cambios, ya sabes dónde estamos.

Un saludo,

**Dr. {{nombre_doctor}}**  
Hospital Capilar {{clinica}}

---

**P.D.** Gracias por confiar en nosotros para tu cirugía. Fue un placer cuidar de ti. Y seguirá siéndolo si decides que cuidemos de tu pelo a largo plazo.

---

**NOTAS DE SEGMENTACIÓN:**

- **Grupo A (3-6 meses):** Añadir línea antes del cierre: "Estás en el momento ideal. A los {{meses_desde_cirugia}} meses, el injerto ya está consolidado y el mantenimiento tiene máximo impacto."
- **Grupo B y C:** Email copy igual. Tono más relajado ("cuando estés listo").

**⚠️ IMPORTANTE:** Después de este email, no enviar más comunicaciones de cross-sell durante al menos 3 meses. Si no convirtieron en 14 días, necesitan espacio. Reactivar con nueva secuencia trimestral o anual.

---

---

# RESUMEN DE LA SECUENCIA

## ARQUITECTURA

```
Email 1 (D+0)  → Reactivación — "¿Cómo va tu pelo?"
Email 2 (D+3)  → Educativo — Por qué el mantenimiento importa
Email 3 (D+7)  → Social proof — Casos con/sin mantenimiento
Email 4 (D+10) → Oferta — Consulta + plan personalizado
Email 5 (D+14) → Urgencia suave — Cierre sin presión
```

**Patrón:** Straight Line (lineal, sin ramificaciones)

---

## TIMING COMPLETO

| Email | Día | Día de Semana | Hora | Subject Line Recomendado |
|-------|-----|---------------|------|--------------------------|
| 01 | 0 | Martes | 09:30 | "{{Nombre}}, ¿cómo va tu pelo?" |
| 02 | 3 | Viernes | 10:00 | "El injerto es el inicio, no el final" |
| 03 | 7 | Martes | 09:30 | "Carlos hizo mantenimiento. Alberto no." |
| 04 | 10 | Viernes | 10:00 | "Tu plan de mantenimiento capilar personalizado" |
| 05 | 14 | Martes | 09:30 | "Última cosa sobre el mantenimiento capilar" |

---

## CONVERSIÓN ESPERADA

| Segmento | Base | Conversión Esperada | Consultas/mes |
|----------|------|---------------------|---------------|
| Grupo A (3-6 meses) | ~800 pacientes | 40-45% | 320-360 consultas |
| Grupo B (6-12 meses) | ~1.200 pacientes | 30-35% | 360-420 consultas |
| Grupo C (12-24 meses) | ~2.000 pacientes | 25-30% | 500-600 consultas |
| **TOTAL** | **4.000 pacientes** | **~32% promedio** | **1.180-1.380 consultas** |

**Meta inicial:** 100-150 consultas/mes = 8-12% de la base contactada mensualmente.

**Escalado:** Enviar secuencia a 400-500 pacientes/mes (rotando por segmentos). Ajustar según capacidad de agenda médica.

---

## VARIABLES DE PERSONALIZACIÓN

Campos a mapear en CRM (Brevo/GHL):

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `{{Nombre}}` | Nombre del paciente | "Carlos" |
| `{{meses_desde_cirugia}}` | Meses desde la cirugía | "6 meses" |
| `{{clinica}}` | Clínica donde se operó | "Madrid" / "Murcia" / "Pontevedra" |
| `{{nombre_doctor}}` | Doctor que realizó cirugía | "Dr. Gómez" (opcional) |
| `{{teléfono_clínica}}` | Teléfono de la clínica | "+34 XXX XXX XXX" |
| `{{precio_cirugia}}` | Precio pagado (opcional) | "3.500" |

---

## MÉTRICAS CLAVE A TRACKEAR

| Métrica | Objetivo | Herramienta |
|---------|----------|-------------|
| **Open Rate** | >35% (Email 1), >25% (resto) | Brevo/GHL |
| **Click Rate (Email 4)** | >8% | Brevo/GHL |
| **Reply Rate (Email 1)** | >5% | Manual |
| **Consultas Agendadas** | 100-150/mes (fase piloto) | Koibox + GHL |
| **Conversión Consulta → Bono** | 35% (baseline) | GHL + Salesforce |
| **Unsubscribe Rate** | <2% | Brevo/GHL |

---

## SIGUIENTES PASOS

### Antes de lanzar:
- [ ] **Confirmar médico asignado** para consultas de seguimiento (bloqueante identificado en company-context)
- [ ] **Validar pricing** de consulta (€195 mencionado en emails — confirmar si es correcto)
- [ ] **Integrar Koibox API** con GHL/Brevo para agendamiento directo desde emails
- [ ] **Conseguir casos antes/después autorizados** para Email 3 (crítico para social proof)
- [ ] **Mapear variables de personalización** en CRM (meses desde cirugía, clínica, doctor)
- [ ] **Test A/B subject lines** en muestra de 200 pacientes antes de rollout completo

### Después del lanzamiento:
- [ ] Trackear métricas semanalmente (open, click, conversión)
- [ ] Iterar subject lines según performance real
- [ ] Ajustar timing si open rates son bajos en ciertos días/horas
- [ ] Crear secuencia trimestral para pacientes que no convirtieron en esta

---

## CADENAS SUGERIDAS

**Después de esta secuencia:**

1. **Si convierten:** Email de bienvenida al programa de mantenimiento (onboarding)
2. **Si no convierten:** Esperar 3 meses → Enviar secuencia trimestral más corta (3 emails)
3. **Si responden Email 1 con foto:** Respuesta manual del equipo médico + oferta de videollamada gratuita

**Promoción en otros canales:**

- `/content-atomizer` — Crear posts de Instagram/Facebook sobre "antes/después con mantenimiento" (usar Email 3 como base)
- Landing page específica para consulta de seguimiento (usar copy de Email 4)

---

**FIN DE LA SECUENCIA**

---

**Generado por:** Escudero (El Redactor)  
**Skill usado:** email-sequences v7.0  
**Fecha:** 26 de febrero de 2026  
**Cliente:** Hospital Capilar  
**Proyecto:** Cross-sell tratamientos a base post-cirugía
