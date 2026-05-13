#!/usr/bin/env node
// One-shot migration: rewrite content-engine idea-queue.json files so
// `status` uses the canonical ContentTaskStatus pipeline values.
//
// Mapping:
//   ready     → New
//   approved  → Approved
//   stale     → Deferred
//   archived  → Discarded
//   discarded → Discarded
//   deferred  → Deferred
//   published → Published
//   new/Approved/etc. (already canonical) → preserved
//
// Run from repo root:  node scripts/migrate-idea-status.mjs
// Or via npm script (add to package.json if you want).

import fs from "fs";
import path from "path";

const BASE = process.env.MC_WORKSPACE
  || path.join(process.env.HOME || "/Users/ragi", ".openclaw", "workspace-sancho");

const VALID = new Set(["New", "Approved", "Discarded", "Deferred", "Published"]);
const LEGACY = {
  ready: "New",
  new: "New",
  approved: "Approved",
  archived: "Discarded",
  discarded: "Discarded",
  stale: "Deferred",
  deferred: "Deferred",
  published: "Published",
};

function canonicalize(status) {
  if (typeof status !== "string") return "New";
  if (VALID.has(status)) return status;
  const k = status.toLowerCase();
  return LEGACY[k] || "New";
}

const brandsDir = path.join(BASE, "brand");
const brands = fs.readdirSync(brandsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let touched = 0, totalIdeas = 0, changed = 0;

for (const brand of brands) {
  const file = path.join(brandsDir, brand, "content", "idea-queue.json");
  if (!fs.existsSync(file)) continue;

  const raw = fs.readFileSync(file, "utf-8");
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    console.warn(`! ${brand}: invalid JSON, skipping`);
    continue;
  }
  if (!Array.isArray(arr)) {
    console.warn(`! ${brand}: not an array, skipping`);
    continue;
  }

  let brandChanged = 0;
  for (const idea of arr) {
    totalIdeas++;
    const oldStatus = idea.status;
    const newStatus = canonicalize(oldStatus);
    if (oldStatus !== newStatus) {
      idea.status = newStatus;
      brandChanged++;
      changed++;
    }
  }

  if (brandChanged > 0) {
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
    touched++;
    console.log(`✓ ${brand}: ${brandChanged}/${arr.length} ideas updated`);
  } else {
    console.log(`· ${brand}: ${arr.length} ideas — already canonical`);
  }
}

console.log(`\nDone. ${changed} ideas migrated across ${touched} files (${totalIdeas} ideas total).`);
