import type { NextApiRequest, NextApiResponse } from "next";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { compose, withErrorHandler, withAuth } from "@/lib/api-middleware";
import { BASE, integrationsFile, brandDir } from "@/lib/data/paths";
import { readJSON, writeJSON } from "@/lib/data/json-io";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface IntegrationEntry {
  status?: string;
  lastTestedAt?: string;
  lastError?: string | null;
  notes?: string | null;
  config?: Record<string, string>;
  [key: string]: unknown;
}

interface IntegrationsData {
  dataSources?: Record<string, IntegrationEntry>;
  systemOverrides?: Record<string, IntegrationEntry>;
}

interface GuideStep {
  title: string;
  instructions: string;
}

interface SetupGuide {
  difficulty: string;
  time: string;
  warning?: string;
  steps: GuideStep[];
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

/* ------------------------------------------------------------------ */
/*  GET — Read status + guide                                          */
/* ------------------------------------------------------------------ */

function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;
  const apiId = req.query.apiId as string;

  if (!slug || !apiId) {
    return res.status(400).json({ error: "Missing slug or apiId" });
  }

  // Read integrations.json
  const integrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
  const entry =
    integrations.dataSources?.[apiId] ||
    integrations.systemOverrides?.[apiId] ||
    null;

  // Determine status
  const status = entry?.status || "not_configured";
  const config: Record<string, string> = {};

  // Only return non-sensitive config values
  if (entry?.config) {
    for (const [k, v] of Object.entries(entry.config)) {
      config[k] = v;
    }
  }

  // Read setup guide. The shared skills tree lives one level above BASE
  // (BASE = ~/.openclaw/workspace-sancho → ~/.openclaw/skills/...).
  const guidesPath = path.join(
    BASE,
    "..",
    "skills",
    "acquisition-metrics-plan",
    "schemas",
    "setup-guides.json"
  );
  const allGuides = readJSON<Record<string, SetupGuide>>(guidesPath, {});
  const guide = allGuides[apiId] || null;

  return res.status(200).json({
    status,
    config,
    lastTestedAt: entry?.lastTestedAt || null,
    lastError: entry?.lastError || null,
    notes: entry?.notes || null,
    guide,
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Save credentials + test connection                          */
/* ------------------------------------------------------------------ */

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { slug, apiId, config, secrets, testOnly } = req.body || {};

  if (!slug || !apiId) {
    return res.status(400).json({ error: "Missing slug or apiId" });
  }

  if (!testOnly) {
    // Load or create integrations.json
    const intPath = integrationsFile(slug);
    const integrations = readJSON<IntegrationsData>(intPath, { dataSources: {} });

    if (!integrations.dataSources) {
      integrations.dataSources = {};
    }
    if (!integrations.dataSources[apiId]) {
      integrations.dataSources[apiId] = {};
    }

    // Save non-sensitive config to integrations.json
    if (config && typeof config === "object") {
      integrations.dataSources[apiId].config = {
        ...(integrations.dataSources[apiId].config || {}),
        ...config,
      };
    }

    integrations.dataSources[apiId].status = "pending";
    writeJSON(intPath, integrations);

    // Save secrets to brand/{slug}/.env
    if (secrets && typeof secrets === "object" && Object.keys(secrets).length > 0) {
      const slugUpper = slug.replace(/-/g, "_").toUpperCase();
      const apiUpper = apiId.replace(/-/g, "_").toUpperCase();
      const envPath = path.join(brandDir(slug), ".env");

      // Read existing .env content
      let envContent = "";
      try {
        envContent = fs.readFileSync(envPath, "utf-8");
      } catch {
        // File doesn't exist yet, that's fine
      }

      // Update/add each secret
      for (const [key, value] of Object.entries(secrets)) {
        const envKey = `${slugUpper}_${apiUpper}_${key.toUpperCase()}`;
        const envLine = `${envKey}=${value}`;

        // Check if key already exists in .env
        const regex = new RegExp(`^${envKey}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, envLine);
        } else {
          envContent = envContent.trimEnd() + "\n" + envLine + "\n";
        }
      }

      // Ensure directory exists
      const dir = path.dirname(envPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(envPath, envContent);
    }
  }

  // Run test script. Same shared-skills tree as setup-guides above.
  const scriptDir = path.join(BASE, "..", "skills", "acquisition-metrics-plan", "scripts");
  const testScript = path.join(scriptDir, "test-connection.js");

  let testResult: { status: string; output?: string; error?: string };

  try {
    const output = execSync(
      `/opt/homebrew/bin/node ${testScript} --slug ${slug} --source ${apiId}`,
      {
        cwd: scriptDir,
        timeout: 30_000,
        encoding: "utf-8",
        env: { ...process.env, PATH: process.env.PATH },
      }
    );

    // Re-read integrations.json after test (script may have updated it)
    const updatedIntegrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
    const updatedEntry =
      updatedIntegrations.dataSources?.[apiId] ||
      updatedIntegrations.systemOverrides?.[apiId] ||
      null;

    testResult = {
      status: updatedEntry?.status || "connected",
      output: output.trim() || undefined,
    };
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    const errorMsg = execErr.stderr || execErr.stdout || execErr.message || "Test failed";

    // Re-read integrations.json after failed test too
    const updatedIntegrations = readJSON<IntegrationsData>(integrationsFile(slug), {});
    const updatedEntry =
      updatedIntegrations.dataSources?.[apiId] ||
      updatedIntegrations.systemOverrides?.[apiId] ||
      null;

    testResult = {
      status: updatedEntry?.status || "error",
      error: errorMsg.toString().trim(),
    };
  }

  return res.status(200).json({
    ok: testResult.status === "connected",
    testResult,
  });
}

export default compose(withErrorHandler, withAuth)(handler);
