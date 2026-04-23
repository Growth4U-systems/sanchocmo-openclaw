# Business Model Audit — Prompt (Fuente de verdad del output)

---

## Step 0: Context Hydration (ANTES de todo)

**Lee `references/hydration.md`** para el mapeo completo.

1. Leer `brand/{slug}/company-brief/current.md` → sección `## Company Identity` (obligatorio)
2. Leer `brand/{slug}/market-and-us/competitors/current.md` (si existe — aporta competitor growth motions)
3. Extraer campos mapeados en hydration.md
4. Presentar al usuario agrupados:

```
"De tu Company Context ya tengo:
  • B2B/B2C: [valor] ✅
  • Revenue model: [valor] ✅
  • Ticket medio: [valor] ✅
  • Leads/mes: [valor] ✅
  ...

¿Correcto? ¿Quieres ajustar algo?

Lo que necesito profundizar (específico de business model):
  1. ¿Self-serve o necesita ventas?
  2. Funnel paso a paso
  3. ¿Dónde se caen más personas?
  ..."
```

5. Si el usuario confirma → esos campos se dan por buenos, NO re-preguntar
6. Si el usuario corrige → usar el valor nuevo
7. Avanzar SOLO con las preguntas genuinamente nuevas de los Steps siguientes

**Regla**: Cada pregunta de Steps 1-3 que ya tenga respuesta upstream → SALTAR. Solo preguntar lo nuevo.

---

## Step 1: Classify the Model (~10 min)

**Preguntas (adaptar — saltar lo ya conocido):**

1. "¿Cómo generáis ingresos? (suscripción, transacción por uso, comisión marketplace, freemium, pago único?)"
   - Muchas empresas tienen modelos híbridos — capturar primario + secundario
   - Si unknown → Discovery Task: "Clarificar modelo de ingresos con finance/founder"

2. "¿Cuál es vuestro ticket medio? ¿Y el lifetime value estimado de un cliente?"
   - Si unknown: "¿Cuántos meses se queda un cliente medio? ¿Cuánto paga al mes?"
   - Calcular si hay datos: LTV = ARPA × Gross Margin / Churn Rate
   - Si still unknown → Discovery Task: "Calcular LTV desde datos de facturación o CRM"

3. "¿Qué porcentaje de vuestros ingresos viene de expansion (upsell/cross-sell) vs nuevos clientes?"
   - Si unknown → Discovery Task: "Analizar revenue expansion vs new en últimos 6 meses"

---

## Step 2: Map the Growth Motion (~10 min)

**Dos inputs:**
1. Lo que el cliente cree — preguntar directamente sobre growth assumptions
2. Lo que competitors hacen — analizar de competitor intelligence o inferir de pricing pages

**Preguntas:**

1. "¿El cliente puede empezar a usar el producto solo, sin hablar con nadie? (self-serve signup?)"
   - Yes → PLG candidate. No → Sales-led o MLG.

2. "¿De dónde viene la mayoría de vuestros clientes hoy? (boca a boca, Google, ads, equipo de ventas, partnerships?)"
   - Si unknown → Discovery Task: "Instalar atribución básica (UTMs + GA4)"

3. "¿El foco debería ser generar leads para ventas, o que la gente se registre directamente?"

---

## Step 3: Map Current Funnel (~10 min)

1. "Describime el camino que hace alguien desde que os descubre hasta que paga. Paso a paso."

2. "¿Dónde se caen más personas en ese proceso?"
   - Si unknown → Discovery Task: "Configurar funnel tracking en analytics"

3. "¿Tenéis datos de conversión en cada paso? (analytics, CRM, hojas de cálculo, intuición?)"

**Funnel template:**
```
[Traffic Source] → [Landing/Homepage] → [Signup/Lead Form] → [Activation] → [Conversion] → [Retention]
                    [visits/mo]          [leads/mo]            [activated]    [customers]    [retained]
                    [conversion %]       [conversion %]        [conversion %] [conversion %] [churn %]
```
Marcar cada paso: **measured** / **estimated** / **unknown** (→ Discovery Task).

---

## Discovery Tasks Format

| Unknown | Discovery Task | Owner | Method | Priority |
|---------|---------------|-------|--------|----------|
| Revenue model details | Clarificar con finance/founder | Client | Interview | High |
| Unit economics (LTV, CAC) | Extraer de billing + CRM | Client + Sancho | Data analysis | Medium |
| Conversion rates | Instalar funnel tracking | Client | GA4 + CRM | Medium |
| Traffic sources | Setup UTM attribution | Client | GA4 UTMs | Medium |
| Expansion revenue | Analizar upsell data último 6mo | Client | Billing data | Low |

---

## Output: Business Model Summary

> **Modelo de [Company Name]:**
>
> **Tipo**: [B2B/B2C/Hybrid] — [revenue model] — ACV [amount o "unknown → DT"]
> **Motion**: [PLG/MLG/Sales-led/Hybrid] — actualmente [current primary source]
> **Funnel**: [n steps mapped], bottleneck en [step] ([conversion %] o unmeasured)
> **Unit Economics**: LTV [amount], CAC [amount], Payback [months] (o "sin datos → DT")
> **Sector benchmark**: CAC [avg], LTV:CAC target [ratio], Payback target [months]
>
> **Discovery Tasks**: [n] datos pendientes de averiguar
> **Implicación**: [1 sentence sobre qué significa para growth strategy]
