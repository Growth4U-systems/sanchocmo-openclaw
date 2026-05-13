## Brand Memory Integration

This skill reads brand context to ensure every lead magnet concept aligns with the user's positioning, speaks to their actual audience, and sounds like their brand. It also checks for existing campaigns and lead magnets to avoid duplication.

**Reads:** `voice-profile.md`, `positioning.md`, `audience.md` (all optional)

On invocation, check for `./brand/` and load available context:

1. **Load `voice-profile.md`** (if exists):
   - Match the brand's tone and vocabulary in all lead magnet copy
   - Apply voice DNA to titles, hooks, and body content
   - A "direct, proof-heavy" voice writes different hooks than a "warm, story-driven" voice
   - Show: "Your voice is [tone summary]. Lead magnet copy will match that register."

2. **Load `positioning.md`** (if exists):
   - Use the chosen positioning angle to inform the lead magnet's frame
   - The positioning determines how the lead magnet bridges to the paid offer
   - Use differentiation points to ensure the lead magnet is unique vs competitors
   - Show: "Your positioning angle is '[angle]'. Concepts will build on that frame."

3. **Load `audience.md`** (if exists):
   - Know who this lead magnet is for: awareness level, sophistication, pain points
   - Match format complexity to audience preference (video people vs readers vs doers)
   - Use audience language in hooks and titles
   - Show: "Writing for [audience summary]. Awareness: [level]."

4. **Check for existing lead magnets** (if `./campaigns/*/brief.md` or `./brand/{slug}/operational/assets.md` references a lead magnet):
   - If a lead magnet already exists, note it and ask whether to create a new one or iterate
   - Show: "Found existing lead magnet: '[name]'. Want to create a new one or improve this?"

5. **If `./brand/` does not exist:**
   - Skip brand loading entirely. Do not error.
   - Proceed without it -- this skill works standalone.
   - The concepts will be well-structured either way; brand memory makes them more targeted.
   - Note: "I don't see a brand profile yet. You can run /start-here or /brand-voice first to set one up, or I'll work without it."

### Context Loading Display

Show the user what was loaded using the standard tree format:

```
Brand context loaded:
├── Voice Profile     ✓ "{tone summary}"
├── Positioning       ✓ "{primary angle}"
├── Audience          ✓ "{audience summary}"
└── Learnings         ✓ {N} entries

Using this to shape lead magnet concepts and copy.
```

If files are missing, show them as ✗ with a suggestion:

```
├── Voice Profile     ✗ not found
│   → /brand-voice to create one (~10 min)
```

---


## Competitive Research

Before generating concepts, use web search to understand what competitors are already offering as lead magnets in the same space. This prevents creating something generic and reveals gaps to exploit.

### Research Process

1. **Identify the niche/market** from user input and brand memory (positioning.md, audience.md).

2. **Search for competitor lead magnets** using web search:
   - Search: "[niche] free download" or "[niche] lead magnet"
   - Search: "[competitor name] free resource" for known competitors
   - Search: "[niche] opt-in freebie" or "[niche] email list building"
   - Check competitor websites for opt-in offers visible on homepages, blog sidebars, and popups

3. **Analyze what you find:**
   - What formats are competitors using? (PDF, quiz, template, challenge)
   - What hooks are they leading with?
   - What gaps exist? (Formats no one is using, angles no one has taken)
   - What is overdone? (If everyone has a "complete guide," avoid that format)

4. **Show the research in the output:**
   ```
   COMPETITIVE LANDSCAPE

   Competitor lead magnets found:
   ├── [Competitor A]   "The Complete X Guide" (PDF)
   ├── [Competitor B]   "X Calculator" (interactive tool)
   ├── [Competitor C]   "X Checklist" (PDF checklist)
   └── [Competitor D]   "What's Your X Type?" (quiz)

   Gap: No one is offering a template/swipe file
   Overdone: PDF guides (3 of 4 competitors)
   Opportunity: Interactive format or template
   ```

5. **Use findings to differentiate:**
   - If everyone has PDFs, suggest a quiz or calculator
   - If everyone is broad, go narrow and specific
   - If no one uses a particular hook type, exploit it
   - Reference competitive gaps in the concept rationale

### When Web Search Is Not Available

If web search is unavailable or returns insufficient results:
- Note: "I wasn't able to research competitor lead magnets. Concepts are based on industry patterns and best practices."
- Proceed with concept generation using the reference files and framework knowledge.
- Still apply the differentiation mindset -- just without specific competitive data.

---


## Iteration Detection

Before starting, check if a lead magnet already exists for this project.

### If campaign lead magnet files exist in `./campaigns/*/`

Do not start from scratch. Instead:

1. Read the existing lead magnet files.
2. Present a summary of what exists:
   ```
   Existing lead magnet found:

   Campaign: {name}
   ├── lead-magnet.md    ✓  ({format}, {title})
   ├── brief.md          ✓  (created {date})
   └── landing-page.md   {✓/✗}

   "{Lead magnet title}"
   Format: {format}
   Hook: "{hook}"
   ```
3. Ask: "Do you want to revise this magnet, create a new one, or generate additional concepts?"
   - **Revise** -- load existing content, identify weak spots, rewrite sections
   - **New** -- create an entirely different lead magnet for a different audience segment or offer
   - **Additional concepts** -- generate more options alongside the existing one

### If no lead magnet files exist

Proceed directly to concept generation using the methodology below.

---


## Before Generating: Understand the Context

### Step 1: Identify the business type

Different business types have different optimal lead magnet formats:

**Info Products (courses, memberships, coaching):**
- Quizzes and assessments work exceptionally well
- Challenges (5-day, 7-day) build momentum and community
- PDF frameworks that solve one specific problem
- Video series that demonstrate teaching style
- Free chapters or modules as taste of full product

**SaaS (software, tools, apps):**
- Free tools or constrained versions of the product
- ROI calculators that quantify the value
- Templates that work with the product
- Checklists and implementation guides
- Free trials (not technically a "lead magnet" but same function)

**Services (agencies, consultants, freelancers):**
- Audits that reveal problems the service solves
- Assessments that diagnose the prospect's situation
- Case studies that prove capability
- Strategy sessions or consultations
- Templates that showcase methodology

### Step 2: Identify what they sell

Not the product. The transformation.

What does the customer's life look like AFTER? What pain disappears? What capability appears? What status changes?

The lead magnet should deliver a MICRO-VERSION of that same transformation.

### Step 3: Identify who they're targeting

- What's the prospect's current situation?
- What have they already tried?
- What do they believe about the problem?
- What would make them say "this is exactly what I needed"?

If `audience.md` exists in brand memory, use it. If not, ask these questions before generating concepts.

---


## The Lead Magnet Framework

### The Specificity Principle

**Narrow beats broad. Every time.**

"5-Step Framework to Land Your First 10 Clients in 30 Days (Even If You Hate Networking)" converts dramatically better than "Marketing Guide for Freelancers."

Why? Specificity signals:
1. This was made for someone exactly like me
2. The creator deeply understands my situation
3. This isn't generic advice I could find anywhere

When generating concepts, always push toward specificity:
- Specific outcome (not "grow your business" but "add $10k MRR")
- Specific timeframe (not "eventually" but "in 30 days")
- Specific audience (not "entrepreneurs" but "B2B SaaS founders")
- Specific method (not "marketing tips" but "The LinkedIn DM Framework")

### The Bridge Principle

**The lead magnet must logically connect to the paid offer.**

If someone downloads a lead magnet about Instagram growth and you sell SEO services, there's no bridge. You've attracted people interested in the wrong thing.

The best lead magnets are "Step 1" of what you sell:
- Course on copywriting -> Lead magnet: "The Headline Formula" (first skill taught in course)
- Agency doing SEO audits -> Lead magnet: Free mini-audit (demonstrates what full audit reveals)
- Coach on productivity -> Lead magnet: "Morning Routine Builder" (taste of coaching methodology)

The bridge should be obvious: "If you liked this free thing, the paid thing is more/deeper/complete."

### The Quick Win Principle

**Solve one specific problem completely.**

Prospects want immediate, actionable value. A lead magnet that requires weeks of study before generating results feels like homework, not a gift.

The best lead magnets deliver a quick win:
- A checklist they can complete in 10 minutes that reveals gaps
- A template they can customize in an hour for their business
- An assessment that gives them a score and action items immediately
- A calculator that shows them their specific numbers right now

Quick wins create reciprocity. When someone thinks "I couldn't have created this myself," they're primed to value your paid offer.

### The Value Equation

Apply Hormozi's value equation to lead magnet concepts:

**Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort)**

Maximize:
- **Dream Outcome:** What's the transformation this lead magnet promises?
- **Perceived Likelihood:** Why will THIS work when other things haven't?

Minimize:
- **Time Delay:** How fast do they see results? (Immediate beats weeks)
- **Effort:** How easy is it to consume and implement? (5-minute checklist beats 50-page guide)

---


## The Hook Generators

Every lead magnet needs a hook -- the reason someone would want it badly enough to give their email.

### Hook Type 1: The Shortcut
"Get the [outcome] without [usual pain/time/effort]"
> "The 5-Minute Morning Routine That Replaced My 2-Hour Gym Sessions"

### Hook Type 2: The Secret
"The [hidden thing] that [impressive result]"
> "The Pricing Secret That Doubled My Agency's Revenue"

### Hook Type 3: The System
"The [named method] for [specific outcome]"
> "The PASTOR Framework: Write Sales Pages in 30 Minutes"

### Hook Type 4: The Specific Number
"[Number] [things] to [outcome]"
> "7 Email Subject Lines That Get 40%+ Open Rates"

### Hook Type 5: The Assessment
"Discover your [type/score/level]"
> "What's Your Entrepreneur Personality Type? Take the 2-Minute Quiz"

### Hook Type 6: The Transformation
"How to go from [painful current state] to [desired outcome]"
> "From Stuck at $5k/month to Consistent $20k Months: The Roadmap"

### Hook Type 7: The Case Study
"How [specific person/company] achieved [specific result]"
> "How Sarah Built a 10,000-Person Email List in 90 Days (And You Can Too)"

---


## Build Mode

This is the v2 upgrade. After the user selects a concept, this skill enters BUILD MODE and actually writes the lead magnet content. Not just the idea -- the thing itself.

### Build Mode Activation

Build mode activates when the user says:
- "Build 1" / "Build ①" / "Let's go with concept 1"
- "Write the checklist" / "Create the template" / "Build the guide"
- Any clear selection of a concept from the options presented

### Build Process

1. **Confirm the selection** -- restate the concept, hook, and format.
2. **Gather any missing details** -- if the concept requires specific inputs the user has not provided (industry data, product details, pricing tiers), ask now.
3. **Write the content** -- produce the full lead magnet content based on format type.
4. **Save to disk** -- write to `./campaigns/{magnet-name}/lead-magnet.md`.
5. **Create campaign brief** -- write `./campaigns/{magnet-name}/brief.md`.
6. **Update assets registry** -- append to `./brand/{slug}/operational/assets.md`.
7. **Offer funnel chain** -- suggest the next skills in the funnel.

### Build Output by Format Type

#### Checklists

Write the complete checklist with:
- Title and subtitle with the hook
- Introduction paragraph (2-3 sentences) explaining what this checklist covers and why it matters
- Numbered or grouped checklist items (aim for 10-25 items)
- Each item has: the action, a one-sentence explanation of why it matters, and a quick-tip or gotcha
- Items grouped by phase or category with section headers
- A "quick start" callout: which 3 items to do first for immediate results
- A bridge section at the end: "Now that you've completed this checklist, here's the next step..."
- CTA that connects to the paid offer

**Example structure:**
```markdown
# [Checklist Title]: [Hook Subtitle]

[2-3 sentence intro explaining the value]


## Phase 1: [Category Name]

- [ ] **[Action item]**
  [Why this matters + quick tip]

- [ ] **[Action item]**
  [Why this matters + quick tip]

...


## Funnel Chain

After building a lead magnet, the natural next steps form a funnel. Always suggest chaining to these skills:

### Chain 1: Landing Page

**Skill:** `/direct-response-copy`
**Why:** The lead magnet needs a landing page to capture emails. The landing page copy should be built around the lead magnet's hook, target audience, and value proposition.
**Handoff:** Pass the lead magnet title, hook, format, target audience, and bridge logic.
**Prompt:** "Your lead magnet is ready, but it needs a landing page to capture emails. Want me to write the opt-in page? Just say /direct-response-copy."

### Chain 2: Email Sequence

**Skill:** `/email-sequences`
**Why:** After someone downloads the lead magnet, they need a welcome sequence that delivers it, builds trust, and bridges to the paid offer.
**Handoff:** Pass the lead magnet name, format, bridge logic, and paid offer details. The email sequence skill will check for this lead magnet in `./brand/{slug}/operational/assets.md`.
**Prompt:** "Now you need emails to deliver the lead magnet and convert subscribers. Want me to build the welcome sequence? Just say /email-sequences."

### Chain 3: Social Promotion

**Skill:** `/content-atomizer`
**Why:** The lead magnet needs traffic. The content atomizer can turn the lead magnet's value proposition into social posts that drive opt-ins.
**Handoff:** Pass the lead magnet content file as source material.
**Prompt:** "Your lead magnet needs subscribers. Want me to create social content to promote it? Just say /content-atomizer."

### Chain Sequence Display

After building, show the funnel chain:

```
  FUNNEL CHAIN

  You have the lead magnet. Here is the full
  funnel if you want to build it end-to-end:

  ① Lead Magnet        ✓ built (this step)
  ② Landing Page       → /direct-response-copy
  ③ Email Sequence     → /email-sequences
  ④ Social Promotion   → /content-atomizer

  Build the next piece or run them all in order.
```

---


## Pre-Launch Foundation (7 days before)

- [ ] **Sales page is live and reviewed by someone who is NOT you**
  Fresh eyes catch what you can't. Send it to one person and ask "what's confusing?" Not "what do you think?" -- that gets you compliments, not corrections.

- [ ] **Pricing finalized and tested in checkout**
  Change your price after launch and you erode trust. Decide now. Test a real transaction (refund yourself after).

- [ ] **Email sequence loaded into ESP with correct triggers**
  Every email, every delay, every link. Send yourself through the entire sequence. Open every link. Reply to at least one email to make sure replies work.

...


## What This Skill Does (v2)

This skill generates lead magnet CONCEPTS and then BUILDS the selected one:

Phase 1 -- Concept Generation:
- Research competitor lead magnets via web search
- Generate 3-5 distinct concepts with hooks, formats, and bridges
- Score and recommend the best starting point

Phase 2 -- Build Mode:
- Write the actual lead magnet content (not just the idea)
- For checklists: write the checklist items with explanations
- For templates: write the template with fill-in sections and examples
- For guides: write the guide sections with principles and examples
- For quizzes: write the questions, scoring logic, and result profiles
- For swipe files: write the curated collection with analysis
- For challenges: write the day-by-day outline with actions
- For calculators: write the specification with formulas

Phase 3 -- File Output:
- Save lead magnet content to ./campaigns/{magnet-name}/lead-magnet.md
- Save campaign brief to ./campaigns/{magnet-name}/brief.md
- Append to ./brand/{slug}/operational/assets.md

Phase 4 -- Funnel Chain:
- Offer to chain to /direct-response-copy for landing page
- Offer to chain to /email-sequences for delivery + welcome
- Offer to chain to /content-atomizer for social promotion

---
