## The Test

Before delivering concepts, verify each one:

1. **Is it specific?** Vague lead magnets (like "Marketing Tips") fail. Specific ones convert.

2. **Does it solve one problem completely?** Not a teaser -- a genuine quick win.

3. **Is the bridge obvious?** Can you see how consuming this leads to wanting the paid offer?

4. **Would the target audience actually want this?** Not "should want" -- ACTUALLY want, right now.

5. **Is it feasible to create?** Match implementation difficulty to available resources.

Before delivering built content, also verify:

6. **Is the content genuinely valuable?** Would someone share this with a colleague?

7. **Does it deliver the promised quick win?** Can someone get results within the estimated consumption time?

8. **Is the bridge section natural, not forced?** The transition to paid offer should feel like a logical next step, not a sales pitch.

9. **Is the voice consistent?** If brand voice was loaded, does every section match it?

10. **Is it the right length?** Long enough to be valuable, short enough to be consumed. Checklists: 10-25 items. Guides: 1500-3000 words. Quizzes: 7-15 questions.

---


## Recording Feedback

After delivering the built lead magnet, present the feedback prompt from the build mode output template. Process responses per `_system/brand-memory.md`:

### If "Great -- shipped as-is"
- Log to `./brand/{slug}/operational/learnings.md` under "What Works":
  ```
  - [YYYY-MM-DD] [/lead-magnet] {format} lead magnet shipped as-is. Title: "{title}". Hook: "{hook}". Angle: {angle used}.
  ```
- Confirm the entry in `./brand/{slug}/operational/assets.md`.

### If "Good -- minor edits"
- Ask: "What did you change? Even small details help me improve next time."
- Log the change to `./brand/{slug}/operational/learnings.md`:
  ```
  - [YYYY-MM-DD] [/lead-magnet] User edited {format} magnet. Change: {description}. Note: {implication for future magnets}.
  ```
- If edits reveal a voice mismatch, suggest: "Sounds like the voice might need tuning. Want to re-run /brand-voice?"

### If "Rewrote significantly"
- Ask: "Can you share what you changed or paste the final version? I'll learn from the diff."
- If they share, analyze the differences and log specific findings.
- If the rewrite reveals a pattern, suggest re-running /brand-voice.
  ```
  - [YYYY-MM-DD] [/lead-magnet] User rewrote {format} magnet significantly -- shifted from {original approach} to {new approach}. Voice profile may need update.
  ```

### If "Haven't used yet"
- Note it. Do not log anything to learnings.md yet.
- Optionally remind them next time: "Last time I created a {format} lead magnet for you. Did you ever launch it? I'd love to know how it performed."

---


## Pre-Generation Checklist

Before generating concepts, confirm:

- [ ] Brand memory loaded (or noted as absent)
- [ ] Business type identified (info product, SaaS, services)
- [ ] Paid offer identified (product, price, transformation)
- [ ] Target audience identified (from brand memory or user input)
- [ ] Competitive research completed (web search for competitor magnets)
- [ ] Existing lead magnet check done (iteration detection)


## Per-Concept Checklist

For each concept generated, verify:

- [ ] Specific outcome named (not vague)
- [ ] Format selected with rationale
- [ ] Hook uses one of the 7 hook types
- [ ] Bridge to paid offer is obvious and natural
- [ ] Implementation difficulty is realistic
- [ ] Differentiates from competitor magnets found in research
- [ ] Matches audience preference from brand memory


## Build Mode Checklist

Before delivering built content, verify:

- [ ] Content is genuinely valuable (not a teaser)
- [ ] Quick win is achievable within estimated consumption time
- [ ] Voice matches brand profile (if loaded)
- [ ] Bridge section feels natural, not forced
- [ ] Length is appropriate for format type
- [ ] Frontmatter is complete and accurate
- [ ] File saved to ./campaigns/{magnet-name}/lead-magnet.md
- [ ] Campaign brief saved to ./campaigns/{magnet-name}/brief.md
- [ ] assets.md updated with lead magnet entry
- [ ] FILES SAVED section lists every file
- [ ] WHAT'S NEXT section offers funnel chain options
- [ ] Feedback prompt presented


## Post-Build Funnel Checklist

After building, verify funnel chain was offered:

- [ ] /direct-response-copy suggested for landing page
- [ ] /email-sequences suggested for delivery + welcome sequence
- [ ] /content-atomizer suggested for social promotion
- [ ] Funnel chain visualization displayed
- [ ] Each chain includes estimated time
