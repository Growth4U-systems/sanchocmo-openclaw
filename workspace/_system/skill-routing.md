# Skill Routing Guide

> When to use which skill — disambiguation for overlapping capabilities

---

## Quick Decision Tree

```
"I want to..."

├─ UNDERSTAND MY BUSINESS
│  ├─ "Analyze my company" → company-context
│  ├─ "Analyze my product" → self-intelligence
│  ├─ "Analyze competitors" → competitor-intelligence
│  ├─ "Understand my market" → market-intelligence
│  ├─ "Audit my business model" → business-model-audit
│  ├─ "SWOT analysis" → swot-analysis
│  ├─ "Find my niche/ICP" → niche-discovery-100x
│  ├─ "Define positioning" → positioning-messaging
│  ├─ "Define brand voice" → brand-voice
│  └─ "Visual identity" → visual-identity
│
├─ EXTRACT INTELLIGENCE (what's happening?)
│  ├─ "What was decided in meetings?" → meeting-intelligence
│  ├─ "What are people talking about?" → daily-pulse
│  ├─ "What patterns keep recurring?" → pattern-detector
│  ├─ "What are competitors doing?" → thief-marketers
│  └─ "What buy signals to watch?" → signal-definition → signal-monitor
│
├─ CREATE CONTENT (one-to-many)
│  ├─ "Get content ideas from meetings" → content-miner
│  ├─ "Turn insights into briefs" → insight-to-content-mapper
│  ├─ "Find keywords" → keyword-research
│  ├─ "Write SEO content" → seo-content
│  ├─ "Distribute across platforms" → content-atomizer
│  ├─ "Write email sequences" → email-sequences
│  ├─ "Create lead magnet" → lead-magnet
│  ├─ "Write sales copy" → direct-response-copy
│  └─ "Write newsletter" → newsletter
│
├─ DECIDE STRATEGY (what channels, what calendar, what outreach)
│  ├─ "Which channels should I use?" → channel-prioritization
│  ├─ "Plan my content calendar" → content-calendar-planner
│  └─ "Create cold outreach sequences" → outreach-sequence-builder
│
├─ FIND & REACH PROSPECTS (one-to-one)
│  ├─ "Find target companies" → company-finder
│  ├─ "Find decision makers" → decision-maker-finder
│  └─ "Get their contact info" → contact-enrichment
│
└─ VALIDATE & PRICE
   ├─ "Validate my ECPs" → ecp-validation
   ├─ "Analyze customer data" → existing-customer-data
   └─ "Price my product" → pricing-strategy
```

---

## Overlap Disambiguation

### Intelligence Skills: Which one when?

| Question | Use This | NOT This |
|----------|----------|----------|
| "What decisions were made?" | **meeting-intelligence** | daily-pulse |
| "Who has action items?" | **meeting-intelligence** | daily-pulse |
| "What content ideas from conversations?" | **daily-pulse** | meeting-intelligence |
| "Classify insights for content calendar" | **content-miner** | daily-pulse |
| "What topics keep appearing?" | **pattern-detector** | content-miner |
| "What are competitors doing?" | **thief-marketers** | meeting-intelligence |

**Key distinction:**
- **meeting-intelligence** = OPERATIONS (decisions, tasks, risks, quotes)
- **daily-pulse** = CONTENT IDEAS (pain points, features, success stories → micro-briefs)
- **content-miner** = CLASSIFICATION (takes meeting-intelligence output → organizes for content calendar)
- **pattern-detector** = TRENDS (analyzes 30 days of intelligence → recurring themes)

### Outreach Skills: Which one when?

| Question | Use This | NOT This |
|----------|----------|----------|
| "Find companies matching ICP" | **company-finder** | decision-maker-finder |
| "Find people at a company" | **decision-maker-finder** | company-finder |
| "Get someone's email" | **contact-enrichment** | decision-maker-finder |

**Always in this order:** company-finder → decision-maker-finder → contact-enrichment

### Decide Skills: Which one when?

| Question | Use This | NOT This |
|----------|----------|----------|
| "Which marketing channels?" | **channel-prioritization** | content-calendar-planner |
| "Plan what to publish when" | **content-calendar-planner** | seo-content |
| "Create cold outreach cadence" | **outreach-sequence-builder** | email-sequences |
| "Nurture warm subscribers" | **email-sequences** | outreach-sequence-builder |

**Key distinction:**
- **outreach-sequence-builder** = COLD outbound (prospects who don't know you, multi-channel email+LinkedIn, signal-triggered)
- **email-sequences** = WARM inbound (opted-in subscribers, email-only, event-triggered nurture)

### Content Skills: Which one when?

| Question | Use This | NOT This |
|----------|----------|----------|
| "I have an insight, make it a brief" | **insight-to-content-mapper** | seo-content |
| "Write the actual article" | **seo-content** | insight-to-content-mapper |
| "Find keywords for a topic" | **keyword-research** | insight-to-content-mapper |
| "Adapt content for social" | **content-atomizer** | seo-content |

---

## Pipeline Maps

### Intelligence → Content Pipeline

```
meeting-intelligence ─┐
                      ├→ content-miner → insight-to-content-mapper → seo-content
daily-pulse ──────────┘                                            → content-atomizer
                                                                   → newsletter
pattern-detector (runs weekly, feeds back to content planning)
```

### Outreach Pipeline

```
niche-discovery-100x (ICP) → company-finder → decision-maker-finder → contact-enrichment → email-sequences
                                                                                         → direct-response-copy
```

### Decide → Execute Pipeline

```
channel-prioritization (which channels) ─┬→ content-calendar-planner → seo-content / content-atomizer / newsletter
                                         └→ outreach-sequence-builder → email-outreach-executor (future)
                                                                      → linkedin-outreach-executor (future)
```

### Competitive Intelligence Pipeline

```
thief-marketers (what competitors do)
signal-definition (what signals matter) → signal-monitor (track signals over time)
```

---

## Frequency Guide

| Skill | Recommended | When |
|-------|-------------|------|
| meeting-intelligence | Daily (automated) | After meetings |
| daily-pulse | Daily (automated) | Morning scan |
| content-miner | After meeting-intelligence | When intelligence accumulates |
| pattern-detector | Weekly | After 7+ days of intelligence |
| company-finder | Monthly | New ECP or market refresh |
| decision-maker-finder | After company-finder | Each batch |
| contact-enrichment | Before outreach | Each campaign |
| insight-to-content-mapper | After daily-pulse | When ideas accumulate |
| thief-marketers | Bi-weekly | Competitor monitoring |
| signal-monitor | Continuous | Automated alerts |
