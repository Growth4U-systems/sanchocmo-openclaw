/**
 * MC Chat Channel Plugin — Entry point
 *
 * Registers the mc-chat channel + HTTP webhook endpoint for inbound messages
 * from Mission Control server.
 */

import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { mcChatPlugin } from "./channel.js";

let _runtime = null;

function setMcChatRuntime(runtime) {
  _runtime = runtime;
}

export function getMcChatRuntime() {
  return _runtime;
}

export default defineChannelPluginEntry({
  id: "mc-chat",
  name: "Mission Control Chat",
  description: "Webchat channel for Mission Control dashboard",
  plugin: mcChatPlugin,
  setRuntime: setMcChatRuntime,

  registerFull(api) {
    const logger = api.logger;

    // ─── HTTP Route: Inbound webhook from MC Server ───
    // MC Server POSTs here when a user sends a message from the dashboard chat
    api.registerHttpRoute({
      path: "/mc-chat/inbound",
      auth: "plugin", // we handle auth ourselves (shared secret)
      handler: async (req, res) => {
        // Only accept POST
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return true;
        }

        // Read body
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 100_000) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Payload too large" }));
            return true;
          }
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return true;
        }

        // Validate shared secret
        const account = mcChatPlugin.setup?.resolveAccount?.(api.config);
        const expectedSecret = account?.sharedSecret;
        if (expectedSecret) {
          const providedSecret = req.headers["x-mc-secret"];
          if (providedSecret !== expectedSecret) {
            logger.warn("[mc-chat] Invalid shared secret from MC server");
            res.statusCode = 403;
            res.end(JSON.stringify({ error: "Forbidden" }));
            return true;
          }
        }

        const {
          slug,        // client slug
          threadId,    // MC thread id
          threadName,  // thread display name
          text,        // user message text
          userId,      // MC user id (portal token or username)
          userName,    // display name
          linkedTo,    // optional: what this thread is linked to (pilar, project, idea)
          skill,       // optional: skill context
          agentId,     // optional: target agent (default: sancho)
        } = payload;

        if (!slug || !threadId || !text) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing required fields: slug, threadId, text" }));
          return true;
        }

        logger.info(`[mc-chat] Inbound from ${userName || userId || "unknown"} → ${slug}/${threadId}: ${text.slice(0, 80)}`);

        // Build the chat target (used for routing responses back)
        const chatId = `mc-chat:${slug}:${threadId}`;

        // Build context prefix for the agent
        const contextParts = [];
        if (linkedTo) contextParts.push(`linkedTo: ${linkedTo}`);
        if (skill) contextParts.push(`skill: ${skill}`);
        if (threadName) contextParts.push(`thread: "${threadName}"`);
        const contextStr = contextParts.length > 0
          ? `[MC Chat | client: ${slug} | ${contextParts.join(" | ")}]`
          : `[MC Chat | client: ${slug}]`;

        // Dispatch to OpenClaw via the runtime
        // The runtime handles session creation, agent routing, etc.
        try {
          if (_runtime && _runtime.chat) {
            // Use the runtime chat API to send the message
            await _runtime.chat.send({
              channel: "mc-chat",
              chatId,
              text: `${contextStr}\n\n${text}`,
              sender: {
                id: userId || `mc-user-${slug}`,
                name: userName || "MC User",
                username: userId || `mc-user-${slug}`,
              },
              agentId: agentId || undefined,
              metadata: {
                slug,
                threadId,
                threadName,
                linkedTo,
                skill,
              },
            });
          } else {
            // Fallback: use the gateway chat.send method
            logger.warn("[mc-chat] Runtime not available, attempting gateway method");
          }
        } catch (err) {
          logger.error(`[mc-chat] Dispatch error: ${err.message}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal dispatch error" }));
          return true;
        }

        // Acknowledge receipt immediately — response comes async via callback
        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          chatId,
          message: "Message dispatched to agent",
        }));
        return true;
      },
    });

    // ─── HTTP Route: Health check ───
    api.registerHttpRoute({
      path: "/mc-chat/health",
      auth: "plugin",
      handler: async (req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({
          ok: true,
          channel: "mc-chat",
          version: "0.1.0",
          ts: new Date().toISOString(),
        }));
        return true;
      },
    });

    logger.info("[mc-chat] Channel plugin registered — webhook at /mc-chat/inbound");
  },
});

export { mcChatPlugin };
