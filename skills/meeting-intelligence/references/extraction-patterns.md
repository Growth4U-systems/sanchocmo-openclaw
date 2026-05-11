# Extraction Patterns - Meeting Intelligence

> Detailed patterns for extracting decisions, insights, quotes, risks from meetings

## Decision Extraction

### Pattern Recognition

**Linguistic Markers** (Spanish + English):
- "Decidimos [X]" / "We decided to [X]"
- "Vamos a [X]" / "We're going to [X]"
- "Aprobado [X]" / "Approved [X]"
- "La decisión es [X]" / "The decision is [X]"
- "Movemos adelante con [X]" / "Let's move forward with [X]"

### Structure to Extract

1. **WHAT**: The decision (specific, actionable)
2. **WHY**: Rationale (reasoning, context, data supporting)
3. **WHO**: Owner (who decided or responsible for execution)
4. **ALTERNATIVES**: What was NOT chosen (if mentioned)

### Example

**Meeting text**:
> "Después de revisar las opciones, decidimos usar Stripe en lugar de PayPal para pagos. La razón principal es que Stripe tiene mejor API para suscripciones recurrentes, que es crítico para nuestro modelo. Alfonso aprobó, empezamos la semana que viene."

**Extracted**:
```json
{
  "decision": "Usar Stripe para pagos (no PayPal)",
  "rationale": "Mejor API para suscripciones recurrentes, crítico para modelo de negocio",
  "owner": "Alfonso (approved), team ejecuta",
  "alternatives_considered": ["PayPal (descartado por API limitada)"],
  "date": "2026-02-21",
  "source": "notion://meeting-xyz"
}
```

---

## Action Item Extraction

### Pattern Recognition (2026 Best Practices)

**Critical**: Owner + Deadline REQUIRED (85-95% accuracy depends on this)

**Markers**:
- "Yo me encargo de [X]" / "I'll handle [X]"
- "[Name] puede hacer [X]?" / "Can [Name] do [X]?"
- "Para el [date]" / "By [date]"
- "[Name] va a [X]" / "[Name] will [X]"

### Structure

1. **TASK**: Action (verb + object)
2. **OWNER**: Person responsible (REQUIRED)
3. **DEADLINE**: Date or "TBD" (REQUIRED)
4. **CONTEXT**: Why this task matters

### Example

**Meeting text**:
> "Martín, ¿puedes preparar el dashboard de Monzo para la reunión del viernes? Necesitamos mostrar las métricas de trust antes del review."

**Extracted**:
```json
{
  "task": "Preparar dashboard Monzo con métricas trust",
  "owner": "Martín",
  "deadline": "2026-02-23 (viernes)",
  "context": "Para review meeting, mostrar trust metrics",
  "source": "notion://meeting-xyz"
}
```

**If owner unclear**:
```json
{
  "task": "[Task description]",
  "owner": "UNASSIGNED (revisar)",
  "deadline": "TBD",
  ...
}
```

---

## Insight Extraction

### 5 Insight Types

**1. Pain Point** (Customer problem):
```
"El cliente dice que la app es muy lenta en móvil"
"Users are confused by the pricing page"
```

**2. Feature Request**:
```
"Nos pidieron integración con Shopify"
"Can we add dark mode?"
```

**3. Success Story**:
```
"Cliente X cerró 500 nuevos usuarios este mes"
"Conversion rate subió de 2% a 5%"
```

**4. Market Trend**:
```
"Vemos que todos los competidores están añadiendo IA"
"Regulatory change coming in Q2"
```

**5. Process Issue** (Internal):
```
"Meetings sin agenda pierden 30 min cada vez"
"No tenemos forma de trackear bugs reportados en Slack"
```

### Structure

```json
{
  "type": "pain_point",
  "insight": "App lenta en móvil",
  "context": "Cliente reportó en call de soporte, afecta retención",
  "mentioned_by": "Customer (via support team)",
  "severity": "high (affecting retention)",
  "source": "slack://thread-xyz"
}
```

---

## Quote Preservation Rules

### When to Capture

✅ Strong opinions
✅ Customer feedback (direct quotes)
✅ Key realizations ("aha moments")
✅ Memorable phrases (quotable for content)
✅ Contrarian takes
✅ Vulnerability moments

### Format

**ALWAYS**:
- Preserve EXACT wording (verbatim)
- Include speaker name
- Context (what prompted the quote)
- Source link + timestamp if available

**Example**:
```json
{
  "quote": "No tienes un problema de presupuesto. Tienes un problema de sistema.",
  "speaker": "Alfonso",
  "context": "Responding to client saying 'we need more budget for ads'",
  "source": "notion://meeting-client-x",
  "timestamp": "15:23"
}
```

**NEVER**:
- ❌ Paraphrase ("Alfonso said budget wasn't the real issue")
- ❌ Summarize ("Discussion about budget vs systems")
- ❌ Lose exact wording

---

## Risk & Blocker Detection

### Types

**Risk**: Potential future problem
**Blocker**: Current impediment to progress
**Dependency**: Waiting on external factor
**Open Question**: Unresolved, needs decision

### Example

**Meeting text**:
> "No podemos lanzar hasta que legal apruebe los términos. Estamos esperando su feedback desde hace 2 semanas. Si no tenemos respuesta para el lunes, vamos a tener que postponer el launch."

**Extracted**:
```json
{
  "type": "blocker",
  "description": "Legal approval pendiente para términos (2 semanas waiting)",
  "impact": "high (blocks launch)",
  "deadline_risk": "Si no resuelto para lunes → postpone launch",
  "source": "notion://meeting-xyz"
}
```

---

## Multi-Source Deduplication

**If same meeting appears in Notion + Drive**:

1. **Detect duplicate**: Title similarity >80% + same date
2. **Merge intelligence**: Combine extractions
3. **Mark sources**: `"sources": ["notion", "drive"]`
4. **Prefer**: Notion transcript (usually more complete)

**Example**:
- Notion: "Client Meeting 2026-02-20" (has summary)
- Drive: "Client_Meeting_20260220.txt" (has full transcript)
- → Merge: Use Drive transcript + Notion metadata
