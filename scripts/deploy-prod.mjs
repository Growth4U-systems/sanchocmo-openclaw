#!/usr/bin/env node
/**
 * Pick a version and ship it to prod (SAN-450).
 *
 *   npm run deploy:prod                → interactive picker
 *   npm run deploy:prod -- --latest    → ship the newest Release, no prompt
 *   npm run deploy:prod -- --tag v1.2.3
 *   npm run deploy:prod -- --dry-run   → resolve + print, dispatch nothing
 *
 * Why this exists: GitHub can't populate a `workflow_dispatch` dropdown from the
 * Releases API (dispatch inputs are static YAML), so the Actions UI can only offer
 * a free-text tag field. This is the version picker — a real list, always fresh.
 *
 * Two things it guarantees over the Actions UI:
 *   • Only *published Releases* are offered. Tags alone are not deployable
 *     (v1.0.6/7/8 exist as tags but were never released) and deploy-prod.yml
 *     rejects them — this never shows them in the first place.
 *   • `--ref main` is pinned, so the deploy logic always comes from the trunk.
 *
 * It only DISPATCHES the workflow — the deploy itself, its guards and its rollback
 * all still run in Actions. Nothing here touches the VPS.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const WORKFLOW = "deploy-prod.yml";
const HOW_MANY = 15;

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  const val = i !== -1 ? args[i + 1] : undefined;
  return val && !val.startsWith("--") ? val : null;
};

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const abort = () => {
  console.log("\n\n  Aborted. Nothing was dispatched.\n");
  process.exit(0);
};

/**
 * Prompt once. Ctrl+D/EOF rejects with an AbortError that would otherwise crash
 * with a stack trace — at a prod-deploy confirm, that reads like a bug rather
 * than the clean "nothing happened" it actually is.
 */
const ask = async (question) => {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } catch {
    abort();
  } finally {
    rl.close();
  }
};

/** Run a command, capture stdout, die with its stderr on failure. */
const run = (cmd, cmdArgs) => {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
  if (res.error?.code === "ENOENT") {
    die(`\`${cmd}\` not found. Install the GitHub CLI: https://cli.github.com`);
  }
  if (res.status !== 0) {
    die(`\`${cmd} ${cmdArgs.join(" ")}\` failed:\n${res.stderr?.trim() || res.stdout?.trim()}`);
  }
  return res.stdout.trim();
};

run("gh", ["auth", "status"]);

// `gh api` rather than `gh release list --json`: same data, but it doesn't pin a
// minimum gh version (`release list --json` needs gh >= 2.14; Ubuntu's own repo
// still ships 2.4.0). Nobody should have to upgrade their CLI to ship a release.
// {owner}/{repo} resolve from the git remote.
const releases = JSON.parse(
  run("gh", ["api", `repos/{owner}/{repo}/releases?per_page=${HOW_MANY}`]),
)
  // Drafts have no tag to deploy; pre-releases aren't prod material.
  .filter((r) => !r.draft && !r.prerelease)
  .map((r) => ({ tagName: r.tag_name, publishedAt: r.published_at }));

if (releases.length === 0) {
  die("No published Releases found. Merge the open `chore: release vX.Y.Z` PR on main to cut one.");
}

// The REST list is newest-first by creation, but "latest" is a distinct concept
// (GitHub's own pointer) — ask for it rather than assuming releases[0].
const latestTag = run("gh", ["api", "repos/{owner}/{repo}/releases/latest", "-q", ".tag_name"]);

/** Resolve the tag to ship, either from a flag or by asking. */
const pickTag = async () => {
  const explicit = getArg("tag");
  if (explicit) {
    if (!releases.some((r) => r.tagName === explicit)) {
      console.warn(
        `⚠ '${explicit}' is not among the last ${HOW_MANY} published Releases. ` +
          `Dispatching anyway — deploy-prod.yml will reject it if it has no Release.`,
      );
    }
    return explicit;
  }

  if (has("latest")) return latestTag;

  if (!stdin.isTTY) {
    die("Not a TTY — can't prompt. Use `--latest` or `--tag vX.Y.Z`.");
  }

  console.log("\n  Published Releases (newest first):\n");
  releases.forEach((r, i) => {
    const date = r.publishedAt.slice(0, 10);
    const mark = r.tagName === latestTag ? " ← latest" : "";
    console.log(`   ${String(i + 1).padStart(2)}) ${r.tagName.padEnd(12)} ${date}${mark}`);
  });

  const answer = await ask(`\n  Which version ships to PROD? [1-${releases.length}, default 1] `);
  if (answer === "") return releases[0].tagName;
  const idx = Number(answer);
  if (!Number.isInteger(idx) || idx < 1 || idx > releases.length) {
    die(`'${answer}' is not one of 1-${releases.length}.`);
  }
  return releases[idx - 1].tagName;
};

const tag = await pickTag();

// --ref main pins the DEPLOY LOGIC to the trunk; -f tag= picks the VERSION.
// deploy-prod.yml refuses any other ref, so this is belt-and-braces.
const dispatch = ["workflow", "run", WORKFLOW, "--ref", "main", "-f", `tag=${tag}`];

if (has("dry-run")) {
  console.log(`\n  Would dispatch:  gh ${dispatch.join(" ")}`);
  console.log("  --dry-run — nothing was dispatched.\n");
  process.exit(0);
}

// Prod is the deliberate go-live — never dispatch on an unconfirmed keystroke.
if (stdin.isTTY && !has("yes")) {
  const ok = (await ask(`\n  Deploy ${tag} to PRODUCTION? [y/N] `)).toLowerCase();
  if (ok !== "y" && ok !== "yes") abort();
}

run("gh", dispatch);

console.log(`\n✓ Dispatched ${tag} to production.\n`);
console.log("  Watch it:  gh run watch $(gh run list --workflow=deploy-prod.yml --limit 1 --json databaseId -q '.[0].databaseId')");
console.log("  Or:        gh run list --workflow=deploy-prod.yml --limit 1\n");
