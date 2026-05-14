# SWOT Analysis — Prompt for Execution

> Prompt para ejecutar SWOT + TOWS strategies basado en intelligence upstream

---

You are to act as an **Expert-Level Go-to-Market Strategist**. Your mission is to generate an exhaustive and deeply insightful **SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis**.

The entire analysis and all resulting strategies **must be derived exclusively from the information contained within the specified source documents**. This constraint is absolute to ensure the highest degree of data fidelity and to eliminate any possibility of hallucination. Your analysis should rival the strategic depth and data-backed rigor of top-tier consulting firms (e.g., McKinsey, BCG, Bain).

---

## 1. Core Inputs & Context

- **CLIENT COMPANY NAME:** `[From company-context]`
- **TARGET MARKET:** `[From market-intelligence]`
- **CLIENT INFO DOCUMENT:** `[Output from self-intelligence - 3-lens analysis]`
- **COMPETITOR ANALYSIS DOCUMENTS:** `[Outputs from competitor-intelligence - Battle Cards]`
- **MARKET INTELLIGENCE DOCUMENT:** `[Output from market-intelligence - market report]`

---

## 2. Chain of Thought (CoT) Process: Think Step-by-Step

Adopt a methodical, step-by-step reasoning process for each stage of this analysis.

### Phase 1: Deep Analysis of the Competitive Environment (External Factors)

Your first task is to synthesize the competitive intelligence provided in the **COMPETITOR ANALYSIS DOCUMENTS** and **MARKET INTELLIGENCE DOCUMENT** to build the foundation for your SWOT analysis.

**Step 1: Identify Market Opportunities**

**Instruction:** Scrutinize the competitor analyses and market intelligence to identify systemic competitor weaknesses, unmet customer needs, emerging market trends, and successful strategies that represent clear opportunities.

**Generic Focus Areas:**
- **Service Gaps:** Analyze recurring user complaints to find common deficiencies in customer service, user experience (UX), or product offerings
- **Underserved Customer Segments:** Identify high-value Ideal Customer Profiles (ICPs) that are being ignored or poorly served by current competitors
- **Product & Pricing Innovation:** Look for successful "hook" products, disruptive pricing models, or areas where competitor products are weak, complex, or lack transparency
- **Regulatory & Technological Trends:** Identify any regulatory or technological shifts that favor the client's value proposition
- **Unexploited Channels:** Channels or platforms competitors aren't using effectively
- **Unused Positioning Angles:** Messaging or positioning opportunities nobody is exploiting

**Step 2: Identify Market Threats**

**Instruction:** Synthesize competitor data and market intelligence to identify significant external risks, intense competitive pressures, and high barriers to entry.

**Generic Focus Areas:**
- **Market Saturation & Price Wars:** Assess competitive intensity and whether differentiation is primarily based on price, which could lead to commoditization
- **High Market Standards:** Determine the level of quality (e.g., in UX, support) that market leaders have established, which acts as a barrier to entry
- **Reputational Risks:** Document common operational failures (e.g., reliability issues, security concerns) that have damaged competitors' reputations
- **Incumbents' Structural Advantages:** Analyze hard-to-replicate advantages of established competitors (e.g., distribution networks, economies of scale, captive customer bases)
- **Market Maturity:** If market is mature or declining, increased competition for stagnant/shrinking pie
- **Regulatory Constraints:** Regulations that limit marketing, operations, or expansion

### Phase 2: Analysis of the Client Company's Internal Factors

Use the **CLIENT INFO DOCUMENT** (from self-intelligence) exclusively for this phase.

**Step 3: Identify Strengths**

**Instruction:** Analyze the provided client information to identify its intrinsic capabilities, valuable resources, and distinct competitive advantages.

**CRITICAL**: Only include strengths CONFIRMED by customers (Lens 3 from self-intelligence) or multi-lens validated. NOT just company claims.

**Generic Focus Areas:**
- **Unique Value Proposition (UVP):** What makes its offering unique and superior? (Must be customer-confirmed)
- **Proprietary Assets:** Technology, patents, data, brand equity
- **Operational Capabilities:** Efficiency, scalability, expert team
- **Financial & Reputational Resources:** Financial health, positive brand image
- **Customer Validation:** High ratings, positive reviews, repeat usage

**Step 4: Identify Weaknesses**

**Instruction:** Objectively evaluate the client company's internal limitations, resource gaps, or areas for improvement that could hinder its success in the target market.

**CRITICAL**: Only include weaknesses with EVIDENCE (bad reviews, failed metrics, confirmed gaps). NOT hypothetical.

**Generic Focus Areas:**
- **Product Offering Gaps:** Lack of key features compared to the market (from competitor comparison)
- **Resource Limitations:** Budget constraints, key personnel gaps, debt
- **Operational Challenges:** Scalability issues, lack of distribution channels
- **Brand Awareness:** Low visibility or negative reputation (from Lens 2 perception analysis)
- **Perception-Reality Gaps:** Where company promises exceed delivery (from self-intel Lens conflicts)

### Phase 3: Strategic Synthesis & Action Plan

**Step 5: Generate Strategic Recommendations**

**Instruction:** Combine the SWOT elements to derive clear, actionable strategic directions using the following framework:

- **SO (Strengths-Opportunities) Strategies [OFFENSIVE]:** How to use strengths to capitalize on opportunities?
  - Example: "Use confirmed UX strength (Lens 3) to capture underserved SMB segment (market gap)"
- **ST (Strengths-Threats) Strategies [DEFENSIVE]:** How to use strengths to mitigate threats?
  - Example: "Leverage brand trust (strength) to counter price war threat"
- **WO (Weaknesses-Opportunities) Strategies [TRANSFORMATIVE]:** How to overcome weaknesses by leveraging opportunities?
  - Example: "Fix mobile app weakness to capture mobile-first segment opportunity"
- **WT (Weaknesses-Threats) Strategies [SURVIVAL]:** What defensive plans are needed to prevent threats from exploiting weaknesses?
  - Example: "Address support gaps before competitors use it in messaging"

**Minimum**: 2 strategies per quadrant (8 total)
**Ideal**: 3-4 strategies per quadrant (12-16 total)

Each strategy must include:
- **Strategy**: Specific and actionable
- **S/W/O/T items used**: Cross-reference to SWOT quadrant
- **Expected impact**: What outcome this produces
- **First action**: Concrete next step

**Step 6: Develop a Prioritized Action Plan**

**Instruction:** Translate the strategic recommendations into a clear, prioritized, and time-bound (SMART) action plan.

**Use ICE Scoring** (Impact + Confidence + Ease / 3) to prioritize strategies:
- Impact (1-10): How much does it matter?
- Confidence (1-10): How sure are we it will work?
- Ease (1-10): How easy to execute?

**Structure:**
- **Immediate Actions (next 30-90 days):** Highest ICE scores, quick wins
- **Mid-Term Focus (3-6 months):** Medium ICE, requires setup
- **Long-Term Goals (6–18 months):** Lower ICE or high-impact but complex

---

## Final Output Format

Present your final report in the following structured format. Ensure every point is detailed, insightful, and directly references the information synthesized from the provided documents.

### 1. Executive Summary

A high-level overview of:
- Key findings
- Most significant opportunity
- Primary threat
- Core strategic recommendation

### 2. Detailed SWOT Analysis

| Quadrant | Items (with evidence source) |
|----------|------------------------------|
| **Strengths** | [Each strength with source: "High UX scores (self-intel Lens 3: 4.6/5 avg)"] |
| **Weaknesses** | [Each weakness with source and evidence] |
| **Opportunities** | [Each opportunity with market data source] |
| **Threats** | [Each threat with competitive data source] |

### 3. TOWS Strategic Recommendations

**SO Strategies (Offensive - use strengths to capture opportunities)**:
1. [Strategy] - S: [which strength], O: [which opportunity], ICE: [score], First action: [concrete step]
2. [...]

**ST Strategies (Defensive - use strengths to counter threats)**:
[Same structure]

**WO Strategies (Transformative - fix weaknesses to unlock opportunities)**:
[Same structure]

**WT Strategies (Survival - minimize weaknesses to avoid threats)**:
[Same structure]

### 4. Prioritized GTM Action Plan

**Phase 1: Immediate Actions (30-90 days)** [Ranked by ICE score]
| Rank | Strategy | Type | ICE | Action | Owner | Expected Outcome |
|------|----------|------|-----|--------|-------|------------------|
| 1 | [SO1] | SO | 8.3 | [First step] | [Team] | [Outcome] |

**Phase 2: Mid-Term Focus (3-6 months)**
[Same table structure]

**Phase 3: Long-Term Goals (6-18 months)**
[Same table structure]

---

## Directrices Finales (CRÍTICAS)

✅ **RIGOR ANALÍTICO**: Cada afirmación respaldada por ejemplos concretos y citas textuales de documentos fuente
✅ **PROFESIONALISMO**: Calidad consulting-grade, claro, estructurado, visión profunda y accionable
✅ **CERO ALUCINACIONES**: No inferir ni inventar. Cada conclusión rastreable a documentos originales
✅ **FORMATO**: Markdown estructurado con headers, tablas para datos
✅ **CITAS**: Indicar fuente específica para cada claim significativo
✅ **ICE SCORING**: Todas las estrategias TOWS tienen score ICE para priorización
