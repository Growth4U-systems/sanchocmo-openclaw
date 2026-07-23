/**
 * OpenClaw may invoke `deliver` more than once for one model turn. Mission
 * Control has one terminal AgentRun result, so retain every visible part and
 * publish them together after the buffered dispatcher has fully drained.
 */
export function createTerminalDeliveryBuffer() {
  const deliveries = [];

  return {
    hasVisible() {
      return deliveries.length > 0;
    },

    append(input = {}) {
      const parts = (Array.isArray(input.parts) ? input.parts : [input.text])
        .map((part) => String(part || "").trim())
        .filter(Boolean);
      if (parts.length === 0) return false;
      deliveries.push({
        parts,
        agent:
          typeof input.agent === "string" && input.agent
            ? input.agent
            : undefined,
        discordLink: input.discordLink || null,
      });
      return true;
    },

    drain() {
      if (deliveries.length === 0) return null;
      const batch = deliveries.splice(0, deliveries.length);
      return {
        text: batch.flatMap((delivery) => delivery.parts).join("\n\n"),
        agent: batch.find((delivery) => delivery.agent)?.agent || "sancho",
        discordLink:
          batch.find((delivery) => delivery.discordLink)?.discordLink || null,
        deliveryCount: batch.length,
      };
    },
  };
}
