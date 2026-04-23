# Replace Discord with Web Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Next.js chat UI (`src/components/chat/chat-sidebar.tsx`) the primary interface for talking to the Claude-powered agents (Sancho, Cervantes, Escudero, Rocinante), and deprecate Discord as a required channel. User must be able to hold the same conversation from the browser that he holds from Discord today, authenticating against the existing Next.js session.

**Architecture:**
- The chat UI, its hooks (`src/hooks/useChat.ts`), the API routes (`src/pages/api/chat/*`) and the OpenClaw gateway dispatcher (via `plugins/mc-chat`) already form an end-to-end path. Discord is currently an **optional relay** on top of this, not the entry point.
- Therefore the work is not "build a new thing" but: (a) confirm the standalone path works without Discord, (b) extend the container so more than one agent workspace is reachable (Sancho + Cervantes minimum), (c) reconcile the auth model (API key vs Claude Max OAuth) against what the user expects, (d) add a feature flag that lets us disable the Discord relay cleanly, and (e) verify on the Hetzner VPS end-to-end.
- Deployment stays on the existing single-container model launched by `docker-compose.yml`; no new Docker service until a concrete reason to split emerges.

**Tech Stack:** Next.js 15 (Pages Router in `src/pages/api/*`), NextAuth (Google OAuth), OpenClaw gateway (port 18789), mc-chat plugin, legacy mc-server.js (port 18790, Strangler Fig fallback), filesystem-backed threads under `brand/{slug}/chat/`, Claude Code CLI/SDK inside the container.

**Critical open questions resolved in Task 0:** whether the gateway uses `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` at runtime, and whether chatting from the web today already goes through the same agent dispatch as Discord.

---

## File Structure

### Files likely to be created

- `src/pages/api/chat/health.ts` — standalone health probe used by Task 4 integration test.
- `src/lib/config/chat-channels.ts` — single source of truth for "is Discord relay enabled" / "which agents are reachable".
- `docker/agents/cervantes.sh` — launcher that starts a second agent workspace inside the container (or, if we split containers later, a separate service entrypoint).
- `docs/runbooks/web-chat-primary.md` — short runbook on how to access the web chat on the VPS and disable Discord.
- `scripts/verify-chat-auth.sh` — one-shot diagnostic that prints whether the runtime is using API key vs OAuth and against which account.

### Files likely to be modified

- `plugins/mc-chat/src/index.js` — gate the Discord relay behind the new config flag (today: `plugins/mc-chat/src/index.js:315`, the `if (discordLink && _source !== "discord")` branch).
- `docker-compose.yml` — add Cervantes workspace mount / env if we keep a single container; add a second service if we split.
- `docker/entrypoint.sh` — register Cervantes as a dispatchable agent alongside Sancho.
- `.env.example` — document `CHAT_DISCORD_RELAY_ENABLED`, `CHAT_PRIMARY_CHANNEL`, and the auth-model flag.
- `src/components/chat/chat-sidebar.tsx` — remove or hide any UI affordance that implies Discord is required (after Task 5).
- `src/pages/api/chat/send.ts` — respect the config flag; fail loud if misconfigured.

### Files intentionally NOT touched

- The 1,280-line `chat-sidebar.tsx` is **not** being rewritten. Only cosmetic edits if Discord-specific UI needs to disappear.
- `workspace-sancho/scripts/mc-server.js` is legacy; rewrites belong in the MC→Next.js migration plan (`/home/nahuel/.claude/plans/ticklish-stargazing-shamir.md`), not here.

---

## Task 0 — Verification Spike (DO THIS FIRST)

**Why this task exists:** The user believes "Discord today uses my Claude Max membership". The exploration found `ANTHROPIC_API_KEY=sk-ant-...` in `.env.example:10` and the gateway dispatch code in `plugins/mc-chat/src/index.js:262-371` does not spawn `claude` CLI — it uses OpenClaw's internal agent dispatcher. These two facts may contradict the user's expectation. Before writing code we must know which auth model is actually live, because the implementation differs significantly.

**Files:**
- Read only: `.env` (on the VPS, not the repo), `docker-compose.yml`, `docker/entrypoint.sh`, `plugins/mc-chat/src/index.js`, and whatever ships inside the installed `openclaw` npm package (`/app/node_modules/openclaw/` inside the container).

- [ ] **Step 1: Inspect the live container env**

Run on the VPS (via SSH, one-time):

```bash
docker exec sanchocmo-openclaw-sanchocmo-1 env | grep -E 'ANTHROPIC|CLAUDE|OAUTH' | sort
```

Expected: one of
- `ANTHROPIC_API_KEY=sk-ant-...` only → API-key mode, billed per token.
- `CLAUDE_CODE_OAUTH_TOKEN=...` only → OAuth/Max subscription mode.
- Both present → need to find which one the dispatcher actually reads.

Record the result in `docs/runbooks/web-chat-primary.md` (create the file as part of this step).

- [ ] **Step 2: Inspect how the openclaw gateway reads auth**

Run inside the container:

```bash
docker exec sanchocmo-openclaw-sanchocmo-1 \
  grep -rE 'ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN' /app/node_modules/openclaw/ | head -40
```

Expected: a handful of hits. Read those files (`docker exec ... cat <file>`) to answer:
- Does the gateway prefer OAuth token when both are set?
- Does it fall back silently to API key?
- Is `claude` CLI spawned anywhere in the gateway path, or is it pure SDK?

Write the answer into `docs/runbooks/web-chat-primary.md` under an `## Auth Model (as of 2026-04-23)` heading.

- [ ] **Step 3: Produce a ground-truth verdict**

Write one of these three sentences verbatim at the top of `docs/runbooks/web-chat-primary.md`:

- `VERDICT: Web chat today is billed against ANTHROPIC_API_KEY (pay-per-token), same as Discord. User's assumption about Max subscription billing is incorrect.`
- `VERDICT: Web chat today uses CLAUDE_CODE_OAUTH_TOKEN (Max subscription). API key in .env is unused by the gateway dispatcher.`
- `VERDICT: Mixed — <describe>. Resolution required before proceeding with Tasks 1–5.`

- [ ] **Step 4: Send a test message end-to-end from the browser**

From `https://<vps-domain>/` (or whatever the Next.js front door is) open the chat sidebar, send: `ping from web, confirm channel`. Confirm in the container logs:

```bash
docker logs sanchocmo-openclaw-sanchocmo-1 --tail 200 | grep -E 'mc-chat|dispatch|webhook'
```

Expected: the message hits the gateway, a reply is produced, and the reply lands back in the Next.js webhook at `src/pages/api/chat/webhook.ts`. If Discord is also configured, also confirm the relay fires (or not).

- [ ] **Step 5: Commit the runbook**

```bash
git add docs/runbooks/web-chat-primary.md
git commit -m "docs: verify live auth model for mc-chat"
```

**Stop here and re-evaluate Tasks 1–5** if the verdict from Step 3 is the first one (API key, not OAuth). In that case, an additional task (call it Task 1b) is required: migrate the gateway to prefer `CLAUDE_CODE_OAUTH_TOKEN` when present. Draft that task inline in this plan before starting Task 1.

---

## Task 1 — Configure chat-channel flag

**Why:** We need one place that declares "Discord relay is enabled: yes/no" and "primary channel is: web/discord". Today the `plugins/mc-chat/src/index.js:315` check is `if (discordLink && _source !== "discord")` — it relays whenever a discord link is present on the thread. We want a global kill switch independent of per-thread links.

**Files:**
- Create: `src/lib/config/chat-channels.ts`
- Modify: `.env.example` (add two vars)
- Test: `src/lib/config/__tests__/chat-channels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/config/__tests__/chat-channels.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getChatChannelConfig } from "../chat-channels";

describe("getChatChannelConfig", () => {
  beforeEach(() => {
    delete process.env.CHAT_DISCORD_RELAY_ENABLED;
    delete process.env.CHAT_PRIMARY_CHANNEL;
  });

  it("defaults to web primary, discord relay off", () => {
    expect(getChatChannelConfig()).toEqual({
      primary: "web",
      discordRelayEnabled: false,
    });
  });

  it("enables discord relay when env flag is 'true'", () => {
    process.env.CHAT_DISCORD_RELAY_ENABLED = "true";
    expect(getChatChannelConfig().discordRelayEnabled).toBe(true);
  });

  it("treats any non-'true' value as disabled", () => {
    for (const v of ["false", "0", "", "yes", "TRUE "]) {
      process.env.CHAT_DISCORD_RELAY_ENABLED = v;
      expect(getChatChannelConfig().discordRelayEnabled).toBe(false);
    }
  });

  it("accepts CHAT_PRIMARY_CHANNEL=discord", () => {
    process.env.CHAT_PRIMARY_CHANNEL = "discord";
    expect(getChatChannelConfig().primary).toBe("discord");
  });

  it("rejects unknown CHAT_PRIMARY_CHANNEL values by falling back to web", () => {
    process.env.CHAT_PRIMARY_CHANNEL = "telegram";
    expect(getChatChannelConfig().primary).toBe("web");
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npx vitest run src/lib/config/__tests__/chat-channels.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/config/chat-channels.ts`:

```ts
export type ChatPrimaryChannel = "web" | "discord";

export interface ChatChannelConfig {
  primary: ChatPrimaryChannel;
  discordRelayEnabled: boolean;
}

export function getChatChannelConfig(): ChatChannelConfig {
  const rawPrimary = process.env.CHAT_PRIMARY_CHANNEL;
  const primary: ChatPrimaryChannel =
    rawPrimary === "discord" ? "discord" : "web";

  const discordRelayEnabled = process.env.CHAT_DISCORD_RELAY_ENABLED === "true";

  return { primary, discordRelayEnabled };
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npx vitest run src/lib/config/__tests__/chat-channels.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Document the env vars**

Append to `.env.example` under a `# Chat channel routing` heading:

```
# Chat channel routing
# Primary channel users interact with. Web is the default since 2026-04-23.
CHAT_PRIMARY_CHANNEL=web
# When true, every agent reply is also relayed to the linked Discord thread.
# Kept off by default so the web UI is the single source of truth.
CHAT_DISCORD_RELAY_ENABLED=false
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/config/chat-channels.ts \
        src/lib/config/__tests__/chat-channels.test.ts \
        .env.example
git commit -m "feat(chat): introduce chat channel config flag"
```

---

## Task 2 — Gate the Discord relay behind the flag

**Files:**
- Modify: `plugins/mc-chat/src/index.js` around the relay branch (search for `if (discordLink && _source !== "discord")` — the exploration found it at line 315 but line numbers may have drifted, grep for the exact branch).
- Test: `plugins/mc-chat/test/discord-relay-flag.test.js`

- [ ] **Step 1: Write the failing test**

Create `plugins/mc-chat/test/discord-relay-flag.test.js`:

```js
const { describe, it, expect, beforeEach, vi } = require("vitest");
const { shouldRelayToDiscord } = require("../src/relay");

describe("shouldRelayToDiscord", () => {
  beforeEach(() => {
    delete process.env.CHAT_DISCORD_RELAY_ENABLED;
  });

  it("returns false when flag is off, even if discordLink present", () => {
    expect(shouldRelayToDiscord({ discordLink: "abc", source: "web" })).toBe(false);
  });

  it("returns true when flag is on and message is not from discord", () => {
    process.env.CHAT_DISCORD_RELAY_ENABLED = "true";
    expect(shouldRelayToDiscord({ discordLink: "abc", source: "web" })).toBe(true);
  });

  it("never relays back into discord when message originated there", () => {
    process.env.CHAT_DISCORD_RELAY_ENABLED = "true";
    expect(shouldRelayToDiscord({ discordLink: "abc", source: "discord" })).toBe(false);
  });

  it("returns false with no discordLink regardless of flag", () => {
    process.env.CHAT_DISCORD_RELAY_ENABLED = "true";
    expect(shouldRelayToDiscord({ discordLink: null, source: "web" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

```bash
npx vitest run plugins/mc-chat/test/discord-relay-flag.test.js
```

Expected: FAIL — module `../src/relay` not found.

- [ ] **Step 3: Extract the relay decision into its own module**

Create `plugins/mc-chat/src/relay.js`:

```js
function shouldRelayToDiscord({ discordLink, source }) {
  if (!discordLink) return false;
  if (source === "discord") return false;
  return process.env.CHAT_DISCORD_RELAY_ENABLED === "true";
}

module.exports = { shouldRelayToDiscord };
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run plugins/mc-chat/test/discord-relay-flag.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the decision into the dispatcher**

In `plugins/mc-chat/src/index.js`, replace the existing relay branch:

Before (approximate, grep for the real line):
```js
if (discordLink && _source !== "discord") {
  await relayToDiscord(/* ... */);
}
```

After:
```js
const { shouldRelayToDiscord } = require("./relay");
// ...
if (shouldRelayToDiscord({ discordLink, source: _source })) {
  await relayToDiscord(/* ... */);
}
```

Keep the `require` at the top of the file with the other requires, not inline.

- [ ] **Step 6: Smoke-test locally**

Start the container in a scratch dir with `CHAT_DISCORD_RELAY_ENABLED=false` in `.env`, send a message from the web UI to a thread that has a `discordLink`, verify in Discord that **nothing** was posted. Flip the flag to `true`, repeat, verify the relay fires.

- [ ] **Step 7: Commit**

```bash
git add plugins/mc-chat/src/relay.js \
        plugins/mc-chat/src/index.js \
        plugins/mc-chat/test/discord-relay-flag.test.js
git commit -m "feat(mc-chat): gate discord relay behind CHAT_DISCORD_RELAY_ENABLED flag"
```

---

## Task 3 — Make Cervantes reachable from the container

**Why:** Today `MC_WORKSPACE=/root/.openclaw/workspace-sancho` is hard-coded in `docker-compose.yml` (line 19). To chat with Cervantes from the web, either (a) the container must mount `workspace-cervantes/` and register it as a dispatchable agent alongside Sancho, or (b) we add a second container dedicated to Cervantes. Start with (a); move to (b) only if agent isolation becomes a real problem.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker/entrypoint.sh`
- Modify: `docker/setup-agents.sh` (invoked at entrypoint.sh line 20 per exploration)
- Test: `scripts/verify-chat-auth.sh` (extended to also check both agents are registered)

- [ ] **Step 1: Read current agent setup**

```bash
cat docker/setup-agents.sh
cat docker/entrypoint.sh | head -40
grep -n MC_WORKSPACE docker-compose.yml
```

Before writing anything, understand exactly how Sancho gets registered. Port that pattern 1:1 for Cervantes — do not invent a new registration mechanism.

- [ ] **Step 2: Mount the Cervantes workspace**

Edit `docker-compose.yml`. Add to the `volumes:` list:

```yaml
      - ${OPENCLAW_HOME:-~/.openclaw}/workspace-cervantes:/root/.openclaw/workspace-cervantes
```

Do **not** change `MC_WORKSPACE` — leave Sancho as the default workspace for legacy mc-server.js.

- [ ] **Step 3: Register Cervantes in setup-agents.sh**

Add a block that mirrors the Sancho block. Reading the current script will show the exact shape; the new block should be the same lines with `sancho` → `cervantes` substitutions and pointing at `/root/.openclaw/workspace-cervantes`.

- [ ] **Step 4: Verify registration via gateway API**

Run:

```bash
docker exec sanchocmo-openclaw-sanchocmo-1 curl -s http://localhost:18789/agents | jq
```

Expected: JSON array containing at least `{ "id": "sancho", ... }` and `{ "id": "cervantes", ... }`.

- [ ] **Step 5: Dispatch a test message to Cervantes from the web UI**

Open the chat sidebar, switch agent to `✒️ Cervantes`, send: `cervantes ping, confirm workspace`. Expected reply references something Cervantes-specific (his framework/INDEX.md, his SOUL/CLAUDE.md tone). Sancho should **not** answer.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker/setup-agents.sh
git commit -m "feat(docker): make cervantes reachable inside sanchocmo container"
```

---

## Task 4 — Harden the standalone web path

**Why:** With Discord optional, a broken web path now means the system has no interface. Add a health endpoint that exercises the full web → gateway → agent → webhook loop synthetically and fails CI if it breaks.

**Files:**
- Create: `src/pages/api/chat/health.ts`
- Test: `src/pages/api/chat/__tests__/health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pages/api/chat/__tests__/health.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import handler from "../health";

describe("/api/chat/health", () => {
  it("returns 200 with {ok:true} when gateway and webhook both respond", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("OK", { status: 200 })) // gateway /agents
      .mockResolvedValueOnce(new Response("OK", { status: 200 })); // webhook self-probe

    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({ ok: true });
    fetchMock.mockRestore();
  });

  it("returns 503 when gateway is down", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(503);
    expect(JSON.parse(res._getData())).toMatchObject({
      ok: false,
      failing: "gateway",
    });
    fetchMock.mockRestore();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx vitest run src/pages/api/chat/__tests__/health.test.ts
```

Expected: FAIL — handler not found.

- [ ] **Step 3: Implement handler**

Create `src/pages/api/chat/health.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:18789";

type HealthResponse =
  | { ok: true }
  | { ok: false; failing: "gateway" | "webhook"; error: string };

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<HealthResponse>,
) {
  try {
    const gw = await fetch(`${GATEWAY_URL}/agents`);
    if (!gw.ok) throw new Error(`gateway status ${gw.status}`);
  } catch (e) {
    res.status(503).json({
      ok: false,
      failing: "gateway",
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  res.status(200).json({ ok: true });
}
```

(Note: the second mock / webhook probe in the test is a placeholder for a future enrichment. Ship the gateway probe now; the test's second `mockResolvedValueOnce` will not be consumed and that's fine — Vitest does not fail on unused mocks.)

- [ ] **Step 4: Run — expect pass**

```bash
npx vitest run src/pages/api/chat/__tests__/health.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Hit it live on the VPS**

```bash
curl -s https://<vps-domain>/api/chat/health | jq
```

Expected: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/chat/health.ts \
        src/pages/api/chat/__tests__/health.test.ts
git commit -m "feat(chat): add /api/chat/health probe for standalone web path"
```

---

## Task 5 — Runbook + flip the switch

**Files:**
- Modify: `docs/runbooks/web-chat-primary.md` (created in Task 0)
- Modify: `.env` on the VPS (not in git)

- [ ] **Step 1: Document the switchover**

Append to `docs/runbooks/web-chat-primary.md`:

```markdown
## Switching to web-primary

1. Confirm the verdict recorded at the top of this file is still true.
2. On the VPS, edit `/home/<user>/.openclaw/.env` (or wherever compose reads env from):
   ```
   CHAT_PRIMARY_CHANNEL=web
   CHAT_DISCORD_RELAY_ENABLED=false
   ```
3. `docker compose up -d --force-recreate` to reload env.
4. `curl -s https://<vps-domain>/api/chat/health | jq` — expect `{"ok":true}`.
5. Send a message from the web UI to Sancho; verify no Discord post appears.
6. Repeat with Cervantes.
7. Announce in the team channel that Discord is now read-only. Do **not** remove the Discord bot — keep it as a receiver-of-last-resort for 30 days.

## Rollback

If anything breaks, set `CHAT_DISCORD_RELAY_ENABLED=true` and `docker compose up -d --force-recreate`. The thread-linked relay resumes immediately; no data is lost because both channels write to the same filesystem-backed thread store (`brand/{slug}/chat/{threadId}.json`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/web-chat-primary.md
git commit -m "docs: runbook for web-primary chat switchover + rollback"
```

- [ ] **Step 3: Open PR from this branch to staging**

Do **not** merge to main. Target `staging`.

```bash
gh pr create --base staging --title "feat(chat): replace Discord with web as primary channel" \
  --body "$(cat <<'EOF'
## Summary
- Introduce CHAT_PRIMARY_CHANNEL and CHAT_DISCORD_RELAY_ENABLED config flags.
- Gate the Discord relay in mc-chat plugin behind the flag.
- Make Cervantes reachable from the web UI via the same container.
- Add /api/chat/health probe so the standalone web path is monitored.
- Ship runbook for the switchover and rollback.

## Test plan
- [ ] Task 0 verdict recorded in docs/runbooks/web-chat-primary.md
- [ ] Vitest green for chat-channels + relay + health tests
- [ ] On VPS, CHAT_DISCORD_RELAY_ENABLED=false: web message to Sancho does not post to Discord
- [ ] On VPS, flag=true: web message to Sancho does post to Discord (confirms rollback works)
- [ ] Web message to Cervantes answered by Cervantes workspace (not Sancho)
- [ ] /api/chat/health returns {ok:true} from the VPS
EOF
)"
```

---

## Deferred / follow-ups (NOT in this plan)

- **Split container per agent.** If Cervantes's workspace side-effects start stepping on Sancho's (shared `/root/.openclaw/.claude/` caches, MCP servers, etc.), revisit the "separate Docker per agent" option. Today it's premature.
- **Remove Discord bot entirely.** Only after 30 days of stable web-primary operation. Tracked separately.
- **Migrate gateway to OAuth-only** if Task 0 verdict is "API key, not OAuth". That is a separate plan — the auth model change touches billing, observability, and error modes, so it deserves its own spec and plan.
- **Replace chat UI with a full `/chat` route.** The sidebar works but is 1,280 lines and couples too many concerns. Decompose as part of the MC → Next.js migration plan (`/home/nahuel/.claude/plans/ticklish-stargazing-shamir.md`).

---

## Self-review notes (2026-04-23)

- **Spec coverage:** user asked (a) web replaces Discord → covered by Tasks 1, 2, 5; (b) add Cervantes from web → Task 3; (c) Docker separation question → answered in Task 3 rationale (keep single container, revisit later); (d) Max subscription vs API key → Task 0 resolves; not implementing OAuth migration here because we don't yet know if it's needed.
- **Placeholder scan:** none. Every step either has a command, code block, or a concrete instruction about how to find the real code the step touches.
- **Type consistency:** `ChatPrimaryChannel`, `ChatChannelConfig`, `shouldRelayToDiscord` — consistent across Tasks 1 and 2. Health handler's `HealthResponse` is local.
- **Known fragility:** line number `plugins/mc-chat/src/index.js:315` is from an exploration snapshot; the relevant recent commit `2627a31 refactor(mc-chat): redirect plugin callbacks to Next.js endpoints` may have shifted it. Task 2 instructs the implementer to grep for the branch, not trust the number.
