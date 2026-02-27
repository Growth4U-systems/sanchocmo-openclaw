# Quiz Structure — "¿Qué le pasa a tu pelo?"
> Owner: /sancho (GTM) | Updated: 2026-02-26
> Implementa: Ramiro en GoHighLevel

## Objetivo
Capturar leads cualificados y segmentarlos por nicho antes de la llamada del asesor.
Resultado del quiz = personalización del approach comercial.

## Diseño del Quiz

### Pantalla 0: Hook
**Headline:** "Descubre qué le pasa a tu pelo en 2 minutos"
**Sub:** "Responde 6 preguntas y recibe un diagnóstico orientativo gratuito elaborado por nuestro equipo médico."
**CTA:** "Empezar diagnóstico →"
**Visual:** Imagen de tricoscopía (lo que se ve bajo el microscopio)

---

### Pregunta 1: Género
**"¿Cómo te identificas?"**
- ○ Hombre
- ○ Mujer
> **Routing:** Define messaging track (Nicho 1 vs Nicho 2)

### Pregunta 2: Edad
**"¿Cuál es tu rango de edad?"**
- ○ 18-25
- ○ 26-35
- ○ 36-45
- ○ 46-55
- ○ 56+
> **Scoring:** 26-45 = score alto (ideal target)

### Pregunta 3: Situación actual
**"¿Qué describes mejor tu situación?"**
- ○ Noto que se me cae más pelo de lo normal
- ○ Veo zonas con menos densidad
- ○ Tengo entradas / coronilla despoblada
- ○ Mi pelo está más fino y débil
- ○ Me hice un injerto y quiero mantener el resultado
> **Routing:** Opción 5 = Nicho 3 (post-cirugía). Opciones 1-2 = early stage. Opciones 3 = advanced.

### Pregunta 4: Tiempo
**"¿Desde cuándo notas este cambio?"**
- ○ Menos de 3 meses
- ○ 3-12 meses
- ○ 1-3 años
- ○ Más de 3 años
> **Scoring:** Menos tiempo = más urgencia percibida, más receptivo

### Pregunta 5: Intentos previos
**"¿Has probado algún tratamiento antes?"**
- ○ No, es la primera vez que busco ayuda
- ○ Sí, productos de farmacia (minoxidil, champús)
- ○ Sí, tratamientos en otra clínica
- ○ Sí, me hice un injerto capilar
> **Routing:** "Injerto capilar" = Nicho 3. "Otra clínica" = need differentiator messaging. "Primera vez" = education-heavy.

### Pregunta 6: Captura (lead)
**"¿Dónde te enviamos tu diagnóstico orientativo?"**
- Nombre: [___________]
- Email: [___________]
- Teléfono: [___________]
- Ciudad: [Madrid / Murcia / Pontevedra / Otra]
> **Nota:** Ciudad filtra por clínica disponible. "Otra" → waitlist para nuevas aperturas.

---

### Pantalla Resultado (personalizada por scoring)

#### Resultado A: Early Stage (Nicho 1/2, opciones 1-2 de P3)
**Headline:** "Buenas noticias: estás a tiempo de actuar"
**Body:** "Según tus respuestas, tu situación sugiere una fase inicial de pérdida capilar. En estos casos, un diagnóstico médico integral puede identificar la causa exacta y definir un tratamiento personalizado que frene la caída."
**CTA:** "Reserva tu diagnóstico capilar integral — €195"
**Incluye:** Tricoscopía + analítica hormonal + 30min con médico + pauta personalizada

#### Resultado B: Advanced (Nicho 1, opción 3 de P3)
**Headline:** "Tu pelo necesita atención profesional"
**Body:** "Tu situación sugiere una alopecia más avanzada. Un diagnóstico médico integral nos permitirá evaluar si necesitas tratamiento, cirugía, o una combinación de ambos. El primer paso es siempre el diagnóstico."
**CTA:** "Reserva tu diagnóstico capilar integral — €195"

#### Resultado C: Post-cirugía (Nicho 3, opción 5 de P3)
**Headline:** "Protege tu inversión con un plan de mantenimiento"
**Body:** "Después de un injerto capilar, el mantenimiento es clave para resultados duraderos. Nuestro equipo médico puede diseñar un plan personalizado para que tu pelo siga fuerte."
**CTA:** "Agenda tu consulta de seguimiento"

#### Resultado D: Mujer (Nicho 2, cualquier opción)
**Headline:** "Tu pelo habla de tu salud"
**Body:** "La pérdida capilar en mujeres tiene causas específicas (hormonales, nutricionales, estrés) que requieren un enfoque médico diferenciado. Nuestro diagnóstico integral incluye analítica hormonal para entender exactamente qué está pasando."
**CTA:** "Reserva tu diagnóstico médico capilar — €195"

---

## Lógica de Routing Post-Quiz (GHL)

```
Quiz completado
  ├─ Lead guardado en GHL (pipeline: Tratamientos)
  ├─ Tag automático: [género] + [edad] + [stage] + [ciudad]
  ├─ Email automático: "Tu diagnóstico orientativo" (personalizado por resultado)
  ├─ WhatsApp automático (D+0): "Hola [nombre], hemos recibido tu diagnóstico..."
  ├─ Asignación a asesor (por ciudad)
  └─ Si no responde en 48h → secuencia nurturing (3 emails + 2 WhatsApp)
```

## Métricas del Quiz
- **Completion rate target:** >60%
- **Lead capture rate target:** >40% de los que empiezan
- **Conversión quiz → consulta €195:** >15%
- **Conversión consulta → bono tratamiento:** 35% (target HC)

## Notas para Ramiro (GHL Implementation)
1. Usar GHL Survey/Funnel builder para el quiz
2. Cada respuesta debe ser un custom field en el contacto
3. Scoring automático para priorización de llamadas
4. Integrar con Koibox (API) para booking directo si es posible
5. Pixel de Meta + Google Tag en todas las pantallas del quiz
6. UTM tracking para atribuir por canal (Google Ads, Meta, orgánico, email)
