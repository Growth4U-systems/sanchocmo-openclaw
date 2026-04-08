## The Format Selection Framework

### When to use each format:

**Quizzes/Assessments**
Best for: Personalization, segmentation, transformation-focused offers
Examples: "What's Your Marketing Personality?", "Find Your Ideal Client Avatar"
Why it works: People love learning about themselves; provides segmentation data
Difficulty: Medium (needs quiz tool, logic branching)

**PDF Guides/Frameworks**
Best for: Establishing authority, comprehensive solutions, complex topics
Examples: "The Ultimate Guide to X", "7-Step Framework for Y"
Why it works: Perceived high value, easy to create, works across all business types
Difficulty: Low (just need content and design)

**Checklists/Templates**
Best for: Quick wins, immediate utility, showcasing methodology
Examples: "Launch Day Checklist", "Content Calendar Template"
Why it works: Immediate actionability, low friction to consume
Difficulty: Low

**Calculators/Tools**
Best for: SaaS, financial services, ROI-focused offers
Examples: "ROI Calculator", "Pricing Calculator", "Savings Estimator"
Why it works: Personalized output, demonstrates tangible value
Difficulty: Medium-High (needs development)

**Challenges (5-day, 7-day, etc.)**
Best for: Community building, transformation offers, coaching
Examples: "5-Day List Building Challenge", "7-Day Productivity Sprint"
Why it works: Creates engagement, builds habit, demonstrates results
Difficulty: Medium (needs email sequence, possibly community)

**Video Series/Mini-Courses**
Best for: Demonstrating teaching style, complex topics, high-ticket offers
Examples: "3-Part Video Training", "Free Masterclass"
Why it works: Builds relationship, showcases expertise deeply
Difficulty: Medium (needs video production)

**Free Audits/Assessments**
Best for: Services, agencies, consultants
Examples: "Free Website Audit", "Marketing Assessment"
Why it works: Reveals problems you solve, demonstrates expertise
Difficulty: Medium (needs time investment per lead)

**Swipe Files/Resource Lists**
Best for: Creative industries, marketing, copywriting
Examples: "50 High-Converting Headlines", "The Ultimate Tool Stack"
Why it works: Massive perceived value, immediately useful
Difficulty: Low

---


## Concept Output Format

When generating lead magnet concepts, present them using the numbered options template from `_system/output-format.md`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LEAD MAGNET CONCEPTS
  Generated {Month Day, Year}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  BRAND CONTEXT

  ├── Voice Profile     {✓/✗} {summary}
  ├── Positioning       {✓/✗} {summary}
  ├── Audience          {✓/✗} {summary}
  └── Learnings         {✓/✗} {summary}

  ──────────────────────────────────────────────

  COMPETITIVE LANDSCAPE

  Competitor lead magnets found:
  ├── {Competitor A}  "{title}" ({format})
  ├── {Competitor B}  "{title}" ({format})
  └── {Competitor C}  "{title}" ({format})

  Gap: {what no one is offering}
  Overdone: {what everyone is doing}
  Opportunity: {where to differentiate}

  ──────────────────────────────────────────────

  ① {CONCEPT NAME}                  ★ recommended
  "{The hook headline}"
  Format: {format type}
  Bridge: {how it connects to paid offer}
  Effort: {low/medium/high} ({what's needed})
  → Best for: {situation or channel}

  ──────────────────────────────────────────────

  ② {CONCEPT NAME}
  "{The hook headline}"
  Format: {format type}
  Bridge: {how it connects to paid offer}
  Effort: {low/medium/high} ({what's needed})
  → Best for: {situation or channel}

  ──────────────────────────────────────────────

  ③ {CONCEPT NAME}
  "{The hook headline}"
  Format: {format type}
  Bridge: {how it connects to paid offer}
  Effort: {low/medium/high} ({what's needed})
  → Best for: {situation or channel}

  ──────────────────────────────────────────────

  ...continue for 3-5 total concepts...

  ──────────────────────────────────────────────

  QUICK PICK
  ★ Concept ①: "{Recommended concept name}"
    → Format: {format type}
    → Why: {one-sentence rationale}

  All concepts detailed above. Pick one to build.

  ──────────────────────────────────────────────

  WHAT'S NEXT

  Pick a concept and I'll build it:

  → "Build ①"    I'll write the full lead magnet
  → "Build ②"    I'll write the full lead magnet
  → "Tweak ③"    Adjust before building
  → "More ideas"  Generate 3 more concepts

  Or tell me what you're working on and
  I'll route you.
```

---


## File Output

Every lead magnet is written to disk in the campaign directory structure.

### Directory Structure

```
./campaigns/{magnet-name}/
  lead-magnet.md                 <- The actual lead magnet content
  brief.md                       <- Campaign brief
```

### Magnet Name Convention

Use lowercase-kebab-case derived from the concept name:
- "The Cold Email Kit" -> `cold-email-kit`
- "7-Step Launch Checklist" -> `7-step-launch-checklist`
- "What's Your Marketing Type? Quiz" -> `marketing-type-quiz`

### Lead Magnet File Format

```markdown
---
title: "{Lead Magnet Title}"
subtitle: "{Hook subtitle}"
format: {checklist/template/guide/quiz/swipe-file/challenge/calculator}
hook: "{The one-line hook}"
bridge_to: "{Paid offer name}"
target_audience: "{Who this is for}"
estimated_consumption_time: "{5 min / 15 min / 30 min}"
status: draft
created_by: /lead-magnet
created_date: {YYYY-MM-DD}
---

# {Lead Magnet Title}

{Full lead magnet content here -- varies by format type}
```

### Campaign Brief Format

Every lead magnet gets a `brief.md` in the campaign directory. This follows the standard campaign brief format from `_system/brand-memory.md`:

```markdown
# Campaign: {Magnet Name}


## Build Mode Output Template

After building the lead magnet content, display the full output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LEAD MAGNET BUILT
  Generated {Month Day, Year}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "{Lead Magnet Title}"
  Format: {format}
  Hook: "{hook headline}"
  Audience: {target audience}
  Consumption time: {estimated time}

  ──────────────────────────────────────────────

  CONTENT SUMMARY

  {Format-specific summary, e.g.:}

  For checklists:
  ├── {N} items across {N} categories
  ├── Quick-start section (top 3 items)
  └── Bridge section to paid offer

  For guides:
  ├── {N} sections covering {topics}
  ├── Executive summary included
  └── Bridge section to paid offer

  For quizzes:
  ├── {N} questions with {N} answer options each
  ├── {N} result profiles
  ├── Scoring logic defined
  └── Per-profile bridge to paid offer

  ──────────────────────────────────────────────

  BRIDGE LOGIC

  Lead magnet delivers: {micro-transformation}
  This creates desire for: {paid offer}
  Bridge: "{one-sentence connection}"

  ──────────────────────────────────────────────

  FILES SAVED

  ./campaigns/{name}/lead-magnet.md    ✓ (new)
  ./campaigns/{name}/brief.md          ✓ (new)
  ./brand/{slug}/operational/assets.md                    ✓ (appended)

  ──────────────────────────────────────────────

  WHAT'S NEXT

  Your lead magnet is written. Before distributing:

  → /creative              Build it — PDF layout, cover
                           design, or template (~15 min)
  → "Skip visuals"         Continue to funnel ↓

  ──────────────────────────────────────────────

  → /direct-response-copy  Write the landing page
                           to capture emails (~20 min)
  → /email-sequences       Build the delivery +
                           welcome sequence (~15 min)
  → /content-atomizer      Create social content to
                           promote the magnet (~15 min)
  → "Revise"               Edit specific sections

  Or tell me what you're working on and
  I'll route you.

  ──────────────────────────────────────────────

  FEEDBACK

  Before I close out:

  1. Does this lead magnet feel genuinely valuable?
     (Would your audience actually want this?)

  2. Does the bridge to your paid offer feel natural?
     (If forced, I can adjust the angle.)

  3. Is the scope right?
     (Too long? Too short? Wrong depth?)
```

---


## Goal
{What this lead magnet accomplishes, with a metric if possible}


## Format
{Checklist / Template / Guide / Quiz / Swipe File / Challenge / Calculator}


## Hook
"{The headline/promise}"


## Target Audience
{Who this is for -- from brand/{slug}/go-to-market/ecps.md or user input}


## Bridge to Paid Offer
{How consuming this lead magnet naturally leads to wanting the paid product}


## Paid Offer
{What we are eventually selling, at what price}


## Competitive Differentiation
{How this differs from competitor lead magnets found in research}


## Distribution Plan
{Where this lead magnet will be promoted -- landing page, social, ads, content upgrades}


## Status
draft


## Voice Notes
{Any lead-magnet-specific voice adjustments from ./brand/{slug}/brand-identity/voice-profile.md}
```

---
