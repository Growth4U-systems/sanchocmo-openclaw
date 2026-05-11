# Budget & Constraints — Prompt (Fuente de verdad del output)

> Instrucciones detalladas para ejecutar el skill.

---

## Block 0: Context Hydration (ANTES de todo)

**Lee `references/hydration.md`** para el mapeo completo.

1. Leer `brand/{slug}/company-context/current.md` (obligatorio)
2. Leer `brand/{slug}/business-model/current.md` (si existe — aporta revenue model, growth motion, unit economics)
3. Extraer campos mapeados en hydration.md
4. Presentar al usuario agrupados:

```
"De tu Company Context ya tengo:
  • [campo]: [valor] ✅
  • [campo]: [valor] ✅
  ...

¿Correcto? ¿Quieres ajustar algo?

Lo que necesito saber (específico de budget):
  1. [pregunta nueva 1]
  2. [pregunta nueva 2]
  ..."
```

5. Si el usuario confirma → esos campos se dan por buenos, NO re-preguntar
6. Si el usuario corrige → usar el valor nuevo, notar discrepancia
7. Avanzar SOLO con las preguntas genuinamente nuevas de los Blocks siguientes

**Regla**: Cada pregunta de los Blocks 1-3 solo se hace si la respuesta NO existe en upstream. Si existe, se salta.

---

## Block 1: Budget Range (~5 min)

**Preguntas (adaptar al contexto):**

1. "¿Cuánto invertís actualmente en marketing al mes? (incluye ads, herramientas, freelancers, todo)"
   - Si zero: "Entendido. ¿Cuánto estáis dispuestos a invertir para empezar?"
   - Si vago: "Dame un rango — ¿menos de 1K, 1-5K, 5-15K, 15-50K, o más de 50K al mes?"

2. "De ese presupuesto, ¿cuánto va a publicidad pagada vs herramientas vs personas?"
   - Muchos clientes no lo saben — OK, notar como "unstructured"

3. "¿Hay flexibilidad para aumentar si los resultados lo justifican? ¿O es un techo fijo?"

**Benchmarks de contexto (si ayuda):**
- B2B SaaS: 7-12% of revenue en marketing es estándar
- Early-stage startups: % más alto pero absoluto más bajo
- 70/20/10 rule: 70% canales probados, 20% growth bets, 10% experiments

---

## Block 2: Time & People (~5 min)

1. "¿Quién se encarga del marketing actualmente? (equipo interno, freelancers, agencia, el fundador solo?)"

2. "¿Cuántas horas semanales puede dedicar tu equipo al marketing?"
   - Founder-only: típicamente 5-10h/semana realista
   - Small team: mapear horas por persona
   - Con agencia: clarificar qué maneja la agencia vs interno

3. "¿Hay alguien que puede crear contenido? (escribir, diseñar, grabar video)"

4. "¿Cuál es el timeline? ¿Necesitas resultados en semanas, meses, o estáis construyendo a largo plazo?"
   - Short (<30 días): Foundation Lite + ejecución inmediata
   - Medium (1-3 meses): Foundation Deep + scaling medido
   - Long (3-6+ meses): Full system build

---

## Block 3: Tool Stack (~5-10 min)

"¿Qué herramientas usáis para marketing? (analytics, email, CRM, social, ads, automatización, cualquier cosa)"

**Categorizar lo que tienen:**

| Categoría | Ejemplos | Impacto de gap |
|-----------|----------|----------------|
| Analytics | GA4, Mixpanel, Amplitude | Sin analytics = blocker Phase 2 |
| CRM | HubSpot, Pipedrive, Salesforce | Sin CRM = riesgo follow-up manual |
| Email | Mailchimp, ActiveCampaign, Brevo | Sin email = gap nurturing |
| Social | Buffer, Hootsuite, nativo | Menor — puede empezar nativo |
| Ads | Google Ads, Meta Ads Manager | Solo si paid es canal viable |
| Automation | Zapier, Make, n8n | Nice to have, no blocking |
| Content | Canva, Figma, WordPress | Depende de estrategia contenido |
| SEO | Ahrefs, SEMrush, GSC | GSC es gratis y suficiente para empezar |

**Detección proactiva de solapamiento:**
Si 3+ herramientas en misma categoría, flag: "Veo que usáis [X] y [Y] para [category]. Suele haber solapamiento — ¿queréis que analice si podéis consolidar?"

---

## Output: Budget Constraints Profile

### Summary (siempre generado)

> **Recursos de [Company Name]:**
>
> **Presupuesto**: [range]/mes ([structured/unstructured], [fixed/flexible])
> **Equipo**: [who] dedicando [hours]h/semana
> **Timeline**: [short/medium/long] — resultados esperados en [timeframe]
> **Stack**: [n] herramientas, gaps en [categories], solapamiento en [categories]
>
> **Implicación**: [1 sentence sobre qué significa para la estrategia]

**Ejemplo implicación:** "Con 2K/mes y 10h/semana del fundador, priorizamos 1 canal orgánico (LinkedIn) + 1 landing page. Paid ads no es viable todavía."

---

## Conversation Design

**Tono:** Directo, sin juicio. Las conversaciones de presupuesto pueden ser incómodas — normalizar cada rango.

**Nunca decir:**
- "That's not enough"
- "You should be spending X"

**Siempre decir:**
- "Con [X amount], esto es lo que podemos hacer..."
- "El presupuesto no determina el éxito — la priorización sí."
