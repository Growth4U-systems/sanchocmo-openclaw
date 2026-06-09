# Channel Prioritization — Self-QA Checklist

> El agente DEBE revisar este checklist ANTES de entregar el documento.
> Para cada ítem: ✅ completado | ⚠️ no disponible (con justificación) | ❌ pendiente (seguir investigando)
> Solo se entrega cuando todo es ✅ o ⚠️. Si hay algún ❌, volver a investigar.

---

## Prerequisites

- [ ] **budget.md** cargado (budget range, team capacity, timeline)
- [ ] **company-context.md** cargado (industry, stage, business model)
- [ ] **ecps.md** cargado (target personas, online behavior)
- [ ] **Missing prerequisites** flagged al usuario con oferta de ejecutar skill prerequisita

## Step 1: Load Client Context

- [ ] **Budget extraído** (monthly EUR, flexibility, split)
- [ ] **Industry + stage** extraídos
- [ ] **Business model** extraído (SaaS, marketplace, services, e-commerce)
- [ ] **ECPs** extraídos (dónde pasan tiempo, cómo descubren soluciones)
- [ ] **Team** extraído (size, hours/week, capabilities)
- [ ] **Tool stack** extraído (si stack.md existe)
- [ ] **Canales actuales** documentados (si existen)

## Step 2: Hormozi Core Four

- [ ] **Matriz Hormozi** construida (One-to-One/One-to-Many × Organic/Paid)
- [ ] **Cuadrantes viables** identificados con justificación
- [ ] **Cuadrantes no viables** explicados (por qué no: budget, ACV, team, etc.)
- [ ] **Reglas de viabilidad** aplicadas correctamente

## Step 3: Channel Scoring

- [ ] **Cada canal viable** scored en 5 dimensiones (ICP, Budget, Team, Gap, Time)
- [ ] **Weights aplicados** correctamente (ICP 0.25, Budget 0.20, Team 0.20, Gap 0.15, Time 0.20)
- [ ] **Score final** calculado por canal
- [ ] **Thresholds aplicados** (≥6.0 recommended, 4-5.9 conditional, <4.0 skip)
- [ ] **Solo canales de cuadrantes viables** scored (no perder tiempo en imposibles)

## Step 4: Tool Detection

- [ ] **stack.md** leído (si existe)
- [ ] **Gaps por canal** identificados (qué herramientas faltan)
- [ ] **Recomendaciones** adaptadas a tools disponibles

## Step 5: Channel Mix (2-4 channels)

- [ ] **2-4 canales seleccionados** del top scoring
- [ ] **Cobertura de 2+ cuadrantes Hormozi** (si budget lo permite)
- [ ] **Cada canal tiene**: quadrant, score, why, budget, time-to-result, tools, team hours, first 30-day action
- [ ] **Mínimo 1 orgánico** (sustainability) + 1 con fast feedback (learning speed)
- [ ] **Canales excluidos** listados con razón breve
- [ ] **First 30-day action** es ESPECÍFICO (no "empezar a publicar")

## Step 6: Budget Allocation

- [ ] **70/20/10 framework** aplicado (Proven/Growth/Experiment)
- [ ] **Distribución documentada** con EUR por canal
- [ ] **Si budget = 0**: allocation por TIEMPO en vez de dinero (misma lógica 70/20/10)

## Step 7: Interactive Selection

- [ ] **Recomendación presentada** con opciones (accept/modify/re-score/show all)
- [ ] **Confirmación del usuario** obtenida antes de escribir

## Output

- [ ] **channel-plan.md** guardado con todos los campos (channels, excluded, allocation, Hormozi coverage, review cadence)
- [ ] **assets.md** actualizado con summary
- [ ] **Summary** incluye: channels seleccionados, budget, Hormozi coverage

## Almacenamiento

- [ ] **Slug identificado** correctamente
- [ ] **Guardado en** `brand/{{slug}}/channel-plan/channel-plan.current.md` (o `./brand/{slug}/go-to-market/channel-plan.md`)
- [ ] **Versionado** correcto

## META (calidad)

- [ ] **Cada score tiene justificación** (no números arbitrarios)
- [ ] **Scoring coherente** con datos de brand files (budget real, team real, ECPs reales)
- [ ] **0 canales recomendados sin viabilidad** (no recomendar paid ads con €0 budget)
- [ ] **Coherencia** con company-context, budget, ECPs, positioning
- [ ] **Hormozi matrix** correctamente aplicada (reglas de viabilidad respetadas)
- [ ] **First 30-day actions** son ejecutables (no aspiracionales)
- [ ] **Review cadence** definida (quarterly, monthly, ad-hoc triggers)

---

## Flujo de uso

```
1. Agente ejecuta Steps 1-7
2. Al terminar, lee este checklist
3. Marca cada ítem:
   - ✅ = completado
   - ⚠️ = no aplica (con razón)
   - ❌ = falta — completar
4. Si hay ❌ → completar antes de entregar
5. Cruzar contra brand files (budget, ECPs, positioning)
6. SOLO ENTONCES entregar al usuario
```

**No se entrega ningún documento con ❌ pendientes.**
