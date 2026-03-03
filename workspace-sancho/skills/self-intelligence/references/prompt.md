# Self-Intelligence — Prompts de Ejecución

Este archivo consolida los prompts de ejecución del pipeline de self-intelligence.

---

## 🎯 REGLAS DE STORYTELLING (OBLIGATORIO)

### Estructura Narrativa Global
El documento final debe contarse como una historia de **descubrimiento de marca**, no como un reporte de datos. Sigue este flujo narrativo:

**PARTE 0: Executive Narrative** (obligatorio al inicio)
- 1 página máximo, narrativa pura, CERO tablas
- Cuenta la historia completa: ¿Qué descubrimos sobre esta marca al analizarla desde 3 perspectivas?
- Estructura: Situación → Tensión/Gaps → Fortalezas Confirmadas
- Quien lea solo esto debe entender el 80%

**Para cada sección del análisis:**
1. **Contexto narrativo** (2-3 párrafos antes de datos/tablas)
   - ¿Qué vamos a analizar y por qué importa?
   - Setup de la perspectiva (autopercepción, terceros, clientes)

2. **Evidencia** (datos de scraping, lens analysis)
   - Los datos que encontramos
   - Citados con fuentes inline

3. **Interpretación** ("So what?")
   - ¿Qué significa esto sobre la marca?
   - ¿Qué nos dice sobre su posicionamiento actual?

4. **Implicación** (accionable)
   - ¿Qué hacer con esto?
   - ¿Qué oportunidades/riesgos crea?

**Transiciones entre lentes:**
- Entre Lens 1 → Lens 2: "Vimos cómo la marca se ve a sí misma... ahora veamos cómo el mundo externo la percibe..."
- Entre Lens 2 → Lens 3: "Los terceros dicen X... pero ¿qué opinan realmente los clientes?"
- Entre Lens 3 → Synthesis: "Con las 3 perspectivas analizadas, ahora cruzamos los datos para encontrar la verdad..."

**Tono de presentación:**
- Escribir como si fuera para el CEO de la empresa
- "Esto significa que...", "La brecha está en...", "La fortaleza confirmada es..."
- Evitar lenguaje de auditoría técnica
- Las tablas son soporte, la narrativa es protagonista

**Cierre final:**
- Párrafo conclusivo que sintetiza: "En resumen, [marca] es percibida como X por ella misma, Y por el mercado, Z por los clientes. La oportunidad más clara es..."

---

## Parte 1: Scrapers + Lens Analysis

Ver [lens-prompts.md](lens-prompts.md) para:
- Los 20 scrapers organizados en 4 grupos
- Los 5 prompts de análisis de lentes (Lens 1, 2, 3a, 3b, Synthesis)
- Formato de output esperado por lens

## Parte 2: Deep Research Prompts

Ver [deep-research-prompts.md](deep-research-prompts.md) para:
- Deep Research: Market (industry overview, landscape, trends)
- Deep Research: Company (digital footprint, products, brand image, UVP)

---

## Output Esperado (CON STORYTELLING)

El documento final debe seguir esta estructura narrativa:

**0. EXECUTIVE NARRATIVE** (obligatorio primero)
- 1 página, narrativa pura, cero tablas
- Historia completa del descubrimiento de marca
- Situación → Gaps/Tensiones → Fortalezas Confirmadas

**1. Profile Discovery**
- **Apertura narrativa** (2-3 párrafos): ¿Qué presencia digital tiene esta marca? ¿Qué dice su footprint sobre su madurez?
- Tabla de todas las URLs encontradas
- **Cierre interpretativo**: ¿Qué canales priorizan? ¿Dónde están ausentes?

**2. Scraping Summary**
- **Apertura narrativa**: ¿Qué datos capturamos y por qué son relevantes?
- Datos crudos organizados por grupo
- **Cierre interpretativo**: ¿Qué patrones iniciales emergen?

**3. Deep Research**
- **Apertura narrativa**: ¿Qué sabemos de la historia y evolución de esta marca?
- Market + Company summaries
- **Cierre interpretativo**: ¿Cómo llegaron hasta aquí?

**4. Lens 1: Autopercepción**
- **Apertura narrativa**: "Empezamos mirando cómo la marca se ve a sí misma..."
- Análisis completo (ver lens-prompts.md)
- **Cierre interpretativo** + **Transición a Lens 2**

**5. Lens 2: Percepción de Terceros**
- **Apertura narrativa**: "Ahora veamos cómo el mundo externo la percibe..."
- Análisis completo
- **Cierre interpretativo** + **Transición a Lens 3**

**6. Lens 3a/3b: Consumidores (RRSS + Reviews)**
- **Apertura narrativa**: "Finalmente, ¿qué dicen realmente los clientes?"
- Análisis completo
- **Cierre interpretativo** + **Transición a Synthesis**

**7. Triangulation Table**
- **Apertura narrativa**: "Cruzando las 3 perspectivas, encontramos..."
- Tabla de cruce de lentes
- **Cierre interpretativo**: ¿Qué es verdad confirmada vs percepción no validada?

**8. Confirmed Strengths/Weaknesses**
- **Narrativa**: "Solo lo confirmado por 2+ lentes merece acción estratégica..."
- Lista de fortalezas/debilidades
- **Cierre interpretativo**: ¿En qué doblar la apuesta? ¿Qué mejorar?

**9. Perception-Reality Gaps**
- **Narrativa**: "Los gaps más peligrosos son donde la promesa ≠ realidad..."
- Lista de gaps
- **Cierre interpretativo**: ¿Qué riesgos crea esto?

**10. Viability Checkpoint**
- **Narrativa final**: "En resumen, [marca] está VIABLE/EN RIESGO porque..."
- PASS o WARNING con justificación completa
- **Cierre del documento**: "El camino más claro hacia adelante es..."

**LONGITUD TARGET**: 20-30 páginas (exhaustivo pero narrativo)
**TONO**: Presentación estratégica al CEO, no auditoría técnica
