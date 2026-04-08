# SEO Content — Detailed Workflow

## Phase 1: Research

Before writing a word, understand what you are competing against.

**This is a research-dependent skill.** Phase 1 requires live web search to
perform SERP analysis, capture People Also Ask questions, and identify
competitor gaps. Show the RESEARCH MODE signal per `_system/brand-memory.md`
before beginning research:

- **If web search tools are available:** Show `RESEARCH MODE → Data quality: LIVE`
  and proceed with full SERP analysis.
- **If web search tools are NOT available:** Show the `RESEARCH MODE → Data
  quality: ESTIMATED` block. Flag this to the user explicitly and ask whether
  to proceed with conceptual analysis or set up web search first. If the user
  proceeds, prefix all SERP-derived claims with `~` to indicate estimates, and
  skip to Phase 2 (Content Brief) using brand context and the user's input
  instead of live data.

### SERP Analysis

Search the target keyword using web search tools and analyze the top 5 results.

**For each result, capture:**
- Title and URL
- Content type (guide, listicle, tool page, etc.)
- Approximate word count
- Structure (headers, sections)
- Unique angles or data
- What they do well
- What they miss or get wrong
- How recent (publish/update date)
- Domain type (major publication, niche site, personal blog)

**Extract from SERP features:**
- People Also Ask questions (answer ALL of these)
- Featured Snippet format (match it to win it)
- AI Overview presence (what it includes/excludes)

**Present SERP findings to the user:**

```
  ──────────────────────────────────────────────

  SERP ANALYSIS: "{target keyword}"

  Top 5 results:
  ├── 1. {Title} -- {domain}
  │      {content type}, ~{N} words, {date}
  │      Angle: {their angle}
  │      Gap: {what they miss}
  │
  ├── 2. {Title} -- {domain}
  │      ...
  │
  └── 5. {Title} -- {domain}
         ...

  ──────────────────────────────────────────────

  SERP FEATURES

  ├── Featured Snippet    {format or "none"}
  ├── People Also Ask     {N} questions captured
  └── AI Overview         {present/absent, summary}

  ──────────────────────────────────────────────

  OPPORTUNITY ASSESSMENT

  {1-3 sentence summary of the gap your content
  will fill and why it can win}

  ──────────────────────────────────────────────
```

### People Also Ask Integration

Pull ALL People Also Ask questions for the target keyword via web search.
These become mandatory sections in your content.

**How to capture PAA:**
1. Search the target keyword
2. Record every PAA question shown
3. Click/expand each PAA to get second-level questions
4. Record those too
5. Search 2-3 keyword variations to find additional PAA questions

**How PAA shapes the content:**
- Each PAA question becomes an H2 or FAQ entry
- Answer PAA questions directly (Featured Snippet format)
- PAA phrasing is used in headers (matches how people search)
- Questions that deserve depth become full sections
- Questions that need brief answers go in the FAQ section

**PAA output:**

```
  PEOPLE ALSO ASK

  Full sections (answer as H2):
  ├── "{question 1}" -- high search signal
  ├── "{question 2}" -- aligns with content type
  └── "{question 3}" -- competitive gap

  FAQ entries (answer briefly):
  ├── "{question 4}"
  ├── "{question 5}"
  └── "{question 6}"
```

### Gap Analysis

After reviewing competitors and PAA, identify:

1. **What is missing?** — Questions unanswered, angles unexplored
2. **What is outdated?** — Old information, deprecated methods
3. **What is generic?** — Surface-level advice anyone could give
4. **What is your edge?** — Unique data, experience, perspective (informed by positioning)

---

## Phase 3: Outline Structures

Structure the content based on type:

### Pillar Guide (5,000-8,000 words)

```
1. Hook Intro (150-250 words)
   - Answer the title question immediately
   - Why this matters NOW
   - Who this is for (and who it's not for)

2. Quick Answer Section (200-300 words)
   - Direct answer for Featured Snippet
   - TL;DR for skimmers

3. Core Sections (3-5 major sections)
   - Each 800-1,500 words
   - Each answers a major sub-question
   - H2 headers with keyword variations
   - PAA questions as H2s where appropriate

4. Implementation / How to Apply (300-500 words)

5. FAQ Section (5-10 questions from PAA)

6. Conclusion with CTA (150-200 words)
```

### How-To Tutorial (2,000-3,000 words)

```
1. What You'll Achieve (150-200 words) — end result, time, prerequisites
2. Why This Method (200-300 words) — context and alternatives
3. Step-by-Step Instructions (1,200-2,000 words) — numbered, one action per step
4. Variations / Advanced Tips (300-400 words)
5. Common Mistakes (200-300 words)
6. FAQ (3-5 questions from PAA)
7. Next Steps with CTA (100-150 words)
```

### Comparison (2,500-4,000 words)

```
1. Quick Verdict (200-300 words) — "Choose X if... Choose Y if..."
2. Comparison Table — 8-12 differentiators
3. Deep Dive: Option A (800-1,000 words)
4. Deep Dive: Option B (800-1,000 words)
5. Head-to-Head (300-500 words) — specific scenarios
6. FAQ (3-5 questions from PAA)
7. Final Recommendation with CTA
```

### Listicle (2,000-3,000 words)

```
1. Intro with Context (150-200 words)
2. Quick Summary Table/List
3. Individual Items (150-300 words each)
4. How to Choose (200-300 words)
5. FAQ (3-5 questions from PAA)
6. Conclusion with CTA
```

---

## Phase 4: Drafting Principles

### Voice Calibration from Brand Memory

If voice-profile.md is loaded, calibrate:
- **Tone:** Match documented tone
- **Personality:** Write as the persona described
- **Pacing:** Follow documented rhythm patterns
- **Vocabulary:** Use "words to use" list, avoid "words to avoid"

If NOT loaded, default to: direct, conversational, specific, opinionated.

### The First Paragraph Rule

Answer the search query in the first 2-3 sentences. Do not make them scroll.

**Bad:** "In today's rapidly evolving digital landscape, marketers are increasingly turning to artificial intelligence..."

**Good:** "AI marketing tools can automate 60-80% of repetitive marketing tasks. Here are the 10 that actually work, based on testing them across 50+ client accounts."

### The "So What?" Chain

For every point, ask "so what?" until you hit something the reader cares about. Write from the bottom of the chain, not the top.

### Specificity Over Generality

**Weak:** "This tool saves time."
**Strong:** "This tool cut our email outreach from 4 hours to 15 minutes per day."

### Show Your Work

> "After testing 23 AI writing tools over 6 months, three stood out..."
> "We analyzed 147 high-ranking articles in this space. The pattern was clear..."

### Positioning-Informed Angle

If positioning.md is loaded, use the brand's positioning to shape HOW you write (perspective, examples, framing) — not WHAT you write about.

---

## Phase 5: Humanization

AI-generated content has tells. Remove them ruthlessly. The goal: "sounds like a specific person wrote this based on real experience."

### Word-Level Tells — Kill immediately:
delve, dive into, dig into, comprehensive, robust, cutting-edge, utilize, leverage, crucial, vital, essential, unlock, unleash, supercharge, game-changer, revolutionary, landscape, navigate, streamline, tapestry, multifaceted, myriad, foster, facilitate, enhance, realm, paradigm, synergy, embark, journey, plethora, nuanced, intricate, seamless

### Phrase-Level Tells — These scream "AI wrote this":
"In today's fast-paced world...", "It's important to note that...", "When it comes to...", "In order to...", "Whether you're a... or a...", "Let's dive in", "Without further ado", "At the end of the day", "In conclusion", "This comprehensive guide will...", "Are you looking for...", "Look no further"

### Structure-Level Tells:
- **The Triple Pattern**: Everything in threes. Humans are messier.
- **Perfect Parallelism**: Every bullet same length, same structure. Too clean.
- **The Hedge Stack**: "While X, it's important to consider Y, but also Z."
- **Fake Objectivity**: "Some experts say..." without taking a position.
- **Summary Sandwich**: Intro summarizes, body covers, conclusion summarizes again.
- **Empty Transitions**: "Now that we've covered X, let's move on to Y."

### Voice-Level Tells:
- No Opinions, No Mistakes Mentioned, Generic Examples, Distance from Subject, Uniform Certainty

### Voice Injection Points — Add these:

**Personal experience:** "I made this mistake for two years. Cost me roughly $40K..."

**Opinion with reasoning:** "Honestly, most SEO advice is written by people who've never ranked anything..."

**Admission of limitations:** "This won't work for everyone. If you're in YMYL niches, ignore this entirely."

**Specific examples:** "When we implemented this for [specific client], their organic traffic went from 12K to 89K monthly."

**Uncertainty:** "I'm not 100% sure why this works. Best guess: semantic density signals topical authority."

**Tangents:** "This is the part where most guides tell you to 'create quality content.' (Useless advice.)"

### Rhythm Variation

- Vary sentence length. Short punch. Then longer explanatory sentences.
- Use fragments. For emphasis.
- Start sentences with "And" or "But" when natural.
- Include parenthetical asides.
- Ask questions. Then answer them. Or don't.

### The Detection Checklist

```
[ ] No AI words (delve, comprehensive, crucial, leverage, landscape)
[ ] No AI phrases (in today's world, it's important to note, let's dive in)
[ ] Not everything in threes
[ ] At least one personal opinion stated directly
[ ] At least one specific number from real experience
[ ] At least one admission of limitation or uncertainty
[ ] Sentence lengths vary (some under 5 words, some over 20)
[ ] Would I say this out loud to a smart friend?
[ ] Does it sound like a specific person, or a committee?
```

---

## Phase 6: On-Page Optimization

### SEO Checklist

```
[ ] Primary keyword in title (front-loaded if possible)
[ ] Primary keyword in H1 (can match title)
[ ] Primary keyword in first 100 words
[ ] Primary keyword in at least one H2
[ ] Secondary keywords in H2s naturally
[ ] Primary keyword in meta description
[ ] Primary keyword in URL slug
[ ] Image alt text includes relevant keywords
[ ] Internal links to related content (4-8 per piece)
[ ] External links to authoritative sources (2-4 per piece)
```

### Title Optimization

**Format:** [Primary Keyword]: [Benefit or Hook] ([Year] if relevant)
- Under 60 characters
- Front-load the keyword
- Include a hook or differentiator
- Match search intent

### Meta Description

**Format:** [Direct answer to query]. [Proof/credibility]. [CTA or hook].
- 150-160 characters
- Include primary keyword
- Compelling enough to click

### Header Structure

```
H1: Main title (one per page)
  H2: Major section (keyword variation)
    H3: Subsection
  H2: FAQ
    H3: Question 1
```

### Featured Snippet Optimization

- **Definition:** Put definition in first paragraph. "[Keyword] is [definition in 40-50 words]"
- **List:** Use H2 for the question, immediately follow with numbered/bulleted list
- **Table:** Use actual HTML tables with clear headers

### Internal Linking

- Link TO from related pillar content, similar blog posts, resource pages
- Link FROM to deeper dives, related tools, conversion pages
- Use descriptive anchor text, vary naturally, include keywords where natural

---

## Content Refresh Mode

Triggered when existing content file found, or user says "refresh"/"update".

### The Refresh Process

1. **Read existing article** — Load frontmatter and content
2. **Re-run SERP analysis** — Search target keyword again
3. **Compare SERP state** — Using `serp_snapshot_date` from frontmatter:
   - New competitors in top 5?
   - New PAA questions not covered?
   - Featured Snippet format changes?
   - New content angles appearing?
   - Search intent shifts?
   - AI Overview changes?

4. **Generate update recommendations** — Specific, actionable:

```
CONTENT REFRESH ANALYSIS

Article: "{title}"
Published: {date} — Days since: {N}

New competitors:
├── {URL 1} -- {what they cover that you don't}
└── {URL 2} -- {what they cover that you don't}

New PAA questions:
├── "{question 1}" -- not in your FAQ
└── "{question 2}" -- not in your FAQ

Recommended updates:
├── ① Add section: "{new H2}" — Reason: {why}
├── ② Update section: "{existing H2}" — {what changed}
├── ③ Add FAQ: "{new PAA}" — {brief answer}
└── ④ Update schema: add {N} new FAQ entries

Apply these updates? (y/n)
```

5. **Apply and save** — Update `last_updated` and `serp_snapshot_date` in frontmatter.
