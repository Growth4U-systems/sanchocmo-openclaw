import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerminalDeliveryBuffer } from "../terminal-delivery-buffer.js";

test("multiple OpenClaw deliveries become one ordered terminal result", () => {
  const buffer = createTerminalDeliveryBuffer();
  assert.equal(buffer.hasVisible(), false);
  assert.equal(
    buffer.append({
      parts: ["Parte uno", ""],
      agent: "sancho",
      discordLink: { threadId: "discord-thread", channelId: "channel" },
    }),
    true,
  );
  assert.equal(buffer.append({ text: "Parte dos", agent: "sancho" }), true);
  assert.equal(buffer.hasVisible(), true);

  assert.deepEqual(buffer.drain(), {
    text: "Parte uno\n\nParte dos",
    agent: "sancho",
    discordLink: { threadId: "discord-thread", channelId: "channel" },
    deliveryCount: 2,
  });
  assert.equal(buffer.hasVisible(), false);
  assert.equal(buffer.drain(), null);
});

test("empty delivery fragments never create a terminal result", () => {
  const buffer = createTerminalDeliveryBuffer();
  assert.equal(buffer.append({ parts: ["", "   "] }), false);
  assert.equal(buffer.drain(), null);
});
