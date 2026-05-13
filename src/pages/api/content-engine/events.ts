/**
 * GET /api/content-engine/events?slug=X
 *
 * Server-Sent Events stream of content-engine state changes for a brand. The
 * frontend subscribes via EventSource and invalidates the React Query cache
 * on relevant events — replacing the polling-based "is the CT still
 * advancing?" loop that left a stale window every time the agent advanced a
 * CT autonomously (typical 409 on "Aprobar texto" right after Sancho
 * finished a draft).
 *
 * Events emitted: `content-task-updated`, `content-task-list-changed`,
 * `draft-updated`. See `src/lib/data/events.ts` for the union.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { subscribe } from "@/lib/data/events";

// Disable Next.js' default response buffering — SSE requires the chunks to
// flush to the client as they're written.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const slug = (req.query.slug as string | undefined)?.trim();
  if (!slug) return res.status(400).end("Missing slug");

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Reverse-proxy hint (nginx) to disable buffering on this response.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Initial hello so the client knows the connection is live even before
  // anything happens. Comments (": ...") are valid SSE no-op frames.
  res.write(": connected\n\n");

  const unsubscribe = subscribe(slug, (event) => {
    try {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Write after close — let the close handler clean up.
    }
  });

  // Heartbeat every 25s so intermediate proxies don't time the connection
  // out, and so we detect a dead socket via the eventual write failure.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      // Ignore — close handler will fire.
    }
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
}
