# SEO Content — Quality, Errors & Feedback

## Content Quality Checklist

```
[ ] Answers title question in first 300 words
[ ] At least 3 specific examples or numbers
[ ] At least 1 personal experience or unique insight
[ ] Unique angle present (not just aggregation)
[ ] All claims supported by evidence or experience
[ ] No generic advice (could apply to anyone)
[ ] Would I bookmark this? Would I share it?
[ ] PAA questions answered (all of them)
[ ] SERP gaps addressed (from Phase 1 analysis)
```

## Voice Quality Checklist

```
[ ] Reads naturally out loud
[ ] No AI-isms (delve, landscape, comprehensive)
[ ] No corporate speak (leverage, synergy)
[ ] Sentence length varies
[ ] Personality present
[ ] Would I actually say this to someone?
[ ] Matches voice-profile.md (if loaded)
[ ] Positioning angle visible (if loaded)
```

## SEO Quality Checklist

```
[ ] Primary keyword in title, H1, first paragraph
[ ] Secondary keywords in H2s naturally
[ ] Meta description compelling and <160 chars
[ ] Internal links included (4-8)
[ ] External citations for claims (2-4)
[ ] Alt text on all images
[ ] Headers create logical structure
[ ] FAQ section with schema-ready format
[ ] Schema markup generated (Article + FAQ)
```

## E-E-A-T Signals Checklist

```
[ ] Experience shown (real examples, specific results)
[ ] Expertise demonstrated (depth, accuracy, nuance)
[ ] Author credentials visible
[ ] Sources cited for factual claims
[ ] Updated date visible
[ ] No misleading claims
```

---

## The Test

Before publishing, ask:

1. **Does it answer the query better than what is ranking?**
2. **Would an expert approve of the accuracy?**
3. **Would a reader bookmark or share this?**
4. **Does it sound like a person, not a content mill?**
5. **Is there at least one thing here they cannot find elsewhere?**
6. **Does it pass the AI detection checklist?** (Phase 5)
7. **Does it match the E-E-A-T examples quality bar?**
8. **Does it answer ALL People Also Ask questions?**
9. **Is the schema markup valid and complete?**
10. **Is it saved to disk with proper frontmatter?**

If any answer is no, revise before publishing.

---

## Error States

### Web search not available

```
  +----------------------------------------------+
  |  X  SERP ANALYSIS UNAVAILABLE               |
  |                                              |
  |  Web search tools are not available. I can   |
  |  still write using brand context and brief   |
  |  -- but without live SERP analysis, PAA, or  |
  |  competitor gap validation.                  |
  |                                              |
  |  -> Continue without SERP data               |
  |  -> Provide competitor URLs manually         |
  +----------------------------------------------+
```

Skip SERP analysis. Proceed with brief-based approach. Note limitation in output.

### No target keyword provided

```
  +----------------------------------------------+
  |  X  NEED A TARGET KEYWORD                   |
  |                                              |
  |  -> Tell me the keyword to target            |
  |  -> /keyword-research to find the right one  |
  |  -> Point me to a content brief              |
  +----------------------------------------------+
```

### Voice profile not found

```
  +----------------------------------------------+
  |  X  BRAND VOICE NOT FOUND                   |
  |                                              |
  |  Using default: direct, conversational,      |
  |  specific.                                   |
  |                                              |
  |  -> /brand-voice to build profile (~10 min)  |
  |  -> Continue with defaults                   |
  +----------------------------------------------+
```

### Content directory not writable

```
  +----------------------------------------------+
  |  X  CANNOT SAVE CONTENT                     |
  |                                              |
  |  Could not write to ./campaigns/content/.    |
  |  Article displayed above -- copy manually.   |
  |                                              |
  |  -> Check directory permissions              |
  |  -> Save to a different location             |
  +----------------------------------------------+
```

---

## Feedback Collection

After saving, present:

```
  How did this land?

  a) Great -- ready to publish as-is
  b) Good -- made minor edits
  c) Rewrote significantly
  d) Have not published yet
```

### Processing Feedback

**If (a) "Great":**
Log to `./brand/{slug}/operational/learnings.md`:
`- [{date}] [/seo-content] Article "{title}" shipped as-is. Keyword: "{keyword}". Angle: {angle}. Word count: {N}.`

**If (b) "Good -- minor edits":**
Ask what changed. Log to learnings.md. If voice/tone issue, suggest updating voice-profile.md.

**If (c) "Rewrote significantly":**
Ask for details or final version. Analyze differences. If pattern emerges, suggest re-running /brand-voice.

**If (d) "Have not published yet":**
Note it. Remind next time: "Last time I wrote an article on '{keyword}'. Did you ever publish it?"

---

## Implementation Notes for the LLM

1. **Never skip SERP analysis when web search is available.** Phase 1 is what makes this content better than a content mill.
2. **Always check for existing content first.** Iteration detection enables content refresh mode.
3. **Always generate schema markup.** Article + FAQ JSON-LD is mandatory. HowTo for tutorials.
4. **Always save to disk.** The saved file IS the deliverable.
5. **Use brand memory visibly.** Show how voice-profile shaped style, how positioning shaped angle.
6. **PAA questions are mandatory sections.** Every one must appear in content or FAQ.
7. **Preserve humanization.** Run every draft through the AI detection checklist.
8. **Always offer /content-atomizer chain.** One article → 10+ social assets.
9. **Write the content brief if one doesn't exist.** Structure the work.
10. **Respect file output format exactly.** Frontmatter, slug, directory — other skills parse these.
11. **Graceful degradation.** No web search → brief-based approach, note limitation.
12. **Content refresh is about specifics.** "Add section on {topic} after {section} because {evidence}."
13. **Feedback closes the loop.** Always present prompt. Always log to learnings.md.
14. **Register every content piece.** Append to `./brand/{slug}/operational/assets.md`.
