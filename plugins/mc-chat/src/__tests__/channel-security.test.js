import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const channelSource = fs.readFileSync(
  new URL("../channel.js", import.meta.url),
  "utf8",
);
const pluginSource = fs.readFileSync(
  new URL("../index.js", import.meta.url),
  "utf8",
);

function occurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

test("channel callbacks validate the control-plane origin and use the durable outbox", () => {
  assert.match(
    channelSource,
    /import \{ validatedControlPlaneOrigin \} from "\.\/chat-turn-authority\.js";/,
  );
  assert.equal(
    occurrences(
      channelSource,
      "const callbackUrl = missionControlWebhookUrl(account);",
    ),
    2,
  );
  assert.equal(occurrences(channelSource, "if (!callbackUrl)"), 2);
  assert.equal(occurrences(channelSource, 'redirect: "error"'), 0);
  assert.match(
    channelSource,
    /import \{ enqueueOpenClawTerminalCallback \} from "\.\/callback-delivery\.js";/,
  );
  assert.equal(
    occurrences(channelSource, "enqueueOpenClawTerminalCallback({"),
    2,
  );
});

test("Discord outbound ingress remains explicitly fail-closed without scoped authority", () => {
  assert.doesNotMatch(pluginSource, /\bapi\.registerOutboundHook\s*\(/);
  assert.doesNotMatch(pluginSource, /\/api\/chat\/find-by-discord\//);
  assert.doesNotMatch(pluginSource, /Relayed Discord message from/);
  assert.match(
    pluginSource,
    /Discord→MC outbound relay disabled: scoped ingress authority is not implemented/,
  );
});

test("every channel callback carries exact-run capability headers", () => {
  assert.equal(occurrences(channelSource, '"X-Sancho-Run-Capability"'), 2);
  assert.equal(occurrences(channelSource, '"X-Mission-Control-Run-Id"'), 2);
  assert.match(pluginSource, /const callbackRunAuthorityHeaders = \{/);
  assert.match(pluginSource, /\.\.\.callbackRunAuthorityHeaders,/);
  assert.match(channelSource, /"X-Sancho-Terminal-Callback-Grant"/);
  assert.match(pluginSource, /"X-Sancho-Terminal-Callback-Grant"/);
  assert.match(pluginSource, /initializeOpenClawCallbackDelivery\(\{/);
  assert.equal(
    occurrences(pluginSource, "await postTerminalDurably({"),
    3,
  );
});

test("Discord thread creation is explicitly fail-closed without scoped authority", () => {
  const route = pluginSource.indexOf('path: "/mc-chat/create-discord-thread"');
  assert.ok(route >= 0);
  assert.match(
    pluginSource.slice(route, route + 500),
    /Discord thread creation disabled until scoped authority is implemented/,
  );
  assert.doesNotMatch(pluginSource, /action: "thread-create"/);
});

test("the durable worker is a full-runtime service and dispatches claims in process", () => {
  assert.match(pluginSource, /api\.registrationMode === "full"/);
  assert.match(pluginSource, /api\.registerService\(\{/);
  assert.match(pluginSource, /id: "mc-chat-agent-turn-worker"/);
  assert.match(pluginSource, /const request = Readable\.from\(/);
  assert.match(pluginSource, /request\.durableTurnClaim = claim/);
  assert.match(pluginSource, /await handleInboundRequest\(request, response\)/);
  assert.match(
    pluginSource,
    /async stop\(\) \{\s*\/\/[^]*?callbackDelivery\.stop\(\);\s*await stopDurableWorker\(\);/,
  );
  assert.doesNotMatch(pluginSource, /fetch\([^\n]*\/mc-chat\/inbound/);
});

test("durable turns install a fail-closed tool boundary before OpenClaw execution", () => {
  assert.match(
    pluginSource,
    /createDurableToolBoundary\(\{\s*ledgerAdmissionTools: \[\s*LEADS_SEARCH_START_TOOL,\s*PARTNERSHIPS_DISCOVERY_START_TOOL,\s*\]/,
  );
  assert.match(
    pluginSource,
    /durableToolBoundary\.beforeToolCall\(event, ctx\) \?\?\s*mcChatCostGuard\.beforeToolCall\(event, ctx\)/,
  );
  assert.match(
    pluginSource,
    /if \(durableTurnClaim && !beforeToolCallHookRegistered\)/,
  );
  assert.match(
    pluginSource,
    /const releaseDurableToolBoundary = durableTurnClaim\s*\? durableToolBoundary\.registerTurn/,
  );
  assert.match(pluginSource, /releaseDurableToolBoundary\(\);/);
});

test("the exact-run Stop rail precedes terminal, chat-turn and duplicate admission", () => {
  const stopControl = pluginSource.indexOf(
    "const runtimeStop = processRuntimeStopControl",
  );
  const terminalAuthority = pluginSource.indexOf(
    "const adapterTerminalCallbackAuthority",
  );
  const chatTurnAuthority = pluginSource.indexOf(
    "const trustedTurn = await authorizeChatTurnWithControlPlane",
  );
  const inboundAdmission = pluginSource.indexOf(
    "const inboundAdmission = claimRuntimeInbound",
  );
  assert.ok(stopControl >= 0);
  assert.ok(terminalAuthority > stopControl);
  assert.ok(chatTurnAuthority > stopControl);
  assert.ok(inboundAdmission > stopControl);
});
