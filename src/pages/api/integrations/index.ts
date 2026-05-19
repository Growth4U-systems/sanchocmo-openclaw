import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, EXEC_PATH } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const slug = (req.query.slug as string) || "";
    if (!slug) {
      return res.status(400).json({ error: "Missing slug parameter" });
    }

    // Shared skills tree lives at ~/.openclaw/skills/, one level above BASE.
    const catalogPath = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "schemas", "api-catalog.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const catalog = readJSON<any>(catalogPath, { categories: {} });

    const intPath = path.join(BASE, "brand", slug, "integrations.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intData = readJSON<any>(intPath, { slug, dataSources: {}, systemOverrides: {} });

    // Merge catalog info with client status
    const merged: Record<string, unknown> = {
      slug,
      dataSources: {} as Record<string, unknown>,
      systemOverrides: {} as Record<string, unknown>,
      updatedAt: intData.updatedAt || null,
    };

    for (const [, catData] of Object.entries(catalog.categories || {})) {
      const cat = catData as { apis?: Record<string, { provider?: string; ownership?: string }> };
      for (const [apiId, apiMeta] of Object.entries(cat.apis || {})) {
        const ownership = apiMeta.ownership || "system";
        const isSystem = ownership === "system";
        const section = isSystem ? "systemOverrides" : "dataSources";
        const clientEntry = (intData.systemOverrides || {})[apiId] || (intData.dataSources || {})[apiId] || {};
        (merged[section] as Record<string, unknown>)[apiId] = {
          provider: apiMeta.provider,
          status: clientEntry.status || "not_configured",
          config: clientEntry.config || {},
          envVars: clientEntry.envVars || [],
          lastTestedAt: clientEntry.lastTestedAt || null,
          lastError: clientEntry.lastError || null,
          notes: clientEntry.notes || null,
        };
      }
    }

    return res.status(200).json(merged);
  }

  if (req.method === "POST") {
    const { slug, source, type, config, secrets } = req.body;
    if (!slug || !source) {
      return res.status(400).json({ error: "Missing slug or source" });
    }

    const brandDir = path.join(BASE, "brand", slug);
    fs.mkdirSync(brandDir, { recursive: true });

    const intPath = path.join(brandDir, "integrations.json");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let intData = readJSON<any>(intPath, { slug, dataSources: {}, systemOverrides: {} });
    if (!intData.dataSources) intData.dataSources = {};
    if (!intData.systemOverrides) intData.systemOverrides = {};

    const section = type === "override" ? "systemOverrides" : "dataSources";
    if (!intData[section][source]) {
      intData[section][source] = { provider: source, status: "not_configured", config: {}, envVars: [] };
    }

    const entry = intData[section][source];

    // Save config (non-sensitive)
    if (config && typeof config === "object") {
      entry.config = { ...(entry.config || {}), ...config };
    }

    // Save secrets to brand/.env
    if (secrets && typeof secrets === "object" && Object.keys(secrets).length > 0) {
      const envPath = path.join(brandDir, ".env");
      let envContent = "";
      try { envContent = fs.readFileSync(envPath, "utf-8"); } catch { /* empty */ }
      const envLines = envContent.split("\n");
      const envVarNames: string[] = [];

      for (const [key, value] of Object.entries(secrets)) {
        const envKey = `${slug.toUpperCase().replace(/-/g, "_")}_${source.toUpperCase().replace(/-/g, "_")}_${key}`;
        envVarNames.push(envKey);

        let found = false;
        for (let i = 0; i < envLines.length; i++) {
          if (envLines[i].startsWith(envKey + "=")) {
            envLines[i] = `${envKey}=${value}`;
            found = true;
            break;
          }
        }
        if (!found) envLines.push(`${envKey}=${value}`);
      }

      fs.writeFileSync(envPath, envLines.filter((l) => l !== "").join("\n") + "\n", "utf-8");
      entry.envVars = Array.from(new Set([...(entry.envVars || []), ...envVarNames]));
    }

    entry.status = "pending";
    intData.updatedAt = new Date().toISOString();
    writeJSON(intPath, intData);

    // Run test-connection.js for this source
    const testScript = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "scripts", "test-connection.js");
    let testResult: Record<string, unknown> = { status: "pending" };

    try {
      const testOutput = execSync(`node "${testScript}" --slug ${slug} --source ${source}`, {
        cwd: BASE,
        timeout: 30000,
        encoding: "utf-8",
        env: { ...process.env, PATH: EXEC_PATH },
      });
      try { intData = readJSON(intPath, intData); } catch { /* empty */ }
      const updatedEntry = (intData.dataSources || {})[source] || (intData.systemOverrides || {})[source] || {};
      testResult = { status: updatedEntry.status || "connected", output: testOutput.slice(-300) };
    } catch (e) {
      const stdout = ((e as Record<string, unknown>).stdout || "").toString();
      const stderr = ((e as Record<string, unknown>).stderr || "").toString();
      const errorMatch = stdout.match(/\u274c Error \u2014 (.+)/);
      const realError = errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || (e instanceof Error ? e.message : "").slice(0, 200));
      try { intData = readJSON(intPath, intData); } catch { /* empty */ }
      testResult = { status: "error", error: realError };
    }

    try { writeJSON(intPath, intData); } catch { /* empty */ }

    return res.status(200).json({ ok: true, testResult });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}

export default compose(withErrorHandler, withAuth)(handler);
