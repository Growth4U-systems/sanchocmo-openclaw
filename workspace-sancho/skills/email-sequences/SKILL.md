---
name: email-sequences
description: >
  Build email nurture sequences that convert subscribers into customers. Supports welcome, nurture, conversion,
  launch, re-engagement, and post-purchase sequences. Generates 3 subject line A/B variants per email, specific
  send timing with rationale, individual .md files per email, and campaign briefs. Detects ESP integrations
  for direct automation setup.
context_required:
- brand/{slug}/brand-voice/current.md
- brand/{slug}/go-to-market/positioning/*/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/operational/learnings.md
- brand/{slug}/operational/assets.md
- brand/{slug}/operational/stack.md
context_writes:
- campaigns/{name}/brief.md
- campaigns/{name}/emails/*.md
- brand/{slug}/operational/assets.md
- brand/{slug}/operational/learnings.md
---

# Email Sequences

Most lead magnets die in the inbox. Someone downloads your thing, gets one
"here's your download" email, and never hears from you again.

The gap between "opted in" and "bought" is where money is made or lost.
This skill builds sequences that bridge that gap.

Read `./brand/` per `_system/brand-memory.md` · Follow `_system/output-format.md`

---

## Brand Memory

### Reads

| File | Purpose |
|------|---------|
| `brand/{slug}/brand-voice/current.md` | Tone, vocabulary, rhythm → shapes every email |
| `brand/{slug}/go-to-market/positioning/*/current.md` | Angle → narrative spine of the sequence |
| `brand/{slug}/go-to-market/ecps/current.md` | Awareness level, sophistication, pain points |
| `brand/{slug}/operational/learnings.md` | Past send-time data, subject line performance |
| `brand/{slug}/operational/assets.md` | Check for existing lead magnet details |
| `brand/{slug}/operational/stack.md` | ESP integrations (Mailchimp, ConvertKit, etc.) |

### Writes

| File | Content |
|------|---------|
| `campaigns/{name}/brief.md` | Campaign overview |
| `campaigns/{name}/emails/*.md` | Individual email files |
| `brand/{slug}/operational/assets.md` | Appends sequence entry |
| `brand/{slug}/operational/learnings.md` | Appends feedback findings |

Display loaded context using standard tree format.

---

## ESP Detection

Before generating, check for email service provider integrations:

1. Check `brand/{slug}/operational/stack.md` for ESP entries
2. Check `.env` for API keys: `MAILCHIMP_API_KEY`, `CONVERTKIT_API_KEY`, `HUBSPOT_ACCESS_TOKEN`, `SENDGRID_API_KEY`, `ACTIVECAMPAIGN_API_KEY`
3. Check for MCP email tools

If detected, offer: ① Set up automation via API ② Just output copy. Always generate local .md files regardless.

---

## Iteration Detection

Check if `campaigns/{name}/emails/` exists. If so, present summary and offer: Revise / Add emails / New sequence type. Don't start from scratch when sequence exists.

---

## Before Starting: Gather Context

1. **Lead magnet?** (Check assets.md for existing)
2. **Paid offer?** (Product, price)
3. **Price point?** (Affects trust-building needed)
4. **Bridge?** (Free → paid logic)
5. **Voice?** (From brand-voice/current.md or ask)
6. **Objections?** (Top 3 "but..." reasons)

Pre-fill from brand memory when possible.

---

## Sequence Types

| Sequence | Purpose | Length | When |
|----------|---------|--------|------|
| **Welcome** | Deliver value, build relationship | 5-7 emails | After opt-in |
| **Nurture** | Provide value, build trust | 4-6 emails | Between welcome and pitch |
| **Conversion** | Sell the product | 4-7 emails | Ready to pitch |
| **Launch** | Time-bound campaign | 6-10 emails | Product launch |
| **Re-engagement** | Win back cold subscribers | 3-4 emails | Inactive 30+ days |
| **Post-Purchase** | Onboard, reduce refunds, upsell | 4-6 emails | After purchase |

→ See `references/workflow.md` for detailed frameworks per sequence type.

---

## Welcome Sequence Framework: DELIVER → CONNECT → VALUE → BRIDGE

```
Email 1: DELIVER — Give them what they came for (Day 0)
Email 2: CONNECT — Share your story, build rapport (Day 2)
Email 3: VALUE — Teach something useful, quick win (Day 4)
Email 4: VALUE — Different angle, builds authority (Day 6)
Email 5: BRIDGE — Show gap between free and paid (Day 8)
Email 6: SOFT PITCH — Introduce offer gently (Day 10)
Email 7: DIRECT PITCH — Make the ask (Day 12)
```

→ See `references/workflow.md` for detailed email structures, copy principles, and all sequence frameworks.

---

## Subject Line A/B Variants

For every email, generate exactly 3 variants:

- **Variant A — Safe Bet:** Proven formula, optimized for open rate
- **Variant B — Bold Play:** Higher risk/reward, pattern interrupt
- **Variant C — Personal Touch:** Feels like a friend, optimized for trust

Rules: Max 50 chars, no emoji (unless brand voice calls for it), no ALL CAPS, each variant uses DIFFERENT formula, preview text complements (doesn't repeat) subject.

→ See `references/workflow.md` §Subject Lines for formulas and `references/examples.md` for variant examples.

---

## Email Copy Principles

- **P.S. is prime real estate** — 40% read it first. **One CTA per email** — multiple = none.
- **Short paragraphs** (1-3 sentences). **Preview text matters** (first 40-90 chars).
- **Open loops** — create curiosity for next email. **Specificity** — "$47,329" not "made money".

---

## File Output

Every email saved as individual file. Non-negotiable.

```
campaigns/{sequence-name}/
  brief.md                    ← Campaign overview
  emails/
    01-delivery.md            ← Email 1
    02-connection.md          ← Email 2
    ...
```

→ See `references/templates.md` for file format, naming conventions, brief template, and terminal output.

---

## Send Timing

Specific day + time for each email based on: audience type, sequence type, price point, learnings data.

| Audience | Best Days | Best Times |
|----------|-----------|------------|
| B2B | Tue/Wed/Thu | 9-10:30 AM |
| B2C | Tue/Wed/Thu | 7-9 AM or 7-9 PM |
| Creator | Tue/Wed | 7-8:30 AM |
| Ecommerce | Thu/Fri/Sun | 10 AM or 8 PM |

When to start selling: <$100 after 3-5 value emails, $100-500 after 5-7, >$500 after 7-10.

---

## Key Rules

1. **3 subject line variants per email** — never a single guess
2. **One CTA per email** — every email does ONE job
3. **Individual files** — each email standalone, importable, iterable
4. **Specific timing** — day, time, rationale, not just "Day 2"
5. **Voice matches brand** — calibrate from brand-voice/current.md
6. **Value before ask** — at least 3-5 value emails before pitch
7. **Respect the reader** — not manipulative, easy unsubscribe

---

## Connections

**Input from:** brand-voice (tone), positioning-angles (angle), lead-magnet (asset), audience-research (timing)
**Uses:** direct-response-copy (copy principles)
**Chains to:** content-atomizer (promote lead magnet socially)

---

## Feedback

Present standard prompt after delivery. Log to learnings.md. Track subject line A/B test results.
→ See `references/quality.md` §Feedback for processing rules.

---

## Reference Files

| File | Contents |
|------|----------|
| `references/workflow.md` | All sequence frameworks, email structures, subject line formulas, copy principles, send timing, ESP integration, architecture patterns |
| `references/templates.md` | Individual email file format, campaign brief, terminal output, directory structure |
| `references/examples.md` | Full welcome sequence example, subject line A/B examples, individual email file example |
| `references/quality.md` | Pre/per/post-generation checklists, subject line checklist, The Test, feedback processing |
