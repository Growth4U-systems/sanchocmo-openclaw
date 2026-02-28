# Positioning & Messaging Prompts

6 prompts for the positioning-messaging pipeline. Steps 2-7 (Step 1 is deep research using general research prompts). Each prompt builds on previous outputs. Run per niche.

**Template variables** — see SKILL.md for the full list of 18 project-level variables.

**Document references** — prompts reference output documents from previous steps:
- `{{doc_deep_research}}` — Step 1 output
- "Company document" — Step 3 output
- "Find your place to win" output — Step 4 output
- "Assets" document — Step 5 output
- "Step 6: Prove you are legit value" — Step 6 output

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

| Value Criterion | Relevance | Importance (1-10) | Justification |
|-----------------|-----------|-------------------|---------------|

2. A detailed Markdown table titled "Competitive Positioning Map for {{client_name}}":

| Evaluation Criteria | {{competitors_type_A}} Score | {{competitors_type_B}} Score | {{competitors_type_C}} Score | {{competitor_type_D}} Score | {{client_name}} Score | DIY Platform Score | 'Do Nothing' Score | Analysis & Opportunity |

3. Beneath the table, a concluding summary highlighting the top 3-5 most promising "Opportunity Zones" for {{client_name}}.

4. **Score Explanations (OBLIGATORIO)**: For EACH competitor × criterion combination, provide a brief explanation of WHY that score was assigned. Format:
   - **[Criterion] — [Competitor]: [Score]/5** — [1-2 sentence justification with evidence]
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

## Prompt 7: Final Positioning & Messaging Playbook

**Input data**: Proof table (Step 6) + all previous outputs

```
Using the document from "Step 6: Prove you are legit value", conduct a strategic and evidence-based analysis of {{client_name}} Unique Value Proposition (UVP) and Unique Selling Proposition (USP).

### OBJECTIVE:

Develop a **messaging playbook** grounded in {{client_name}} brand tone and validated user pain points. Your final output will be a **messaging table** that includes polished, bilingual copy ready for marketing and product channels.

### TASKS:

1. **Extract and clearly define UVP and USP**:
    - Use evidence from the "Step 6: Prove your value" document.
    - Clearly distinguish between the core value promise (UVP) and the product differentiators (USPs).

2. **Translate findings into a messaging table** with the following format:

| Message Category | Hypothesis (Why it will work) | Value Criteria | Objective | Final Message (English) | Final Message (Castellano) |

3. **For the "Final Message" columns**, generate marketing-ready messages that are:
    - Short, direct, and emotionally resonant
    - Consistent with {{client_name}} tone
    - Crafted by a skilled **copywriter** — apply messaging principles from the reference document titled "Perfil de Copywriter" to inform tone, persuasion tactics, and structure.
    - Make sure to connect the message with the ECP.

4. **Ensure each message row focuses on a distinct strategic emphasis**, such as:
    - Core UVP (e.g. emotional and logistical clarity)
    - Automation
    - Fairness (e.g. pro-rata logic)
    - Transparency & Accountability
    - Flexibility in payments
    - Speed and ease of collection

5. **Align each row with a clear Value Criteria from Step 4**

6. **Provide full citations or document references** for any findings or claims drawn from the ECP results.

### OUTPUT REQUIREMENTS:

- 1 row for {{client_name}} **UVP Core Promise**
- At least 4-5 rows for **different USPs**, each with unique positioning
- Fully completed bilingual messaging table
- Each message must reflect how a **professional copywriter** would phrase the communication
- Short, sharp, emotionally intelligent copy

### Tip for Copy Tone:

- Emphasize **clarity**, **empathy**, and **actionability**
- Use informal but respectful language in Spanish
- Prefer benefit-driven over feature-driven copy
- Make pain points and solutions obvious within 1 sentence
```

---

## Self-Intelligence Adaptation

When running for the client's OWN company (not a competitor's niche):
- Step 2 (Mini Competitor Analysis) still runs — it's about how competitors serve this niche
- Step 3 (Own Company Analysis) uses self-intelligence data as primary input
- All other steps identical
