# Competitor Intelligence — Analysis Prompts

Reference prompts for the 3-lens analysis. One prompt per lens, applied per competitor.

---

## Prompt 1: Lens 1 — Autopercepción (What They Say About Themselves)

**Input required**: Website content, social media posts, paid ads, support docs, blog posts

```
Analyze [Competitor Name]'s self-positioning based on the following data.

For each dimension, provide specific evidence (quotes, URLs, screenshots):

1. **Value Proposition**: What is their stated core value promise? (look at H1, meta descriptions, hero sections)

2. **Target Audience**: Who are they explicitly targeting? Who is implied by their messaging? Are these the same?

3. **Feature Emphasis**: What features do they highlight? What do they hide or minimize? What's suspiciously absent?

4. **Pricing Strategy**: What's the pricing model? How do they frame it? (cheap vs premium, value vs volume) Any hidden costs?

5. **Content Strategy**: What topics do they cover? What's their publishing frequency? Which channels are most active? Which are dormant?

6. **Paid Ads Analysis**: What messages are they running in ads? What offers/hooks? What audiences (if targetable from ad libraries)?

7. **Tone & Voice**: How do they speak? (formal/casual, technical/simple, serious/playful) Is it consistent across channels?

8. **Growth Model Signals**: Based on their public strategy, how do they acquire customers? (PLG indicators: free trial, self-serve signup. Sales indicators: "book a demo", "contact sales". Content indicators: heavy blog/SEO investment. Paid indicators: active ad campaigns.)

Output a structured Lens 1 profile with evidence for each dimension.
```

---

## Prompt 2: Lens 2 — Percepción de Terceros (What Others Say About Them)

**Input required**: News articles, influencer mentions, SEO data, industry reports

```
Analyze external perception of [Competitor Name] based on third-party data.

1. **Media Narrative**: How do journalists/media describe them? What's the recurring storyline? (disruption, reliability, innovation, controversy?)

2. **Influencer Perception**: What do YouTube/Instagram/LinkedIn creators say about them? Positive, neutral, or critical? What specific aspects do they praise or criticize?

3. **SEO Visibility**: What's their domain authority? What are their top organic keywords? Where do they rank well vs poorly? What content drives their traffic?

4. **Industry Position**: How are they referenced in industry reports, rankings, or awards? Are they leaders, contenders, or followers?

5. **Narrative Alignment**: Does the external narrative MATCH their Lens 1 self-positioning? Where are the gaps?

Rate overall external perception as: positive, neutral, negative, or mixed.
Rate narrative vs Lens 1 alignment as: aligned, partially aligned, or misaligned.

Output a structured Lens 2 profile.
```

---

## Prompt 3: Lens 3 — Percepción del Consumidor (What Customers Say)

**Input required**: Review platform data, social media comments, forum mentions

```
Analyze customer perception of [Competitor Name] based on review and social data.

1. **Overall Sentiment**: Across all review platforms, what's the weighted average rating and sentiment trend? (improving, stable, declining)

2. **Top Pros** (3-5): What do customers consistently praise? Be specific — not "good product" but "easy onboarding in under 5 minutes" or "responsive support team".

3. **Top Cons** (3-5): What do customers consistently complain about? Be specific. Look for patterns across multiple reviews.

4. **Unmet Needs**: What are customers asking for that this competitor does NOT deliver? These are direct positioning opportunities.

5. **Migration Patterns**: Where are customers coming FROM when they choose this competitor? Where do they go when they LEAVE?

6. **Customer Profiles**: What types of users leave reviews? (company size, role, industry, use case) Do the best reviews come from their stated target audience?

7. **Review Volume**: Is there enough data for high-confidence analysis? (>50 reviews = high, 20-50 = medium, <20 = low)

8. **Lens Conflict Detection**: Does customer reality match what the competitor claims (Lens 1)? Flag every significant gap.

Output a structured Lens 3 profile with confidence level noted.
```

---

## Prompt 4: Battle Card Synthesis

**Input required**: All 3 lens profiles for one competitor

```
Using the Lens 1, Lens 2, and Lens 3 profiles for [Competitor Name], synthesize a Battle Card.

Apply the Lens Priority Hierarchy:
- Lens 3 (customer data) always wins in conflicts
- Lens 2 (third-party) overrides Lens 1
- Lens 1 (self-claims) is lowest priority

Produce:

1. **Quick Profile**: Founded, HQ, team size, funding, growth model (1 paragraph)

2. **Real Positioning** (not what they claim, what they actually deliver): Value prop, target audience, key strengths, pricing

3. **Vulnerabilities** (Lens 1 vs 3 gaps): Where they promise what they don't deliver. Each vulnerability = positioning opportunity for us.

4. **How to Beat Them**:
   - Their specific weakness that maps to our strength
   - Positioning angle: how to differentiate
   - What NOT to compete on: where they genuinely win
   - 3-5 sales talking points when a prospect mentions them

5. **Monitoring Triggers**: What changes would require re-analysis? (pricing change, major feature launch, funding round, leadership change)
```

---

## Prompt 5: Competitive Landscape Synthesis

**Input required**: All Battle Cards + market context

```
Using the Battle Cards for all analyzed competitors, produce a Competitive Landscape Map.

1. **Overview Table**: One row per competitor — name, type, tier, positioning claim, pricing model, customer rating, key strength, key weakness

2. **Positioning Map**: Recommend the best 2 axes for a 2x2 matrix based on market dynamics. Place each competitor + us. Identify white space.

3. **Feature Heatmap**: Matrix of the 10-15 most important features × all competitors. Rate: strong (delivers well), exists (has it, mediocre), missing (doesn't have it).

4. **Growth Model Comparison**: How each competitor acquires customers. Which channels are crowded? Which have opportunity?

5. **Cross-Competitor Patterns**:
   - What EVERYONE claims but nobody delivers (universal Lens 1 vs 3 gaps)
   - Features nobody offers that customers want (aggregate unmet needs)
   - Positioning angles nobody is using
   - Channels nobody is exploiting

6. **Opportunity Summary**: Top 3-5 actionable opportunities derived from the landscape analysis. Each with: opportunity, evidence, recommended action.
```
