---
name: alarife-integration
description: Operate Alarife Payload from Sancho. Use when creating, importing, exporting, editing, previewing, publishing, or auditing sites/pages in Alarife Payload; when user says "exporta a Alarife", "Alarife Payload", "Payload", "cambia el diseño", "importa un sitio", "crea una landing", "publica", or "preview".
---

# Alarife Payload Integration

Alarife Payload is the production CMS/site builder for Growth4U. Sancho operates it through a narrow API and, when changing the Alarife codebase itself, through the official Payload skills installed in this workspace.

## Official Payload Skills

These skills are installed in `skills/` from `payloadcms/skills`:

- `payload` — use for Payload CMS code work: collections, fields, hooks, access control, REST/GraphQL, Local API, plugins, transactions, jobs, MCP.
- `cms-migration` — use when designing Payload collections from source CMS exports or planning migrations from Webflow, WordPress, Contentful, Strapi, Sanity, CSV, or JSON.

Use `alarife-integration` for live Alarife operations. Use `payload`/`cms-migration` when the task requires changing Payload implementation or designing schemas.

## Production Connection

- Base URL: `https://alarife-payload.growth4u.io`
- Admin: `https://alarife-payload.growth4u.io/admin`
- Auth env var: `SANCHOCMO_ALARIFE_PAYLOAD_API_KEY`
- Fallback env vars: `ALARIFE_PAYLOAD_API_KEY`, `SANCHOCMO_ALARIFE_API_KEY`
- Config source: `brand/sanchocmo/integrations.json`

Never ask users for API keys in chat. If the key is missing, tell them to configure it in Mission Control or the local Sancho env.

## Capabilities Available Now

Alarife Payload API supports:

- Sites/clients: list/create.
- Pages: list/create/read/update/delete.
- Page status: draft or published.
- Import generated HTML: `POST /api/clients/{clientId}/import/save`.
- Import one URL: `POST /api/clients/{clientId}/import`.
- Crawl/discover URLs from sitemap: `POST /api/clients/{clientId}/import/crawl`.
- Preview rendered HTML: `GET /api/clients/{clientId}/pages/{pageId}/preview`.
- Legacy Example alias: `7SRxn8rDeE3PWEi-oQjle` resolves to `example`.

Not available yet:

- Visual drag-and-drop editing.
- Batch ZIP/folder upload.
- Legacy separate endpoints for domains, blog-posts, partner-lps, funnels, experiments.
- Automatic link-management UI.

If a user asks for unsupported features, use the closest supported workflow and say what remains manual or pending.

## Helper Script

Use the bundled helper instead of hand-writing curl when possible:

```bash
python3 skills/alarife-integration/scripts/alarife_payload_api.py clients
python3 skills/alarife-integration/scripts/alarife_payload_api.py pages example
python3 skills/alarife-integration/scripts/alarife_payload_api.py create-page example --json /tmp/page.json
python3 skills/alarife-integration/scripts/alarife_payload_api.py update-page example <pageId> --json /tmp/patch.json
python3 skills/alarife-integration/scripts/alarife_payload_api.py preview example <pageId> --out /tmp/preview.html
python3 skills/alarife-integration/scripts/alarife_payload_api.py import-url example https://example.com/page --target-path /page
python3 skills/alarife-integration/scripts/alarife_payload_api.py import-save example --json /tmp/import-save.json
python3 skills/alarife-integration/scripts/alarife_payload_api.py delete-page example <pageId>
```

The script reads `.env` from the current shell and `brand/sanchocmo/.env`.

## Workflow: Export a Sancho Site to Alarife Payload

1. Identify the target client/site slug. Use an existing slug when possible (`example`, `growth4u`, etc.).
2. If the site does not exist, create it with `POST /api/clients`.
3. Convert each page to one `raw_html` section:
   - `title`
   - `path` or `slug`
   - `category`
   - `status: "draft"`
   - `sections[0].type: "raw_html"`
   - `sections[0].config.html`
   - optional `sections[0].config.css`
4. Save each page with `/import/save` or `/pages`.
5. Request preview for every changed page.
6. Share previews for human review.
7. Publish only after explicit approval.

For a whole static site, export page by page. There is no single folder upload endpoint yet.

## Workflow: Import an Existing Site

1. Run `crawl` against the source URL to discover sitemap URLs.
2. Confirm scope if many URLs are found.
3. Import pages one by one with `import-url`.
4. Keep pages in draft unless the user explicitly asked to publish.
5. Preview the most important pages: `/`, pricing/product pages, contact, legal, conversion pages.
6. Report imported count, failures, and preview links.

## Workflow: Design Changes on a Payload Page

1. List pages for the client and find the page by path/title.
2. Read the page.
3. Detect page structure:
   - `raw_html` block: edit `config.html` and/or `config.css`.
   - structured block: edit the specific fields only.
4. Preserve imported assets and runtime fields:
   - `headLinks`
   - `bodyScripts`
   - `navbarHtml`
   - `sourceOrigin`
   - image/font URLs
5. Save as draft.
6. Render preview and inspect the HTML or screenshot when possible.
7. Publish only after explicit approval.

Do not rewrite the entire page for a small design request. Make targeted changes.

## Safety Rules

- Draft-first always.
- No publish without explicit approval.
- No delete unless the user explicitly says delete/remove.
- Never paste API keys or secrets into chat.
- Preserve source fonts, images, scripts, tracking tags, and legal links.
- For imported Webflow/raw HTML pages, avoid "cleanup" refactors unless requested.
- If editing production content, state what page/path changed and provide preview.
- If the requested change is a platform feature, update Alarife code using the `payload` skill, then deploy Alarife normally.

## API Shapes

Create/update page:

```json
{
  "title": "Landing",
  "path": "/landing",
  "category": "landing",
  "status": "draft",
  "metaTitle": "SEO title",
  "metaDescription": "SEO description",
  "sections": [
    {
      "type": "raw_html",
      "name": "Page",
      "config": {
        "html": "<main>...</main>",
        "css": ".hero { ... }",
        "scopeClass": ""
      }
    }
  ]
}
```

Import generated HTML:

```json
{
  "detectedType": "page",
  "data": {
    "title": "Landing",
    "slug": "landing",
    "category": "landing",
    "status": "draft",
    "sections": [
      {
        "type": "raw_html",
        "config": {
          "html": "<main>...</main>"
        }
      }
    ]
  }
}
```

## Response Pattern

When done, report:

- Client/site slug.
- Pages changed/imported.
- Draft/published status.
- Preview URL or preview endpoint.
- Any unsupported part or manual review needed.

Keep internal API details and secrets out of client channels.
