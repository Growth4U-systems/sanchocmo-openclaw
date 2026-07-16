import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Partnerships effects-v2 is propagated but remains off by default", () => {
  assert.match(
    source(".env.example"),
    /^# PARTNERSHIPS_DISCOVERY_EFFECTS_V2=off\s+# off\|canary;/m,
  );
  assert.match(
    source(".github/workflows/ci.yml"),
    /^  PARTNERSHIPS_DISCOVERY_EFFECTS_V2: "off"$/m,
  );

  for (const workflow of [
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/deploy-prod.yml",
  ]) {
    const contents = source(workflow);
    assert.match(
      contents,
      /PARTNERSHIPS_DISCOVERY_EFFECTS_V2: \$\{\{ vars\.PARTNERSHIPS_DISCOVERY_EFFECTS_V2 \|\| 'off' \}\}/,
      workflow,
    );
    assert.match(contents, /"PARTNERSHIPS_DISCOVERY_EFFECTS_V2"/, workflow);
    assert.doesNotMatch(
      contents,
      /PARTNERSHIPS_DISCOVERY_EFFECTS_V2: \$\{\{[^\n]*'canary'/,
      workflow,
    );
  }
});
