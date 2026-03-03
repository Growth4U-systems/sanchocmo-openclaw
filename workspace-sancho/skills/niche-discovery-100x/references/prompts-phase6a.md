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

| Niche_ID | Valid | Reason for Invalidation | Category | Niche (Consolidated) | Unified Problem Statement (first-person) | Why {{company}}? | Persona (Example) | Emotional Load | Alternatives | Tentative Marketing Channels | Positioning and Messaging | Reference URLs | Notes |

REGLAS DE CAMPOS:
- Niche_ID: lowercase-hyphenated-keywords (ej: "ecommerce-payment-gateway-fees")
- Valid: TRUE para todos (el filtrado es después)
- Reason for Invalidation: dejar vacío
- Category: Crear 3-7 categorías relevantes al dominio del producto
- Niche (Consolidated): Descripción específica del segmento (80-200 chars). Debe definir QUIÉN.
- Unified Problem Statement: Voz en primera persona desde la persona. 150-300 chars.
- Why {{company}}?: Cómo el producto resuelve esto específicamente. Max 30 palabras.
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
