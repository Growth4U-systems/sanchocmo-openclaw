# Changelog

## [0.5.0](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.4.2...v0.5.0) (2026-06-10)


### Features

* add Sancho MCP server ([cf7f787](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/cf7f7877ffa07689d87393d74b03137af9fbe0eb))
* add Sancho MCP task write tools (SAN-64) ([#314](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/314)) ([5d44d5d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5d44d5d88c3314fed3cdc47a511f7da84d7717fe))
* **agents:** roster v4.1 — merge Yalc into Rocinante + promote Alarife to full agent (SAN-116) ([#391](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/391)) ([855ae5d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/855ae5da61f9f0c8c6af78f84bd8ede9a78edbd7))
* **comments:** SAN-15 — commented-snapshot model with file-side append ([#232](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/232)) ([d165220](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d1652209f4cd5d5127372acbb447941a57bc0897))
* **comments:** SAN-15 — inline anchor highlights, hover tooltip, detail modal, edit/delete ([#231](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/231)) ([25545d7](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/25545d7ef4cb55bedbffc7d0fe888677cd1f781b))
* **comments:** SAN-15 — internal Mission Control doc viewer overlay + Sancho protocol ([#234](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/234)) ([98a743d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/98a743dff06f5634273d8573ba210137cf58a0d4))
* **comments:** SAN-15 PR1 — schema, endpoints, and helper for shared doc comments ([#228](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/228)) ([6264d42](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6264d427ada0cc88f11a2e82dd76fbe9d30528e7))
* **comments:** SAN-15 PR2 — public comments UI on /share/[token] ([#229](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/229)) ([d32c881](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d32c88136a7731a111cb6e7a347cb2cd33c74442))
* configurable admin domain (ADMIN_EMAIL_DOMAIN) ([#208](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/208)) ([7ef3228](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7ef3228478652cd739584fe75de3baa2299dbb95))
* dual model auth (api_key | subscription) for Anthropic and OpenAI ([#219](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/219)) ([58f98a7](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/58f98a7b716d1522775aef7bee85b94d8924cf76))
* **foundation:** declare and route owner agent per Foundation thread (SAN-102) ([#352](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/352)) ([2fe886f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2fe886ff609f43d3e95e6c4134ba503ad132648e))
* **intelligence+agents:** provider preflight + /deep-research routing + wire Hamete (SAN-100, SAN-101) ([#358](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/358)) ([952c73b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/952c73b63aefec42e4ff60969160b7e8bf01e4b0))
* **internal-api:** include client metrics summary in /status ([#336](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/336)) ([01f384e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/01f384ed6b14fa4bbca77764a4906b7652e20c64))
* **packaging:** bundled local Postgres with conditional driver (B9) ([#366](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/366)) ([a6a0274](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/a6a02746376da2698adb22c98d0974663dcf0c31))
* **packaging:** configurable cron publish channel (Slack, extensible) — D5 + D5b UI ([#372](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/372)) ([5e4c3ab](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5e4c3ab4c17e347cf906966aea0989f89b31df23))
* **packaging:** one-command install.sh + setup wizard (Fase 4/6) ([#331](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/331)) ([19a587f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/19a587ff6af6f2fbe4e63c78a9eefcdbdb9e1808))
* **packaging:** self-contained image — seed OpenClaw home from the image ([#369](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/369)) ([854c599](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/854c599652cbd959d3ef8d699570581bb86706e1))
* SAN-36 add YALC outbound publish flow ([fe22a49](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fe22a49bf9dd7966cc9aeb36cd16c0d2e6cae3b1))
* SAN-36 add YALC outbound publish flow ([2a070af](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2a070af2a2ac2225ef85c131b3bbac0791715178))
* **settings:** remove system API keys from the UI ([#392](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/392)) ([ea93573](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ea93573c5be7701b943d73bfdcd9fcd089e910b8))
* **settings:** staging-only "Sync with Prod" data sync (A/B/C) ([#401](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/401)) ([5bfb84f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5bfb84ff4b523ccea5d8d7030fbdd3722caa9e7a))
* surface YALC provider keys in API settings ([fa514f5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fa514f5e1c9d3a9001fad774759067a34a7e4280))
* surface YALC provider keys in API settings ([3ed538b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3ed538b330d0f53d12a8a1ec45f2f5754a829438))
* **yalc:** auto-provision each brand's YALC brain from Sancho ([3456a0e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3456a0e9ee5105fa72c208ffba08ab7a99544319))
* **yalc:** auto-provision each brand's YALC brain from Sancho (no CLI) ([1a6afa5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/1a6afa55c9b27725c18f5e638fbdfb28d97d981d))
* **yalc:** sync approved Foundation docs into each brand's YALC brain ([#429](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/429)) ([f3d38c7](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f3d38c768fe57989239b6b10c304e4844e214dbc))


### Bug Fixes

* **auth:** route gateway Anthropic calls through Claude subscription + extra-usage alert ([#388](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/388)) ([bc69383](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/bc693839dd61f843191f54fe2b46c752855d6621))
* avoid duplicate YALC API catalog entries ([2a51870](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2a51870590b0b3437487a3c588b152207d656525))
* avoid duplicate YALC API catalog entries ([3127d96](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3127d96ec9081897235c49fade978f17ed935f7c))
* **chat:** alias *-analysis pillars to *-intelligence skills (SAN-98) ([#348](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/348)) ([aa37af2](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/aa37af22bebd0775d7439a37e6c6d4924f675421))
* **comments:** SAN-15 — drop commented sibling when no comments, clean title and render ([#233](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/233)) ([f828821](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f828821e9f02383cfdbdba1336df8eb90794524b))
* **comments:** SAN-15 PR2 — popup dismissal + viewport-relative positioning ([#230](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/230)) ([c6ca083](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/c6ca0839defbaaa2ea670fc70aa4f05040b3b23c))
* **content:** guard Ideas tab against ideas missing content_type ([#342](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/342)) ([9aecff6](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9aecff683c526aa6b21581f84f29a164f693a818))
* **content:** guard Ideas tab against ideas missing content_type ([#342](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/342)) ([650af77](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/650af775c5732753298f13ca4842dd91208541b2))
* **dashboard:** redirect non-admins to their client dashboard (SAN-99) ([#347](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/347)) ([8a1ae32](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/8a1ae32ed4cfecd2f769a071e3e7e5c31586d1ca))
* **deploy:** inject YALC_BASE_URL into prod/staging .env ([eaf631c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/eaf631c365d4e2eec6ede35c7cfae56d7e5a32f8))
* **deploy:** inject YALC_BASE_URL so the cockpit never falls back to localhost ([8b1e99e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/8b1e99e899579910e1ca8fca356eb0673338dea3))
* **deploy:** self-heal stray src/ edits before tag checkout ([227b3bc](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/227b3bc5b43ec179f1ac4ec57ee2ebdb907eb6f5))
* **deploy:** self-heal stray src/ edits before tag checkout ([252a293](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/252a2932fb39a85b9d0c882927e9e8779acd10ee))
* force staging deploy to serve built image ([b4aa612](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b4aa612c9adc8606545b2cbc98d62d6dd75fbe32))
* **foundation:** SAN-27 decouple Full from Fast + add reseed script + chat timeout fix ([#226](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/226)) ([1462c0a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/1462c0af15b8419bb42d9ec903522750bbfbfe1a))
* include drizzle config in staging image ([14e5d9c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/14e5d9cf59ff29047463950f03b9eebdc0ace183))
* keep staging deploy heredoc after migration ([18ec48d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/18ec48db51454eac02ad113ecf6330e59709727b))
* **lint:** clear 60 pre-existing lint errors + make pre-push lint blocking ([#322](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/322)) ([e308197](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e30819708523c9e506e412d3a7624ba124493fb6))
* **models:** correct cron model arg + validate availability before persist ([#218](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/218)) ([3d45ddc](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3d45ddc98a9917d93e70776f4b554a2028fdfc12))
* **packaging:** wizard wrote duplicate DATABASE_URL for local-db (B9 follow-up) ([#367](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/367)) ([2293ec5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2293ec506e24fafd043d51ec102e2e6d73f9eb90))
* prevent mc chat long generation aborts ([#201](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/201)) ([e208553](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e208553e1f6354a3a01b9df461fa71eda17726d7))
* run API connection tests in workspace path ([ce6c04b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ce6c04b8c31363075fb8cf0674a74855fb8d8af3))
* run staging migrations without app entrypoint ([10717ba](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/10717ba2dc89b4676e49293542c6be38c65b9a45))
* SAN-36 avoid stale chat cancel swallowing replies ([3e449e4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3e449e4c2d123f716b058bd67a937eb3cdfcee3c))
* SAN-36 avoid stale chat cancel swallowing replies ([17f9819](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/17f98197997eca147ad344e37d7d6ee303b8c2fd))
* SAN-36 harden mc-chat YALC dispatch ([#254](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/254)) ([6407f43](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6407f433b962fea4362a934460ceb1e4b6ffd86a))
* SAN-36 harden mc-chat YALC dispatch ([#254](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/254)) ([7d6ea12](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7d6ea12c03ef364ccf338913fb9c24f369c09e89))
* SAN-36 keep YALC chat responsive ([1114505](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/11145056fc607719c41a6376e7abf4c2a8eae6bc))
* SAN-36 keep YALC chat responsive ([91b2f42](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/91b2f42827ee95035602df222986fdc7a63974d9))
* SAN-36 route chat cancel to selected agent ([0bbdb86](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/0bbdb86aff3d2edb0cebd502dd07908f600cad33))
* SAN-36 route chat cancel to selected agent ([078fa87](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/078fa87f2cf62d498ab9d953ea7a46970cfdc365))
* SAN-36 route outbound campaigns through YALC drafts ([#262](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/262)) ([46ea6b9](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/46ea6b92cf386b45152baec966727804510a7d1f))
* SAN-36 route outbound campaigns through YALC drafts ([#262](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/262)) ([fe29b2d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fe29b2dfcb9ce222e338bbbe5062dcf8d9c4b332))
* SAN-36 run YALC on Anthropic ([#256](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/256)) ([0acd8ad](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/0acd8adfc2ea8c2ffb4ca74fd7b258ee01b994fb))
* SAN-36 run YALC on Anthropic ([#256](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/256)) ([eca30f7](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/eca30f70a4912745763571da55a8c648c781351b))
* SAN-36 run YALC on GPT-5.5 ([#255](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/255)) ([d44b238](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d44b2389e71a6a8555982e69c0e22c81a25c6a20))
* SAN-36 run YALC on GPT-5.5 ([#255](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/255)) ([146375a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/146375a80148c0c36a528080d9c533799094f186))
* SAN-36 show YALC email sequence drafts ([#293](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/293)) ([deeaeb4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/deeaeb42f51f716e630236d0a3dc803efb273ebe))
* SAN-36 show YALC email sequence drafts ([#293](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/293)) ([7ec35a5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7ec35a53e3c9823a4a7faa27463051e77cb81749))
* Sancho skills — Apify scraping, run timeouts, chat→owner-agent routing (SAN-98) ([#343](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/343)) ([f58f37b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f58f37bf1b54a157c34e88dff6e7b99994c61df3))
* use safe MCP audit migration runner ([0931459](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/0931459a250eea2244384e914c6c39e115bf12c3))
* **yalc:** add explicit campaign lifecycle commands ([bec2ba5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/bec2ba5abd30d8dc17541795fa3cea979356501c))
* **yalc:** add explicit campaign lifecycle commands ([f834da9](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f834da966a4b928337aaf226fedb1cbdc111469a))
* **yalc:** scope every Sancho-&gt;YALC call to the brand tenant ([2a29418](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2a29418ebe450daf51cbc2742488c994a7300e8e))
* **yalc:** scope every Sancho→YALC call to the brand tenant ([2b193ed](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2b193ed3a630047eaf67b7be3f308b09b64c9ef0))

## [0.4.2](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.4.1...v0.4.2) (2026-05-27)

### Bug Fixes

* **deploy:** keep production startup alive when optional agent registration fails during setup

## [0.4.1](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.4.0...v0.4.1) (2026-05-27)

### Bug Fixes

* **models:** promote SAN-5/SAN-6 model assignment fixes to production ([#194](https://github.com/Growth4U-systems/sanchocmo-openclaw/pull/194))
* **models:** route Anthropic models through the Claude subscription profile instead of API-key auth
* **settings:** expose system API/subscription status and keep agent model selectors aligned with the effective model

## [0.4.0](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.3.0...v0.4.0) (2026-05-26)

> First feature release after the staging → production cutover. Promotes the work that accumulated on `staging` since v0.3.0.

### Features

* **auth:** multi-client access + integral user management ([#160](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/160), [#162](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/162))
* **access:** redirect non-admins off admin views + "Colaborador" role label ([#163](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/163))
* **sidebar:** scoped scroll, collapse toggle, version + STAGING tag ([#165](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/165))
* **scripts:** `resync-staging-to-prod.sh` for gradual-cutover data sync ([#166](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/166), [#170](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/170))
* **chat:** elapsed-time indicator on "Sancho está pensando" ([#154](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/154))
* **ci:** release-please via PAT + `target-branch: main`; auto-sync release version files main → staging

### Bug Fixes

* **content-engine:** stop false cron errors from jq + wrong MC_BASE port ([#169](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/169))

## [0.3.0](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.2.0...v0.3.0) (2026-05-26)

> **Staging → Production cutover.** This release promotes the full staging
> codebase (the de-facto production instance) to the production VPS. The
> auto-generated entries below only list the two commits that lived solely
> on `main` since `v0.2.0`; the bulk of the work summarized here was
> developed on `staging` and ships to production for the first time now.

### Cutover highlights (work shipped to production)

- **Content Engine** — POV Bank moved to Neon (pillars, evidence, update proposals); content-creation pipeline (strategy → pillars → setup → POV → visual templates); per-brand cron seeding (news/PAA/thief-marketers monitors); per-cron model picker; empty-state UI when a brand has no Content Engine project.
- **Meeting Intelligence** — meetings, insights, recommendations and document-impact tracking surfaced internally (`mi_*` tables).
- **Mission Control (Next.js)** — faithful UI migration (Foundation, Projects, Ideas, Trust Engine, Metrics, Dashboard V2); chat progress timeline with live elapsed ticker and sealed-event timestamps; normalized runtime error messages with technical-detail modal.
- **Multi-client & admin** — external admin allowlist via `clients.json`; settings split by brand vs all-clients; cross-brand recurring-cron panel at `/dashboard/admin/settings` with live status, manual run and diagnostics; APIs tab in admin settings.
- **YALC / GTM-OS** — YALC cockpit + staging service, provider-connect UI, operator integration, runtime-capability mapping, Sancho live-status API.
- **Open Design** — versioned nginx vhost + documented setup; `ANTHROPIC_API_KEY` passthrough with preserve-key flag for the baked-in CLI.
- **Infra / Deploy** — CI/CD split into staging (auto) and prod (manual); GitHub-Environment-managed secrets via `upsert-env.py` + `load-secrets-from-env.sh`; YALC overlay in deploy workflows; `MC_TASKS_BACKEND` + `DATABASE_URL` wired through Compose; snapshot watchdog + backup crons.

_~38 features and ~65 fixes accumulated on `staging` since v0.2.0 are included. See the [v0.2.0…v0.3.0 compare](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.2.0...v0.3.0) for the full commit list._

### Features

* **skills:** add Alarife Payload operator ([7c1f9e2](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7c1f9e2c30f363daa4c75becf907312d41f290fc))


### Bug Fixes

* **chat:** wrap long URLs inside message bubble ([#144](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/144)) ([9c5ce02](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9c5ce02ec94dea810a9e0062f874ee873370922c))

## [0.2.0](https://github.com/Growth4U-systems/sanchocmo-openclaw/compare/v0.1.0...v0.2.0) (2026-05-12)


### Features

* add CLAUDE.md for Cervantes Claude Code migration ([b14bcdf](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b14bcdff69797a215a87b34449d698d63baf2c0a))
* add Discord webhook fallback for operational alerts ([99bd1ba](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/99bd1babf704560d12375648c18797adbdb8b71c))
* add docker-compose.yml for VPS deployment (Phase 3) ([fced4b4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fced4b4ae7c154e6985f1df97e95996b65d152a5))
* add Dockerfile for OpenClaw VPS container (Phase 3) ([66712f0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/66712f054864a59a1c62767f1b5bdb278228cdaf))
* add entrypoint.sh for container startup sequence (Phase 3) ([9dd2f28](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9dd2f287664d796d274ccb76b386ddda2f9fcd79))
* add executable scripts to niche-discovery-100x skill ([6d0e320](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6d0e32043d92b21de4a1b373cc64bed7c617da91))
* add export_csv.py script for Markdown table to CSV conversion ([d3cf95f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d3cf95f1b14622a961ad1e8a95a2fbac8087c411))
* add nginx reverse proxy config template for VPS deployment (Phase 3) ([7b4473d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7b4473d3ac3acde09291dbbb8e145294606ab826))
* add open-source structure (Phase 2) ([f14a42f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f14a42f665a74b61edfc734b964ee922e3ecdb28))
* add system crontab and intelligent cron wrappers for Claude Code ([1c91e33](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/1c91e33152e0492989be4cc977b5a304ae70a559))
* add systemd service and setup script for Cervantes Claude Code ([85549b4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/85549b4d5e7b2c0d0b9ba15efeaaf5c33535a164))
* add VPS provisioning script for one-shot server setup ([6feaa11](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6feaa11c8506cceaba6994918b31223867ff09d2))
* add weekly insights and patterns documentation for March 2026 ([ed5eb17](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ed5eb17988343b20cf2f2bd3ad1ffc800fea6e18))
* Alfonso 10 Abril — resumen completo de la migración MC Dashboard + OpenCloud ([9d21283](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9d21283d8701fb2a19bca7a74c8d1d89bf72c285))
* change Sancho escalation from sessions_send to Discord message for Cervantes ([29317f4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/29317f44eac1cd9109e3ece0edc80b76b72fa1a9))
* chat quick actions, skills page, cron insights v2, skill resolver refactor ([df38db0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/df38db0161cad94c1c3f325b9dda012ba501ea7a))
* **ci:** set up CI/CD, release-please, commitlint and contributor docs ([5a01650](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5a016508f8c964f762b113c5d40ec09f411ce887))
* **ci:** set up CI/CD, release-please, commitlint and contributor docs ([30ba38d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/30ba38d97778fd012118897381bf2e962f865943))
* **ci:** split deploy into staging (auto) and prod (manual approval) ([#21](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/21)) ([5304f96](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5304f966867a30450a325ccb7fc1e8ba422e7010))
* create buscador-de-nichos-v2 skill and restore original niche-discovery-100x ([cfe2b54](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/cfe2b54c837455c801672690124bdeeffffd2e99))
* **deploy:** add openclaw.json.example and validate in entrypoint ([303f082](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/303f082270a26659decbee029159567e1ad2872a))
* **deploy:** add snapshot-data.sh for private data backups every 3h ([a3f7b8b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/a3f7b8b4b6f89af492f8e58337c3e9eefa63e71b))
* **deploy:** auto-configure OpenClaw from env vars + update channel structure ([99549f0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/99549f058c6a900d65fec87c34f4a7b3c9af6e4b))
* **deploy:** auto-register agents on first startup ([4b0931d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/4b0931db82c800ece29f5e8c867cd9f839f0aea4))
* **deploy:** link cron jobs to .openclaw/cron/ on first startup ([fcb927c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fcb927ce48b9dbe365e219244c8694f43abde43e))
* deregister Cervantes from OpenClaw agent system ([d99ed8a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d99ed8acae01db130831d9f668b0ee59db66b701))
* enhanced task detail, recurring tasks panel, trust engine + ideas improvements ([cf14d9f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/cf14d9f6c2fec770ee4cede5cffa625bc0282d11))
* extract instance-specific data to instance-config.md (Batch 1F) ([f9c9ce2](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f9c9ce251ada33f6ed3ccc11f3c2ac4ec2637d6e))
* faithful UI migration — Foundation, Projects, Ideas, Trust Engine, Metrics + remaining pages ([f8353cc](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f8353ccf36bb8a803f5a3f7bca144e6eaea5536d))
* faithful UI migration — shared components, chat system, Dashboard V2 ([d759a49](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d759a49829dc14274614049feb63ae869a5aaa62))
* **healthcheck:** make infrastructure checks environment-aware for VPS ([d560da2](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d560da26d3c0fa84bda63c4963c2701cdc06eabd))
* initial commit ([41029d8](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/41029d84234624ef907c463256d13df10e461935))
* integrate Next.js Mission Control with updated configurations and API endpoints ([56b582c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/56b582c1fdf03f29d93c4ac90854404417d254ce))
* MC Dashboard complete — full Next.js migration + OpenCloud SaaS features ([f72f010](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f72f010bcaa994d18b02e02b4a0cd02faf302a13))
* **mc-chat:** rehydrate thread context when OpenClaw session is cold ([95c5ad1](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/95c5ad127bb70fbafd7d8a50c06da071e8279b33))
* **mc:** external admin allowlist via adminEmails ([319d332](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/319d332239070707b7dc096f2afa1164dcd70df0))
* **mc:** external admin allowlist via adminEmails in clients.json ([b09005f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b09005f5889154c256aa91a6ad578c5de0c1de29))
* **mc:** grant Diego Fernandez client access to growth4u workspace ([639b7fd](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/639b7fd4f88f7204e90dab70670f8ad52ed47778))
* **mc:** grant Diego Fernandez client access to growth4u workspace ([ce2828a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ce2828a1c75583f8b3f4766be919ca59d0d4962f))
* **mc:** per-client settings & activity pages; admin/settings global only ([1b37d7a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/1b37d7ade261f1ba3b235ceaaf2f374e28113f41))
* **mc:** pin sidebar header/footer and surface collapse toggle ([e254cfd](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e254cfd2320f9cfe277a128724d3592b1c612421))
* **mc:** reorganize sidebar navigation with sections ([4695403](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/4695403db49bf69f32fb84bb848ed8a4f94c2804))
* **mc:** rewrite relative links in brand docs + red-link styling for missing pages ([2ab76a6](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2ab76a6cbc01996c762ebdbb87157dd211a03246))
* **mc:** sidebar env badge via NEXT_PUBLIC_ENV_LABEL ([37ed74f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/37ed74f74a228c18ff1daecd4e81e7b9cbbee8c0))
* **mc:** sidebar env badge via NEXT_PUBLIC_ENV_LABEL ([915158a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/915158a5e6544fbfc76468c50db9ae2cf18db67c))
* **mc:** track Mission Control and all data files in git ([2bb1e45](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2bb1e4562dacd480afbab4757b951a7e044402ce))
* Mission Control Next.js migration — Phases 0-4 ([8c696fe](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/8c696fe1e8829b4f075e91a6f50c2a5afac973c8))
* parametrize Discord IDs and instance-specific data ([70a50ea](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/70a50ea25d43f7f625a4eda76d27b0d24ac69a46))
* replace hardcoded paths with dynamic env vars (Phase 1) ([2c6e073](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/2c6e0734c37583772bdbd1f0239727e3aa8bf065))
* **slack:** app_mention reply + slash commands ([b157723](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b157723a28cb8251c84a8f6d54fc2e5e90ee68bf))
* **slack:** app_mention reply + slash commands ([3ae15ec](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3ae15ec6bad773d8c6b1c507fb4e01109efbc987))
* **slack:** multi-tenant OAuth flow with encrypted bot tokens ([21d709c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/21d709c12fc772f58a6d120559f64aa36279a18f))
* **slack:** multi-tenant OAuth flow with encrypted bot tokens ([5e3bc9a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5e3bc9a222586e02332d226cb59903b3730d7316))
* **slack:** per-action handlers + events endpoint ([dafb89b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/dafb89b2359712df3a1d486de629697d2d436c9e))
* **slack:** per-action handlers + events endpoint ([bed0395](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/bed039532d962d06aa341e825096b1551e732d39))
* **slack:** UI connect button + interactivity endpoint ([3756d67](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3756d672210b4d9f982e7a7cce79c1fbfcc9d6bd))
* **slack:** UI connect button + interactivity endpoint ([e7448e8](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e7448e8c91147e745d9906c16037b85ac4fcbabb))
* task anchors, attachments system, public sharing, chat UX overhaul ([6270472](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6270472de8b884353f286c2b257bb74ad46209d7))
* task anchors, attachments system, public sharing, chat UX overhaul ([809e3ed](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/809e3edee8324c6320d16ae370ad5f8e900d311f))
* update buscador-de-nichos-v2 skill with 10-phase pipeline ([6e63d61](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6e63d61bb882e21930b328d33f11edebf6485e97))
* update environment variables and permissions in settings for improved configuration ([ed64597](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ed64597e4152ab37422555280f9ff16f0832e521))
* update environment variables and setup scripts for Cervantes integration ([aab08b6](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/aab08b655c2783ce25e5efa3c1fc5155eea2102b))


### Bug Fixes

* add guideline against hardcoding URLs and configuration values in SOUL.md ([66a10a4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/66a10a4441596d5e79a5aafef5824fd6b3f97d6e))
* address quality review issues in CLAUDE.md and HEARTBEAT.md ([0c7ce3d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/0c7ce3dc2b10aa9e2eb2298754f5769c064a3240))
* address quality review issues in webhook scripts ([6945f67](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6945f6731fdc98b94b3df4f46a5e63ebe7437f79))
* **agents:** Sancho default model → gpt-5.4 (minimax deprecated) ([a88988f](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/a88988fce994971a76cc39edb9702eeaab76e88b))
* backup.sh respects current branch + gitignore cron-generated files ([e6d1bbe](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e6d1bbed79ec460c07d13b03310b11c65dd7182d))
* **ci:** expand DEPLOY_PATH tilde correctly in SSH heredocs ([#22](https://github.com/Growth4U-systems/sanchocmo-openclaw/issues/22)) ([566cd5a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/566cd5aa2eeaf158cd2f7decb2875720cc40f194))
* correct Discord client ID variable name in .env.example and DEPLOY.md ([e20db6c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e20db6ca58e3c36b760b3495fa301378fea0a796))
* correct path for openclaw.json in entrypoint and config generation scripts ([5fae4e9](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/5fae4e9bc9d7abde7cbb9d9df9957b637493787d))
* cron insights feed improvements, ideas cleanup, updated cron templates ([f0d057a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/f0d057ae2f8d69d6b114e4337bd7025d28f015d7))
* **dashboard:** defensive status handling for projects without status ([ea9429e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ea9429ee6149b834d15634cfe87395e540ee9b6e))
* **deploy:** bind MC server to 0.0.0.0 inside container ([cabbd31](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/cabbd310651b4755880d571c20506a9e2253335b))
* **deploy:** check openclaw.json existence instead of .setup-complete flag ([0a1110d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/0a1110d4083f17f2c81d3250e5a5d713e586d8f9))
* **deploy:** complete deploy automation + docs overhaul ([91732f5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/91732f5e5569675e1093ed4c43c6d54b92d1c6c1))
* **deploy:** distinguish 'already exists' from real errors in agent registration ([ce8e7f4](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ce8e7f475161659c44beab4478e50252cd5459a8))
* **deploy:** generate MC dashboard data on first startup ([fa9c175](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/fa9c175f1cabf22186796d7b5e67c2febfa5d556))
* **deploy:** install node dependencies (ws) for MC server in entrypoint ([077954a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/077954ad72cb21cd9e66d2ffaa3935ec0e5d7188))
* **deploy:** remove set -e from inject-env-vars.sh (grep returns 1 on no match) ([ad35a86](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ad35a86e8e48d91cb22ef50960b2ba8de2d757ed))
* **deploy:** skip setup on container restarts (flag file .setup-complete) ([397be8e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/397be8e43f4711ef19d9b19352f4c1d8ce6832a0))
* **deploy:** use openclaw gateway foreground mode in container ([7dca21c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7dca21c51e9286cc613b310b683fbe00ba391a03))
* **deploy:** use openclaw gateway run for foreground mode in container ([bbd3ccb](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/bbd3ccbbcaae2a246ddedc2ff3af35e52b271991))
* **deploy:** write Discord token to openclaw.json (was detecting guilds but not saving token) ([00bff35](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/00bff35a398beb70dfa1c64c1704d783b11ecfaa))
* **deploy:** write openclaw.json to .openclaw/ subdirectory ([2131567](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/21315670bbc506494de3842c7d1fbea03c33cac5))
* **docs:** correct architecture diagram to show Cervantes Brain guild ([6fec7a0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/6fec7a0f638849fd20bb60c157059b56e8695041))
* dynamic bot_client_id from instance.json, remove dead clients.js step ([e3ede3b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e3ede3bbdac9975c00b0c2ef3550b714e54f5195))
* foundation state endpoint + NextAuth session support in API middleware ([72cec51](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/72cec515f148ee508c0703750a9bb07a72b9996c))
* **growth4u:** restore Slack workspace integration ([d37de3b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d37de3b39a9edf127e431531e748c668b6ccc719))
* healthcheck VPS checks + DEPLOY.md corrections ([e26c1f9](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e26c1f9a87bf6cf77aa5eb73d99d1d18d741eb44))
* ignore root .openclaw/ dir (runtime state) ([b74c773](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b74c773c81887d2f95c102f1cedab42780ded5e8))
* improve buscador-de-nichos-v2 skill with checkpoints and deep-research ([d696454](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/d69645455986fc26baf68db9da620c6dce32b934))
* make Supabase and MC URLs dynamic in client-onboarding.md ([37e5efa](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/37e5efadeba98f98d535867f016bd75fc9a2437c))
* **market-synthesis:** align body paths with frontmatter ([4b67394](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/4b67394fd594de2a4789ac7c8db33baf08c17229))
* MC admin static file routing — serve JS/CSS directly after admin URL rewrite ([173e283](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/173e283d8b4f95c1128d1ce1f9fe62f0ea1c492a))
* MC portal — mc-work.js relative path + clients.js broken symlink ([9cd273a](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9cd273a9c69d8287288e855e8135d57a4140c95d))
* mc-chat gateway default port 18789 instead of 18800 ([90ee8a6](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/90ee8a63e1e3a795dd9923acaf91419438513040))
* **mc-chat:** expose channel meta + make Discord relay failure loud ([af76f42](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/af76f422a4915321e5628ea9187c65d9581982d9))
* **mc:** 404 for all unknown routes + URL-driven doc selection ([a43c267](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/a43c2679cb5d9083ee7ed84b4cafda6638070766))
* **mc:** aggregate costs from per-client files in /api/system/costs ([815963b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/815963b313cb6d7a6b8263a7beecb123496b173e))
* **mc:** Dashboard nav link follows the active client ([81efdcd](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/81efdcd784e03ae87bc434b33a7accd274f1d7e6))
* **mc:** deduplicate Actividad/Ajustes in sidebar; scope-aware hrefs ([71b308c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/71b308c1c7d84dab34a660319c733475967785e2))
* **mc:** derive sidebar scope from the URL, not the store ([3884e8b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3884e8bc6e0326cada020a33c5d9e3de5b524fb4))
* **mc:** repair client selector routing and add Next.js 404 page ([b0cfa9c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b0cfa9c300309760ae8ad6726a46b91470cdfeb7))
* **mc:** stop useSlugSync from reverting the store during client switch ([7e3ffb0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/7e3ffb0278c1fafc0dd99a9b8f484855cf927ab1))
* move mcChatSidebar declaration before first usage to avoid TDZ error ([84f4cd0](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/84f4cd06b2f53962bdefe7d20e2e19b6a6052229))
* new-client.sh bugs + gitignore workspace state ([3bbb187](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3bbb187c979f961d7376439d36c9fa83be521113))
* project cards are collapsible — click header to toggle tasks ([e41ce0b](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e41ce0bf7593bf1cb1de40c79f995c7d6ce28a56))
* **protocol:** enhance descriptions for budget and company-brief sections ([4aa8afe](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/4aa8afee8069dc214107e405efbec2f3158d4dd1))
* QA manual — 10 bugs corregidos en Mission Control Next.js ([8b0fa61](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/8b0fa6189fd9d3f0a772a8cb6a1424a350dbe1a1))
* recommendations with action buttons, remove standalone Atalaya section ([82129b1](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/82129b1e935fae8c9d5db888ca190feb66a3a2ad))
* replace hardcoded macOS paths with portable alternatives ([952ac04](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/952ac04b55ba8921280fdc5b75fe9370615d45fe))
* **sancho:** move MEMORY.md to workspace root per openClaw ([b8dacd5](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/b8dacd59bbc405e5ad9b8d7b78d4bcce74ab738e))
* **sancho:** relocate instance files per openClaw convention ([de9f434](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/de9f4344fe6c41348cb99418c58fd87a823dae4a))
* **scripts/new-client:** P00 dirs sin sufijo duplicado ([79b041c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/79b041c24bc62a607562e468cc55209d2d5aa861))
* **security:** remove all private instance data from git tracking ([9a3cb5e](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9a3cb5eb52ea5659469b5d1aebc43ddf9ee51704))
* **security:** remove private config files from git tracking ([206565c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/206565caf5ba1a5ea5ff6dbc3c5a426f76128827))
* sidebar replica legacy structure + project clicks navigate instead of chat ([3a498e9](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/3a498e9d55e929ede0cd4e089e469aac83636935))
* **skills:** align storage block paths to market-and-us/ pillars ([8c1c249](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/8c1c249cafcd8c1dc3ef4b290135b2d035197043))
* sync MC foundation/project status with actual pillar states ([9e58d43](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/9e58d43349446acfb85ca5108db363bde4050bd1))
* task rows in project list are clickable links to task detail ([ff0b82c](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ff0b82c7cf03bc3dc66d3250a56cea14e5abb5c7))
* unify instance.json schema and add missing fields ([ff54568](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ff54568c4186546d50aec10434739c14b3fd778f))
* update gateway restart command to support Docker execution ([e60fe30](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/e60fe30ef0d90d48313214d86c1033909ffc89c6))
* update OAuth Bot link to use dynamic BOT_CLIENT_ID from instance.json ([ba85ddc](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/ba85ddc9d7ed74677e18707bbf3768e447f56c25))
* update paths to openclaw.json for consistency across scripts ([25faf9d](https://github.com/Growth4U-systems/sanchocmo-openclaw/commit/25faf9d77018a1563613502b17affea074464efd))
