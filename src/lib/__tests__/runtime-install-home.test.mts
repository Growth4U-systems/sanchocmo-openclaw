import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as pathsModule from "../data/paths";

const paths =
  (pathsModule as unknown as { default: typeof pathsModule }).default ?? pathsModule;

const REPO_ROOT = process.cwd();

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("installHome is the parent of the MC workspace by default", () => {
  withEnv(
    { SANCHO_HOME: undefined, OPENCLAW_HOME: undefined, MC_WORKSPACE: "/srv/sancho/workspace-sancho" },
    () => {
      assert.equal(paths.installHome(), "/srv/sancho");
      assert.equal(paths.skillsRoot(), path.join("/srv/sancho", "skills"));
    },
  );
});

test("OPENCLAW_HOME overrides the derived install home (existing installs)", () => {
  withEnv(
    { SANCHO_HOME: undefined, OPENCLAW_HOME: "/srv/openclaw-home", MC_WORKSPACE: "/srv/elsewhere/workspace-sancho" },
    () => {
      assert.equal(paths.installHome(), "/srv/openclaw-home");
      assert.equal(paths.skillsRoot(), path.join("/srv/openclaw-home", "skills"));
    },
  );
});

test("SANCHO_HOME overrides OPENCLAW_HOME and the derived install home", () => {
  withEnv(
    { SANCHO_HOME: "/opt/sancho-home", OPENCLAW_HOME: "/srv/openclaw-home", MC_WORKSPACE: "/srv/elsewhere/workspace-sancho" },
    () => {
      assert.equal(paths.installHome(), "/opt/sancho-home");
      assert.equal(paths.skillsRoot(), path.join("/opt/sancho-home", "skills"));
    },
  );
});

test("installHome resolves env at call time, not module load", () => {
  withEnv({ SANCHO_HOME: undefined, OPENCLAW_HOME: undefined, MC_WORKSPACE: "/first/workspace-sancho" }, () => {
    assert.equal(paths.installHome(), "/first");
    withEnv({ MC_WORKSPACE: "/second/workspace-sancho" }, () => {
      assert.equal(paths.installHome(), "/second");
    });
  });
});

// Regression guard for the 2026-07-15 prod incident: with the runtime switched
// to external-http, state.home() points at the runtime's private state dir
// (workspace-sancho/_runtime/external-http) and the Skills panel went empty —
// the 171-skill catalog was intact the whole time. Install-level assets
// (skills/, workspace-maese-pedro/) must resolve via installHome(), never via
// the active runtime's state home.
const INSTALL_ASSET_FILES = [
  "src/pages/api/system/skills.ts",
  "src/pages/api/media-tasks/dispatch.ts",
  "src/lib/open-design/actions.ts",
];

test("install-asset modules do not locate assets via the runtime state home", () => {
  for (const relative of INSTALL_ASSET_FILES) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
    assert.doesNotMatch(
      source,
      /state\.home\(\)/,
      `${relative} must resolve install assets via installHome()/skillsRoot() from @/lib/data/paths — the runtime state home is per-runtime private state and breaks under hermes/external-http (SAN-485)`,
    );
  }
});
