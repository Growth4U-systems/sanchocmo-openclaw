---
name: contact-enrichment
description: Get verified emails, phones, socials.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-one)
  depends_on: decision-maker-finder
  chains_to: outreach-sequence-builder, email-sequences
context_required:
- brand/{slug}/company-brief/company-brief-current.md
- brand/{slug}/go-to-market/ecps/ecps-current.md
- brand/{slug}/go-to-market/ecps/ecps-current.md
context_writes:
- campaigns/
- brand/{slug}/operational/assets.md
---

# Contact Enrichment — The Last Mile Before Outreach

> "The best outreach fails if it lands in the wrong inbox."

Este skill convierte una lista de decision makers en **contactos listos para outreach**. No basta con saber quienes son — necesitas saber COMO llegar a ellos: email verificado, telefono directo, perfiles sociales.

**Diferencia con decision-maker-finder:**
- **decision-maker-finder**: Quienes son los decision makers (IDENTIDAD)
- **contact-enrichment**: Como contactarlos (DATOS DE CONTACTO)

Read ./brand/ per _system/intelligence/brand-memory.md (if using SanchoCMO framework)

Follow _system/output/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input:**
- Decision makers list from decision-maker-finder skill
- File: `brand/{slug}/operational/decision-makers-YYYYMMDD.json`
- At minimum: name + company + title (LinkedIn URL is a bonus)

**API Keys needed (at least ONE):**
- **Minimum:** Hunter.io free plan (25 searches/mo + 50 verifications/mo)
- **Recommended:** Apollo.io (free, 50 credits/mo) + Hunter.io (verification)
- **Full stack:** Apollo + Hunter + SignalHire + Snov.io

**Optional context:**
- `brand/{slug}/operational/target-companies.json` (for domain lookup)
- `brand/{slug}/go-to-market/ecps.json` (for title matching validation)

---

## Workflow

### Step 0: Tool Detection (Automatic)

Check which enrichment APIs are configured:

```
CHECK environment for API keys:
  ├─ APOLLO_API_KEY     → apollo available
  ├─ HUNTER_API_KEY     → hunter available
  ├─ SIGNALHIRE_API_KEY → signalhire available
  ├─ SNOV_CLIENT_ID     → snov available
  ├─ LUSHA_API_KEY      → lusha available (phone)
  └─ ZOOMINFO_*         → zoominfo available (phone)

Mode: FULL (3+ providers) / STANDARD (1-2) / LIGHT (manual)

Estimated found rate:
  FULL:     85-95% emails, 50-70% phones
  STANDARD: 70-85% emails, 30-50% phones
  LIGHT:    40-60% emails (manual)
```

If NO API keys → switch to LIGHT mode (see section below).

---

### Step 1: Load Contacts

```
Read from Context Lake:
  └─ brand/{slug}/operational/decision-makers-YYYYMMDD.json

Extract per contact: name, title, company, domain, LinkedIn URL, existing data

If NO decision makers file → ERROR: Run /decision-maker-finder first
```

Present: total contacts, % with LinkedIn URL, % with domain, how many already have email.

---

### Step 2: Select Enrichment Depth

| Depth | What | Best for | Cost per 100 |
|-------|------|----------|-------------|
| Email Only | Email waterfall + verification | Email-first outreach | $5-15 |
| Email + Phone | Full waterfall | Multi-channel, SDR teams | $20-40 |
| Full Enrichment | Email + Phone + Social | ABM, high-value prospects | $30-60 |

User selects -> Proceed with appropriate depth.

---

### Step 3: Waterfall Email Enrichment

**For each contact, try providers in order. STOP at first verified match.**

See [waterfall-providers.md](references/waterfall-providers.md) for complete API details.

**Pass 1 — Apollo.io (if available):**
```
POST https://api.apollo.io/v1/people/match
Body: { first_name, last_name, organization_name, domain }

IF email_status == "verified" → ACCEPT (high confidence)
   BONUS: Also capture phone if returned
IF email_status == "guessed" → pending_verification
IF no result → CONTINUE
```
Hit rate: 60-70%. Time: ~2 min/100 contacts.

**Pass 2 — Hunter.io (if available):**
```
GET https://api.hunter.io/v2/email-finder
Params: domain, first_name, last_name

IF score >= 90 → ACCEPT (high confidence)
IF score >= 70 → pending_verification
IF no result → CONTINUE
```
Additional hit rate: 15-25%.

**Pass 3 — SignalHire (if available):**
```
POST https://www.signalhire.com/api/v1/candidate/search
Body: { linkedin_url }

IF isVerified == true → ACCEPT (high confidence)
   BONUS: Phone numbers often included
IF no result → CONTINUE
```
Additional hit rate: 5-15%.

**Pass 4 — Snov.io (if available):**
```
POST https://api.snov.io/v1/get-emails-from-name
Body: { firstName, lastName, domain }

IF emailStatus == "valid" → ACCEPT (medium confidence)
IF emailStatus == "unverifiable" → low confidence
IF no result → "not_found"
```
Last resort. Additional hit rate: 5-10%.

---

### Step 4: Email Verification

See [email-verification.md](references/email-verification.md) for full pipeline.

```
VERIFICATION PIPELINE:

1. Syntax check (instant) — regex, remove malformed
2. MX record check (instant) — DNS lookup, remove no-MX domains
3. Hunter.io verification API:
   GET https://api.hunter.io/v2/email-verifier?email={email}
   "deliverable" + score >= 90 → HIGH
   "deliverable" + score 70-89 → MEDIUM
   "risky"                     → MEDIUM (max)
   "unknown"                   → LOW
   "undeliverable"             → DISCARD
4. Catch-all detection — if catch-all domain → cap at MEDIUM
5. Disposable email check — if disposable → DISCARD
```

---

### Step 5: Phone Enrichment (if requested)

Only runs for "Email + Phone" or "Full Enrichment" depth.

```
PHONE WATERFALL:
1. Check Apollo responses (may already have phone from Step 3)
2. SignalHire → POST /api/v1/candidate/search (LinkedIn URL input)
3. Lusha → POST https://api.lusha.com/person (name + company)
4. ZoomInfo → enterprise only, if client has subscription
```

---

### Step 6: Social Profile Enrichment (if requested)

Only runs for "Full Enrichment" depth.

```
1. LinkedIn URL — already from decision-maker-finder (95%+ coverage)
2. Twitter/X — WebSearch: "{name} {company} site:twitter.com OR site:x.com"
3. GitHub/Medium — optional, for technical/content decision makers
```

---

### Step 7: Confidence Scoring

```
FOR each contact:
  HIGH   = email verified + non-catch-all + 2+ sources (90%+)
  MEDIUM = email found + MX valid + catch-all OR single source (70-89%)
  LOW    = email guessed + no verification OR pattern match only (<70%)

  overall = min(email_confidence, phone_confidence) if phone requested
         OR email_confidence if email only
```

---

### Step 8: Present Results

```
CONTACT ENRICHMENT — Complete

Emails: [found]/[total] ([%]) | Verified: [N] | HIGH: [N] | MEDIUM: [N] | LOW: [N]
Phones: [found]/[total] ([%]) | Mobile: [N] | Direct: [N]
Social: LinkedIn [N] | Twitter [N]

Provider breakdown + cost per provider
Total cost: $X for [N] contacts

READY FOR OUTREACH: [N] HIGH confidence (safe) + [N] MEDIUM (caution)
```

---

### Step 9: Save Output

File: `brand/{slug}/operational/contacts-enriched-YYYYMMDD.json`

```json
{
  "date": "2026-02-21",
  "source": "contact-enrichment",
  "enrichment_depth": "email+phone",
  "providers_used": ["apollo", "hunter", "signalhire"],
  "contacts": [
    {
      "name": "Jane Doe",
      "title": "VP Marketing",
      "company": "Example Corp",
      "email": "jane@example.com",
      "email_confidence": "high",
      "email_source": "hunter",
      "email_verified": true,
      "phone": "+34 612 345 678",
      "phone_type": "mobile",
      "phone_source": "signalhire",
      "linkedin_url": "linkedin.com/in/janedoe",
      "twitter_url": "twitter.com/janedoe",
      "enrichment_date": "2026-02-21"
    }
  ],
  "stats": {
    "total_contacts": 142,
    "email_found": 128,
    "email_verified": 115,
    "phone_found": 67,
    "email_found_rate": "90%",
    "avg_confidence": "high",
    "providers_hit_rate": {
      "apollo": "65%",
      "hunter": "20%",
      "signalhire": "5%"
    }
  }
}
```

Append summary to `./brand/{slug}/operational/assets.md`.

---

## LIGHT Mode — Manual Enrichment

**When no API keys are configured or budget is zero.**

1. **Hunter.io Free Plan** — 25 searches/mo + 50 verifications/mo. Use for top-priority contacts.

2. **Domain Pattern Detection** — `GET https://api.hunter.io/v2/domain-search?domain=example.com`. Find the pattern, apply to all contacts at that domain.

3. **Common Email Patterns** (try in order):
   ```
   {first}.{last}@domain.com       jane.doe@example.com
   {first}{last}@domain.com        janedoe@example.com
   {first}@domain.com              jane@example.com
   {f}{last}@domain.com            jdoe@example.com
   {first}_{last}@domain.com       jane_doe@example.com
   ```

4. **Google Pattern Search** — `"jane doe" "example.com" email` or `"jane.doe@example.com"`

5. **Manual LinkedIn** — Profile > Contact info (requires connection or InMail).

**LIGHT Workflow:**
```
1. Group contacts by domain
2. Hunter.io domain search per domain → detect pattern
3. Apply pattern to all contacts at that domain
4. Verify top 5 per domain via Hunter.io verifier
5. If pattern works → apply to rest (MEDIUM confidence)
6. Remaining: Google search + LinkedIn manual
7. Output mostly MEDIUM confidence
```

---

## Cost Estimation

### Per 100 Contacts

| Depth | Providers | Cost | Found Rate |
|-------|-----------|------|-----------|
| Email only (free) | Apollo free + Hunter free | $0 | 40-60% |
| Email only (paid) | Apollo + Hunter paid | $5-15 | 80-90% |
| Email + Phone | Apollo + Hunter + SignalHire | $20-40 | Email 85%, Phone 50% |
| Full enrichment | All providers | $30-60 | Email 90%+, Phone 60%+ |

### Monthly Budget by List Size

| Contacts | Email Only | Email + Phone | Full |
|----------|-----------|--------------|------|
| 50 | $3-8 | $10-20 | $15-30 |
| 100 | $5-15 | $20-40 | $30-60 |
| 500 | $25-75 | $100-200 | $150-300 |
| 1,000 | $50-150 | $200-400 | $300-600 |

---

## GDPR / Privacy Warning

**This skill handles personal data. Comply with applicable data protection laws.**

| Requirement | Action |
|-------------|--------|
| Legal basis | Document legitimate interest for B2B prospecting |
| Data minimization | Only collect data needed for outreach purpose |
| Storage limitation | Delete enriched data after 12 months if no engagement |
| Right to erasure | If contact requests removal, delete within 30 days |
| Opt-out mechanism | Every outreach must include unsubscribe option |
| Record keeping | Log when and where each data point was obtained |

**EU (GDPR):** B2B email to professional addresses permitted under legitimate interest. Personal emails (gmail, yahoo) require more care. Always include company name + opt-out.

**Spain (LOPDGDD):** Follows GDPR. AEPD active on enforcement. Add "Conforme al Art. 21 LSSI" in commercial emails.

**Best practice:** Limit outreach to professional email addresses at company domains. Avoid personal email and mobile unless clear business relationship.

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| brand/{slug}/operational/decision-makers-YYYYMMDD.json | Names, titles, companies, LinkedIn URLs | Input contacts to enrich |
| brand/{slug}/operational/target-companies.json | Company domains | Domain lookup for email patterns |
| brand/{slug}/go-to-market/ecps.json | Target titles/roles | Validation enriched contacts match target |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| brand/{slug}/operational/contacts-enriched-YYYYMMDD.json | Enriched contacts with emails, phones, socials |
| ./brand/{slug}/operational/assets.md | Append: Enrichment summary and stats |

### Chains to

- `/outreach-sequence-builder` — Build personalized outreach sequences
- `/email-sequences` — Create email drip campaigns to verified emails
- `/direct-response-copy` — Write outreach copy using contact context

### Depends on

- `/decision-maker-finder` — Must run first to provide contacts to enrich

---

## Reference Files

- [waterfall-providers.md](references/waterfall-providers.md) — Provider guide: API endpoints, auth, formats, rate limits, costs
- [email-verification.md](references/email-verification.md) — Verification pipeline: syntax, MX, SMTP, catch-all, disposable, scoring

---

## Frequency

- **Initial run:** After each decision-maker-finder execution
- **Re-verification:** Every 90 days (people change jobs, emails go stale)
- **Pre-campaign:** Always re-verify before launching new outreach campaign
- **Why:** 2-3% of B2B emails go stale per month. Re-verification costs less than bounce damage.

---

*The last mile matters most. Verified data = delivered outreach = real conversations.*
