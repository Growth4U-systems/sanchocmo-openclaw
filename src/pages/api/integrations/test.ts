import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, EXEC_PATH } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";


function extractTestError(e: unknown): string {
  const stdout = ((e as Record<string, unknown>).stdout || "").toString();
  const stderr = ((e as Record<string, unknown>).stderr || "").toString();
  const errorMatch = stdout.match(/\u274c Error \u2014 (.+)/);
  return errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || (e instanceof Error ? e.message : "").slice(0, 200));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { slug, source, all } = req.body;
  if (typeof slug !== "string" || !slug) {
    return res.status(400).json({ error: "Missing slug" });
  }
  if (!all && (typeof source !== "string" || !source)) {
    return res.status(400).json({ error: "Missing source" });
  }

  const testScript = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "scripts", "test-connection.js");
  const intPath = path.join(BASE, "brand", slug, "integrations.json");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let intData = readJSON<any>(intPath, { slug, dataSources: {}, systemOverrides: {} });

  const results: Record<string, { status: string; error?: string }> = {};

  function runTest(srcId: string): { status: string; error?: string } {
    try {
      execFileSync(process.execPath, [testScript, "--slug", slug, "--source", srcId], {
        cwd: BASE,
        timeout: 30000,
        encoding: "utf-8",
        env: { ...process.env, MC_WORKSPACE: BASE, PATH: EXEC_PATH },
      });
      try { intData = readJSON(intPath, intData); } catch { /* empty */ }
      const entry = (intData.dataSources || {})[srcId] || (intData.systemOverrides || {})[srcId] || {};
      if (entry.status === "connected") return { status: "connected" };
      const error = entry.lastError || "Connection test did not confirm the provider";
      entry.status = "error";
      entry.lastTestedAt = new Date().toISOString();
      entry.lastError = error;
      return { status: "error", error };
    } catch (e) {
      const extractedError = extractTestError(e);
      try { intData = readJSON(intPath, intData); } catch { /* empty */ }
      const section = (intData.systemOverrides || {})[srcId] ? "systemOverrides" : "dataSources";
      const entry = intData[section]?.[srcId];
      const realError = entry?.lastError || extractedError;
      if (intData[section] && intData[section][srcId]) {
        intData[section][srcId].status = "error";
        intData[section][srcId].lastTestedAt = new Date().toISOString();
        intData[section][srcId].lastError = realError;
      }
      return { status: "error", error: realError };
    }
  }

  if (all) {
    const allSources = { ...(intData.dataSources || {}), ...(intData.systemOverrides || {}) };
    for (const [srcId, srcData] of Object.entries(allSources)) {
      if ((srcData as Record<string, unknown>).status === "not_configured") continue;
      results[srcId] = runTest(srcId);
    }
  } else if (source) {
    results[source] = runTest(source);
  }

  intData.updatedAt = new Date().toISOString();
  const brandDir = path.join(BASE, "brand", slug);
  fs.mkdirSync(brandDir, { recursive: true });
  try { writeJSON(intPath, intData); } catch { /* empty */ }

  return res.status(200).json({
    ok: Object.values(results).every((result) => result.status === "connected"),
    results,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
