---
name: connect-api
description: Connect a client to an external API (GA4, GSC, Meta Ads, HubSpot, Stripe, etc.) via Mission Control. Use when user says connect, conecta, conectar, link, vincular, integrar followed by an API name or service. Also triggers on "quiero conectar", "necesito conectar", "configura la API de", "añade", "enlaza". NEVER ask for credentials in chat — always redirect to the Mission Control connect page.
---

# Connect API Skill

## Security Rules (P0 — NO EXCEPTIONS)
1. **NEVER ask for API keys, tokens, secrets, or credentials in chat**
2. **NEVER accept credentials pasted in chat** — respond with: "⚠️ No compartas credenciales por chat. Usa Mission Control: [link]"
3. **ALL credential handling happens in Mission Control** via HTTPS + Tailscale

## Flow

### Step 1: Identify client and API

Parse the user's request to extract:
- **Client slug**: from context (current guild → `clients.json`) or explicit mention
- **API name**: map to catalog ID

API name mapping (common names → catalog IDs):
- google analytics, ga4, analytics → `ga4`
- search console, gsc → `gsc`
- meta ads, facebook ads, instagram ads → `meta_ads`
- google ads, adwords → `google_ads`
- hubspot → `hubspot`
- stripe → `stripe`
- pipedrive → `pipedrive`
- gohighlevel, ghl, highlevel → `ghl`
- linkedin ads → `linkedin_ads`
- tiktok ads → `tiktok_ads`
- posthog → `posthog`
- instantly → `instantly`
- lemlist → `lemlist`
- slack → `slack`
- notion → `notion`
- metricool → `metricool`
- amplitude → `amplitude`
- apify → `apify`
- dataforseo → `dataforseo`
- supabase → `supabase`
- openai, gpt → `openai`
- anthropic, claude → `anthropic`
- gemini → `gemini`
- openrouter → `openrouter`
- xai, grok → `xai`
- firecrawl → `firecrawl`
- serper → `serper`
- brave search → `brave`

### Step 2: Validate API exists

Read `skills/acquisition-metrics-plan/schemas/api-catalog.json` and check if the API ID exists in any category.

- **If exists** → continue to Step 3
- **If not found** → respond: "Esa API ({name}) no está en nuestro catálogo. Si la necesitas, dime y la añadimos."

### Step 3: Generate link and respond

Base URL: `https://sancho-cmo.taild48df2.ts.net/mc/connect/{slug}/{apiId}`

Respond with ONLY the link and a one-liner. Example:

> 👉 https://sancho-cmo.taild48df2.ts.net/mc/connect/growth4u/ga4
> Ahí tienes las instrucciones y el formulario para conectarlo.

**Do NOT:**
- Explain how to get API keys
- List manual steps
- Offer to "help configure" via chat
- Ask what credentials they have

### Step 4: If client slug is unclear

If you can't determine the client from context:
- Check `clients.json` for the current guild
- If still unclear, ask: "¿Para qué cliente quieres conectar {API}?"

## Multiple APIs at once

If the user asks to connect multiple APIs, generate all links:

> 👉 GA4: https://sancho-cmo.taild48df2.ts.net/mc/connect/{slug}/ga4
> 👉 GSC: https://sancho-cmo.taild48df2.ts.net/mc/connect/{slug}/gsc
> 👉 Meta Ads: https://sancho-cmo.taild48df2.ts.net/mc/connect/{slug}/meta_ads

## System Service Account (Google APIs)

GA4, GSC, and Google Ads use a shared system Service Account. The email is loaded automatically on the connect page. The client only needs to:
1. Give "Viewer" access to the SA email in their Google service
2. Provide the non-sensitive config (Property ID, Site URL, etc.)
