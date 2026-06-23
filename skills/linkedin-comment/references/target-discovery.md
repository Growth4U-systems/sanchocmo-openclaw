# Target discovery: build the focus group

The goal of this step is to turn the client's positioning into an actionable list of real people worth commenting on, classified into two lanes, each with evidence that they actually post. You build it once; after that it lives in `brand/{slug}/engagement/linkedin-focus-group.json` and you do not rebuild it.

## Read the client, do not ask

Unlike the personal version of this method, here the positioning is **read from the client's brand**, not asked:
- **Positioning and ICP** from `go-to-market/positioning/positioning.current.md` and `go-to-market/ecps/ecps.current.md`.
- From those, derive the **ICP and two lanes** directly. Only if the brand context is genuinely insufficient to define the lanes, present your reading back to the human for confirmation rather than asking from scratch.

Do not interrogate. The brand files almost always have enough; lean on them.

## The two lanes

Every person on the list belongs to one of two lanes. Both matter, for different reasons.

- **Lane A: the ICP.** People the client sells to or wants a relationship with. The payoff is relationship and, eventually, business. These are the names that matter most and are the hardest to find, because the real decision-makers who also post are not usually famous. **This lane is curated here, by hand, with web search.** It is the moat.
- **Lane B: the big creators.** Large accounts that the client's ICP already follows. The payoff is borrowed reach: commenting where the buyers already hang out gets the client seen by them without selling. **This lane can be delegated** to Sancho's discovery engine (`discovery-plan-builder` → `discovery-search-runner`, owner Rocinante, via ScrapeCreators), which surfaces creators by sector, network, tier and engagement rate at scale. Apply the fit rules below on top of whatever it returns; do not add everything it brings back.

A healthy list leans on Lane A for depth and uses a smaller set of Lane B for reach.

## Hard rules for who qualifies

1. **They must actually post.** A perfect title who never publishes is useless, because you cannot comment on silence. Require evidence of recent, regular posting before adding anyone.
2. **Location and language fit.** If the client targets a region, the person should be in it (or post to that audience). Do not add someone just because they share a language.
3. **On-topic.** Their content should overlap with the client's world, or with what the client's ICP cares about.

When in doubt, mark the person as "to verify" rather than dropping or asserting. Honesty about confidence is more useful than a long list of maybes presented as facts.

## How to research Lane A (tool-agnostic)

Use whatever the session has. With web tools, run a multi-angle search; without them, work from names the human provides.

**If web search and fetch are available**, search from several angles, because any single angle misses people:
- **Company + role searches** to find Lane A decision-makers who post (search the client's target companies plus the relevant title plus "LinkedIn"). This is the angle that surfaces real buyers, so spend the most effort here.
- **Press and sector media** lists of experts and speakers.
- **Directories**: newsletters, podcasts, conference speaker pages, professional community member lists.
- **Influencer and "top voices" rankings** for the client's field and region (these surface Lane B candidates fast, though Lane B is better served by the discovery engine above).
- **Known names verified.** Propose prominent people you already know in the field, but verify location and posting activity by search before trusting it. Do not assert a fact about a person you have not checked.

If the session has parallel subagents, fan these angles out in parallel. Either way the method is the same.

A note on access: public profile pages are often behind a login wall. Lean on secondary sources (rankings, press, company sites, indexed posts) rather than trying to force your way into authenticated pages. Never scrape from the client's account.

## Classify, dedupe, and persist

Produce a list, not prose. For each person capture: name, role and company, location (or "?"), lane (A or B), profile URL or handle if found, evidence that they post, tier (see `selection-and-cadence.md`), `lastSuggested` (null at creation), and a one-line reason they fit. Deduplicate name variants. Sort by how strong the fit and the evidence are.

Present your top picks to the human (lean toward Lane A) and be explicit that nothing is verified beyond web research: handles and "they post" signals can be stale. Once confirmed, save to `brand/{slug}/engagement/linkedin-focus-group.json`. This file is the skill's memory: future runs read it instead of rebuilding. Do not persist this list in YALC; it is an engagement artifact, kept isolated from the outreach CRM.
