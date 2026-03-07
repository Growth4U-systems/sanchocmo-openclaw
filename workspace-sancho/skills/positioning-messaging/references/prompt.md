# Positioning & Messaging Prompts

7 prompts for the positioning-messaging pipeline. Steps 2-7 (Step 1 is deep research using general research prompts). Each prompt builds on previous outputs. Run per niche.

**Template variables** — see SKILL.md for the full list of project-level variables.

**Idioma**: el idioma de output es el idioma del cliente (definido en `clients.json` → `language`, regla general en SOUL.md principio 7). Las skills NO gestionan idioma.

**Document references** — prompts reference output documents from previous steps:
- `{{doc_deep_research}}` — Step 1 output
- "Company document" — Step 3 output
- "Find your place to win" output — Step 4 output
- "Assets" document — Step 5 output
- "Step 6: Prove you are legit value" — Step 6 output
- "Step 6.5: Objection Neutralization" — Step 6.5 output

---

## Prompt 2: Mini Competitor Analysis for Niche

**Input data**: Global competitor intelligence + Deep Research output (Step 1)

```
Act as a senior {{industry}} product strategist. Conduct a targeted competitive analysis of {{ competitors_type_A }}, {{ competitors_type_B }}, {{ competitors_type_C }}, {{ competitor_type_D }} that offer features aligned with the ECP persona: {{ ecp_persona }} to solve {{ problem_core }}

**Core User Pain Point:**

{{problem_core}}

**Research Objective:**

Identify how {{client_name}} top competitors are currently addressing this user pain point through specific product features and UX strategies. Include {{ competitors_type_A }} (such as {{ competitors_examples_A }}), {{ competitors_type_B }} (such as {{ competitors_examples_B }}), {{ competitors_type_C }} (such as {{ competitors_examples_C }}), {{ competitor_type_D }} (such as {{ competitors_examples_D }})

Use the document {{doc_deep_research}} as a supporting reference to understand market trends and validate which features are most responsive to this need in the Spanish market.

**For each competitor, provide:**

- A short product overview (with target segment focus)
- A summary of the relevant features to the ECP: {{ ECP_why_features }}
- A detailed explanation of how those features work
- How each functionality addresses both operational friction (e.g., visibility, automation, segmentation) and emotional friction (e.g., motivation, pressure to borrow, satisfaction of progress)
```

---

## Prompt 3: Own Company Analysis for Niche

**Input data**: Deep Research output (Step 1)

```
Conduct a detailed and structured analysis focused exclusively on {{client_name}}, the company, by addressing the following two main areas:

1. General Company Overview
- Provide a concise history of the company, including founding context, major milestones, and current positioning.
- Describe the company's business model, detailing revenue streams and core customer segments.
- Define the company's Unique Value Proposition (UVP) and explain how it is reflected in its product, UX, and brand messaging.
- List and briefly describe the app's main features, highlighting those central to the company's core user experience and ecosystem. This section should only reflect the company's offerings.

2. In-Depth Functional Review for ECP Persona:
{{ ecp_persona }}

    **Core User Pain Point:**

    {{problem_core}}

    Please include:

    - A complete list of {{client_name}}'s features supporting {{ ECP_why_features }}
    - Use the document {{doc_deep_research}} as a reference to align with market-relevant needs.
    - For each feature: provide a concise summary (name, purpose, capabilities).
    - Describe the full end-to-end user flow for the ECP's core use case using the company's products and features.
    - Explain how each feature works and how it reduces both operational and emotional friction for this ECP.

    Focus strictly on the company; exclude competitor analysis.
```

---

## Prompt 4: Value Criteria Discovery + Competitive Scoring

**Input data**: Competitor analysis (Step 2) + Company analysis (Step 3) + Deep Research (Step 1)

> **TIER 2 RULE**: Before running this prompt, check existing Value Criteria from other niches. Reuse matching criteria. Add only new ones. No duplicates.

```
**Objective:** To conduct a comprehensive competitive analysis in the {{ industry }} sector to identify key customer selection criteria and create a scorable competitive map focusing on {{ ecp_need }}. The primary goal is to determine the most viable strategic positioning for {{ client_name }} by identifying underserved market needs.

**Persona:** Act as an expert Market Research Analyst with a specialization in the {{industry}} industry. Your analysis should be from the perspective of {{ecp_name}}

**Input Data:** You will primarily analyze the attached files containing competitor data. Supplement this data with deep web research to identify market trends, common alternatives, and customer sentiment not covered in the documents.

**Step-by-Step Research & Analysis Protocol:**

1.1 Carefully analyze the attached documents focusing on the need to {{ecp_need}}. Based on this analysis, generate a comprehensive list of evaluation criteria relevant to understand both the functional and emotional drivers behind customer decisions.

1.2 **Analyze Personal Needs & Ambitions:** These are the emotional and psychological drivers of the customer's decision. Some good examples are: Trust in the advisor/brand, Sense of Financial Security, Feeling of Exclusivity/Prestige, Ego Gratification, Financial Empowerment & Education, and Long-term Peace of Mind.

Ensure the list integrates both tangible aspects of the service (for example: pricing model, ease of use, digital accessibility, user experience, brand reputation, multi-user access, integration with third party services, reminders, security perception, customization options, categorization features, group creation) — and intangible factors (for example: trust, perceived safety, empowerment, sense of control).
Present all criteria in a single cohesive list, blending commercial/functional elements with personal needs and ambitions without separating them into categories.

1.3 CRITICAL INSTRUCTION FOR CRITERIA GENERATION: You must generate a clean, consistent list of evaluation criteria. You must strictly follow these formatting rules:
- Naming Convention: Use short, professional Noun Phrases (2-5 words max). Do NOT use full sentences. Do NOT use codes like "F1" or "P2".
- Consistency: Ensure all criteria are at the same level of abstraction.

Required Dimensions to Cover:
- Compliance & Reliability: (e.g., Regulatory Adherence, Audit Proofing).
- Operational Efficiency: (e.g., Auto-Reconciliation, Receipt Capture).
- Financial Intelligence: (e.g., Tax Forecasting, Cash Flow Visibility).
- Ecosystem Connectivity: (e.g., Accountant Access, Bank Aggregation).
- Emotional Drivers: (e.g., Fiscal Peace of Mind, Professional Confidence).

2. **Map the Competitive Landscape:**
    - Using the attached files and additional online research, identify all competitive alternatives relevant to {{ecp_name}}
    - Divide the analysis between: {{ competitors_type_A }} (such as {{ competitors_examples_A }}), {{ competitors_type_B }} (such as {{ competitors_examples_B }}), {{ competitors_type_C }} (such as {{ competitors_examples_C }}), {{ competitor_type_D }} (such as {{ competitors_examples_D }})
    - The status quo ("do nothing"): the alternative of doing it manually

3. **Execute Scoring and Analysis:**
    - For each identified criterion (from Step 1 + any extra found), score every competitor and alternative (from Step 2) on a scale of 0 to 5, where:
        - **0 = Extremely Poorly Positioned / Need completely unsatisfied.**
        - **1 = Poorly Positioned.**
        - **2 = Adequately Positioned.**
        - **3 = Well Positioned.**
        - **4 = Very Well Positioned.**
        - **5 = Market Leader / Need fully satisfied.**
    - For each criterion, add a final "Analysis & Opportunity" column. In this column, interpret the scores:
        - **Red Ocean (Average score 4-5):** Highly competitive area, needs well-satisfied. Note as "High Competition".
        - **No Market (Average score 0-1):** Needs unsatisfied, possibly low customer value. Note as "Low Customer Value or Untapped Market?".
        - **Opportunity Zone (Average score 2-3):** Ideal area to compete. Needs valued but not perfectly satisfied. Note as "Key Opportunity for Differentiation".

**Final Deliverable:**

1. A table with the value criteria including: name, relevance level (Critical/Very High/High/Medium), **importance weight (1-10)**, and a **justification explaining WHY this criterion matters** for this specific ECP and how it connects to their pain/problem.

| Value Criteria | Relevance | Importance (1-10) | Justification |
|-----------------|-----------|-------------------|---------------|

2. A detailed Markdown table titled "Competitive Positioning Map for {{client_name}}":

| Evaluation Criteria | {{competitors_type_A}} Score | {{competitors_type_B}} Score | {{competitors_type_C}} Score | {{competitor_type_D}} Score | {{client_name}} Score | DIY Platform Score | 'Do Nothing' Score | Analysis & Opportunity |

3. Beneath the table, a concluding summary highlighting the top 3-5 most promising "Opportunity Zones" for {{client_name}}.

4. **Score Explanations (OBLIGATORIO)**: For EACH competitor × criterion combination, provide a brief explanation of WHY that score was assigned. Format:
   - **[Criteria] — [Competitor]: [Score]/5** — [1-2 sentence justification with evidence]
   - This ensures transparency and allows the user to challenge or validate scores.

5. **Deduplication check**: Before finalizing, compare all new Value Criteria against the existing shared list. If a new criterion overlaps with an existing one (>80% conceptual similarity), USE the existing one instead of creating a new one.
```

---

## Prompt 5: Asset Mapping

**Input data**: Company analysis (Step 3) + Value Criteria (Step 4) + ECP document

> **TIER 2 RULE**: Before creating new assets, check existing Asset list from other niches. Update existing assets with new niche connections. Only add truly new assets.

```
Connect the assets in "Company document" output document, match each of the value criteria of "Find your place to win" output document, focused on the information of {{ecp_name}} contained in "{{Name_doc_nichos}}" document.

This step is all about identifying {{client_name}} unique strengths and determining how they can be leveraged to differentiate its product. We want to avoid competing on price, since that's a "race to the bottom".

1. **Map All Your Assets**:
    - List everything your company has that could be valuable: **features, team abilities, skills, knowledge, technology, even location**.

2. **Categorize Assets: Qualifiers vs. Differentiators**:
    - **Qualifiers**: These are the **market standard**; what's expected of you to even "play the game". You *must* have these. *Example*: Geo-targeting for a GPS tracking system.
    - **Differentiators**: These are what make you **unique**. What do you have that no one else does? This is what you can build your **entire business around**.
        - Avoid vague, ambiguous words like "empower," "elevate," or "level up" in your value proposition, as they don't clearly communicate what you do. Be **specific and clear**.
        - **Niche down** in the early stages; you can't serve five customer segments with a small team. Focus on one or two to create scalable processes.

    *Example*: For a vehicle tracking system, having a highly capable analytical team that can quickly develop a feature to save 20% in maintenance costs could be a differentiator, especially if competitors aren't addressing this specific client need.

**Output format:** Present the output as a structured table with the following columns:

| {{client_name}} Asset | Value Criteria | Category | Justification for Differentiation |

Instructions for formatting:
- Each row should represent a single unique asset (do not repeat assets across rows).
- In the Value Criteria column, use one of the Value Criteria from Step 4 that the asset contributes to.
- In the Category column, define whether the asset acts as a Qualifier or a Differentiator.
- The Justification for Differentiation should concisely explain why this asset provides strategic or competitive value in relation to the specified value criteria.

**Deduplication check (OBLIGATORIO)**: Before finalizing, compare all new Assets against the existing shared Asset list. If a new asset overlaps with an existing one (same feature described differently), USE the existing asset and add a new connection to this ECP's Value Criteria. Do NOT create a duplicate.
```

---

## Prompt 6: Benefit-Proof Pairing

**Input data**: Asset table (Step 5) + Deep Research (Step 1) + ECP document

```
You are a market analyst responsible for evaluating the strengths of {{client_name}} product for the ECP segment {{ecp_name}} in {{country}}.

Using the different assets highlighted in the "Assets" document, in the "{{client_name}} Assets" column, complete the table below focusing on ECP: {{ecp_name}} contained in "{{Name_doc_nichos}}" document. For each row, fill in:

- Unique asset: Use the assets from the "Assets" document from Step 5, in the "{{client_name}} Assets" column.
- Competitive advantage: What kind of advantage does the company gain by owning or deploying that asset over its competitors?
- User benefit: What does the user get from that asset? Why would the user care?
- Proof: How can you demonstrate that the company really has that asset and that users really get the benefit? What message or image should we include? How can I demonstrate this to the customer? Testimonials, images of the app, tutorials, advertisements with a message. Clearly indicate the message to be displayed. Adapt the message to the ECP.

Example of format to follow:

| **Unique Asset** | **Competitive Advantage** | **Benefit for the User** | **Proof** |
| --- | --- | --- | --- |
| Independent financial strategy (not tied to product-sales) | Ability to select best alternatives in market without conflict of interest | User receives objective advice, transparent decision-making | Publish transparency reports, user testimonials, independent review |
| Competitive pricing | Lower entry threshold, democratizing access | A wider audience can access quality advice affordably | Cost-comparative tables vs competitors, case studies |
| Personalized human financial adviser combined with digital platform | Hybrid model offers human empathy + digital efficiency | Users get tailored support when needed, beyond robo-advice | Client testimonials emphasizing personal service, adviser profiles published online |

Provide the responses in table form, with one row per criterion/asset.

| **Unique Asset** | **Competitive Advantage** | **Benefit for the User** | **Proof** |
| --- | --- | --- | --- |
| ... | ... | ... | ... |
```

---

## Prompt 6.5: Objection Neutralization (NUEVO)

**Input data**: Conversion barriers from company-brief (`{{conversion_barriers}}`) + Proof table (Step 6) + ECP document

```
You are a conversion strategist for {{client_name}} targeting the ECP: {{ecp_name}}.

**Context:** The company brief identifies these conversion barriers for this audience:

{{conversion_barriers}}

**Task:** For EACH barrier/objection, create a neutralization strategy:

| Objeción | Tipo (precio/miedo/dolor/confianza/otro) | Reframe (cómo reencuadrar la objeción) | Mensaje neutralizador | Proof de soporte | Formato sugerido (FAQ, testimonial, comparativa, garantía...) |

**Rules:**
- The reframe must NOT dismiss the objection — it must acknowledge it and redirect.
- The message must feel empathetic, not defensive.
- Proofs must be specific and verifiable (not "our clients love us").
- Each objection gets its OWN dedicated message, not a generic catch-all.
- If a barrier connects to an Asset from Step 5, reference it explicitly.

**Example:**
| "Es muy caro" | precio | "No es un gasto, es la inversión que evita gastar 3x en soluciones que no funcionan" | "El 73% de quienes prueban minoxidil por su cuenta gastan más de €2.000 en 3 años sin resultado. Con nosotros, sabes exactamente qué necesitas desde el día 1." | Dato: coste medio tratamientos OTC vs. diagnóstico profesional [Fuente] | Comparativa de costes + testimonial |

Generate one row per conversion barrier. If the brief lists 3 barriers, produce 3 rows minimum.
```

---

## Prompt 7: Final Positioning & Messaging Playbook (PAIN-ACTIVATED)

**Input data**: Proof table (Step 6) + Objection neutralization (Step 6.5) + all previous outputs

```
Using the documents from "Step 6: Prove you are legit value" and "Step 6.5: Objection Neutralization", conduct a strategic and evidence-based analysis of {{client_name}} Unique Value Proposition (UVP) and Unique Selling Propositions (USPs).

### OBJECTIVE:

Develop a **pain-activated messaging playbook** grounded in {{client_name}} brand tone and validated user pain points. Every message must follow the **Dolor → Diagnóstico → Puente** framework, which maps directly to the pipeline:

1. **Dolor = Value Criteria (Step 4)**: The pain point the ECP experiences. Describe a specific, vivid moment the ECP lives. Not abstract pain — a scene they recognize instantly. ("Llevas meses mirándote la frente en cada reflejo...")
2. **Diagnóstico del problema real**: The insight connecting pain to solution — what the ECP hasn't articulated. ("El problema no es la caída — es no saber si lo que haces funciona o estás perdiendo tiempo.")
3. **Puente = Asset (Step 5)**: What {{client_name}} has that solves the problem. Connect diagnosis to the specific asset. ("Con un diagnóstico capilar real, dejas de adivinar y empiezas un plan que tiene sentido para TU caso.")

Each message row therefore traces: **Value Criteria (dolor) → Insight (diagnóstico) → Asset (puente)**. This ensures every message is grounded in the pipeline data, not invented.

### TASKS:

1. **Extract and clearly define UVP and USPs**:
    - Use evidence from Step 6 proof table.
    - Clearly distinguish between the core value promise (UVP) and the product differentiators (USPs).

2. **For EACH message, generate 2 formats**:
    - **Versión corta (ads)**: 1-2 líneas máximo. Para social ads, banners, subject lines.
    - **Versión landing (story-driven)**: 1 párrafo completo. Situación → Diagnóstico → Puente. Para landing pages, emails, blog intros.

3. **Include objection-neutralization messages**: Integrate the key messages from Step 6.5 as dedicated rows in the playbook.

4. **Messaging table format**:

| Categoría | Hipótesis (por qué funcionará) | Value Criteria | Objetivo | Versión Corta (ads) | Versión Landing (story-driven) |

5. **Ensure each message row focuses on a distinct strategic emphasis**, such as:
    - Core UVP (dolor → diagnóstico → puente emocional)
    - Anti-objeción: precio
    - Anti-objeción: miedo/dolor
    - Anti-objeción: desconfianza
    - Diferenciador clave 1, 2, 3...

6. **Align each row with a clear Value Criteria from Step 4**

7. **Statistical claims**: Every number, percentage, or data point in the messaging MUST have either:
    - `[Fuente: título](url)` inline citation, OR
    - `~estimación` marker if no verified source exists
    - **NEVER include unattributed statistics in final copy.**

### A/B VARIANTS (OPCIONAL):

Si el cliente indica que tiene tests planificados o quiere variantes:
- Para los 2-3 USPs más críticos, generar 2-3 variantes alternativas
- Marcar: `[Variante A]`, `[Variante B]`, `[Variante C]`
- Indicar qué hipótesis testea cada variante (ej: "bono €195" vs "consulta gratuita" vs "diagnóstico sin compromiso")

### OUTPUT REQUIREMENTS:

- 1 row for {{client_name}} **UVP Core Promise** (con dolor → diagnóstico → puente)
- At least 4-5 rows for **different USPs**, each with unique positioning
- At least 1-2 rows for **anti-objection messaging** (from Step 6.5)
- **2 formatos por mensaje**: corto + landing
- Each message must reflect how a **professional copywriter** would phrase the communication
- Copy es: visceral, específico, reconocible. NO genérico, NO funcional, NO "Stop guessing".

### LEGAL CHECK (OBLIGATORIO):

Before finalizing, cross-check ALL messaging against these restrictions:
{{legal_constraints}}

If ANY message violates a restriction (names a restricted product, makes a prohibited claim, etc.):
- Flag it: ⚠️ LEGAL
- Rewrite to comply
- Document the original + compliant version

### Copy Principles:

- **Dolor primero**: el lector debe sentirse identificado en la primera frase
- **Específico > genérico**: "mirándote la frente en el espejo" > "preocupado por tu pelo"
- **Diagnóstico que sorprende**: nombra el problema real que no han verbalizado
- **Puente creíble**: conecta diagnóstico → solución con proof, no con promesa vacía
- Informal pero respetuoso
- Benefit-driven, nunca feature-driven
```

---

## Self-Intelligence Adaptation

When running for the client's OWN company (not a competitor's niche):
- Step 2 (Mini Competitor Analysis) still runs — it's about how competitors serve this niche
- Step 3 (Own Company Analysis) uses self-intelligence data as primary input
- All other steps identical
