# Email Verification Guide

> Encontrar un email no es suficiente. Verificar que es real, activo y deliverable es lo que separa
> outreach profesional de spam que rebota. Esta guia cubre todas las capas de verificacion.

---

## Verification Pipeline

```
FOUND EMAIL
  │
  ├─ Layer 1: Syntax Check (instant, free)
  │   └─ Is it a valid email format?
  │
  ├─ Layer 2: MX Record Validation (instant, free)
  │   └─ Does the domain have a mail server?
  │
  ├─ Layer 3: SMTP Verification (1-3 sec, free but risky)
  │   └─ Does the mailbox exist on that server?
  │
  ├─ Layer 4: Catch-All Detection (1-3 sec, free)
  │   └─ Does the domain accept ALL emails? (lower confidence)
  │
  ├─ Layer 5: Disposable Email Detection (instant, free)
  │   └─ Is it a throwaway address?
  │
  └─ FINAL: Confidence Score Assignment
      └─ high / medium / low
```

---

## Layer 1: Syntax Check

**What:** Regex validation of email format.

**Pattern:**
```regex
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

**Checks:**
- Has exactly one `@` symbol
- Local part (before @) contains valid characters
- Domain part (after @) has at least one dot
- TLD has 2+ characters
- No spaces, no special characters in wrong places

**Common false positives to catch:**
- `jane@` (no domain)
- `@example.com` (no local part)
- `jane@example` (no TLD)
- `jane doe@example.com` (space)
- `jane@.com` (no domain name)

**Result:** PASS or FAIL. If FAIL, discard immediately.

---

## Layer 2: MX Record Validation

**What:** DNS lookup to confirm the domain has a mail server (MX record).

**How it works:**
```
Query DNS for MX records of "example.com"
  → MX 10 mail.example.com     (has mail server = PASS)
  → No MX records found         (no mail server = FAIL)
```

**Implementation:**
```python
import dns.resolver

def check_mx(domain):
    try:
        mx_records = dns.resolver.resolve(domain, 'MX')
        return len(mx_records) > 0
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
        return False
```

**Notes:**
- Some domains use A record fallback instead of MX — rare but valid.
- If MX check fails, the email is almost certainly invalid. Discard.
- Fast check (< 1 second). Always do this before SMTP.

---

## Layer 3: SMTP Verification

**What:** Connect to the mail server and ask if the mailbox exists.

**How it works:**
```
1. Connect to MX server (port 25)
2. HELO mail.example.com
3. MAIL FROM: <test@yourdomain.com>
4. RCPT TO: <jane@example.com>
5. Server responds:
   - 250 OK → Mailbox exists (PASS)
   - 550 User not found → Mailbox doesn't exist (FAIL)
   - 452 Too many connections → Try later
```

**IMPORTANT WARNINGS:**

| Risk | Description | Mitigation |
|------|-------------|------------|
| IP blacklisting | Too many SMTP checks = spam behavior | Max 50-100/day from one IP |
| Rate limiting | Servers block repeated checks | Add 2-5 second delays |
| Greylisting | Server temporarily rejects unknown senders | Retry after 5 min |
| Catch-all servers | Always say "250 OK" regardless | Detect in Layer 4 |
| Privacy laws | GDPR considerations for EU contacts | Document legitimate interest |

**Recommendation:** Use Hunter.io verification API instead of raw SMTP checks. They handle IP rotation, rate limiting, and catch-all detection.

---

## Layer 4: Catch-All Detection

**What:** Some domains accept email for ANY address (even non-existent ones).

**How to detect:**
```
1. Generate random email: test_abc123xyz@example.com
2. SMTP check this random address
3. If server responds 250 OK → domain is catch-all
4. If server responds 550 → domain is NOT catch-all (individual mailboxes)
```

**Impact on confidence:**
- Email found on catch-all domain = **medium confidence** (not low, because the email pattern may still be correct)
- Email found on non-catch-all domain AND verified = **high confidence**

**Common catch-all domains:**
- Small companies with custom domains (< 50 employees)
- Companies using Google Workspace with catch-all enabled
- Some enterprise domains for compliance/logging

---

## Layer 5: Disposable Email Detection

**What:** Check if the email uses a temporary/throwaway service.

**Known disposable domains (partial list):**
```
guerrillamail.com, tempmail.com, throwaway.email,
mailinator.com, yopmail.com, 10minutemail.com,
trashmail.com, fakeinbox.com, sharklasers.com,
guerrillamailblock.com, grr.la, dispostable.com
```

**Detection method:**
- Check domain against known disposable provider lists
- Open source lists: `disposable-email-domains` on GitHub (3,000+ domains)
- Hunter.io API returns `disposable: true/false`

**Action:** If disposable → **discard immediately**. No B2B decision maker uses disposable email.

---

## Confidence Scoring System

### Score Assignment

| Confidence | Score Range | Criteria | Action |
|------------|-----------|----------|--------|
| **High** | 90-100% | Verified by SMTP + non-catch-all + found in 2+ sources | Safe to email |
| **Medium** | 70-89% | Pattern match + MX valid + catch-all OR single source | Email with caution |
| **Low** | < 70% | Guessed pattern + no SMTP verification + single source | Verify first or skip |

### Scoring Rules

```
START with base score = 50

ADD points:
  +20  SMTP verified (mailbox confirmed)
  +15  Found by 2+ providers (cross-validated)
  +10  MX records valid
  +10  Non-catch-all domain
  +5   Recent source (< 6 months old)
  +5   Professional domain (not gmail/yahoo/hotmail)

SUBTRACT points:
  -20  Catch-all domain (can't confirm individual)
  -15  Only guessed (pattern match, not verified)
  -10  Single source only
  -10  Source older than 12 months
  -30  Disposable domain (auto-discard)

FINAL score capped at 100
```

### Examples

```
Jane Doe - jane@example.com
  Base:                     50
  + SMTP verified:         +20
  + Found by Apollo+Hunter: +15
  + MX valid:              +10
  + Non-catch-all:         +10
  = TOTAL: 105 → capped at 100 → HIGH confidence

John Smith - john.smith@startup.io
  Base:                     50
  + MX valid:              +10
  + Found by Apollo only:   +0
  - Catch-all domain:      -20
  - Single source:         -10
  = TOTAL: 30 → LOW confidence

Maria Garcia - mgarcia@bigcorp.com
  Base:                     50
  + Found by Hunter (score 85): +0 (not SMTP)
  + MX valid:              +10
  + Non-catch-all:         +10
  - Single source:         -10
  - Guessed pattern:       -15
  = TOTAL: 45 → LOW confidence (needs verification)
```

---

## Hunter.io Verification API

**Recommended approach:** Use Hunter.io's verification API instead of manual SMTP checks.

**Endpoint:**
```
GET https://api.hunter.io/v2/email-verifier?email=jane@example.com&api_key=YOUR_KEY
```

**Response:**
```json
{
  "data": {
    "email": "jane@example.com",
    "result": "deliverable",
    "score": 95,
    "regexp": true,
    "gibberish": false,
    "disposable": false,
    "webmail": false,
    "mx_records": true,
    "smtp_server": true,
    "smtp_check": true,
    "accept_all": false,
    "block": false,
    "sources": [
      {
        "domain": "example.com",
        "uri": "https://example.com/team",
        "extracted_on": "2026-01-15",
        "still_on_page": true
      }
    ]
  }
}
```

**Result values:**
| Result | Meaning | Action |
|--------|---------|--------|
| `deliverable` | Email exists and accepts mail | Safe to email (high) |
| `undeliverable` | Email does not exist | Discard |
| `risky` | Catch-all, full inbox, or temp issue | Email with caution (medium) |
| `unknown` | Server didn't respond clearly | Try again or mark low |

**Mapping to confidence:**
- `deliverable` + `score >= 90` = **high**
- `deliverable` + `score 70-89` = **medium**
- `risky` = **medium** (max)
- `unknown` = **low**
- `undeliverable` = **discard**

**Cost:** 1 verification credit per email. Free plan: 50/mo. Paid: based on plan.

---

## Bulk Verification Strategy

For lists of 100+ contacts:

```
1. Quick filter (free, instant):
   - Syntax check → remove invalid format
   - Disposable check → remove throwaway
   - Expected removal: 5-10%

2. MX check (free, fast):
   - Remove emails with no MX records
   - Expected removal: 2-5%

3. Hunter.io bulk verification (paid):
   - POST https://api.hunter.io/v2/email_count
   - Upload remaining emails
   - Wait for results (async, ~30 min for 100 emails)
   - Expected removal: 10-20%

4. Final classification:
   - High confidence: 60-70% of original list
   - Medium confidence: 15-25%
   - Low confidence: 5-10%
   - Discarded: 10-20%
```

**Tip:** Only send outreach to HIGH confidence emails first. If response rate is good, expand to MEDIUM.

---

## Deliverability Best Practices

### Before Sending Outreach

1. **Warm up your sending domain** (2-4 weeks before cold outreach)
2. **SPF, DKIM, DMARC** records configured on your domain
3. **Start slow:** 20-30 emails/day, increase by 10/day
4. **Monitor bounce rate:** > 5% = stop and clean list

### Bounce Handling

| Bounce Type | Meaning | Action |
|-------------|---------|--------|
| Hard bounce (550) | Mailbox doesn't exist | Remove permanently |
| Soft bounce (452) | Inbox full or temp issue | Retry in 7 days, then remove |
| Block (554) | Your IP/domain blocked | Check blacklists, warm up again |

### Email List Hygiene

- Re-verify list every 90 days (people change jobs)
- Remove hard bounces immediately
- Track and remove unsubscribes
- Monitor spam complaint rate (< 0.1% target)

---

*Un email verificado vale 10x mas que uno adivinado. Nunca saltarse la verificacion.*
