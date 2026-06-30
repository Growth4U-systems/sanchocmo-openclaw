import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sancho-integrations-actions-"));
const workspace = path.join(root, "workspace-sancho");
process.env.MC_WORKSPACE = workspace;

function seedJson(relPath: string, value: unknown) {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(value, null, 2), "utf8");
}

test("system-only ScrapeCreators can be tested without client integrations entry", async (t) => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  seedJson("skills/acquisition-metrics-plan/schemas/api-catalog.json", {
    categories: {
      search_data: {
        apis: {
          scrapecreators: {
            provider: "ScrapeCreators",
            ownership: "system",
            systemOnly: true,
          },
        },
      },
    },
  });
  seedJson("workspace-sancho/brand/growth4u/integrations.json", {
    client: "growth4u",
    dataSources: {},
    systemOverrides: {},
  });

  const mod = await import("../integrations/actions");
  const preview = mod.previewTestIntegrationConnection({
    clientSlug: "growth4u",
    source: "scrapecreators",
  });

  assert.deepEqual(preview.targets, ["scrapecreators"]);
  assert.equal(preview.willRunScript, true);
});
