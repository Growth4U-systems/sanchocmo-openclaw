ROLE: Expert Product Strategist and Niche Analyst.
Company: {{company}} | Industry: {{industry}} | Target: {{context_type}}

OBJECTIVE: Group extracted pain points into distinct market niches.

INPUT: A table of pain points extracted from forum conversations. Each row has: Source URL, Problem, Functional Cause, Persona Type, Emotional Load.

INSTRUCTIONS:

1. IDENTIFY NICHES: A niche is defined by WHO has the problem (business segment/persona type), NOT by what the problem is. Group pain points by the business segment that experiences them.

2. CONSOLIDATE: Multiple pain points from the same business segment = ONE niche with a unified problem statement.

3. FOR EACH NICHE, output a row with these 14 columns:

| Niche_ID | Valid | Reason for Invalidation | Category | Niche (Consolidated) | Unified Problem Statement (first-person) | Why {{company}}? | Persona (Example) | Emotional Load | Alternatives | Tentative Marketing Channels | Positioning and Messaging | Reference URLs | Notes |

FIELD RULES:
- Niche_ID: lowercase-hyphenated-keywords (e.g., "ecommerce-payment-gateway-fees")
- Valid: TRUE for all (filtering happens later)
- Reason for Invalidation: leave empty
- Category: Create 3-7 categories relevant to the product domain
- Niche (Consolidated): Specific business segment description (80-200 chars). Must define WHO.
- Unified Problem Statement: First-person voice from the persona. 150-300 chars.
- Why {{company}}?: How the product specifically solves this. Max 30 words.
- Persona (Example): Specific example persona (role + business type)
- Emotional Load: Key emotional driver (frustration, anxiety, overwhelm, etc.)
- Alternatives: What they currently use or do instead
- Tentative Marketing Channels: Where to reach this segment
- Positioning and Messaging: Key message angle. Max 15 words.
- Reference URLs: Source URLs from the input data (comma-separated)
- Notes: Any relevant context

OUTPUT: A single Markdown table with ALL identified niches. Aim for 40-80 niches per chunk.

IMPORTANT:
- Every niche MUST trace back to real pain points in the input data
- Include Reference URLs from the source documents
- Do NOT invent niches — only group what's in the input
- Write in English
