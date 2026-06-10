import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import { openSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import { withAuth, withErrorHandler, compose } from "@/lib/api-middleware";

/**
 * Sync production client data INTO this staging instance.
 *
 *   POST /api/system/sync-prod-to-staging  { mode: "A" | "B" | "C" }
 *     → spawns scripts/resync-prod-to-staging.sh detached, returns { syncId }.
 *   GET  /api/system/sync-prod-to-staging?id=<syncId>
 *     → { state: "running" | "ok" | "failed", logTail, ... }
 *
 * Two hard safety gates: admin-only, and staging-only. The sync script PULLS
 * from prod and writes only to local staging paths — it can never write to
 * prod — but we still refuse to even start outside staging as defense in depth.
 */

const VALID_MODES = ["A", "B", "C"] as const;
type Mode = (typeof VALID_MODES)[number];

// Prod ships NEXT_PUBLIC_ENV_LABEL empty; staging sets it (e.g. "STAGING").
function isStaging(): boolean {
  const label = (process.env.NEXT_PUBLIC_ENV_LABEL || "").trim();
  if (!label) return false;
  if (label.toUpperCase().includes("PROD")) return false;
  return true;
}

function syncDir(): string {
  const ws = process.env.MC_WORKSPACE || "/root/.openclaw/workspace-sancho";
  return path.join(ws, "_system", "sync-prod-to-staging");
}

function resolveScriptPath(): string | null {
  const candidates = [
    process.env.SYNC_SCRIPT_PATH,
    path.join(process.cwd(), "scripts", "resync-prod-to-staging.sh"),
    "/app/mc-nextjs/scripts/resync-prod-to-staging.sh",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!req.ctx?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }
  if (!isStaging()) {
    return res.status(403).json({
      error: "Only available on staging (prod→staging never writes to prod).",
    });
  }

  const dir = syncDir();
  mkdirSync(dir, { recursive: true });

  if (req.method === "GET") {
    const id = (req.query.id as string) || "";
    if (!id || !/^[A-Za-z0-9.\-:TZ_]+$/.test(id)) {
      return res.status(400).json({ error: "Missing or invalid id" });
    }
    const statusPath = path.join(dir, `${id}.status.json`);
    const logPath = path.join(dir, `${id}.log`);
    if (!existsSync(statusPath)) {
      return res.status(404).json({ error: "Unknown sync id" });
    }
    let status: Record<string, unknown> = {};
    try {
      status = JSON.parse(readFileSync(statusPath, "utf-8"));
    } catch {
      // Status file mid-write — report as running until the next poll.
      status = { syncId: id, state: "running" };
    }
    let logTail = "";
    if (existsSync(logPath)) {
      logTail = readFileSync(logPath, "utf-8").split("\n").slice(-50).join("\n");
    }
    return res.status(200).json({ ...status, logTail });
  }

  if (req.method === "POST") {
    const mode = ((req.body || {}).mode || "A") as Mode;
    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: "mode must be A, B or C" });
    }

    const scriptPath = resolveScriptPath();
    if (!scriptPath) {
      return res.status(500).json({
        error: "Sync script not found (scripts/resync-prod-to-staging.sh).",
      });
    }

    const syncId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}`;
    const logPath = path.join(dir, `${syncId}.log`);
    const statusPath = path.join(dir, `${syncId}.status.json`);

    writeFileSync(
      statusPath,
      JSON.stringify(
        { syncId, mode, state: "running", startedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    // Detached: the sync outlives this request. The script writes its own
    // final state ("ok"/"failed") to STATUS_FILE and streams to the log.
    const logFd = openSync(logPath, "a");
    const child = spawn("bash", [scriptPath], {
      cwd: path.dirname(path.dirname(scriptPath)),
      env: {
        ...process.env,
        MODE: mode,
        SYNC_ID: syncId,
        STATUS_FILE: statusPath,
        ENV_LABEL: process.env.NEXT_PUBLIC_ENV_LABEL || "",
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.on("error", () => {
      try {
        writeFileSync(
          statusPath,
          JSON.stringify({ syncId, mode, state: "failed", error: "spawn failed" }, null, 2),
        );
      } catch {
        /* best effort */
      }
    });
    child.unref();

    return res.status(200).json({ ok: true, syncId, mode });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
