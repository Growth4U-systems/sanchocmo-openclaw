# Personalization Variables

> Reference data for outreach-sequence-builder skill. Merge field framework with 4 levels, tool-specific syntax, fallback values, and anti-spam guidelines.

---

## 4 Levels of Personalization

### Level 1: Basic (minimum viable, always available)

| Variable | Description | Source | Example |
|----------|-------------|--------|---------|
| `{first_name}` | Prospect's first name | contacts-enriched.json | "Maria" |
| `{last_name}` | Prospect's last name | contacts-enriched.json | "Garcia" |
| `{company}` | Company name | contacts-enriched.json | "PayFlow" |
| `{title}` | Job title | contacts-enriched.json | "Head of Marketing" |
| `{email}` | Email address | contacts-enriched.json | "maria@payflow.com" |

**Impact**: Low — every cold email does this. Necessary but not differentiating.

### Level 2: Context (requires company-finder or contact-enrichment data)

| Variable | Description | Source | Example |
|----------|-------------|--------|---------|
| `{industry}` | Company industry | company-finder output | "Fintech" |
| `{company_size}` | Employee count range | company-finder output | "50-200" |
| `{funding_stage}` | Last funding round | company-finder / Crunchbase | "Series A" |
| `{funding_amount}` | Amount raised | company-finder / Crunchbase | "EUR 5M" |
| `{tech_stack}` | Key technologies used | contact-enrichment / BuiltWith | "Stripe, HubSpot" |
| `{location}` | Company HQ | company-finder output | "Madrid, Spain" |
| `{founded_year}` | Year founded | company-finder output | "2019" |
| `{website}` | Company website | company-finder output | "payflow.com" |

**Impact**: Medium — shows you did basic research. Most SDRs stop here.

### Level 3: Signal (requires signal-definition + signal-monitor)

| Variable | Description | Source | Example |
|----------|-------------|--------|---------|
| `{recent_signal}` | Most recent buying signal | signal-monitor output | "Raised Series A last week" |
| `{trigger_event}` | Specific event that triggered outreach | signal-monitor output | "Hired VP Marketing" |
| `{pain_point_inferred}` | Pain point inferred from signal | signal-definition mapping | "Scaling marketing post-funding" |
| `{timing_context}` | Why NOW is the right time | signal analysis | "90 days post-hire, need quick wins" |

**Impact**: High — demonstrates relevance and timeliness. Feels like a warm intro.

### Level 4: Deep (requires manual research or advanced enrichment)

| Variable | Description | Source | Example |
|----------|-------------|--------|---------|
| `{mutual_connection}` | Shared connection on LinkedIn | LinkedIn / manual | "We both know Carlos Perez" |
| `{shared_interest}` | Common interest or background | LinkedIn profile | "Fellow IE Business School alum" |
| `{content_they_published}` | Recent article/post they wrote | LinkedIn / blog | "Your post on fintech regulation" |
| `{competitor_they_use}` | Competitor product they use | BuiltWith / signal | "I see you're using [competitor]" |
| `{specific_achievement}` | Recent company milestone | News / LinkedIn | "Congrats on reaching 10K users" |
| `{custom_insight}` | Tailored observation about their business | Manual analysis | "Your pricing page suggests X" |

**Impact**: Very high — feels like a personal note, not a campaign. Reserve for top-priority prospects.

---

## Tool-Specific Merge Field Syntax

| Variable | Instantly | Lemlist | Expandi | HubSpot | Manual |
|----------|-----------|---------|---------|---------|--------|
| First name | `{{firstName}}` | `{{firstName}}` | `{first_name}` | `{{contact.firstname}}` | [Name] |
| Last name | `{{lastName}}` | `{{lastName}}` | `{last_name}` | `{{contact.lastname}}` | [LastName] |
| Company | `{{companyName}}` | `{{companyName}}` | `{company}` | `{{company.name}}` | [Company] |
| Title | `{{title}}` | `{{title}}` | `{title}` | `{{contact.jobtitle}}` | [Title] |
| Custom 1 | `{{custom1}}` | `{{custom1}}` | `{custom_1}` | `{{contact.custom_1}}` | [Custom1] |
| Custom 2 | `{{custom2}}` | `{{custom2}}` | `{custom_2}` | `{{contact.custom_2}}` | [Custom2] |

**Note**: When generating sequences, use the generic `{variable_name}` format. The user (or executor skill) converts to tool-specific syntax before loading into the platform.

---

## Fallback Values

Every personalization variable MUST have a fallback to avoid broken emails:

| Variable | Fallback | Example Output |
|----------|----------|----------------|
| `{first_name}` | "Hi there" | "Hi Maria" or "Hi there" |
| `{company}` | "your company" | "at PayFlow" or "at your company" |
| `{title}` | "your role" | "as Head of Marketing" or "in your role" |
| `{industry}` | "your industry" | "in fintech" or "in your industry" |
| `{recent_signal}` | (omit the sentence) | Full sentence or nothing |
| `{mutual_connection}` | (omit the sentence) | Reference or nothing |

**Rule**: Never send an email with visible merge tags (`{first_name}` literally in the email). Always test with fallbacks.

---

## Personalization Strategy by Prospect Tier

| Tier | Prospects | Personalization Level | Time per Prospect |
|------|-----------|----------------------|-------------------|
| Tier 1 (Top 20) | Highest-value accounts | Level 4 (Deep) | 15-20 min |
| Tier 2 (Top 100) | Strong-fit accounts | Level 3 (Signal) | 5-10 min |
| Tier 3 (Remaining) | Good-fit accounts | Level 2 (Context) | 1-2 min |
| Tier 4 (Mass) | ICP match, lower priority | Level 1 (Basic) | Automated |

**Time allocation rule**: 80% of personalization time on Tier 1-2 (20% of prospects, 80% of pipeline value).

---

## Anti-Spam Guidelines

### DO
- Use the prospect's real name and company
- Reference specific, verifiable facts about their business
- Write in natural language (conversational, not corporate)
- Keep emails under 150 words (sweet spot: 50-100 words)
- Use plain text (no HTML templates for cold outreach)
- Include a clear, honest reason for reaching out

### DO NOT
- Use clickbait subject lines ("RE:" or "FWD:" fake threads)
- Over-personalize (reading their personal blog from 2015 = creepy)
- Include images, logos, or heavy formatting in cold emails
- Use tracking pixels in first email (affects deliverability)
- Send from shared/generic email addresses
- Mention competitors by name in a negative way

### Subject Line Personalization

| Pattern | Example | When to Use |
|---------|---------|-------------|
| Signal-based | "Congrats on the round, {first_name}" | When signal is strong |
| Curiosity gap | "Question about {company}'s [area]" | General outreach |
| Mutual reference | "{mutual_connection} suggested I reach out" | When you have a connection |
| Value offer | "[Resource] for {industry} companies" | Value-first approach |
| Direct | "15 min, {first_name}?" | Follow-up touches only |

---

## GDPR Compliance for Personalization

| Requirement | Implementation |
|-------------|---------------|
| Legitimate interest basis | Document why contacting this prospect is relevant to their business needs |
| Professional context only | Only use business email, professional LinkedIn data — never personal email |
| Right to opt-out | Include unsubscribe mechanism in every email: "Not interested? Reply 'stop' and I'll remove you." |
| Data minimization | Only collect data needed for outreach — don't hoard personal information |
| Data retention | Delete prospect data after 90 days of no engagement |
| Source documentation | Record where each piece of data came from (LinkedIn, Apollo, website, etc.) |

**Note**: GDPR applies to EU prospects. For US prospects, CAN-SPAM applies (less strict but still requires opt-out and honest headers).
