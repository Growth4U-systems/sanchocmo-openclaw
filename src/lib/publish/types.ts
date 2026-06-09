// Channel-agnostic publish abstraction. Today only Slack is registered;
// adding Discord/Telegram = implement Transport + register it (registry.ts).

export interface PublishTarget {
  transport: string; // "slack" today; "discord" | "telegram" later
  channel: string;   // channel id/name in that transport
}

export interface PublishMessage {
  title: string; // posted as the root message
  body: string;  // posted as a threaded reply under the root (or appended, for thread-less transports)
}

export interface PublishResult {
  ok: boolean;
  rootId?: string;   // root message id/ts (for threading/logging)
  threadId?: string; // threaded reply id/ts
  error?: string;
}

export interface Transport {
  name: string;
  isConfigured(slug: string): Promise<boolean>;
  publish(slug: string, target: PublishTarget, msg: PublishMessage): Promise<PublishResult>;
}
