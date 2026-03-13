# Prompt: Presentación "Estrategia de Nichos y Posicionamiento" — Hospital Capilar

> **Objetivo:** Generar una presentación HTML con Reveal.js (theme white) para una sesión de trabajo de ~1.5 horas con el equipo directivo de Hospital Capilar. Se presentan los 7 nichos de pacientes elegidos, la justificación basada en datos de cada uno, el posicionamiento y messaging propuesto, y los próximos pasos (validar flujos + primeros tests de campaña). Tono: estratégico, basado en datos, directo. Idioma: español.

---

## ARCO NARRATIVO

La presentación cuenta una historia en 6 actos. Cada acto prepara el siguiente. No hay slide que exista sola — todas avanzan la narrativa.

**Acto 1 — "La puerta abierta"** (Slides 3-4): España tiene 20M de personas con alopecia, un mercado de €276M en tratamientos creciendo a doble dígito, y NADIE lo domina. La puerta está abierta de par en par.

**Acto 2 — "El héroe con la espada guardada"** (Slides 5-8): HC tiene el mejor producto, la mejor reputación y los mejores márgenes del sector. Pero su web dice "injerto", su contenido dice "cirugía" y sus pacientes potenciales de tratamientos ni saben que existen. Es como tener la mejor espada del reino... guardada en un cajón. Mientras tanto, los competidores tienen peor producto pero mejor visibilidad.

**Acto 3 — "Las 7 personas que están buscando"** (Slides 9-17): Hay 7 tipos de pacientes ahí fuera, cada uno con un dolor diferente, buscando una solución diferente, en un momento diferente del camino. HC puede hablarle a CADA uno de ellos con un mensaje que los haga sentir: "me están hablando a mí". Cada nicho es una historia humana — no un segmento de mercado.

**Acto 4 — "La verdad como arma"** (Slide 18): El posicionamiento de HC no es un slogan inventado — es lo que ya son. La clínica donde un médico te dice la verdad. Eso es imbatible en un sector lleno de vendedores. Y además, la regulación (Ley SARA) hace que ser honesto sea la ÚNICA estrategia sostenible.

**Acto 5 — "El plan de batalla"** (Slides 19-20): Estrategias concretas, priorizadas por impacto. Un modelo de consulta que vamos a testear (no asumir). 7 videos que activan cada nicho. Todo medible, todo ejecutable en semanas.

**Acto 6 — "La cuenta atrás"** (Slides 21-22): La ventana está abierta pero se está cerrando. Insparya puede pivotar. Cada semana sin lanzar es una semana regalada. Timeline, responsables, fechas. Y un cierre que deja claro: HC tiene todo para ganar. Solo falta el sistema para que la gente los encuentre.

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
  - Green: #2ECC9B (positivo, fortalezas)
  - Red: #E74C3C (negativo, gaps, urgencia)
  - Orange: #F39C12 (warning, prioridad media)
  - Blue: #2E5BFF (neutro)
  - Pink: #E91E90 (nicho mujeres)
  - Gold: #C9A96E (dorado para acentos premium)

- **Componentes reutilizables (CSS classes):**
  - `.card` / `.card-highlight` — tarjetas con border-radius 12px, sombra sutil
  - `.card-grid-2` / `.card-grid-3` / `.card-grid-4` — grids responsive
  - `.big-num` — números grandes cyan (font-size 48px, font-weight 800)
  - `.label` — etiquetas uppercase pequeñas (12px, letter-spacing 1px)
  - `.tag` / `.tag-green` / `.tag-red` / `.tag-orange` / `.tag-cyan` / `.tag-blue` / `.tag-pink` / `.tag-purple` — pills de prioridad
  - `.navy-box` — caja fondo navy con texto blanco, border-radius 12px
  - `.section-slide` — divisores de sección (fondo navy, número grande cyan semitransparente)
  - `.two-col` / `.three-col` — layouts columnas con gap 24px
  - `.source` — fuentes en itálica pequeña gris al pie de cada slide
  - `.badge-alta` / `.badge-media` / `.badge-estrategica` — badges de prioridad
  - `.niche-card` — card grande para detalle de nicho (border-left 5px color por nicho)
  - `.niche-header` — header del nicho con emoji grande + título + badge
  - `.quote-box` — cita de paciente real con borde izquierdo cyan, fondo gris claro
  - `.metric-row` — fila de métricas con label + big-num
  - `.timeline-item` — punto de timeline con círculo cyan + línea vertical
  - `.action-table` — tabla de acciones con responsable y deadline
  - `.uvp-banner` — banner central para UVP (fondo navy, texto grande blanco centrado)
  - `.legal-card-red` / `.legal-card-green` — cards para prohibido/permitido Ley SARA
  - `.video-mini-card` — mini card para guiones de video (emoji + título + gancho + target)
  - `.flow-card` — card para flujo de quiz con borde de color

- **Colores por nicho (usar en `.niche-card` border-left):**
  - Nicho #1 🪞 El Espejo: Navy #1B2A4A
  - Nicho #2 💊 La Farmacia: Orange #F39C12
  - Nicho #3 ❓ ¿Qué Me Pasa?: Purple #6B4C9A
  - Nicho #4 💸 La Inversión: Gold #C9A96E
  - Nicho #5 🏪 Ya Me Engañaron: Red #E74C3C
  - Nicho #6 👩 Es Normal: Pink #E91E90
  - Nicho #7 👶 Lo Que Vino Con el Bebé: Green #2ECC9B

- **Reveal config:** hash:true, slideNumber:'c/t', width:1100, height:700, transition:'fade', center:false, navigationMode:'linear'
- **Texto alineado a la izquierda** excepto en cover, section slides y UVP banner.
- **Cada slide DEBE tener fuente visible** al pie (class `.source`).
- **Cada dato es ÚNICO** — nunca repetir el mismo dato en dos slides diferentes.

---

## ESTRUCTURA DE SLIDES (22 slides)

---

### SLIDE 1 — PORTADA
- Header pequeño: "Hospital Capilar × Growth4U"
- Título grande: "Estrategia de Nichos y Posicionamiento"
- Subtítulo: "Tratamientos Capilares — Plan de Go-to-Market"
- Línea separadora cyan
- "Sesión de trabajo con el equipo — 14 Marzo 2026"
- Footer: "📋 6 bloques | ⏱️ ~1.5 horas | 🎯 7 nichos + Validación + Decisiones"
- Diseño: fondo navy degradado, texto blanco, tag dorado "Confidencial"
- Fuente: Growth4U — Análisis de mercado (43 fuentes, 9 competidores)

### SLIDE 2 — AGENDA
- Título: "Agenda"
- Subtítulo gris: "Cada bloque construye sobre el anterior. Los nichos nacen de los datos. Las estrategias nacen de los nichos."
- 6 bloques numerados con iconos, cada uno con 1 línea de contexto narrativo:
  1. 📊 **La oportunidad** — Un mercado de €276M sin dueño. Por qué tratamientos, por qué ahora.
  2. 🏥 **Dónde estamos hoy** — HC tiene el mejor producto. Pero el mundo no lo sabe.
  3. 🎯 **Los 7 nichos** — 7 tipos de pacientes, 7 dolores diferentes, 7 mensajes distintos.
  4. 💎 **Posicionamiento** — "La clínica de la verdad" — por qué HC gana siendo honesto.
  5. 🚀 **La propuesta** — Qué hacemos, cómo lo testeamos, qué contenido producimos.
  6. 📅 **Próximos pasos** — Del 14 al 24 de marzo: quién hace qué para llegar al lanzamiento.
- Fuente: Foundation analysis completo (Layers 0-4, 43 fuentes, 9 competidores analizados)

---

### ACTO 1: LA PUERTA ABIERTA

### SLIDE 3 — SEPARADOR SECCIÓN 01
- Section slide navy: número grande "01" en cyan semitransparente
- Título: "La Oportunidad"
- Subtítulo: "Un mercado enorme, en crecimiento, sin dueño — y una puerta que no va a estar abierta para siempre"

### SLIDE 4 — EL MERCADO QUE NADIE HA RECLAMADO
- Título: "España es el país con más alopecia de Europa — y el mercado de tratamientos es 4× el de cirugía"
- Narrativa introductoria (texto gris, 2 líneas max): "20 millones de españoles tienen algún grado de pérdida capilar. La mayoría no saben qué tienen, nunca han visto un especialista, y llevan años comprando cosas que no funcionan. Es el mercado sanitario de consumo más grande en el que nadie ha construido una marca de confianza."
- 4 cards grid-4 con `.big-num`:
  - **20M** — Españoles afectados (10M hombres + 9.6M mujeres). Label: "44.5% hombres, 40% mujeres"
  - **€276M** en cyan — Mercado tratamientos 2024. Label: "vs €63.8M cirugía — ratio 4:1"
  - **+12.1%** en green — Crecimiento 2024. Label: "CAGR más alto de Europa (7.05% hasta 2031)"
  - **<6%** — Cuota máxima de cualquier player. Label: "Mercado fragmentado, sin líder claro"
- `.two-col` debajo:
  - Left `.card-highlight` borde cyan "🎯 Por qué tratamientos — no cirugía":
    - El mercado de tratamientos es 4× más grande que cirugía en euros
    - Margen: 90% (vs 40% en cirugía) — cada euro facturado vale más del doble
    - Modelo recurrente: el paciente vuelve cada año. LTV multi-año vs one-shot
    - Cross-sell natural: 90% de hombres jóvenes en tratamiento → operables en el futuro
    - PMF ya validado: +88% crecimiento en HC SIN marketing dedicado. Imagina con marketing.
  - Right `.card` borde navy "💡 Por qué AHORA — la ventana":
    - 70% de personas con caída no tienen diagnóstico médico → oportunidad educacional masiva
    - DTC (Olistic Science, Keeps) está educando al mercado… y frustrando a sus clientes (ciclo fallo 1-2 años)
    - El cuadrante "tratamientos como core + enfoque médico riguroso" está VACÍO
    - Pero Insparya (€20.7M + CR7 + €2M I+D/año) puede pivotar en 12 meses
    - Potencial bottom-up: 20M × 10-15% buscan médico × ARPU €820-1,200 = **€1.6B — €3.6B**
- Fuente: Grand View Research, Mordor Intelligence, Stanpa, INE 2024, Market Research Future, Medihair 2025

---

### ACTO 2: EL HÉROE CON LA ESPADA GUARDADA

### SLIDE 5 — SEPARADOR SECCIÓN 02
- Section slide navy: "02" + "Dónde Estamos Hoy"
- Subtítulo: "HC tiene el mejor producto del sector. Pero su web dice 'injerto', su contenido dice 'cirugía', y los pacientes de tratamientos no saben que existen."

### SLIDE 6 — LO QUE HC YA TIENE (Y QUE NADIE MÁS TIENE)
- Título: "Hospital Capilar ya tiene los mejores cimientos del sector"
- Subtítulo gris: "Estos números no se compran con marketing. Se construyen con años de buen trabajo clínico."
- 4 cards grid-4 `.big-num` en green:
  - **4.8/5** — Trustpilot (mejor del sector). Label: "vs Insparya 3.8/5 — un punto ENTERO de diferencia"
  - **+88%** — Crecimiento tratamientos. Label: "Sin landing, sin quiz, sin paid, sin comercial dedicado"
  - **90%** — Margen tratamientos. Label: "vs 40% en cirugía — cada euro vale el doble"
  - **+4,000** — Pacientes atendidos. Label: "Con 3 clínicas. Expansión a 9 en 2026."
- 3 cards grid-3 debajo, cada una con una narrativa de por qué importa:
  - Card borde green "🩺 Enfoque médico genuino — lo que nadie más ofrece":
    - Tricólogo médico en CADA consulta (no esteticista, no comercial, no asesor)
    - Tricoscopía + analítica hormonal en 1 sola visita → diagnóstico completo
    - Protocolos propios: CRT (Capillary Regeneration Treatment) / HRT (Hair Redensification Treatment) — nombres de marca que no dependen de fármacos genéricos
    - Pauta anual completa y personalizada (no "ven cada mes y te ponemos lo mismo")
    - Diagnóstico de CAUSA, no de síntomas. "Te digo POR QUÉ se te cae, no solo QUÉ se te cae."
  - Card borde green "⭐ Reputación que se ha ganado, no comprado":
    - Mejor Trustpilot del sector: 4.8/5 con 75+ reviews reales
    - 95% satisfacción en trasplantes — y lo documentan
    - Transparencia radical: son la ÚNICA clínica que publica en su web "los tratamientos NO hacen crecer pelo nuevo". Eso genera confianza.
    - Pacientes valoran: "profesionalismo", "comunicación cercana", "resultados naturales", "mismo médico siempre"
  - Card borde green "📈 Modelo de negocio preparado para escalar":
    - €3.5M inversión de Inveready + Trainera → expansión 3→9 clínicas en 2026
    - Lifecycle completo bajo mismo techo: tratamiento → cirugía → mantenimiento
    - 152 tratamientos/mes llegan solos (baseline orgánico, sin funnel)
    - 17% de pacientes vienen referidos SIN programa formal — dinero dejado en la mesa
    - Google convierte 5× mejor que Meta para tratamientos — sabemos dónde invertir
- Fuente: Company Brief v1.4, Self-Analysis v1.0, Trustpilot, Forbes España, datos HC 2025

### SLIDE 7 — LA PARADOJA: EL MEJOR PRODUCTO, INVISIBLE
- Título: "El mejor producto del sector — con un sistema de captación que no le hace justicia"
- Subtítulo gris: "Los gaps NO son de producto ni de reputación. Son de visibilidad, funnel y operaciones."
- `.navy-box` arriba: "💡 La paradoja HC: 4.8/5 en Trustpilot, +88% crecimiento orgánico, 90% de margen — pero si un paciente busca 'tratamiento capilar' hoy, no encuentra Hospital Capilar. Encuentra Insparya, Svenson o un anuncio de Olistic Science. HC crece A PESAR del sistema, no GRACIAS a él."
- `.two-col`:
  - Left — Card borde red "🔴 El paciente llega a HC... y encuentra cirugía":
    - Homepage H1 literal: "Recupera tu pelo — expertos en **injerto** capilar"
    - Hero section: paquetes Gold/Gold+/Platinum (€3,145 — €4,345) → TODO cirugía
    - Tratamientos = sección secundaria, sin precio visible, sin CTA dedicado, sin funnel
    - 80% del tráfico web = búsquedas de cirugía. Solo 20% busca tratamientos.
    - Instagram/TikTok: ≈100% contenido de cirugía (antes/después, FUE, testimonios quirúrgicos)
    - 0 posts dedicados a tratamientos en los últimos 6 meses
    - No existe landing `/tratamientos` — solo una página informativa genérica
    - **Traducción:** Un paciente que busca tratamiento llega a HC, ve "injerto capilar" en grande, asume que HC es solo cirugía, y se va. A Svenson. O a comprar otro bote de Olistic.
  - Right — Card borde red "🔴 Los que SÍ llegan... no aparecen":
    - **No-shows** (dato HC 2025): Madrid **47%**, Murcia **40%**, Pontevedra **25%**
    - Casi 1 de cada 2 leads confirmados no aparece a la consulta
    - Sin sistema de recordatorios automatizados (ni WhatsApp, ni SMS, ni email pre-cita)
    - Sin pago previo como filtro de compromiso — cero fricción = cero commitment
    - **Reviews:** 75 reviews en Trustpilot — TODAS hablan de cirugía. Cero de tratamientos.
    - No se pide activamente al paciente que deje review después de tratamiento
    - 17% de pacientes vienen por referido SIN programa → si se formalizara, podría ser 25-30%
    - Sin comercial dedicado a tratamientos — cirugía tiene equipo propio, tratamientos no
    - **Traducción:** HC genera 152 tratamientos/mes a pesar de no tener funnel, no tener landing, no tener reviews de tratamientos, y perder la mitad de los leads por no-shows. Imagina qué pasa cuando arreglamos todo eso.
- `.card-highlight` borde cyan abajo: "🎯 **La buena noticia:** Estos gaps se cierran en semanas. No requieren cambiar el producto, contratar médicos, ni abrir clínicas nuevas. Son marketing + operaciones. Exactamente lo que estamos aquí para construir juntos."
- Fuente: Self-Analysis v1.0, Company Brief v1.4, datos HC 2025, hospitalcapilar.com (analizado Feb 2026)

### SLIDE 8 — LA COMPETENCIA: TODOS VULNERABLES
- Título: "5 competidores que facturan más — pero cuyos pacientes están descontentos"
- Subtítulo gris: "Hemos analizado 9 competidores. Estos 5 son los relevantes. Todos tienen tratamientos. Ninguno los hace bien."
- 5 `.card` en layout 3 arriba + 2 abajo. Cada card tiene estructura: "Lo que parecen" / "Lo que son" / "Cómo les ganamos":
  - Card borde orange **Insparya** — "El gigante con pies de barro" (€20.7M, 5 clínicas, CR7):
    - **Lo que parecen:** El líder indiscutible. CR7 como embajador. Facturación de €20.7M. Marketing impecable. 5 clínicas premium.
    - **Lo que son:** 3.8/5 en Trustpilot. Reviews: *"te tratan como ganado"*, *"seguimiento nefasto"*, *"cada vez un médico diferente"*, *"un completo desastre después de pagar 5.000€"*. Modelo fábrica: volumen > calidad. Tratamientos = add-on sin protocolo propio (oral, plasma, mesoterapia genérica).
    - **La amenaza real:** €2M/año en I+D. Capacidad de pivotar a tratamientos-first en 12 meses si ven la oportunidad. Por eso la velocidad importa.
    - **Cómo ganamos:** Mismo médico siempre + diagnóstico completo + transparencia radical + 4.8/5 vs 3.8/5
  - Card borde orange **Svenson** — "La marca que se vendió" (€17.4M, 31 clínicas):
    - **Lo que parecen:** La marca legacy. 31 centros = omnipresencia. Décadas de historia.
    - **Lo que son:** Esteticistas con bata, no médicos. Estuvieron en concurso de acreedores (NK5 los rescató con +26% ventas proyectadas). OCU denuncia: *"No presentan alternativas, insisten en la solución más cara."* Review real: *"Fui pensando en un tratamiento y salí con un presupuesto de 10.000€."*
    - **Pricing:** €1,300-2,600 por tratamientos equivalentes a los que HC ofrece por €820. Modelo de sesiones mensuales (fidelización forzada, no por valor).
    - **Novedad:** svenson-responde.es (micro-site de transparencia). ¿Están aprendiendo? Posiblemente. Pero partiendo de una posición débil.
    - **Cómo ganamos:** €820 vs €1,300-2,600 + médico real + pauta anual (no sesiones mensuales) + sin presión de venta
  - Card borde red **Capilclinic** — "SEO brutal, producto débil" (low cost, SEO top):
    - **Lo que parecen:** Alternativa accesible. Dominan keywords genéricos en Google. Presencia digital fuerte.
    - **Lo que son:** Tratamientos = add-ons post-cirugía, sin protocolo médico propio, sin analítica hormonal, sin diagnóstico de causa.
    - **El peligro real:** Su posicionamiento SEO captura el tráfico que HC debería tener. Un paciente busca "tratamiento capilar Madrid" y encuentra Capilclinic antes que HC. Eso se arregla con landing + SEO + paid.
    - **Cómo ganamos:** Diagnóstico completo (tricoscopía + analítica hormonal) vs "vistazo rápido y ponte minoxidil"
  - Card borde orange **Medical Hair** — "Las reviews que no cuadran" (€70/sesión, modelo satélite):
    - **Lo que parecen:** Accesibles y populares. 1,570 reviews con 4.9/5. Modelo escalable con dermatólogos locales.
    - **Lo que son:** Reviews sospechosamente uniformes (posible incentivo). Sin analítica hormonal. Modelo franquicia = sin control de calidad centralizado. Sesiones sueltas a €70 vs pauta anual integrada.
    - **Cómo ganamos:** Modelo integrado vs satélite. Pauta anual personalizada con seguimiento real vs sesiones aisladas sin plan.
  - Card borde orange **IMD** — "Belleza, no medicina" (21 clínicas, enfoque mujer):
    - **Lo que parecen:** Líderes en público femenino. 21 centros. Marketing emocional y bien ejecutado.
    - **Lo que son:** Esteticistas hacen de comerciales. Sin analítica hormonal. Modelo de centro de belleza, no clínica médica. El diagnóstico es superficial.
    - **Cómo ganamos:** Tricólogo real + analítica hormonal + protocolo médico genuino. Cuando HC lance nicho mujeres con enfoque médico, IMD pierde su principal ventaja.
- `.navy-box` abajo: "📊 **La conclusión:** Todos tienen tratamientos. Ninguno tiene diagnóstico completo (tricoscopía + analítica hormonal) + protocolos propios (CRT/HRT) + pauta anual personalizada + transparencia radical + 4.8/5 Trustpilot. El cuadrante 'tratamientos como core + enfoque médico riguroso' está vacío. HC es el ÚNICO que puede ocuparlo. Pero la ventana no es eterna."
- Fuente: Competitor Intelligence v1.0, Trustpilot (Insparya 3.8/5, HC 4.8/5), OCU, Meta Ad Library, svenson-responde.es, datos HC 2025

---

### ACTO 3: LAS 7 PERSONAS QUE ESTÁN BUSCANDO

### SLIDE 9 — SEPARADOR SECCIÓN 03
- Section slide navy: "03" + "Los 7 Nichos"
- Subtítulo: "No son segmentos de mercado. Son personas reales con dolores reales. Cada una necesita escuchar algo diferente."

### SLIDE 10 — VISIÓN GENERAL: 7 PACIENTES, 7 MOMENTOS, 7 MENSAJES
- Título: "7 nichos que cubren todo el journey del paciente — de 'algo me pasa' a 'necesito cambiar de clínica'"
- Subtítulo gris: "Cada nicho captura un MOMENTO diferente. No competimos por el mismo paciente 7 veces — los encontramos en 7 puntos distintos de su camino."
- Narrativa breve (texto gris, 2 líneas): "Un joven de 23 años que se mira en el espejo, una mujer de 50 que ve cómo se afina su pelo, una madre postparto que llena la almohada de pelos, un frustrado que lleva 2 años con minoxidil sin resultado — todos necesitan a HC. Pero no les puedes decir lo mismo. Estos son los 7 mensajes."
- Tabla `.action-table` con header navy, 7 columnas:

| # | Nicho | Quién es (1 frase) | SAM | A quién le quitamos mercado | Prioridad | Fase funnel |
|---|---|---|---|---|---|---|
| 🪞 1 | El Espejo de Cada Mañana | Joven 20-28, ve cómo se le cae el pelo y no sabe qué hacer | ~80K | **Olistic Science / Keeps** (DTC que captura jóvenes primero) + **Capilclinic** (SEO les roba el tráfico) | `.badge-alta` ALTA | Awareness |
| 💊 2 | La Farmacia Sin Salida | Lleva 1-3 años con minoxidil/suplementos. No funciona. | ~70K | **Olistic Science** (700K clientes, muchos fallarán → nuestro pipeline) + **OTC genérico** (minoxidil/biotina) | `.badge-alta` ALTA | Consideration |
| ❓ 3 | ¿Qué Me Pasa? | Se le cae el pelo y no sabe por qué. No ha visto a un especialista. | ~150K | **Capilclinic** (domina SEO genérico) + **Sistema público** (3-6 meses espera = HC gana por velocidad) | `.badge-alta` ALTA | Awareness |
| 💸 4 | La Inversión Que Se Deshace | Se operó (Turquía o España) y nadie le dijo que el pelo nativo sigue cayendo. | ~25K | **Clínicas Turquía** (operan sin plan de mantenimiento) + **Insparya** (cirugía sin follow-up médico real) | `.badge-media` MEDIA | Consideration |
| 🏪 5 | Ya Me Engañaron | Fue a otra clínica. Le vendieron. Busca un médico de verdad. | ~12K | **Insparya** (3.8/5 TP, fuente principal de insatisfechos) + **Svenson** (1.5/5 TP, presión comercial, OCU) | `.badge-media` MEDIA | Decision |
| 👩 6 | Es Normal, Ya Pasará | Mujer menopausia/perimenopáusica (45-55). Su médico le dijo "es la edad". | ~9.6M afectadas | **IMD** (21 clínicas, esteticistas no médicos) + **Blue ocean** (nadie segmenta mujeres 45-55 con enfoque médico) | `.badge-estrategica` ESTRATÉGICO | Awareness |
| 👶 7 | Lo Que Vino Con el Bebé | Mujer postparto (28-38). Le dijeron "ya pasará". Llevan meses. | ~60K/año | **OTC** (Iraltone, champús) + **Vacío de oferta médica** (ginecólogos no derivan) | `.badge-estrategica` ESTRATÉGICO | Awareness |

- Fuente: Niche Discovery v1.0, Company Brief v1.5, datos HC 2025, Pfizer España 2024, cita Óscar Mendoza reunión 10/03

### SLIDE 11 — NICHO #1: EL ESPEJO DE CADA MAÑANA
- `.niche-card` con border-left navy 5px
- `.niche-header`: 🪞 emoji 40px + "Nicho #1: El Espejo de Cada Mañana" bold 22px + `.badge-alta`
- Subtítulo gris bajo el header: "Jóvenes 20-28 con alopecia temprana — el segmento con mayor LTV de todo el funnel"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **Olistic Science / Keeps** (DTC que captura jóvenes primero) y **Capilclinic** (SEO les roba el tráfico que debería ser nuestro)"
- `.quote-box`: *"Llevo un par de años sin intentar tener citas — en parte porque me da mucha vergüenza mi línea del pelo. Llevo gorra todos los días desde hace 3 años."* — r/dating_advice, hombre 25 años
- Narrativa de contexto (1-2 líneas gris debajo de la cita): "Tiene 24 años. Cada mañana se mira en el espejo y ve menos pelo. Busca en TikTok, en Reddit, en Google. Compra minoxidil. No va al médico porque 'no es para tanto'. Pero lleva gorra todo el día. En invierno, en verano, en fotos, en citas. 3 años así."
- `.three-col`:
  - Col 1 — `.label` "📊 POR QUÉ LO ELEGIMOS":
    - 82% de pacientes HC son hombres (dato HC 2025)
    - 25% de 18-24 años ya tiene caída activa (estudio Svenson)
    - GenZ busca en TikTok/Reddit ANTES que en médico — ahí es donde les encontramos
    - LTV máximo de todos los nichos: tratamiento crónico → cirugía futura → mantenimiento de por vida
    - 90% de hombres jóvenes en tratamiento son operables a futuro (cross-sell natural)
    - La madre como influencer oculto: investiga, recomienda y/o paga. Hay que hablarle a ella también.
  - Col 2 — `.label` "💬 QUÉ LE DECIMOS":
    - **Gancho:** "3 años con gorra. Hoy me la quité."
    - **USP 1:** "No es tu culpa. Pero sí es tu decisión."
    - **USP 2:** "Aquí nadie va a venderte nada — te vamos a decir qué tienes y qué opciones hay"
    - **USP 3:** "Un médico de verdad, no un asesor capilar con bata"
    - **Mensaje clave (reunión 10/03):** "No te hagas cirugía todavía — primero hay que estabilizar la alopecia. Hay pacientes jóvenes que solo necesitan tratamiento."
    - Tono: sin paternalismo, sin drama. Directo, real, como habla un amigo que es médico.
  - Col 3 — `.label` "📱 DÓNDE LE ENCONTRAMOS":
    - **TikTok/Reels** — Video "3 años con gorra" (gancho: plano gorra quitándose, cara real)
    - **Google Ads** — "alopecia joven", "caída pelo 20 años", "alopecia androgenética joven", CPC €1-3
    - **Reddit** — r/tressless (500K+ suscriptores, el foro más grande de alopecia del mundo)
    - **Quiz online** — 4-5 preguntas → resultado personalizado → CTA consulta diagnóstica
    - Contenido educativo: mitos de alopecia, efectos secundarios REALES (sin paternalismos), qué esperar en una primera consulta
- Fuente: Company Brief v1.4, datos HC 2025, Svenson estudio jóvenes, r/dating_advice, r/tressless

### SLIDE 12 — NICHO #2: LA FARMACIA SIN SALIDA
- `.niche-card` con border-left orange 5px
- `.niche-header`: 💊 + "Nicho #2: La Farmacia Sin Salida" + `.badge-alta`
- Subtítulo gris: "Usuarios OTC frustrados — llevan 1-3 años con minoxidil, suplementos, champús especiales… y siguen perdiendo pelo"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **Olistic Science** (700K clientes globales, muchos fallarán = nuestro pipeline) y **OTC genérico** (minoxidil, biotina, champús)"
- `.quote-box`: *"Empecé con minoxidil y microneedling en enero 2024... en 3-4 meses noté mejoría... Ahora un año después, la caída ha continuado. He gastado más de 1.200€."* — u/Paul_iio, r/tressless
- Narrativa de contexto: "Ha probado todo: minoxidil, biotina, champú anticaída, Olistic, dermaroller. Al principio parecía que funcionaba. Después dejó de funcionar. Ahora tiene menos pelo Y menos dinero. El siguiente paso lógico es un médico — pero no sabe que existe una clínica que empieza por el diagnóstico, no por venderle otro producto."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - ~400-500K usuarios minoxidil en España (estimación sectorial)
    - Olistic Science: 700K+ clientes globales. Muchos fallarán. Son nuestro pipeline.
    - El ciclo es predecible: 1-2 años OTC → no funciona → frustración → busca médico
    - 84% intentan auto-tratamiento antes de consultar a un profesional
    - El MOMENTO de captura es preciso: cuando "deja de funcionar". Ahí hay intent puro.
    - Google Ads captura exactamente ese momento: "minoxidil no funciona"
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "1.200€ en productos. 0 diagnósticos. Algo falla — y no es el minoxidil."
    - **USP 1:** "No necesitas otro producto. Necesitas saber qué tienes."
    - **USP 2:** "De 'a ver si funciona' a 'sé exactamente qué funciona y por qué'"
    - **USP 3:** "La escalera lógica: OTC → diagnóstico médico → protocolo personalizado → resultados medibles"
    - Posición HC: el paso NATURAL después de que el OTC falla. No competimos con Olistic — somos lo que viene después.
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Google Ads** — "minoxidil no funciona", "caída de pelo después de minoxidil" (intent 100%), CPC medio
    - **SEO blog** — "Por qué el minoxidil dejó de funcionarte" / "3 razones por las que tu tratamiento OTC no funciona"
    - **Reddit** — r/tressless, respondiendo en threads de frustración (organic, no ads)
    - **Retargeting** — Usuarios que han visitado webs de Olistic Science, Keeps, Hims
    - Blog educativo: la escalera OTC → médico → protocolo (content funnel)
- Fuente: r/tressless, estimación sectorial minoxidil España, Olistic Science data pública

### SLIDE 13 — NICHO #3: ¿QUÉ ME PASA?
- `.niche-card` con border-left purple 5px
- `.niche-header`: ❓ + "Nicho #3: ¿Qué Me Pasa?" + `.badge-alta`
- Subtítulo gris: "Sin diagnóstico médico — no saben qué tipo de alopecia tienen, ni que existen más de 20 tipos"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **Capilclinic** (domina SEO genérico que captura estas búsquedas) y **Sistema público** (3-6 meses espera → HC gana por velocidad)"
- `.quote-box`: *"70% de los españoles no saben qué es la alopecia areata."* — Pfizer España 2024
- Narrativa de contexto: "Se le cae el pelo. Busca en Google '¿por qué se me cae el pelo?' y obtiene 47 millones de resultados. Lee sobre estrés, sobre hormonas, sobre genética, sobre tiroides. No sabe cuál es SU caso. Su médico de cabecera le dice 'es normal' o le receta minoxidil sin diagnóstico. El dermatólogo público tiene 3-6 meses de espera. Mientras tanto, el pelo sigue cayendo."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - SAM ~150K — el nicho con mayor volumen de pacientes alcanzables
    - 70% de personas con caída no tienen diagnóstico médico específico
    - Dermatólogo público: lista de espera 3-6 meses. Es demasiado.
    - Entry point PERFECTO para el funnel: quiz (4-5 preguntas) → "parece que podrías tener X" → consulta diagnóstica
    - La mayoría busca soluciones OTC por defecto porque NO SABEN que necesitan un diagnóstico
    - Conversión natural: educación gratuita → diagnóstico → protocolo personalizado → paciente de por vida
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "47 millones de resultados en Google. Ninguno te dice qué tienes TÚ."
    - **USP 1:** "Tricoscopía + analítica hormonal — no un vistazo rápido y 'ponte minoxidil'"
    - **USP 2:** "¿6 meses de espera para el dermatólogo? Diagnóstico completo en 1 semana."
    - **USP 3:** "Saber qué tienes. Sin compromiso. Luego tú decides."
    - Tono: educativo, no comercial. "Te ayudamos a entender qué pasa" antes de "te vendemos algo".
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Quiz HC** — El arma principal. Primer contacto, baja fricción: 4-5 preguntas → resultado orientativo → CTA consulta
    - **Google Ads** — "diagnóstico capilar", "por qué se me cae el pelo", "tipos de alopecia", CPC €1-2
    - **SEO** — "por qué se me cae el pelo" (volumen alto, intent perfecto)
    - **TikTok** — Video "Google no es un médico" (screen recording de búsqueda confusa → corte a clínica real con tricoscopio)
    - Contenido educativo: "Los 5 tipos de alopecia más comunes" explicados por un médico real
- Fuente: Pfizer España 2024, Market Intelligence v1.1, datos sistema público de salud (listas espera)

### SLIDE 14 — NICHO #4: LA INVERSIÓN QUE SE DESHACE
- `.niche-card` con border-left gold 5px
- `.niche-header`: 💸 + "Nicho #4: La Inversión Que Se Deshace" + `.badge-media`
- Subtítulo gris: "Post-trasplante sin mantenimiento — operados en Turquía o España que nadie advirtió: el pelo nativo sigue cayendo"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **Clínicas Turquía** (operan sin plan de mantenimiento) e **Insparya** (cirugía sin follow-up médico real para pelo nativo)"
- `.quote-box`: *"Tomé una decisión impulsiva y estúpida de ir a una fábrica de pelo en Turquía. 8 meses después, el pelo trasplantado crece pero el resto sigue cayéndose. Nadie me dijo que necesitaba tratamiento de mantenimiento."* — r/HairTransplants
- Narrativa de contexto: "Se gastó €3,500 en Estambul. Le dijeron que el resultado sería 'para siempre'. Nadie le explicó que el pelo trasplantado es permanente, pero el pelo nativo de alrededor sigue sometido a la alopecia. 3 años después, tiene una isla de pelo trasplantado rodeada de calva. Necesita tratamiento de mantenimiento — y nadie se lo ofreció."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - 20,000 españoles/año se operan en Turquía + ~15,000 en España
    - 10% de los tratamientos HC actuales = pacientes post-cirugía (dato HC 2025) — ya llegan solos
    - La mayoría SIN protocolo de mantenimiento post-quirúrgico
    - El pelo NATIVO sigue cayendo (androgenética no se detiene con un trasplante) — nadie lo advierte
    - Disposición a pagar demostrada: ya invirtieron €3,000-8,000 en cirugía. €820/año es nada en comparación.
    - Patrón de retorno: vuelven ~3 años después cuando el pelo vuelve a caer
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "Tu trasplante costó miles de euros. ¿Quién cuida el pelo que queda?"
    - **USP 1:** "El pelo trasplantado se queda. El pelo nativo no. Sin tratamiento, la alopecia sigue."
    - **USP 2:** "Cirugía y tratamiento bajo el mismo techo — HC es el único sitio donde no te mandan a otro lado"
    - **USP 3:** "Proteger una inversión de €3,000+ por €820/año. Es mantenimiento, no gasto extra."
    - Mensaje: no estás empezando de nuevo. Estás completando lo que empezaste.
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Google Ads** — "mantenimiento post injerto", "pelo cae después de trasplante" (bajo volumen, intent 100%)
    - **YouTube** — Educativo: "Pelo nativo vs trasplantado — lo que nadie te explica" (animación + médico)
    - **Facebook/Reddit grupos** — Comunidades de trasplante capilar (turismo médico Turquía)
    - **Landing específica** — "¿Operado y sin seguimiento? Tu pelo nativo sigue en riesgo."
    - Video "Lo que no me dijeron en Turquía" — plano cenital coronilla, zona trasplantada vs nativa
- Fuente: Company Brief v1.4, datos HC 2025, r/HairTransplants, Market Intelligence v1.1

### SLIDE 15 — NICHO #5: YA ME ENGAÑARON
- `.niche-card` con border-left red 5px
- `.niche-header`: 🏪 + "Nicho #5: Ya Me Engañaron" + `.badge-media`
- Subtítulo gris: "Insatisfechos de otras clínicas — fueron a Insparya, Svenson o IMD, les vendieron, y buscan un médico de verdad"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **Insparya** (3.8/5 TP, fuente #1 de insatisfechos) y **Svenson** (presión comercial documentada por OCU, esteticistas como médicos)"
- `.quote-box`: *"Todo es marketing. Decepcionante... revisiones impersonales, cada vez con un médic@ diferente... un completo desastre... después de pagar 5.000 euros."* — Trustpilot Insparya, review 1 estrella
- Narrativa de contexto: "Fue a Insparya. Le atendió un 'asesor' que resultó ser un comercial con bata. Le recomendaron cirugía directamente — sin diagnóstico completo, sin considerar si tratamiento bastaba. Pagó 5.000€. El seguimiento fue nefasto: cada visita un médico diferente, sin continuidad. Ahora busca alguien que le trate como paciente, no como ticket. Busca en Google 'opiniones Insparya' y encuentra que no es el único."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - Insparya: 3.8/5 Trustpilot — quejas sistemáticas y documentadas de venta agresiva
    - Svenson: OCU denuncia presión comercial. Esteticistas diagnosticando.
    - HC ya recibe estos pacientes orgánicamente, por 2 motivos: 1) desinformación previa, 2) insatisfacción con modelo de sesiones mensuales sin plan (dato HC 2025)
    - Son pacientes ya en el mercado = intent 100%, disposición a pagar PROBADA
    - Valoran explícitamente que HC primero valora el caso, no habla directamente de cirugía
    - Bajo volumen pero ALTA conversión y alto ticket — cada lead convertido vale mucho
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "En tu anterior clínica te atendió un vendedor. Aquí te atiende un médico."
    - **USP 1:** "Aquí te atiende un médico. Siempre el mismo. En cada visita."
    - **USP 2:** "Si con tratamiento basta, te lo decimos. No todo el mundo necesita cirugía."
    - **USP 3:** "Tu progreso registrado. Tu historial completo. Nada de empezar de cero cada visita."
    - **USP 4:** "4.8/5 en Trustpilot — lee las reviews de pacientes que cambiaron de clínica"
    - Tono: validar su frustración. "No fue tu culpa. El sistema les premia por venderte."
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Google** — "opiniones Insparya", "opiniones Svenson", "problemas Insparya" (SEO + SEM)
    - **SEO comparativo** — Páginas "Hospital Capilar vs Insparya" / "vs Svenson"
    - **Trustpilot** — Solicitar reviews estratégicas a pacientes que cambiaron de clínica
    - **Retargeting** — Visitantes de webs de Insparya, Svenson, IMD
    - Video "5.000€ y un vendedor" — storytime confesional a cámara, tono real
- Fuente: Trustpilot Insparya/Svenson, OCU, datos HC 2025, Competitor Intelligence v1.0

### SLIDE 16 — NICHO #6: ES NORMAL, YA PASARÁ
- `.niche-card` con border-left pink #E91E90 5px
- `.niche-header`: 👩 + "Nicho #6: Es Normal, Ya Pasará" + `.badge-estrategica` tag morado ESTRATÉGICO
- Subtítulo gris: "Mujeres menopausia/perimenopáusicas (45-55) — el nicho más grande, más silenciado y más rentable del sector femenino"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **IMD** (21 clínicas enfoque mujer, pero esteticistas no médicos, sin analítica hormonal) + **Blue ocean** (nadie segmenta mujeres 45-55 con enfoque médico real)"
- `.quote-box`: *"Tengo 51 años y llevo un año viendo cómo la raya se ensancha. Mi médico me dijo 'es la menopausia, es normal'. Normal no es perder pelo cada día. Normal es que alguien me diga qué está pasando."* — Síntesis basada en r/FemaleHairLoss
- Narrativa de contexto: "Tiene 50 años. Nota que el pelo se afina, la raya se ensancha, la cola de caballo cada vez más fina. Su médico dice 'es la edad'. Pero NO es solo la edad — es un cambio hormonal (primera menopausia, postmenopausia) que es tratable. Óscar Mendoza, fundador de HC, lo dice textual: 'Entre 45 y 55 es el nicho. Brutal lo fácil que es captarlas.' Tiene poder adquisitivo alto, es constante con tratamientos si ve resultados, y no hay NADIE en España posicionándose para hablarle directamente."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - 9.6M mujeres afectadas en España (40% experimentan adelgazamiento capilar)
    - 18% de pacientes HC ya son mujeres (dato HC 2025) — sin hacer nada específico
    - Óscar Mendoza (fundador HC): "entre 45 y 55 es el nicho — brutal lo fácil que es captarlas"
    - Tres momentos críticos: primera menopausia, perimenopáusica, postmenopausia
    - NINGÚN competidor en España segmenta messaging específico para mujeres 45-55
    - IMD tiene 21 clínicas pero son esteticistas — no hacen analítica hormonal
    - Poder adquisitivo alto, constancia en tratamientos, carga emocional profunda (identidad + tabú)
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "Te dijeron que es la edad. No es la edad. Es un cambio hormonal que tiene solución."
    - **USP 1:** "No es 'normal'. Es un diagnóstico que nadie te ha hecho."
    - **USP 2:** "Analítica hormonal + tricoscopía — no un vistazo rápido y 'ponte biotina'"
    - **USP 3:** "Si no necesitas tratamiento, te lo decimos. Sin rodeos."
    - Quiz segmentado por sexo desde la pregunta 1 — el flujo femenino pregunta ciclo hormonal, menopausia, SOP, tiroides
    - Tono: validación + autoridad médica. "Lo que sientes es real. Vamos a averiguar qué es."
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Google Ads** — "caída pelo menopausia", "pelo fino menopausia", "alopecia mujer 50 años", CPC bajo (baja competencia)
    - **Facebook** — Audiencia principal de mujeres 45-55 (IG es secundario para este perfil)
    - **Dermatólogos y ginecólogos** — Partnership de derivación (principal puerta de entrada)
    - **IG/TikTok** — Video "La raya que se ensancha" (plano cenital, raya del pelo, voz en off femenina íntima)
    - **Quiz** — Flujo femenino dedicado (preguntas sobre ciclo hormonal, menopausia, SOP, tiroides)
    - Nota: Algunas alopecias femeninas NO son tratables pero SÍ diagnosticables → el quiz filtra y redirige. HC gana confianza incluso cuando dice "esto no lo podemos tratar".
- Fuente: datos HC 2025, cita Óscar Mendoza reunión 10/03/2026, r/FemaleHairLoss

### SLIDE 17 — NICHO #7: LO QUE VINO CON EL BEBÉ
- `.niche-card` con border-left green #2ECC9B 5px
- `.niche-header`: 👶 + "Nicho #7: Lo Que Vino Con el Bebé" + `.badge-estrategica` tag morado ESTRATÉGICO
- Subtítulo gris: "Mujeres postparto (28-38) — el efecto secundario del embarazo que nadie te avisa y todos minimizan"
- `.tag-red` inline: "🎯 Le quitamos mercado a: **OTC** (Iraltone, champús anticaída = lo que prueban primero) + **Vacío de oferta médica** (ginecólogos no derivan a especialista capilar)"
- `.quote-box`: *"'Es normal después del parto, ya pasará' — me dijo mi ginecóloga. Han pasado 14 meses. No ha pasado. Cada mañana cuento los pelos en la almohada. Mi marido dice que no se nota. Se nota."* — Síntesis basada en r/FemaleHairLoss
- Narrativa de contexto: "Tiene 33 años. Tuvo a su hijo hace 8 meses. A los 3 meses empezó a caérsele el pelo 'a puñados' en la ducha. Su ginecóloga dijo 'efluvio telógeno, es normal, pasará'. No pasó. Ha probado Iraltone, biotina, champú anticaída. Nada funciona. Le da vergüenza salir sin cola de caballo. Mezcla de angustia ('¿me estoy quedando calva?') y culpa ('debería estar feliz por mi bebé, no preocupada por mi pelo'). Ninguna clínica capilar le habla directamente a ella."
- `.three-col`:
  - Col 1 — "📊 POR QUÉ":
    - ~200K nacimientos/año en España × 30% con caída postparto significativa = ~60K potenciales/año
    - Journey completamente distinto al de menopausia: trigger agudo (parto), componente emocional diferente (culpa materna), presupuesto más ajustado (vuelta de baja)
    - Ginecólogos no derivan — dicen "es normal" y se acaba la conversación
    - El ciclo OTC es más corto (6-12 meses) → buscan solución médica más rápido que otros nichos
    - Canal de captación diferente: Instagram mamás, foros maternidad, grupos Facebook maternidad
    - Si funciona, se fideliza de por vida — y recomienda a amigas (referidos naturales)
  - Col 2 — "💬 QUÉ LE DECIMOS":
    - **Gancho:** "14 meses después del parto y sigue cayendo. Eso no es 'normal'. Es un diagnóstico que nadie te ha hecho."
    - **USP 1:** "Tu ginecóloga no es especialista capilar. Nosotros sí."
    - **USP 2:** "Postparto no es igual que menopausia. Tu protocolo tampoco debería serlo."
    - **USP 3:** "Si es efluvio telógeno y va a pasar solo, te lo decimos. Sin cobrarte un tratamiento innecesario."
    - Tono: validación + empatía + autoridad. "Lo que sientes es real. No estás exagerando. Vamos a averiguar qué es."
  - Col 3 — "📱 DÓNDE LE ENCONTRAMOS":
    - **Instagram** — Comunidades de mamás, reels "Lo que nadie te cuenta del postparto" (contenido que ya consumen)
    - **Google Ads** — "caída pelo postparto", "pelo se cae después del parto", "efluvio telógeno postparto", CPC bajo
    - **Foros maternidad** — BabyCenter, Crianza Natural, grupos Facebook de madres recientes
    - **Ginecólogos privados** — Material divulgativo para que deriven ("si tu paciente lleva +6 meses con caída postparto, derívala")
    - **IG/TikTok** — Video "La almohada" (pelos en almohada, voz en off femenina, tono íntimo, mezcla angustia + esperanza)
    - **Quiz** — Flujo femenino con rama específica postparto (¿cuándo fue tu último parto? ¿lactancia? ¿cuántos meses de caída?)
- Fuente: datos HC 2025, reunión equipo HC 10/03/2026, INE natalidad, r/FemaleHairLoss

---

### ACTO 4: LA VERDAD COMO ARMA

### SLIDE 18 — SEPARADOR SECCIÓN 04 + UVP + MARCO LEGAL
- Título de sección: "Posicionamiento: la clínica de la verdad"
- Subtítulo: "El posicionamiento de HC no es un invento de marketing. Es lo que ya son — puesto en palabras."
- `.uvp-banner` (fondo navy, centrado, grande):
  - Label: "UVP Global — Hospital Capilar (Tratamientos)"
  - **"La clínica donde un médico te dice la verdad sobre tu pelo — sin venderte nada."**
- Narrativa debajo del banner (2 líneas gris): "En un sector donde el paciente desconfía por defecto — porque le han vendido, engañado, o ignorado — decir la verdad es la propuesta de valor más poderosa posible. HC ya lo hace. Solo falta que el mundo lo sepa."
- `.two-col`:
  - Left "4 pilares — por qué HC es imbatible cuando juega a decir la verdad":
    - 4 mini `.card` con borde gold, cada uno con 2-3 líneas narrativas:
    1. 🩺 **Autoridad médica** — En HC te atiende un tricólogo. No un esteticista con bata, no un comercial con buen discurso. Un médico que diagnostica, prescribe y hace seguimiento. Siempre el mismo.
    2. 🔬 **Precisión diagnóstica** — Tricoscopía + analítica hormonal en 1 visita = el gold standard del sector. No es "te miro el pelo y te digo qué ponerte". Es un diagnóstico COMPLETO.
    3. 🪟 **Transparencia radical** — HC es la ÚNICA clínica en España que publica en su web: "los tratamientos NO hacen crecer pelo nuevo". Eso no es debilidad — es confianza. Y los pacientes lo valoran.
    4. 💰 **Pricing sin trampas** — €820 el bono anual. Sin packs sorpresa, sin "pero si añades esto…", sin presión. "Tratamientos primero. Cirugía si hace falta."
  - Right "Marco legal: por qué la honestidad es la ÚNICA estrategia sostenible":
    - `.legal-card-red` "❌ Lo que la Ley SARA prohíbe (sept 2024)":
      - Garantizar resultados ("recupera tu pelo 100%")
      - Nombres de fármacos en publicidad (PRP, dutasteride, finasteride)
      - Antes/después sin consentimiento explícito documentado
      - Presión tipo "solo hoy", "últimas plazas"
      - Influencers haciendo claims de salud sin cualificación
    - `.legal-card-green` "✅ Lo que HC SÍ puede hacer (y ya hace)":
      - Nombrar protocolos propios: CRT (Capillary Regeneration Treatment), HRT (Hair Redensification Treatment) — inmunes a restricciones de nombres de fármacos
      - Tricoscopía + analítica como servicio diagnóstico (es un acto médico, no un claim)
      - Reviews reales de Trustpilot (son opiniones de terceros, no claims propios)
      - Contenido educativo firmado por médicos
      - "Procedimiento realizado por médico especialista"
      - Precio claro y visible
- `.navy-box` abajo: "HC gana cuando la regulación se endurece. Los competidores que prometen resultados, usan nombres de fármacos en ads, o presionan con ofertas tendrán que ajustarse. HC ya cumple. Los protocolos CRT/HRT son a prueba de regulación."
- Fuente: Ley SARA sept 2024, BOE RD 1907/1996, AEMPS, Positioning v2.7

---

### ACTO 5: EL PLAN DE BATALLA

### SLIDE 19 — SEPARADOR SECCIÓN 05 + ESTRATEGIAS + MODELO DE CONSULTA
- Título de sección: "La Propuesta"
- Subtítulo: "Qué hacemos, en qué orden, y cómo testeamos sin asumir nada"
- `.two-col`:
  - Left "Top 6 estrategias priorizadas (ICE scoring)" — tabla `.action-table`:
    - Narrativa breve encima de la tabla: "De las 14 estrategias del TOWS, estas 6 tienen mayor impacto × confianza × facilidad. Son las primeras que ejecutamos."

| Rank | Estrategia | ICE | Qué hacemos primero | Qué esperamos conseguir |
|---|---|---|---|---|
| 1 | Treatment-First Positioning | 8.7 | Landing /tratamientos + quiz con messaging de nichos | La web deja de decir "cirugía" y empieza a decir "tratamientos" |
| 2 | Funnel de Tratamientos | 8.3 | Quiz MVP + landing + paid ads (Meta + Google) | +€50K/mes facturación incremental |
| 3 | Reviews de Tratamientos | 8.3 | Pedir a 30 pacientes actuales que dejen review | De 0 a 50+ reviews de tratamientos en 6 meses |
| 4 | Digital Capture Jóvenes | 8.0 | 21 videos cortos (7 de nicho + 14 educativos) | 50-100 leads/mes en 6 meses |
| 5 | Contenido Social 50/50 | 8.0 | Calendario: 50% cirugía + 50% tratamientos, 12 posts/mes | 100K+ reach/mes en 6 meses |
| 6 | Medical Authority Shield | 8.0 | Auditoría compliance Ley SARA + protocolos ads | Ads sin interrupciones por incumplimiento |

  - Right "Modelo de consulta — 3 flujos que vamos a TESTEAR en paralelo":
    - Narrativa breve: "No sabemos cuál es el mejor modelo. Por eso testeamos 3 simultáneamente y dejamos que los datos decidan."
    - 3 `.flow-card`:
      - Card borde green 🅰️ **Quiz corto + consulta gratis** — 4-5 preguntas → asesor contacta → consulta sin coste. Pros: máxima conversión de quiz. Contras: no-shows altos (47% actual). Hipótesis: si el asesor llama en <30min, los no-shows bajan a <30%.
      - Card borde orange 🅱️ **Quiz + pago variable** — Quiz → resultado orientativo → pago online (€25 / €50 / €100 / €195). Test de price sensitivity: ¿cuánto está dispuesto a pagar por una consulta diagnóstica? Pros: filtra curiosos, compromiso real. Contras: más fricción = menos volumen.
      - Card borde purple 🅲 **Quiz largo + sin pago** — 10+ preguntas detalladas → solo los que completan pasan. Pros: filtra por compromiso sin cobrar. Contras: drop-off alto en quiz largo.
    - Nota pequeña gris: "Benchmarks de mercado: Eurofins €229, Biolabs €35, HC actual €195. Directriz del equipo: cuestionar TODAS las suposiciones. No asumir que €195 es el precio correcto."
- Fuente: SWOT/TOWS v1.0, Company Brief v1.4, benchmarks laboratorios externos

### SLIDE 20 — 7 VIDEOS: 1 HISTORIA POR NICHO
- Título: "7 videos cortos — 1 historia por cada nicho"
- Subtítulo: "Cada video sigue el mismo patrón: gancho visceral (0-3s) → historia real → experiencia HC (tricoscopio siempre presente) → resultado creíble → CTA quiz"
- Narrativa breve: "El tricoscopio es el elemento visual que une los 7 videos. Es lo que diferencia a HC de todo lo demás: un instrumento médico real. No un producto, no un vendedor, no un influencer. Un médico con un instrumento mirando tu pelo en serio."
- Grid de `.video-mini-card` (cada card: emoji + título + descripción visual + gancho + target):
  - 🪞 **"3 años con gorra"**
    Visual: Plano en espejo. Joven con gorra. Se la quita lentamente. Corte a clínica HC: tricoscopio en cuero cabelludo. Corte a 6 meses después: sin gorra, sonrisa.
    Gancho: "Ni en fotos, ni en citas, ni en la playa. 3 años."
    Target: TikTok/Reels, hombres 20-28
  - 💊 **"1.200€ tirados al baño"**
    Visual: POV baño. Mano abriendo armario: botes de minoxidil, biotina, champú, suplementos. Calculadora: 1.247€. Corte a clínica: tricoscopio + analítica. "Lo primero fue saber QUÉ tenía."
    Gancho: "1.247€ en cosas que no funcionan. ¿Sabes cuántos diagnósticos son?"
    Target: IG Reels, 25-35
  - ❓ **"Google no es un médico"**
    Visual: Screen recording. Mano escribiendo "por qué se me cae el pelo" en Google. 47M resultados. Scroll confuso. Corte a clínica: médico con tricoscopio. "47 millones de respuestas. Ninguna sabía qué tenía yo."
    Gancho: "47 millones de resultados. Ninguno acertó."
    CTA: Quiz online
  - 💸 **"Lo que no me dijeron en Turquía"**
    Visual: Plano cenital de coronilla. Zona trasplantada (pelo denso) vs zona nativa (aclareando). Voz en off: "Me gasté 3.500€ y nadie me dijo que el resto del pelo iba a seguir cayéndose."
    Gancho: "3.500€. Y nadie me dijo esto."
    Target: YouTube, hombres 30-45
  - 🏪 **"5.000€ y un vendedor"** (Ya Me Engañaron)
    Visual: Storytime confesional a cámara. Cara real, tono directo. "Fui a [clínica]. Me atendió un vendedor. Me dijo que necesitaba cirugía. Pagué 5.000€. Después busqué otra opinión. Resulta que con tratamiento bastaba."
    Gancho: "Pagué 5.000€. No era un médico."
    Target: IG/TikTok, 30-40
  - 👩 **"La raya que se ensancha"** (Es Normal)
    Visual: Plano cenital de cabeza de mujer. Raya del pelo ensanchándose. Espejo. Mano tocando pelo fino. Voz en off femenina, 50 años: "Me dijeron que era la menopausia. Que era normal. Normal no es perder pelo cada día."
    Gancho: "Me dijeron que era la edad. No es la edad."
    Target: Facebook + IG, mujeres 45-55
  - 👶 **"La almohada"** (Lo Que Vino Con el Bebé)
    Visual: Plano almohada con pelos. Mano recogiendo pelos del cepillo. Corte a bebé durmiendo. Voz en off femenina, íntima: "Debería estar feliz. Tengo un bebé precioso. Pero cada mañana cuento los pelos en la almohada."
    Gancho: "14 meses después del parto. Y sigue cayendo."
    Target: IG, mujeres 28-38, comunidades mamás
- Nota legal gris: "⚠️ Cumplimiento Ley SARA: sin nombres de fármacos, sin nombrar competidores, sin garantías de resultado. El tricoscopio aparece en los 7 videos como recurso visual de marca y diferenciación. Todos los testimonios deben ser reales o basados en casos reales documentados."
- Fuente: Positioning v2.7 — Speed Videos section

---

### ACTO 6: LA CUENTA ATRÁS

### SLIDE 21 — DEL 14 AL 24 DE MARZO: LA CARRERA
- Título: "De aquí al lanzamiento — cada día cuenta"
- Subtítulo gris: "10 días. 10 acciones. Si cumplimos, el 24 de marzo hay quiz live, landing nueva y primeros ads corriendo."
- `.two-col`:
  - Left — Timeline vertical con `.timeline-item` y línea cyan. Cada punto con narrativa:
    - 📌 **14 Marzo — HOY** `.active` (punto más grande, borde cyan grueso)
      "Estamos aquí. Hoy validamos nichos, mensajes y prioridades. La directora médica valida las preguntas del quiz. Noemí empieza onboarding en GHL. El equipo da feedback sobre el documento completo de estrategia."
    - 🔧 **17-21 Marzo — CONSTRUCCIÓN**
      "La semana de construcción. Ramiro monta 3 flujos de quiz en GHL. Growth4U + HC crean la landing de tratamientos. IT conecta Stripe + Koibox. Se piden 30 reviews de tratamientos a pacientes actuales."
    - 🚀 **24-28 Marzo — LANZAMIENTO**
      "Go live. Meta Ads piloto en 2-3 nichos top (probablemente #1 + #2 + #3). Google Ads con keywords de tratamientos. Quiz live con tracking completo. A/B testing de flujos."
    - 📊 **Abril — MEDICIÓN**
      "Primer mes de datos reales. Medimos: leads por nicho, tasa de confirmación, no-shows, conversiones a bono €820, conversiones a cirugía (cross-sell). Encontramos el 'happy path' óptimo."
    - 📈 **Mayo en adelante — ESCALADA**
      "Duplicamos budget en el nicho ganador. Lanzamos campañas completas. Escalamos a otras clínicas. Activamos programa de referidos."
  - Right — `.action-table` "10 acciones antes del 24 de marzo":

| Acción | Quién | Para cuándo |
|---|---|---|
| Validar preguntas quiz (4-5) | Directora médica HC | 14 Mar |
| Onboarding GHL | Noemí (HC) | 14 Mar |
| Feedback documento estrategia | Todo el equipo HC | 14 Mar |
| Quiz MVP (3 flujos en paralelo) | Ramiro (Growth4U/GHL) | 21 Mar |
| Landing page /tratamientos | Growth4U + HC Marketing | 21 Mar |
| Producto Stripe + Koibox | IT (HC) | 21 Mar |
| Solicitar 30 reviews tratamientos | HC Comercial (asesores) | 21 Mar |
| Formación equipo comercial | Dirección HC | 24 Mar |
| Validar landings + quiz (QA) | Growth4U + HC | 24 Mar |
| Testing tracking (GA4 + events) | Miguel Ángel (HC SEM) | 24 Mar |

- `.navy-box` abajo: "⚡ **Por qué la velocidad importa:** El cuadrante 'tratamientos médicos como core' está vacío HOY. Pero Insparya tiene €20.7M de facturación, €2M/año en I+D, y CR7. Si ven la oportunidad, pueden pivotar en 12 meses. Cada semana que pasa sin lanzar es una semana regalada al competidor más peligroso del sector."
- Fuente: Company Brief v1.4, timeline proyecto Growth4U (9 semanas)

### SLIDE 22 — CIERRE: LO QUE FALTA NO ES PRODUCTO. ES SISTEMA.
- Section slide navy (como portada, fondo navy degradado)
- Tag dorado arriba: "Resumen ejecutivo"
- Frase central grande blanca (font-size 28px): **"Hospital Capilar tiene el mejor producto del sector. La mejor reputación. Los mejores márgenes. Lo único que falta es el sistema para que la gente los encuentre."**
- 3 `.big-num` en gold centrados debajo:
  - **7** — "Nichos definidos con messaging completo"
  - **14** — "Estrategias priorizadas y puntuadas"
  - **24/03** — "Lanzamiento primeros tests"
- Lista blanca debajo (los 4 pasos del plan):
  1. ✅ Validar flujos de quiz (3 variantes en paralelo)
  2. 🔧 Construir landing + integrar Stripe/Koibox + reviews
  3. 🚀 Primeros tests de campaña por nicho (paid + organic)
  4. 📊 Medir → encontrar "happy path" → escalar lo que funciona
- Frase final pequeña gris (debajo de todo): "La puerta está abierta. El producto está listo. Los pacientes están buscando. Solo falta encender el motor."
- Pie gris sutil: "Hospital Capilar × Growth4U — Confidencial — Marzo 2026"
- Fuente: Foundation analysis completo, Layers 0-4

---

## NOTAS PARA EL LLM

1. **Arco narrativo:** La presentación cuenta una historia en 6 actos. Respetar la progresión: puerta abierta → héroe con espada guardada → las personas que buscan → la verdad como arma → el plan → la cuenta atrás. Cada slide avanza la narrativa.
2. **Cada dato aparece UNA sola vez** — si un número se usó en una slide, no repetirlo en otra. Si hace falta referenciarlo, usar "como vimos en el bloque X".
3. **Fuente visible en cada slide** — usar class `.source` al pie. Formato: "Fuente: nombre, nombre, ..."
4. **No inventar datos** — usar exclusivamente los proporcionados en este prompt.
5. **Narrativas de contexto** — las frases en gris que cuentan la historia del paciente son FUNDAMENTALES. No son decoración. Son lo que hace que el equipo sienta al paciente como persona, no como segmento.
6. **Citas de pacientes reales** en `.quote-box` — usar *itálica* para el texto, fuente debajo. Son reales o basadas en casos reales de Reddit/Trustpilot.
7. **Los 7 nichos son el CORAZÓN** de la presentación (slides 11-17). Son las slides más largas y deben ser las más trabajadas visualmente. Cada una debe sentirse como "conocer a una persona".
8. **`.navy-box`** para insights estratégicos clave y conclusiones que el equipo debe recordar.
9. **`.card-highlight`** solo para lo más importante (máximo 2-3 en toda la presentación).
10. **Tags de prioridad:** `.badge-alta` = verde, `.badge-media` = naranja, `.badge-estrategica` = morado.
11. **Slides NO sobrecargadas** — si el contenido no cabe limpio, reducir texto. Nunca comprimir fuente ni apretar márgenes.
12. **Colores consistentes por nicho** — cada nicho mantiene su color en border-left, badges y cualquier referencia posterior.
13. **El modelo de consulta (€25-€195)** es un TEST, no una decisión tomada — presentar como hipótesis que los datos resolverán.
14. **"Olistic"** siempre como **Olistic Science** (nombre de marca).
15. **CRT/HRT** siempre con nombre completo la primera vez: CRT (Capillary Regeneration Treatment), HRT (Hair Redensification Treatment). Después se puede usar solo la sigla.
16. **El tricoscopio** es el recurso visual de marca — aparece en los 7 videos, en la descripción del diagnóstico, y en las fotos de clínica. Es lo que hace TANGIBLE la diferencia médica.
17. **Tono de messaging para cada nicho:** dolor activado → solución HC → resultado creíble. Nunca promesas exageradas, nunca paternalismo, nunca "somos los mejores". El tono es: "esto es lo que pasa, esto es lo que hay, esto es lo que podemos hacer."
18. **Ley SARA** integrada en slide 17 (no slide separada) para no alargar la presentación. La narrativa es: "la regulación beneficia a HC porque HC ya cumple".
19. **Timeline es OPERATIVO** — nombres reales de responsables, fechas concretas, acciones específicas. No es aspiracional — es un plan de ejecución.
20. **Reveal.js transitions:** fade para todas las slides. Sin animaciones internas ni efectos.
21. **La presentación cierra un círculo narrativo:** "La puerta está abierta" (slide 4) → "Solo falta encender el motor" (slide 22). El arco va de oportunidad → problema → personas → solución → plan → urgencia.
