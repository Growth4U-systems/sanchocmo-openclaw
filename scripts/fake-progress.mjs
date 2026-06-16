#!/usr/bin/env node
/**
 * Fake progress emitter — drives the new POST /api/chat/webhook
 * `role: "progress"` protocol with a scripted sequence so we can verify
 * the timeline UI without the real OpenClaw gateway plugin in the loop.
 *
 * Usage:
 *   node scripts/fake-progress.mjs <slug> [shortId]
 *
 * Example:
 *   node scripts/fake-progress.mjs growth4u general
 *
 * Reads MC_CHAT_SECRET from the environment (matches what
 * src/lib/data/mc-chat.ts:getChatSecret() expects).
 */

const MC_URL = process.env.MC_URL || "http://localhost:3000";
const MC_CHAT_SECRET = process.env.MC_CHAT_SECRET;

const slug = process.argv[2];
const shortId = process.argv[3] || "general";

if (!slug) {
  console.error("usage: fake-progress.mjs <slug> [shortId]");
  process.exit(2);
}

const threadId = `${slug}:${shortId}`;

async function post(body) {
  const res = await fetch(`${MC_URL}/api/chat/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MC_CHAT_SECRET ? { "X-MC-Secret": MC_CHAT_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`POST ${res.status}: ${await res.text()}`);
  }
  return res.ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sequence = [
  { kind: "thinking", label: "Leyendo el contexto del thread", agent: "sancho" },
  { kind: "agent_handoff", label: "Delegando a Dulcinea", target: "dulcinea", agent: "sancho" },
  { kind: "read", label: "Abriendo brand brief", target: "foundation/brand-book/voice.current.md", agent: "dulcinea" },
  { kind: "search", label: "Buscando contenido reciente", target: "content/posts/", agent: "dulcinea" },
  { kind: "tool_call", label: "Generando draft", target: "draft-writer", agent: "dulcinea" },
  { kind: "file_write", label: "Escribiendo borrador", target: "drafts/2026-05-08-post-1.md", agent: "dulcinea" },
  { kind: "tool_call", label: "Revisando con Hamete", target: "fact-checker", agent: "hamete" },
  { kind: "thinking", label: "Componiendo respuesta final", agent: "dulcinea" },
];

(async () => {
  console.log(`[fake-progress] Sending ${sequence.length} events to ${threadId}`);
  // Initial status (legacy role) so the typing indicator turns on immediately.
  await post({
    threadId,
    slug,
    role: "status",
    text: "Sancho está pensando…",
    agent: "sancho",
  });
  await sleep(500);

  for (const evt of sequence) {
    const ok = await post({
      threadId,
      slug,
      role: "progress",
      agent: evt.agent,
      event: { kind: evt.kind, label: evt.label, target: evt.target },
    });
    console.log(`  ${ok ? "✓" : "✗"} ${evt.kind}: ${evt.label}`);
    await sleep(900);
  }

  // Final bot reply — the webhook will seal pendingProgress into this message
  await post({
    threadId,
    slug,
    text: "Listo. Borrador guardado y revisado.",
    agent: "dulcinea",
  });
  console.log("[fake-progress] Final bot reply sent. Pending progress sealed.");
})();
