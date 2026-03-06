# Niche Discovery v4.0 — Conceptos y Metodología

## 100x Niche Philosophy

El concepto "100x niche" viene de buscar nichos donde tu producto es 100x mejor que las alternativas, no 2x. Si solo eres ligeramente mejor, la inercia del status quo gana. Si eres dramáticamente mejor para un grupo específico, ganas rápido.

## Solution Filter (Step 3)

### SWOT Filter
- Compara cada problem contra las Strengths y Opportunities del SWOT
- Un problem PASA si al menos 1 Strength lo resuelve directamente
- Un problem obtiene BONUS si hay una Opportunity que lo amplifica
- FAIL si nuestras Weaknesses bloquean la solución

### Solution Filter (reemplaza ICP Filter)
- **Pregunta central:** "¿Podemos resolver ESTE problem mejor que las alternativas?"
- ¿Tenemos capacidad real de resolverlo hoy (o con esfuerzo menor)?
- ¿Las alternativas actuales dejan un gap que nosotros cubrimos?
- ¿Podemos LLEGAR a las personas con este problem? (pre-check)
- **NO filtra por tipo de persona** — filtra por capacidad de solución

### Product Filter
- **HOY** — no "podríamos construir esto"
- Score 1-5: 1=no resuelve, 3=parcialmente, 5=totalmente
- Si score < 3, el problem pasa pero con flag "needs product work"

---

## Scoring Methodology (Step 5)

### Fórmula

```
ECP Score = Pain × 0.35 + Reachability × 0.40 + SAM_norm × 0.25
```

Todos los scores son **2-99**. Cada score DEBE ir acompañado de explicación de 200-400 chars.

---

### Pain Score (2-99) — Cómo medirlo

**Análisis Jobs to Be Done:**
- **Push (El Problema):** Severidad del Job Utilitario + Severidad del Job Emocional
- **Pull (La Solución):** ¿Cuánto atrae nuestra solución? ¿Qué tan cerca está de lo que necesitan?
- **Ansiedad:** ¿Qué miedos tienen de cambiar? (riesgo percibido, coste de switching)

**Variables Cuantitativas (buscar datos concretos):**
- **Pérdida Económica Directa** — ¿Cuántos €/año pierden por este problem? (CAC desperdiciado, revenue lost, multas)
- **Coste de Oportunidad** — ¿Qué dejan de ganar? (deals perdidos, mercado no capturado)
- **Pérdida de Tiempo** — ¿Cuántas horas/mes desperdician? (procesos manuales, reuniones innecesarias, rehacer trabajo)

**Variables Cualitativas (evaluar desde foros/entrevistas):**
- **Carga Cognitiva y Estrés** — ¿Cuánto espacio mental ocupa? ¿Les quita el sueño?
- **Fricción y Complejidad** — ¿Cuántos pasos, personas, herramientas necesitan para el workaround?
- **Obstáculos a Metas** — ¿Bloquea objetivos de vida/carrera? (founder no puede escalar, Head of Growth no puede demostrar valor)
- **Impacto Social o Profesional** — ¿Afecta reputación, relaciones con board, inversores, equipo?
- **Frecuencia e Inevitabilidad** — ¿Es un dolor diario/semanal o anual? ¿Pueden evitarlo?

**Señales de alto pain en datos:**
- Menciones frecuentes en foros (threads con 100+ upvotes)
- Lenguaje emocional ("frustrado", "harto", "nightmare", "estoy desesperado")
- Willingness to pay declarado ("pagaría lo que fuera por...")
- Múltiples alternativas intentadas y fallidas ("he probado 3 agencias y...")

| Rango | Significado |
|-------|-------------|
| 2-20 | Nice-to-have, no urgente. Lo mencionan de pasada. |
| 21-50 | Dolor real pero manejable con alternativas. Workarounds aceptables. |
| 51-75 | Dolor significativo, buscan activamente solución. Gastan tiempo/dinero intentando resolver. |
| 76-99 | Hair-on-fire. Pagarían casi cualquier precio. Existencial para el negocio/carrera. |

---

### Reachability Score (2-99) — Cómo medirlo

Reachability NO es un número subjetivo. Es el resultado de un **proceso de descubrimiento** en 3 pasos:

**Paso 1: Trust Map — ¿En quién confían?**
Investigar con web_search + web_fetch:
- **Influencers/creadores específicos** — NOMBRES con handles, no categorías. ¿Quién tiene autoridad en este tema?
- **Publicaciones/newsletters** — ¿Qué leen? ¿Con qué frecuencia? ¿Cuántos suscriptores?
- **Comunidades** — ¿Dónde preguntan? Slack, Discord, foros, Reddit subs específicos. Nombre + plataforma + tamaño.
- **Eventos/conferencias** — ¿Dónde van en persona? Nombre + ciudad + frecuencia.
- **Podcasts** — ¿Qué escuchan? Nombre + host + audiencia estimada.

**Paso 2: Search Map — ¿Qué buscan activamente?**
- **Keywords de awareness** — "cómo [resolver problema]", "[síntoma] qué hacer"
- **Keywords de consideración** — "[solución A] vs [solución B]", "mejor [tipo de solución]"
- **Keywords de decisión** — "[marca específica] opiniones", "contratar [tipo de servicio] España"

**Paso 3: Channel Map — Convergencia Trust × Search**
- **Canal PRIMARIO** = donde Trust Map Y Search Map convergen. La audiencia confía en ese medio Y busca soluciones ahí. Máxima eficiencia.
- **Canal SECUNDARIO** = donde solo hay Trust O Search, no ambos.
- Cada canal DEBE tener **acción específica** (no "LinkedIn" → "LinkedIn: posts sobre X en respuesta a Y en comunidad Z")

**Criterios adicionales que afectan el score:**
- **Complejidad del producto** — ¿Necesitan educación previa? (baja complejidad = más reachable)
- **Competencia por atención** — ¿El canal está saturado? (afecta CAC efectivo)
- **Tamaño de comunidades** — Comunidad de 1.300 > comunidad de 50
- **Convergencia** — ¿Cuántos canales primarios (trust+search) encontraste?

| Rango | Significado | Evidencia requerida |
|-------|-------------|---------------------|
| 2-20 | No se encontraron canales específicos | 0 canales primarios, 0-1 secundarios |
| 21-50 | Solo canales secundarios o genéricos | 0 canales primarios, 2+ secundarios |
| 51-75 | 1 canal primario + secundarios | 1 canal primario (trust+search convergen) + 2+ secundarios |
| 76-99 | 2+ canales primarios con acciones concretas | 2+ canales donde trust+search convergen, acciones definidas |

---

### Market Size — SAM (2-99) — Cómo medirlo

**Estimación en 2 pasos:**

**Paso 1: Número absoluto (SAM)**
- **Top-Down:** TAM país → filtrar por vertical → filtrar por tamaño → filtrar por madurez = SAM
- **Bottom-Up:** Registros sectoriales, bases de datos (INE, Eurostat, Statista, Tracxn, Crunchbase), asociaciones del sector
- Cruzar ambos métodos. Si divergen mucho → usar el más conservador.

**Paso 2: Normalización a 2-99**

| Rango | Significado (referencia España) |
|-------|-------------|
| 2-20 | < 100 empresas/personas. Micro-nicho. |
| 21-40 | 100-500. Nicho pequeño pero viable si ticket alto. |
| 41-60 | 500-2.000. Mercado sólido. |
| 61-80 | 2.000-5.000. Mercado amplio. |
| 81-99 | > 5.000. Mercado grande. |

**Información adicional obligatoria:**
- Cifra absoluta del SAM
- Confianza: Alta / Media / Baja
- Fuentes usadas
- Tendencia: Acelerando / Moderado / Estable / Declinando
- Competencia: ¿Quién lo resuelve ahora? ¿Hay incumbentes fuertes?

---

## Founder Moat (Qualifier)

**NO es un score ni un filtro.** Es un badge que se añade DESPUÉS del scoring:

- **🏆 ALTO** — Track record demostrable y específico para esta necesidad. Ejemplo: "Bnext 0→400K bajo CNMV". Imposible de replicar sin los mismos años de experiencia.
- **⭐ MEDIO** — Experiencia relevante pero sin caso de éxito específico para esta necesidad. Credibilidad pero sin prueba irrefutable.
- **(sin badge)** — Sin track record diferencial. El ECP compite solo por Pain + Reachability + SAM.

Founder Moat NO resta puntos. Solo bonifica. Una empresa sin founder con moat simplemente no tiene badges.

---

## Edge Cases

**< 50 problems tras Step 2:**
- Ampliar keywords, buscar en otros idiomas
- Usar fallback sources (LinkedIn mining, competitor reviews)
- Si después de esfuerzo intensivo < 30: documentar gap, proceder con lo que hay

**All ECPs score low:**
- Reconsiderar product-market fit
- ¿El producto resuelve un problem real?
- FLAG para discusión con usuario

**1 ECP domina completamente:**
- Válido — no forzar diversificación artificial
- Pero validar que SAM es suficiente
- Considerar 1 ECP principal + 1-2 secondary para futuro

**Existing customer data contradicts scraped problems:**
- Customer data GANA — los clientes reales saben más que los foros
- Usar scraped data como complemento, no reemplazo

**Reachability Discovery no encuentra canales:**
- Score baja a 2-20 automáticamente
- Si NINGÚN ECP tiene canales → replantear estrategia completa
- Considerar que el mercado es demasiado fragmentado o demasiado nuevo
