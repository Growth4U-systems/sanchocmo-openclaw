# Email Open Rate Diagnostic: 35% → 18% Drop

## Context Check
- **Brand context files**: Not available (no slug provided)
- **Operational learnings**: Not available
- **ESP stack**: Not detected
- **Past subject line performance data**: Not available

> ⚠️ Without access to brand context, ESP data, or historical send logs, this diagnostic is based on general email marketing expertise and the information provided (35% → 18% open rate decline). Recommendations would be more precise with actual send data, subject line history, and audience segmentation info.

---

## 1. Diagnostic: Why Open Rates Drop from 35% to 18%

A ~17-point drop is significant — nearly halving performance. Here are the most common root causes, ranked by likelihood:

### 🔴 High Probability Causes

**A. List Hygiene Decay**
- Inactive subscribers accumulate over time, dragging down open rates
- If you haven't cleaned your list in 3-6 months, this is likely the #1 factor
- ISPs track engagement; low engagement → worse inbox placement → lower opens (a vicious cycle)

**B. Deliverability / Inbox Placement Degradation**
- You may be landing in Promotions tab or Spam more frequently
- Common triggers: sudden volume increases, domain reputation decline, complaints
- Apple MPP (Mail Privacy Protection) may have inflated your original 35% — and now you're seeing more accurate numbers as ISPs adjust

**C. Subject Line Fatigue**
- Using the same patterns repeatedly trains subscribers to ignore you
- If most subject lines follow one formula (e.g., always "How to X"), readers develop banner blindness
- Preview text not being used (or repeating the subject) wastes a second hook opportunity

**D. Send Frequency / Cadence Issues**
- Too frequent = fatigue and learned-ignore behavior
- Too infrequent = subscribers forget who you are, leading to low recognition opens
- Inconsistent schedule = no habit formation

### 🟡 Medium Probability Causes

**E. Audience Composition Shift**
- If you've been adding subscribers from a different source (e.g., switched from organic to paid acquisition), the new cohort may be lower intent
- Compare open rates by signup source/cohort if possible

**F. Content-Subject Mismatch History**
- If past emails promised something in the subject but delivered something else, trust erodes
- Subscribers learn whether your emails are worth opening based on past experience

**G. Technical Issues**
- Authentication problems (SPF, DKIM, DMARC misconfigured or expired)
- Sending domain/IP reputation decline
- ESP migration gone wrong

---

## 2. Immediate Diagnostic Steps (Before Fixing Subject Lines)

Before rewriting subject lines, confirm the actual problem:

| Check | How | Why |
|-------|-----|-----|
| **Deliverability** | Run inbox placement test (GlockApps, Mail-Tester) | If you're in spam, subject lines don't matter |
| **List age distribution** | Segment by signup date, compare open rates by cohort | Identifies if it's a list quality vs. content issue |
| **Source quality** | Compare open rates by acquisition source | Identifies if new subscribers are low-intent |
| **Apple MPP impact** | Check % of "opens" from Apple proxy | Your old 35% may have been inflated |
| **Engagement segments** | Split: active (opened in 90d) vs. inactive | Shows true engaged-subscriber open rate |
| **Send frequency** | Plot send frequency vs. open rate over time | Identifies fatigue patterns |

---

## 3. Subject Line Fix: Strategy & Formulas

Based on the skill's Subject Line Strategy framework:

### Rules (from skill)
- **Clear > Clever**
- **Specific > Vague**
- Benefit or curiosity-driven
- **40-60 characters** ideal
- Test emoji (they're polarizing)

### The 5 High-Performing Patterns

| Pattern | Formula | Example |
|---------|---------|---------|
| **Question** | "Still struggling with X?" | "Still losing leads to your competitors?" |
| **How-to** | "How to [outcome] in [timeframe]" | "How to cut churn in half this quarter" |
| **Number** | "3 ways to [benefit]" | "3 ways to double your demo bookings" |
| **Direct** | "[First name], your [thing] is ready" | "Sarah, your Q1 report is ready" |
| **Story tease** | "The mistake I made with [topic]" | "The mistake that cost us 40% of signups" |

### Subject Line Rehab Plan

**Week 1-2: Pattern Diversity**
- Audit your last 20 subject lines — categorize each by pattern
- If 80%+ use the same formula, that's your fatigue source
- Commit to rotating across all 5 patterns

**Week 3-4: A/B Testing Sprint**
For each send, test 3 variants (per skill framework):

| Variant | Style | Purpose |
|---------|-------|---------|
| **A — Safe Bet** | Proven formula, clear benefit | Baseline performance |
| **B — Bold Play** | Pattern interrupt, unexpected angle | Ceiling discovery |
| **C — Personal Touch** | Feels like a friend wrote it | Trust rebuild |

**Example for a product update email:**
- **A (Safe Bet):** "3 new features that save you 2 hours/week"
- **B (Bold Play):** "We broke something (on purpose)"
- **C (Personal):** "Quick update — thought you'd want to know"

**Preview text for each (complementary, never repeating subject):**
- A: "Plus a sneak peek at what's coming next month"
- B: "And rebuilt it to work the way you actually use it"
- C: "Two changes based on exactly what you asked for"

### What to Stop Doing
- ❌ ALL CAPS words (triggers spam filters)
- ❌ Clickbait that doesn't deliver (erodes trust → future opens decline)
- ❌ Same formula every email
- ❌ Generic subjects ("Newsletter #47", "Monthly Update")
- ❌ Long subjects (60+ chars get truncated on mobile)
- ❌ Ignoring preview text

---

## 4. Recovery Playbook (90-Day Plan)

### Phase 1: Triage (Days 1-14)
1. **Run deliverability audit** — fix any SPF/DKIM/DMARC issues
2. **Segment list**: Active (opened in 90d) / Dormant (90-180d) / Dead (180d+)
3. **Pause sends to Dead segment** immediately
4. **Start A/B testing subjects** on Active segment using the 3-variant framework above

### Phase 2: Rebuild (Days 15-45)
5. **Re-engagement sequence for Dormant segment** (3-4 emails per skill framework):
   - Email 1: Check-in (genuine concern)
   - Email 2: Value reminder (what's new)
   - Email 3: Incentive (special offer)
   - Email 4: Last chance (stay or unsubscribe)
6. **Remove non-responders** from Dormant after sequence completes
7. **Document winning subject line patterns** in operational learnings

### Phase 3: Sustain (Days 46-90)
8. **Implement quarterly list cleaning** as a recurring process
9. **Set up automated engagement scoring** if ESP supports it
10. **Target**: Active segment open rate back to 30%+ (overall may be lower due to smaller, cleaner list — but healthier)

---

## 5. Metrics to Track (from skill)

| Metric | Benchmark | Your Current | Target |
|--------|-----------|-------------|--------|
| Open rate | 20-40% | 18% | 28-32% (realistic) |
| Click rate | 2-5% | Unknown | 3%+ |
| Unsubscribe rate | <0.5% | Unknown | <0.3% |
| Spam complaints | <0.1% | Unknown | <0.05% |
| List growth rate | Net positive | Unknown | Positive after cleaning |

---

## 6. Questions to Answer for More Precise Help

Per the skill's task-specific questions, adapted for this diagnostic:

1. **When did the decline start?** (Gradual vs. sudden tells us a lot)
2. **Has send frequency changed recently?**
3. **What ESP are you using?** (Deliverability tools vary)
4. **What's your list size and growth rate?**
5. **Have you changed acquisition sources recently?**
6. **Can you share your last 10 subject lines and their open rates?**

With this data, we can move from general diagnostic to specific, targeted fixes.

---

## Summary

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| 🔴 P0 | Deliverability audit | Removes #1 blocker if present |
| 🔴 P0 | Segment by engagement, pause dead subscribers | +5-10 pts on open rate immediately |
| 🟡 P1 | Subject line pattern diversification + A/B testing | +3-7 pts over 30 days |
| 🟡 P1 | Preview text optimization | +1-3 pts |
| 🟢 P2 | Re-engagement sequence for dormant | Recovers 10-20% of dormant, cleans rest |
| 🟢 P2 | Quarterly list hygiene process | Prevents future decay |

**Bottom line:** Subject lines are likely a contributing factor, but a 17-point drop almost always indicates a deliverability or list quality issue underneath. Fix infrastructure first, then optimize copy.
