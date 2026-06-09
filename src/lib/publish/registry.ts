import type { Transport } from "./types";
import { SlackTransport } from "./slack";

// Only Slack is registered today. To add Discord/Telegram: implement Transport
// in src/lib/publish/<name>.ts and add one entry here.
const transports: Record<string, Transport> = {
  slack: new SlackTransport(),
};

export function resolveTransport(name: string): Transport {
  const t = transports[name];
  if (!t) {
    const registered = Object.keys(transports).join(", ");
    throw new Error(`Transport "${name}" not available — only [${registered}] are registered`);
  }
  return t;
}

export function registeredTransports(): string[] {
  return Object.keys(transports);
}
