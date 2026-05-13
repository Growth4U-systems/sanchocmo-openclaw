/**
 * Mini SSE parser para consumir streams del daemon de Open Design.
 * No depende de EventSource (no soporta POST con body); usa fetch + ReadableStream.
 */

import type { OdSseEvent } from "./types";

interface SseFrame {
  event?: string;
  data: string;
  id?: string;
}

/** Parser line-based de SSE. Cada frame separado por blank line. */
async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let blankIdx;
      while ((blankIdx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, blankIdx);
        buffer = buffer.slice(blankIdx + 2);

        const frame: SseFrame = { data: "" };
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

          if (field === "event") frame.event = value;
          else if (field === "data") frame.data += (frame.data ? "\n" : "") + value;
          else if (field === "id") frame.id = value;
        }
        if (frame.data || frame.event) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Mapea un frame SSE crudo a OdSseEvent tipado. */
function frameToEvent(frame: SseFrame): OdSseEvent {
  let payload: unknown = frame.data;
  if (frame.data) {
    try {
      payload = JSON.parse(frame.data);
    } catch {
      // queda como string
    }
  }
  const eventName = frame.event ?? (typeof payload === "object" && payload && "type" in payload ? (payload as { type: string }).type : undefined);

  switch (eventName) {
    case "text_delta": {
      const p = payload as { delta?: string };
      return { type: "text_delta", delta: p?.delta ?? "" };
    }
    case "tool_call": {
      const p = payload as { tool?: string; args?: Record<string, unknown> };
      return { type: "tool_call", tool: p?.tool ?? "unknown", args: p?.args };
    }
    case "tool_result": {
      const p = payload as { tool?: string; result?: unknown };
      return { type: "tool_result", tool: p?.tool ?? "unknown", result: p?.result };
    }
    case "thinking": {
      const p = payload as { delta?: string };
      return { type: "thinking", delta: p?.delta };
    }
    case "artifact_created": {
      const p = payload as { artifactId?: string; primaryFile?: string };
      return { type: "artifact_created", artifactId: p?.artifactId ?? "", primaryFile: p?.primaryFile };
    }
    case "error": {
      const p = payload as { message?: string };
      return { type: "error", message: p?.message ?? String(frame.data) };
    }
    case "done": {
      const p = payload as { artifactId?: string };
      return { type: "done", artifactId: p?.artifactId };
    }
    default:
      return { type: "raw", eventName, data: payload };
  }
}

/** Itera eventos tipados desde un Response con body SSE. */
export async function* readOdSseEvents(response: Response): AsyncGenerator<OdSseEvent> {
  if (!response.body) {
    throw new Error("OD SSE response has no body");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OD SSE request failed: ${response.status} ${text.slice(0, 300)}`);
  }
  for await (const frame of parseSseStream(response.body)) {
    yield frameToEvent(frame);
  }
}
