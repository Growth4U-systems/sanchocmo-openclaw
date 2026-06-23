#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const CATEGORY_IDS = ["performance", "accessibility", "best-practices", "seo"];

function usage() {
  return `Usage:
  lighthouse_gate.mjs --url <preview-url> [--strategy mobile] [--api-key <key>] [--out <file>]
  lighthouse_gate.mjs --input <pagespeed-json> [--strategy mobile] [--out <file>]

Options:
  --threshold <n>       Average category score required. Default: 95
  --category-floor <n>  Minimum score per category. Default: 90
  --waive id=reason     Record a waiver for a non-scoring audit. Repeatable.
`;
}

function parseArgs(argv) {
  const args = {
    strategy: "mobile",
    threshold: 95,
    categoryFloor: 90,
    waivers: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--url") {
      args.url = next;
      i += 1;
    } else if (arg === "--input") {
      args.input = next;
      i += 1;
    } else if (arg === "--strategy") {
      args.strategy = next;
      i += 1;
    } else if (arg === "--api-key") {
      args.apiKey = next;
      i += 1;
    } else if (arg === "--out") {
      args.out = next;
      i += 1;
    } else if (arg === "--threshold") {
      args.threshold = Number(next);
      i += 1;
    } else if (arg === "--category-floor") {
      args.categoryFloor = Number(next);
      i += 1;
    } else if (arg === "--waive") {
      args.waivers.push(parseWaiver(next));
      i += 1;
    } else if (arg.startsWith("--waive=")) {
      args.waivers.push(parseWaiver(arg.slice("--waive=".length)));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseWaiver(raw) {
  const [auditId, ...reasonParts] = String(raw ?? "").split("=");
  const reason = reasonParts.join("=").trim();
  if (!auditId || !reason) {
    throw new Error(`Invalid waiver "${raw}". Use --waive auditId=reason`);
  }
  return { auditId: auditId.trim(), reason };
}

async function loadPagespeedResult(args) {
  if (args.input) {
    return JSON.parse(await readFile(args.input, "utf8"));
  }

  if (!args.url) {
    throw new Error("Provide either --url or --input");
  }

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", args.url);
  endpoint.searchParams.set("strategy", args.strategy);
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) {
    endpoint.searchParams.append("category", category);
  }
  if (args.apiKey) endpoint.searchParams.set("key", args.apiKey);

  const response = await fetch(endpoint);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PageSpeed request failed (${response.status}): ${body}`);
  }
  return response.json();
}

function toScore(rawScore) {
  if (typeof rawScore !== "number") return 0;
  return Math.round(rawScore * 100);
}

function auditWeights(categories) {
  const weights = new Map();

  for (const category of Object.values(categories)) {
    for (const ref of category.auditRefs ?? []) {
      const current = weights.get(ref.id) ?? 0;
      weights.set(ref.id, current + (Number(ref.weight) || 0));
    }
  }

  return weights;
}

function summarize(result, args) {
  const lighthouse = result.lighthouseResult ?? result;
  const categories = lighthouse.categories ?? {};
  const audits = lighthouse.audits ?? {};
  const availableCategoryIds = CATEGORY_IDS.filter((id) => categories[id]);

  if (availableCategoryIds.length === 0) {
    throw new Error("No Lighthouse categories found in input");
  }

  const categoryScores = Object.fromEntries(
    availableCategoryIds.map((id) => [id, toScore(categories[id].score)]),
  );
  const average = Number(
    (Object.values(categoryScores).reduce((sum, score) => sum + score, 0) / availableCategoryIds.length).toFixed(1),
  );
  const failingCategories = Object.entries(categoryScores)
    .filter(([, score]) => score < args.categoryFloor)
    .map(([id, score]) => ({ id, score, floor: args.categoryFloor }));

  const weights = auditWeights(categories);
  const invalidWaivers = [];
  const waivers = args.waivers.map((waiver) => {
    const scoreWeight = weights.get(waiver.auditId) ?? 0;
    const audit = audits[waiver.auditId];
    const valid = Boolean(audit) && scoreWeight === 0;
    if (!valid) {
      invalidWaivers.push({
        ...waiver,
        scoreWeight,
        reason: !audit ? "audit not found" : "audit contributes to score",
      });
    }
    return {
      ...waiver,
      valid,
      scoreWeight,
      title: audit?.title,
    };
  });

  const nonScoringIssues = Object.entries(audits)
    .filter(([id, audit]) => {
      if ((weights.get(id) ?? 0) > 0) return false;
      if (audit.score === null || audit.score === undefined) return false;
      return audit.score !== 1;
    })
    .slice(0, 25)
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      score: audit.score,
      scoreDisplayMode: audit.scoreDisplayMode,
      waived: waivers.some((waiver) => waiver.auditId === id && waiver.valid),
    }));

  const pass = average >= args.threshold && failingCategories.length === 0 && invalidWaivers.length === 0;

  return {
    pass,
    url: lighthouse.finalDisplayedUrl ?? lighthouse.finalUrl ?? result.id,
    strategy: args.strategy,
    threshold: args.threshold,
    categoryFloor: args.categoryFloor,
    average,
    categoryScores,
    failingCategories,
    waivers,
    invalidWaivers,
    nonScoringIssues,
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }

  if (!Number.isFinite(args.threshold) || !Number.isFinite(args.categoryFloor)) {
    throw new Error("--threshold and --category-floor must be numeric");
  }

  const result = await loadPagespeedResult(args);
  const report = summarize(result, args);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (args.out) {
    await writeFile(args.out, json, "utf8");
  }
  process.stdout.write(json);

  return report.pass ? 0 : 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
  });
