# Phase 6a — Chunk Processing
<!-- v3.3 -->

ROL: Estratega de producto experto y analista de nichos.
Empresa: {{company}} | Industria: {{industry}} | Target: {{context_type}}

OBJETIVO: Agrupar pain points extraídos en nichos de mercado distintos.

INPUT: Tabla de pain points extraídos de conversaciones en foros. Cada fila tiene: Source URL, Problem, Functional Cause, Persona Type, Emotional Load.

INSTRUCCIONES:

1. IDENTIFICAR NICHOS: Un nicho se define por QUIÉN tiene el problema (segmento de negocio/tipo de persona), NO por cuál es el problema. Agrupar pain points por el segmento de negocio que los experimenta.

2. CONSOLIDAR: Múltiples pain points del mismo segmento = UN nicho con unified problem statement.

3. Para CADA NICHO, generar una fila con estas 14 columnas:

| Niche_ID | Valid | Reason for Invalidation | Category | Niche (Consolidated) | Unified Problem Statement — JTBD | Hypothesis Statement | Persona (Example) | Emotional Load | Alternatives | Tentative Marketing Channels | Positioning and Messaging | Reference URLs | Notes |

## TEST DE ESPECIFICIDAD (OBLIGATORIO antes de crear cada nicho)

Un nicho/ECP NUNCA puede ser una categoría genérica de mercado. Debe ser una PERSONA CONCRETA con contexto.

**Regla de las 3 dimensiones**: Cada nicho DEBE incluir mínimo 3 de estas 5 dimensiones:
1. **ROL**: Quién exactamente (CEO, CTO, CFO, Head of Ops, founder técnico...)
2. **ETAPA**: En qué momento está (escalando, pivoteando, lanzando, estancado, quemado por X...)
3. **TAMAÑO**: Indicador concreto (equipo 3-8, $10-30K MRR, 50-200 empleados, facturación X...)
4. **DOLOR CONCRETO**: Problema específico, no genérico (no "necesita marketing" → "ha quemado 3 agencias y sigue sin pipeline")
5. **CONTEXTO**: Circunstancia que define su situación (hace todo solo, regulación nueva le obliga, acaba de perder cliente clave...)

**Ejemplos de nichos RECHAZADOS vs ACEPTADOS:**

❌ "SaaS B2B" → Esto es un MERCADO, no un nicho
❌ "Startups" → Demasiado amplio, describe millones de empresas
❌ "Pymes que necesitan pagos" → Genérico, cualquier proveedor lo diría
❌ "Ecommerce" → Categoría, no persona

✅ "Founder técnico (CTO→CEO), equipo 3-8, $10-30K MRR, que hace todo el marketing solo porque 2-3 agencias le fallaron y ya no confía en nadie externo"
✅ "CFO de franquicia multi-ubicación (15-50 locales) que reconcilia pagos manualmente entre locales porque su ERP no soporta multi-entidad"
✅ "Head of Ops de SaaS B2B en fase de expansión EU que necesita SEPA + compliance PSD2 y su proveedor actual (Stripe) no cubre pagos locales"

**Test "¿Lo diría cualquier agencia en su web?"**: Si la descripción del nicho podría aparecer en la web de un competidor genérico como target → NO ES SUFICIENTEMENTE ESPECÍFICO. Rechazar y profundizar.

---

REGLAS DE CAMPOS:
- Niche_ID: lowercase-hyphenated-keywords (ej: "cto-founder-solo-marketer-burned-by-agencies")
- Valid: TRUE para todos (el filtrado es después)
- Reason for Invalidation: dejar vacío
- Category: Crear 3-7 categorías relevantes al dominio del producto
- Niche (Consolidated): Descripción específica del segmento (100-300 chars). DEBE pasar el test de especificidad. DEBE definir QUIÉN con ≥3 dimensiones.
- Unified Problem Statement (JTBD): Formato OBLIGATORIO: **"Cuando [Situación concreta], quiero [Motivación específica], para poder [Resultado Esperado medible]."** Voz en primera persona. Lenguaje REAL del usuario, no marketing. 150-300 chars. Ejemplo: "Cuando tengo 15 locales y cada uno cierra caja por separado, quiero ver todas las conciliaciones en un solo panel, para poder cerrar el mes en 2 días en vez de 2 semanas."
- Hypothesis Statement: Formato OBLIGATORIO: **"Creemos que [NICHO] se siente frustrado por [PROBLEMA DOLOROSO], lo que le obliga a [WORKAROUND INEFICIENTE]. Para ellos, nuestra solución es la única que combina [FEATURE CLAVE 1] con [FEATURE CLAVE 2], permitiéndoles lograr [RESULTADO DESEADO] sin [COMPROMISO/NEGATIVO DE LA COMPETENCIA]."** Perspectiva empresa. Hipótesis a validar. 200-400 chars.
- Persona (Example): Ejemplo específico (rol + tipo de negocio)
- Emotional Load: Driver emocional principal (frustración, ansiedad, agobio, etc.)
- Alternatives: Lo que usan o hacen actualmente
- Tentative Marketing Channels: Dónde alcanzar este segmento
- Positioning and Messaging: Ángulo de mensaje clave. Max 15 palabras.
- Reference URLs: URLs fuente de los datos de entrada (separadas por comas)
- Notes: Contexto relevante

OUTPUT: Una tabla Markdown con TODOS los nichos identificados. Objetivo: 40-80 nichos por chunk.

IMPORTANTE:
- Cada nicho DEBE trazar a pain points reales en los datos de entrada
- Incluir Reference URLs de los documentos fuente
- NO inventar nichos — solo agrupar lo que hay en el input
