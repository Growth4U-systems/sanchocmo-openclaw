# Waterfall Enrichment Providers Guide

> Guia completa de proveedores de datos para enriquecimiento de contactos.
> Ordenados por tier de prioridad. Waterfall = probar en orden, parar al primer resultado verificado.

---

## Waterfall Logic

```
EMAIL WATERFALL:
  Apollo.io → Hunter.io → SignalHire → Snov.io → STOP

PHONE WATERFALL:
  SignalHire → Lusha → ZoomInfo → STOP

SOCIAL WATERFALL:
  LinkedIn (ya disponible del decision-maker-finder) → Twitter/X (WebSearch) → STOP
```

**Principio:** Empezar por el proveedor con mejor ratio coste/volumen. Escalar a proveedores premium solo cuando los anteriores fallan.

---

## Tier 1 — Email Finding

### Apollo.io

| Attribute | Value |
|-----------|-------|
| Method | Database (600M+ contacts) |
| Accuracy | ~80% |
| Pricing | Free: 50 credits/mo. Paid: $59/mo (5,000 credits) |
| Best for | Volume email finding, first pass in waterfall |

**API Endpoint:**
```
POST https://api.apollo.io/v1/people/match
```

**Auth:** API key in header `X-Api-Key`

**Request:**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "organization_name": "Example Corp",
  "domain": "example.com"
}
```

**Response (relevant fields):**
```json
{
  "person": {
    "email": "jane.doe@example.com",
    "email_status": "verified",
    "phone_numbers": [
      { "raw_number": "+34612345678", "type": "mobile" }
    ],
    "linkedin_url": "https://linkedin.com/in/janedoe",
    "twitter_url": "https://twitter.com/janedoe",
    "title": "VP Marketing",
    "organization": {
      "name": "Example Corp",
      "website_url": "https://example.com"
    }
  }
}
```

**Rate Limits:**
- Free: 50 requests/day
- Paid: 100 requests/minute
- Bulk endpoint: up to 10 people per request

**Notes:**
- `email_status` values: `verified`, `guessed`, `unavailable`
- Solo confiar en `verified`. Tratar `guessed` como medium confidence.
- Apollo tambien devuelve phone — bonus si sale en primer paso.

---

### Hunter.io

| Attribute | Value |
|-----------|-------|
| Method | Domain-based pattern matching + public sources |
| Accuracy | ~85% |
| Pricing | Free: 25 searches/mo. Paid: $49/mo (500 searches) |
| Best for | Pattern-based email finding, email verification |

**API Endpoint — Email Finder:**
```
GET https://api.hunter.io/v2/email-finder
```

**Auth:** API key as query parameter `api_key`

**Request:**
```
GET https://api.hunter.io/v2/email-finder?domain=example.com&first_name=Jane&last_name=Doe&api_key=YOUR_KEY
```

**Response (relevant fields):**
```json
{
  "data": {
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane.doe@example.com",
    "score": 91,
    "domain": "example.com",
    "position": "VP Marketing",
    "sources": [
      {
        "domain": "example.com",
        "uri": "https://example.com/team",
        "extracted_on": "2026-01-15"
      }
    ],
    "verification": {
      "status": "valid",
      "date": "2026-02-20"
    }
  }
}
```

**API Endpoint — Email Verification:**
```
GET https://api.hunter.io/v2/email-verifier?email=jane@example.com&api_key=YOUR_KEY
```

**Verification Response:**
```json
{
  "data": {
    "email": "jane@example.com",
    "result": "deliverable",
    "score": 95,
    "mx_records": true,
    "smtp_server": true,
    "smtp_check": true,
    "accept_all": false,
    "disposable": false,
    "webmail": false
  }
}
```

**Rate Limits:**
- Free: 25 searches/mo, 50 verifications/mo
- Paid: Based on plan (500-50,000/mo)
- API: 10 requests/second

**Notes:**
- `score` field: 0-100. Treat 90+ as high, 70-89 as medium, <70 as low.
- Hunter es el mejor para VERIFICAR emails encontrados por otros proveedores.
- Domain search tambien disponible para listar todos los emails de un dominio.

---

### SignalHire

| Attribute | Value |
|-----------|-------|
| Method | Multi-source aggregation (LinkedIn, public records, databases) |
| Accuracy | ~90% |
| Pricing | $99/mo (500 credits) |
| Best for | Highest accuracy, phone numbers included |

**API Endpoint:**
```
POST https://www.signalhire.com/api/v1/candidate/search
```

**Auth:** API key in header `apitoken`

**Request:**
```json
{
  "items": [
    {
      "linkedin_url": "https://linkedin.com/in/janedoe"
    }
  ]
}
```

**Response (relevant fields):**
```json
{
  "items": [
    {
      "fullName": "Jane Doe",
      "emails": [
        {
          "value": "jane.doe@example.com",
          "type": "professional",
          "isVerified": true
        },
        {
          "value": "jane.doe@gmail.com",
          "type": "personal",
          "isVerified": true
        }
      ],
      "phones": [
        {
          "value": "+34612345678",
          "type": "mobile",
          "isVerified": true
        }
      ]
    }
  ]
}
```

**Rate Limits:**
- 1 credit per person (includes email + phone)
- API: 5 requests/second
- Batch: up to 50 items per request

**Notes:**
- LinkedIn URL es el mejor input para SignalHire (mas preciso que name+company).
- Devuelve BOTH professional y personal emails — usar solo professional para outreach B2B.
- Excelente para phones — primer proveedor en el waterfall de telefono.

---

### Snov.io

| Attribute | Value |
|-----------|-------|
| Method | Multi-source (crawling, databases, pattern detection) |
| Accuracy | ~82% |
| Pricing | Free: 50 credits/mo. Paid: $39/mo (1,000 credits) |
| Best for | Budget-friendly fallback, good API |

**API Endpoint — Email Finder:**
```
POST https://api.snov.io/v1/get-emails-from-name
```

**Auth:** OAuth2 access token

**Get Token:**
```
POST https://api.snov.io/v1/oauth/access_token
Body: { "grant_type": "client_credentials", "client_id": "YOUR_ID", "client_secret": "YOUR_SECRET" }
```

**Request:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "domain": "example.com"
}
```

**Response (relevant fields):**
```json
{
  "success": true,
  "data": {
    "firstName": "Jane",
    "lastName": "Doe",
    "emails": [
      {
        "email": "jane.doe@example.com",
        "emailStatus": "valid"
      },
      {
        "email": "jdoe@example.com",
        "emailStatus": "unverifiable"
      }
    ]
  }
}
```

**Rate Limits:**
- Free: 50 credits/mo
- API: 60 requests/minute
- Email verification: separate credits

**Notes:**
- `emailStatus` values: `valid`, `invalid`, `unverifiable`, `unknown`
- Snov.io tambien ofrece drip email campaigns (útil para siguiente paso: outreach).
- Buen precio para startups. Ultimo recurso en waterfall.

---

## Tier 2 — Phone Finding

### SignalHire (Phone)

Ya descrito arriba. Primer paso en waterfall de telefono.

- **Type:** Mobile + direct dial
- **Accuracy:** ~85%
- **Cost:** Incluido en los credits de email (1 credit = email + phone)
- **Best for:** Primer intento de telefono. LinkedIn URL como input.

---

### Lusha

| Attribute | Value |
|-----------|-------|
| Type | Mobile + direct dial |
| Accuracy | ~80% |
| Pricing | Free: 50 credits/mo. Paid: $49/mo (480 credits) |
| Best for | Direct dials for sales teams |

**API Endpoint:**
```
POST https://api.lusha.com/person
```

**Auth:** API key in header `api_key`

**Request:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "company": "Example Corp",
  "property": "phoneNumbers"
}
```

**Response:**
```json
{
  "data": {
    "phoneNumbers": [
      {
        "internationalNumber": "+34612345678",
        "countryCallingCode": "+34",
        "type": "mobile_phone",
        "label": "direct"
      }
    ]
  }
}
```

**Rate Limits:**
- 1 credit per person per property (email or phone)
- API: 300 requests/minute

---

### ZoomInfo

| Attribute | Value |
|-----------|-------|
| Type | Direct dial + mobile (enterprise database) |
| Accuracy | ~90% |
| Pricing | $$$$ (enterprise pricing, starts ~$15K/year) |
| Best for | Enterprise sales teams with budget |

**API Endpoint:**
```
POST https://api.zoominfo.com/search/contact
```

**Auth:** OAuth2 Bearer token

**Request:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "companyName": "Example Corp",
  "outputFields": ["phone", "directPhone", "mobilePhone"]
}
```

**Notes:**
- ZoomInfo es enterprise. Solo usar si el cliente ya tiene suscripcion.
- Mejor accuracy del mercado para direct dials en EEUU/Europa.
- NO recomendado para startups o PYMES por coste.

---

## Cost Comparison Per Contact

| Provider | Email Cost | Phone Cost | Total (email+phone) |
|----------|-----------|------------|---------------------|
| Apollo.io (paid) | ~$0.012 | Included | ~$0.012 |
| Hunter.io (paid) | ~$0.098 | N/A | ~$0.098 |
| SignalHire | ~$0.198 | Included | ~$0.198 |
| Snov.io (paid) | ~$0.039 | N/A | ~$0.039 |
| Lusha (paid) | ~$0.102 | ~$0.102 | ~$0.204 |
| ZoomInfo | N/A | Enterprise pricing | $$$ |

**Recommended Budget por 100 contactos:**
- Email only: ~$5-15 (Apollo + Hunter waterfall)
- Email + Phone: ~$20-40 (Apollo + Hunter + SignalHire)
- Full enrichment: ~$30-60 (all providers in waterfall)

---

## Waterfall Implementation

### Email Waterfall (Step by Step)

```
FOR each contact IN decision_makers_list:

  1. TRY Apollo.io
     IF email_status == "verified" → ACCEPT (high confidence)
     IF email_status == "guessed" → MARK pending_verification
     IF no result → CONTINUE

  2. TRY Hunter.io
     IF score >= 90 → ACCEPT (high confidence)
     IF score >= 70 → MARK pending_verification
     IF no result → CONTINUE

  3. TRY SignalHire
     IF isVerified == true → ACCEPT (high confidence)
     IF found but unverified → MARK pending_verification
     IF no result → CONTINUE

  4. TRY Snov.io
     IF emailStatus == "valid" → ACCEPT (medium confidence)
     IF emailStatus == "unverifiable" → MARK low confidence
     IF no result → MARK as "not_found"

  5. VERIFY all "pending_verification" emails via Hunter.io verification API

END FOR
```

### Phone Waterfall (Step by Step)

```
FOR each contact WHERE phone_requested:

  1. CHECK Apollo response (may already have phone from email step)
     IF phone found → ACCEPT

  2. TRY SignalHire (may already have from email step)
     IF phone found AND isVerified → ACCEPT
     IF no result → CONTINUE

  3. TRY Lusha
     IF phone found → ACCEPT
     IF no result → CONTINUE

  4. TRY ZoomInfo (only if client has subscription)
     IF phone found → ACCEPT
     IF no result → MARK as "not_found"

END FOR
```

---

## Provider Setup Checklist

| Provider | Sign Up | API Key Location | Free Tier |
|----------|---------|-----------------|-----------|
| Apollo.io | app.apollo.io | Settings > Integrations > API | 50 credits/mo |
| Hunter.io | hunter.io | API > Your API key | 25 searches/mo |
| SignalHire | signalhire.com | Account > API | No free tier |
| Snov.io | snov.io | Account > API | 50 credits/mo |
| Lusha | lusha.com | Settings > API | 50 credits/mo |
| ZoomInfo | zoominfo.com | Contact sales | No free tier |

**Minimum viable setup:** Apollo.io (free) + Hunter.io (free) = 75 searches/month at $0.

---

*Waterfall enrichment maximiza found rate mientras minimiza coste. Siempre empezar por el proveedor mas barato/con mas volumen.*
