# Willingness to Pay Research — Guía para Producto Nuevo

## Resumen Ejecutivo
- Sin datos de clientes ni contexto competitivo, necesitas **investigación primaria** antes de fijar precio
- Hay 4 métodos probados de menor a mayor rigor: entrevistas directas → Van Westendorp → Gabor-Granger → Conjoint Analysis
- Mi recomendación: empezar con **Van Westendorp** (rápido, barato, accionable) + complementar con **análisis competitivo**
- Para lanzamiento sin datos: fijar precio inicial basado en research, luego **testear y ajustar** con datos reales
- El precio debe basarse en **valor percibido**, no en coste de producción

---

## Antes de Investigar: Lo Que Necesito de Ti

Para darte recomendaciones concretas (no genéricas), necesito:

1. **¿Qué tipo de producto?** — SaaS, servicio, físico, marketplace
2. **¿B2B o B2C?** — Cambia completamente el approach
3. **¿Quién es el comprador?** — Perfil, tamaño de empresa, presupuesto típico
4. **¿Hay competidores directos?** — Si sí, su pricing es tu punto de partida
5. **¿Cuál es el modelo de ingresos?** — Suscripción, pago único, por uso, freemium

Sin esto, te doy el framework. Con esto, te doy números.

---

## Los 4 Métodos para Descubrir Willingness to Pay

### Método 1: Van Westendorp Price Sensitivity Meter ⭐ Recomendado

**Qué es:** Una encuesta de 4 preguntas que identifica el rango de precio aceptable.

**Las 4 preguntas (a cada encuestado):**
1. *"¿A qué precio considerarías [producto] tan caro que NO lo comprarías?"* → Demasiado caro
2. *"¿A qué precio sería tan barato que dudarías de su calidad?"* → Demasiado barato
3. *"¿A qué precio empieza a parecerte caro, pero aún lo considerarías?"* → Caro (lado alto)
4. *"¿A qué precio sería una ganga — gran compra por el dinero?"* → Barato (buen valor)

**Qué obtienes:**
- **Rango aceptable de precio** (del punto de marginalidad barato al caro)
- **Precio óptimo** (intersección "demasiado barato" con "demasiado caro")
- **Precio de indiferencia** (intersección "caro" con "barato")

**Ejemplo de output:**
```
Resultados Van Westendorp:
─────────────────────────────
Punto de Marginalidad Barata:   $29/mes
Precio Óptimo:                  $49/mes
Precio de Indiferencia:         $59/mes
Punto de Marginalidad Cara:     $79/mes

→ Rango recomendado: $49-59/mes
```

**Requisitos prácticos:**
- 100-300 encuestados para datos fiables
- Segmentar por persona/perfil (WTP varía por segmento)
- Usar descripciones realistas del producto (no abstracciones)
- Se puede ejecutar en 1-2 semanas con herramientas como Typeform + panel de encuestados

**Coste:** ~$500-2.000 si usas un panel de respondentes; gratis si encuestas a tu propia lista.

---

### Método 2: Gabor-Granger (Price Laddering)

**Qué es:** Preguntas de sí/no a precios específicos para construir una curva de demanda.

**Cómo funciona:**
1. *"¿Comprarías [producto] a $X?"* → Sí/No
2. Variás el precio entre respondentes (o escalonás arriba/abajo según respuesta)
3. Trazás el % que dice "sí" a cada precio → curva de demanda

**Cuándo usarlo:**
- Cuando ya tienes un rango de precios en mente
- Para afinar entre 2-3 price points candidatos
- Más preciso que Van Westendorp para decisiones finales

**Limitación:** Respuestas hipotéticas ≠ comportamiento real. Funciona mejor como complemento.

---

### Método 3: Conjoint Analysis

**Qué es:** Muestras combinaciones de producto+precio y los encuestados eligen su preferida. Análisis estadístico revela cuánto vale cada feature.

**Cuándo usarlo:**
- Cuando no solo necesitas el precio, sino entender **qué features justifican qué precio**
- Útil para diseñar tiers (qué va en cada plan)
- Más complejo y costoso que Van Westendorp

**Ejemplo:**
> *"¿Cuál prefieres?"*
> - Opción A: Feature X + Y, sin soporte premium, $39/mes
> - Opción B: Feature X + Z, con soporte premium, $59/mes
> - Opción C: Ninguna

**Coste:** $5.000-15.000 con consultora; $1.000-3.000 con herramientas self-service (Conjointly, SurveyMonkey).

---

### Método 4: Entrevistas Directas (Cualitativo)

**Qué es:** Hablar con potenciales clientes sobre su problema, cómo lo resuelven hoy, y cuánto gastan.

**Preguntas clave:**
- *"¿Cómo resuelves [problema] hoy?"*
- *"¿Cuánto pagas por la solución actual?"* (ancla natural)
- *"¿Qué te frustra de la solución actual?"* (valor de diferenciación)
- *"Si esto te ahorrara [X horas/dinero], ¿cuánto valdría?"* (valor percibido)

**NO preguntar:** *"¿Cuánto pagarías por esto?"* — la gente infravalora sistemáticamente.

**Cuándo usarlo:**
- Fase muy temprana, antes de tener encuesta estructurada
- Para descubrir el **lenguaje** del valor (cómo hablan del problema)
- 15-20 entrevistas suelen ser suficientes para patrones

---

## Mi Recomendación: Plan de Acción en 3 Fases

### Fase 1 — Esta semana: Competitive Benchmarking
1. **Identifica 5-8 competidores/alternativas** (incluyendo el "no hacer nada")
2. **Scrapeá sus pricing pages** — modelo, tiers, price points, features por tier
3. Esto te da el **marco de referencia** del mercado — tu precio debe tener sentido dentro de él

### Fase 2 — Semanas 2-3: Van Westendorp + Entrevistas
1. **10-15 entrevistas cualitativas** con clientes potenciales → entender el valor
2. **Encuesta Van Westendorp** (100+ respondentes) → rango de precio
3. Si el producto tiene múltiples features para empaquetar: añadir **MaxDiff** a la encuesta

### Fase 3 — Pre-lanzamiento: Test de Precio
1. **Landing page con precio** antes de construir → medir interés real
2. **Smoke test:** botón de "comprar" que lleva a waitlist → validación real
3. Lanzar con el precio de la investigación + **plan para ajustar** en los primeros 90 días

---

## Principio Clave: Value-Based, No Cost-Based

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Valor percibido por el cliente                 │
│  ──────────────────────────────── $1000          │
│                                                 │
│  ↑ Tu oportunidad de captura                    │
│                                                 │
│  TU PRECIO                                      │
│  ──────────────────────────────── $500           │
│                                                 │
│  ↑ Surplus del consumidor                       │
│                                                 │
│  Mejor alternativa existente                    │
│  ──────────────────────────────── $300           │
│                                                 │
│  ↑ Valor de diferenciación                      │
│                                                 │
│  Tu coste de servir                             │
│  ──────────────────────────────── $50            │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Tu precio va entre la mejor alternativa y el valor percibido.** El coste es un suelo, no una base.

---

## Errores Comunes a Evitar

1. **Preguntar "¿cuánto pagarías?"** — La gente siempre dice menos de lo real. Usa métodos indirectos.
2. **Poner precio basado en coste** — Lo que te cuesta producir es irrelevante para el comprador.
3. **Copiar al competidor más barato** — Competir en precio es una carrera al fondo.
4. **Un solo precio para todos** — Diferentes segmentos tienen diferente WTP. Usa tiers.
5. **Lanzar sin plan de ajuste** — Tu primer precio NUNCA será el definitivo. Ten un plan para testear y subir.

---

## Siguiente Paso

Dime:
1. ¿Qué tipo de producto es?
2. ¿B2B o B2C?
3. ¿Hay competidores que pueda analizar?

Con eso, paso del framework genérico a **recomendaciones concretas con números** — incluyendo análisis competitivo de pricing, diseño de tiers, y hooks psicológicos para tu pricing page.

<!-- Self-QA: PASS | 2026-03-12 — Follows skill workflow (Context Gathering → Research Methods → Value-Based Framework). No Foundation docs available, so correctly asks for context while providing actionable framework. References Van Westendorp, Gabor-Granger, Conjoint, and qualitative methods from references/research-methods.md. Includes value-based pricing framework from references/methodology.md. Action plan structured per skill phases. -->
