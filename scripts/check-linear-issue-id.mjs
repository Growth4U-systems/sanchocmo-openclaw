#!/usr/bin/env node

const title = process.env.PR_TITLE || "";
const body = process.env.PR_BODY || "";
const headRef = process.env.HEAD_REF || "";
const baseRef = process.env.BASE_REF || "";
const actor = process.env.GITHUB_ACTOR || "";
const teamKeys = (process.env.LINEAR_TEAM_KEYS || "SAN")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const skipBranches = [
  /^release-please--/,
  /^sync\/release-/,
];

const escapedKeys = teamKeys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const issueIdPattern = new RegExp(`\\b(?:${escapedKeys.join("|")})-[1-9][0-9]*\\b`, "i");

function pass(message) {
  console.log(`Linear issue ID check passed: ${message}`);
  process.exit(0);
}

if (actor.endsWith("[bot]")) {
  pass(`skipping bot actor ${actor}`);
}

if (baseRef === "main" && headRef === "staging") {
  pass("skipping staging -> main promotion PR");
}

if (skipBranches.some((pattern) => pattern.test(headRef))) {
  pass(`skipping automated branch ${headRef}`);
}

const haystack = [
  `title: ${title}`,
  `body: ${body}`,
  `branch: ${headRef}`,
].join("\n");

const match = haystack.match(issueIdPattern);
if (match) {
  pass(`found ${match[0].toUpperCase()}`);
}

console.error(`Missing Linear issue ID.

Add a Linear issue reference before merging, for example:
- Branch: martin/san-123-short-description
- PR body: Refs SAN-123

Accepted team key(s): ${teamKeys.join(", ")}
Checked title, body, and head branch.`);
process.exit(1);
