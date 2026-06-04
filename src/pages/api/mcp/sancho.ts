import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpAuthError, authenticateMcpRequest } from "@/lib/mcp/auth";
import { createSanchoMcpServer } from "@/lib/mcp/server";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const traceId = getTraceId(req);
  res.setHeader("X-Request-Id", traceId);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Sancho MCP supports POST Streamable HTTP requests.",
      },
      id: null,
    });
  }

  let principal;
  try {
    principal = authenticateMcpRequest(req);
  } catch (err) {
    const status = err instanceof McpAuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Sancho MCP authentication failed";
    return res.status(status).json({
      jsonrpc: "2.0",
      error: {
        code: status === 401 || status === 403 ? -32001 : -32603,
        message,
      },
      id: null,
    });
  }

  const server = createSanchoMcpServer({ principal, traceId });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  };

  res.on("close", () => {
    void cleanup();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[sancho-mcp] Request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal Sancho MCP error",
        },
        id: null,
      });
    }
  } finally {
    if (res.writableEnded) {
      await cleanup();
    }
  }
}

function getTraceId(req: NextApiRequest): string {
  const header = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 128);
  return crypto.randomUUID();
}
