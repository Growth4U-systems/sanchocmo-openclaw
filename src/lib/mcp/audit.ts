import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import { db, hasDatabase } from "@/db/drizzle";
import { mcpAuditEvents } from "@/db/schema";
import type { McpPrincipal } from "@/lib/mcp/auth";

interface McpAuditEvent {
  principal: McpPrincipal;
  toolName: string;
  ok: boolean;
  clientSlug?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function auditMcpToolCall(event: McpAuditEvent): Promise<void> {
  const entry = buildAuditEntry(event);
  if (process.env.SANCHO_MCP_AUDIT_BACKEND === "db") {
    if (!hasDatabase) {
      const message = "SANCHO_MCP_AUDIT_BACKEND=db requires DATABASE_URL";
      if (process.env.SANCHO_MCP_AUDIT_FAIL_CLOSED === "true") {
        throw new Error(message);
      }
      await appendJsonl({
        ...entry,
        auditBackend: "file-fallback",
        auditDbError: message,
      });
      return;
    }

    try {
      await db.insert(mcpAuditEvents).values({
        id: entry.id,
        principalId: entry.principalId,
        tokenHash: entry.tokenHash,
        toolName: entry.toolName,
        clientSlug: entry.clientSlug,
        ok: entry.ok,
        error: entry.error,
        metadata: entry.metadata,
        createdAt: new Date(entry.at),
      });
      return;
    } catch (err) {
      if (process.env.SANCHO_MCP_AUDIT_FAIL_CLOSED === "true") {
        throw err;
      }
      await appendJsonl({
        ...entry,
        auditBackend: "file-fallback",
        auditDbError: err instanceof Error ? err.message : "Unknown DB audit error",
      });
      return;
    }
  }

  await appendJsonl(entry);
}

function buildAuditEntry(event: McpAuditEvent) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    principalId: event.principal.id,
    tokenHash: event.principal.tokenHash,
    toolName: event.toolName,
    clientSlug: event.clientSlug,
    ok: event.ok,
    error: event.error,
    metadata: event.metadata || {},
  };
}

async function appendJsonl(entry: Record<string, unknown>): Promise<void> {
  const auditPath =
    process.env.SANCHO_MCP_AUDIT_FILE ||
    path.join(process.cwd(), ".context", "sancho-mcp-audit.jsonl");

  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
}
