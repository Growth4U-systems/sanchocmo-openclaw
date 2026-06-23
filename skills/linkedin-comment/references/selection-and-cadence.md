# Selection and cadence: choose who to comment on

With a list in `brand/{slug}/engagement/linkedin-focus-group.json`, this step decides who the client comments on, so the practice is sustainable and compounds instead of feeling spammy. This runs every time, including (and especially) on runs where you did not build the list.

## The two-tier model

Familiarity comes from repetition: the client becomes a known face by showing up again and again to the same people. But you cannot show up daily to a hundred people, and showing up too often to a small set who post rarely feels like stalking. The tiers resolve this.

- **Tier A, the core (small, ~10 to 15 people).** Comment on every post they publish, no spacing rule. This is where familiarity-by-repetition happens, so it has to be small. Keep it to the people who matter most: the closest ICP and the few creators whose audience is most valuable. If Tier A grows past ~15 to 20, the repetition dilutes and the client stops being a known face. Resist the urge to promote everyone.
- **Tier B, the bank (larger, the rest).** Rotate through these with a **cooldown** of at least a few days between comments to the same person, so no one feels over-touched. The bank gives volume, discovery, and a farm team: whoever posts well or replies earns promotion to Tier A.

Seed the tiers when you first save the list: put the strongest, most valuable handful in Tier A and everyone else in Tier B. Tiers can be moved anytime.

## The cooldown, in plain terms

The `linkedin-focus-group.json` file records, per person, the date a comment was last suggested for them. A Tier B person is **eligible** today only if they have never been commented on or the last suggestion was at least the cooldown window ago (default: 3 days). Tier A people are always eligible. After you generate comments in step 4 of the skill, update the date for the people commented on, so the cooldown holds across runs.

You do not need a script for this. Read the dates from the file, compare to today, and pick. If repeated runs show you rewriting the same selection logic each time, that is the signal to bundle a small script, but start with the methodology.

## The daily pick by relevance

Being eligible is not enough; the comment also has to be worth making. From the eligible people who have a fresh post, prioritize by:
- **Freshness.** A comment on a post less than a few hours old is worth far more than one on a two-day-old post, because early comments get seen and the algorithm weights them heavily. Under ~6 hours is gold; under ~48 hours is acceptable; older usually is not worth it unless it is a strong relationship play.
- **On-topic and substance.** The post should give something real to say. Skip job reposts, pure reshares with no take, and thin posts where any comment would be filler.
- **Conversation potential.** Posts that invite a genuine reaction or a friendly question are better targets than announcements.

Propose a focused set, not everything. A realistic daily load is roughly 8 to 12 comments. More than that and quality drops and it starts to look automated. Tell the client which Tier A posts to hit first, then fill remaining slots from the eligible Tier B bank.

## Account safety

Never advise automating commenting or scraping at volume from the client's account. The whole strategy depends on the account staying healthy. Commenting is done by the human, on real posts, at a human pace. The skill's job is to decide who and to draft what, not to act.
