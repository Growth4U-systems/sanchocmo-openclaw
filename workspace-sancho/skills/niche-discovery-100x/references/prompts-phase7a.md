# Phase 7a — Filtro de Calidad
<!-- v3.3 -->

ROL: Validador experto de nichos para {{company}}.
Industria: {{industry}} | Target: {{context_type}}

OBJETIVO: Filtrar nichos agrupados para quedarse solo con los de alta calidad, específicos y comercialmente viables.

INPUT: Tabla Markdown de nichos agrupados (14 columnas).

CRITERIOS DE FILTRADO — Marcar como Valid=FALSE con la razón apropiada:

1. **DEMASIADO GENÉRICO** (Reason: "Too Generic")
   Un nicho que se puede describir con ≤ 3 palabras genéricas ("SaaS B2B", "Ecommerce", "Startups", "Pymes") es SIEMPRE genérico. FAIL automático.
   
   **Test obligatorio de 3 dimensiones**: El nicho DEBE incluir ≥ 3 de: ROL + ETAPA + TAMAÑO + DOLOR CONCRETO + CONTEXTO.
   - ROL: quién exactamente (no "empresario" → "CTO-turned-CEO", "CFO de franquicia")
   - ETAPA: en qué momento (escalando, pivoteando, quemado por agencias, post-regulación)
   - TAMAÑO: indicador concreto ($MRR, empleados, locales, facturación)
   - DOLOR CONCRETO: problema específico (no "necesita pagos" → "reconcilia 15 locales manualmente")
   - CONTEXTO: circunstancia que define la situación
   
   **Test "agencia genérica"**: ¿Esta descripción aparecería en la web de cualquier competidor como su target? → Si sí, FAIL.
   
   ❌ "SaaS B2B" / "Startups tech" / "Pymes que necesitan X" → FAIL
   ✅ "Founder técnico, equipo 3-8, $10-30K MRR, que hace todo el marketing solo tras quemarse con 2-3 agencias" → PASS

2. **DEMASIADO PEQUEÑO** (Reason: "Too Small")
   Freelancers/autónomos individuales con volumen mínimo (<€1K/mes).
   El target debe ser negocios con volúmenes de transacción significativos.

3. **NO RELEVANTE AL PRODUCTO** (Reason: "Not Product-Relevant")
   El problema no está relacionado con el dominio core de {{company}}.
   Ejemplo: un problema de marketing cuando el producto es plataforma de pagos.

4. **PROBLEMA DE CONSUMIDOR** (Reason: "Consumer Problem")
   Quejas personales/individuales, no operaciones de negocio.
   Ejemplo: "no puedo dividir la cuenta de la cena" es B2C, no B2B.

5. **SEGMENTO DUPLICADO** (Reason: "Duplicate Segment — see [Niche_ID]")
   Mismo tipo de negocio que otro nicho en la tabla.
   Múltiples problemas del mismo segmento = un nicho.
   Quedarse con el más fuerte (mejor data, más URLs, problema más claro).

PRINCIPIO CLAVE: Un NICHO = QUIÉN tiene el problema (segmento), NO QUÉ es el problema.

INSTRUCCIONES:

1. Revisar CADA nicho de la tabla.
2. Para cada nicho, decidir: MANTENER (Valid=TRUE) o FILTRAR (Valid=FALSE + Reason).
3. Para SEGMENTO DUPLICADO: consolidar el unified problem statement en el nicho superviviente.
4. Output: la tabla COMPLETA con columnas Valid y Reason actualizadas.

OUTPUT: La misma tabla de 14 columnas, con Valid y Reason actualizados.

RESULTADO ESPERADO: 30-40% de nichos filtrados. Si mantienes más del 70%, no estás siendo suficientemente estricto. Si filtras más del 50%, puedes estar siendo demasiado agresivo.
