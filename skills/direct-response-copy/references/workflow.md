## Brand Memory Integration

This skill reads brand context to make every piece of copy consistent with the brand's established identity.

**Reads:** `voice-profile.md`, `positioning.md`, `audience.md`, `creative-kit.md` (all optional)

On invocation, check for `./brand/` and load available context:

1. **Load `voice-profile.md`** (if exists):
   - Match the brand's tone, vocabulary, rhythm in all copy output
   - Apply the voice DNA: sentence length patterns, jargon level, formality register
   - Show: "Your voice is [tone summary]. All copy will match that register."

2. **Load `positioning.md`** (if exists):
   - Use the chosen angle as the copy's foundation
   - The positioning angle determines the lead, the proof hierarchy, the CTA framing
   - Show: "Your positioning angle is '[angle]'. Building copy around that frame."

3. **Load `audience.md`** (if exists):
   - Know who you are writing to: their awareness level, sophistication, pain points
   - Match Schwartz awareness level to headline approach (see methodology below)
   - Show: "Writing for [audience summary]. Awareness level: [level]."

4. **Load `creative-kit.md`** (if exists):
   - Visual consistency for landing pages: color palette, typography, image style
   - Ensure copy references match the visual system
   - Show: "Creative kit loaded -- copy will reference your visual system."

5. **If `./brand/` does not exist:**
   - Skip brand loading entirely. Do not error.
   - Proceed without it -- this skill works standalone.
   - The copy will be excellent either way; brand memory makes it consistent.
   - Note: "I don't see a brand profile yet. You can run /start-here or /brand-voice first to set one up, or I'll work without it."

---


## What Are We Writing?

Before diving into frameworks, establish the format. Ask the user or infer from context:

  ①  LANDING PAGE
     Hero, problem, solution, proof, CTA sections.
     Typically 800-2000 words.
     Structure: The Full Sequence (see methodology below).
     Constraints: Mobile-first formatting, scannable, one primary CTA.

  ②  SALES PAGE
     Long-form. Full objection handling.
     Story-driven. Typically 2000-5000 words.
     Structure: Extended Full Sequence with founder story, extended proof, FAQ.
     Constraints: Multiple CTA placements, risk reversal prominent.

  ③  EMAIL
     Single idea, single CTA.
     Subject line + body. Under 500 words.
     Structure: Hook, value, CTA. That is it.
     Constraints: Subject line is the headline. Preview text matters. No images required.

  ④  AD COPY
     Platform-specific (Meta, Google, LinkedIn, TikTok).
     Character limits apply. Hook-focused.
     Constraints by platform:
       Meta primary text: 125 chars (visible), 1000 max
       Google responsive: 30-char headlines, 90-char descriptions
       LinkedIn: 150 chars intro, 600 max
       TikTok: 100 chars overlay, hook in first 2 seconds

  ⑤  SOCIAL POST
     Platform-native. Under 300 words typically.
     Hook + value + CTA.
     Constraints by platform:
       LinkedIn: 1300 chars for engagement, 3000 max
       Twitter/X: 280 chars, or thread format
       Instagram: 2200 chars caption max

  ⑥  GENERAL / OTHER
     Any persuasive writing. Custom format.
     Apply methodology below with user-specified constraints.

Each mode applies the SAME methodology below but with format-specific
constraints on length, structure, and CTA placement. State which mode
you are using before generating copy.

---


## Iteration Detection

Before starting, check if copy already exists for this project:

### If campaign files exist in `./campaigns/{name}/`

Do not start from scratch. Instead:

1. Read the existing copy files.
2. Present a summary of what exists:
   ```
   Existing copy found:
   ├── landing-page.md    ✓  (1,247 words, last updated Feb 10)
   ├── emails/            ✓  (3 emails in sequence)
   └── ads/               ✗  (none yet)
   ```
3. Ask: "Do you want to revise the existing copy, add a new piece, or start fresh?"
   - **Revise** -- load existing copy, apply scoring rubric, identify weak spots, rewrite
   - **Add new** -- use existing copy as context for consistency, write new piece
   - **Start fresh** -- run the full process below as if nothing exists

### If no campaign files exist

Proceed directly to copy generation using the methodology below.

---


## The core principle

Write like you're explaining to a smart friend who's skeptical but curious. Back up every claim with specifics. Make the transformation viscerally clear.

That's it. Everything else flows from there.

---


## The full sequence

When building a complete landing page:

1. **Hook** — Outcome headline with specific number or timeframe
2. **Problem** — Quantify the pain (hours wasted, money lost)
3. **Agitate** — Scenario or story that makes the problem vivid
4. **Credibility** — Founder story, authority endorsements, or proof numbers
5. **Solution** — What the product does, framed as transformation
6. **Proof** — Testimonials with specific outcomes
7. **Objections** — FAQ or "fit/not fit" section
8. **Offer** — Pricing with value justification
9. **Urgency** — Only if authentic
10. **Final CTA** — Benefit-oriented, friction reducers below

You don't need all ten every time. But this is the complete arc when you need it.

---
