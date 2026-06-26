/**
 * done-gate.ts — Universal deterministic Definition-of-Done gate (SAN-344).
 *
 * ONE quality floor that lives OUTSIDE the individual skills: at a deliverable's
 * "done" moment, prove — deterministically, with NO LLM — that the work is real
 * before the status flips to `completed`. Catches the recurring "agent says done
 * but wrote nothing / an empty / orphaned file" failure mode, and rejects a
 * status/step the data model doesn't recognize.
 *
 * It is a CODE gate (filesystem truth), not agent obedience — the model cannot
 * confabulate its way past it. Mirrors the self-contained research / media gates
 * in `content-tasks.ts`: a fail-loud assert carrying a 422, behind a default-ON
 * kill-switch (`DONE_GATE=off`) for catastrophic-failure bypass.
 *
 * HARD vs ADVISORY (the altitude that matters):
 *   - HARD floor = the task's OWN `deliverable_file`(s) — the task-specific
 *     contract. Missing/empty here BLOCKS (422).
 *   - ADVISORY = the owning skill's `context_writes` — a soft signal only. A
 *     skill's declared outputs are GENERIC across all its invocations, so a
 *     single task need not have produced every one; hard-blocking on them would
 *     false-positive (e.g. a `newsletter` task blocked because `campaigns/` or
 *     `operational/assets.md` — outputs of OTHER newsletter runs — are absent).
 *     These surface in `result.advisories` for visibility and the future
 *     Sansón/qa-bot LLM soft-flag tier; they never block.
 *
 * SCOPE (PR1): the deterministic floor ONLY. The qualitative Sansón LLM pass is
 * a LATER tier. Contract + criteria: skills/_shared/done-gate.md.
 */

import fs from "fs";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { VALID_TASK_STATUSES, type DoneStamp } from "@/types";
import { isLegacyStatusAlias } from "@/lib/task-status";
import { normalizePipelineStep } from "@/lib/pipeline-steps";
import { readSkillContextField } from "@/lib/server/skill-frontmatter";
import { resolveWorkspaceDocPath } from "@/lib/server/doc-paths";

// Kill-switch: `DONE_GATE=off` makes `assertDeliverableDone` a no-op (audit-only:
// the verdict is still computed and returned, just never thrown). Default ON.
// Captured once at module load (same pattern as `CONTENT_RESEARCH_GATE` in
// content-tasks.ts), so the bypass is exercised in tests via a child process.
const DONE_GATE_ENABLED = process.env.DONE_GATE !== "off";

export type GateReasonCode =
  | "MISSING_OUTPUT"
  | "EMPTY_OUTPUT"
  | "INVALID_STATUS"
  | "INVALID_STEP";

export interface GateReason {
  code: GateReasonCode;
  message: string;
  /** Resolved workspace path for MISSING/EMPTY_OUTPUT. */
  path?: string;
  /** Offending value for INVALID_STATUS / INVALID_STEP. */
  value?: string;
}

/** Traceability stamp written on the gated deliverable. Canonical shape lives in
 *  `@/types` (`DoneStamp`) so the task store and the gate agree on it. */
export type GateStamp = DoneStamp;

export interface GateResult {
  ok: boolean;
  /** HARD failures (deliverable_file + status + step). Empty iff `ok`. Blocks. */
  reasons: GateReason[];
  /** SOFT failures from the skill's generic `context_writes`. Never blocks. */
  advisories: GateReason[];
  /** Resolved paths actually verified (files + non-empty dirs). */
  checkedOutputs: string[];
  /** N/A entries: unresolved placeholder / glob — never blocking. */
  skippedOutputs: string[];
  /** Always returned — the caller persists it on the gated deliverable. */
  stamp: GateStamp;
  /** false when `DONE_GATE=off` (audit-only — `assert*` won't throw). */
  enforced: boolean;
}

export interface DoneGateInput {
  slug: string;
  /** Owning skill — its `context_writes` are read as ADVISORY (soft) signals. */
  skill: string;
  agent?: string;
  model?: string;
  /** Task status being written at "done" (e.g. "completed"). Validated if set. */
  status?: string;
  /** Pipeline step being written at "done". Validated if set. */
  step?: string;
  /** The task's own declared output(s) (e.g. `task.deliverable_file`). This is
   *  the HARD floor: each must exist + be non-empty or the gate blocks. */
  deliverableFiles?: string[];
  /** Placeholder values beyond `{slug}` ({ideaId}, {channel}, {asset-slug}…). */
  vars?: Record<string, string>;
}

export class DoneGateError extends Error {
  readonly statusCode = 422;
  readonly result: GateResult;
  constructor(result: GateResult) {
    super(buildMessage(result));
    this.name = "DoneGateError";
    this.result = result;
  }
}

function buildMessage(result: GateResult): string {
  const lines = result.reasons.map((r) => `  - [${r.code}] ${r.message}`);
  const n = result.reasons.length;
  return (
    `Deliverable failed the Definition-of-Done gate (${n} issue${n === 1 ? "" : "s"}):\n` +
    `${lines.join("\n")}\n` +
    `The task's declared deliverable must exist on disk and be non-empty before ` +
    `"done". If this is a false positive, fix the task's deliverable_file, or set ` +
    `DONE_GATE=off to bypass (audit-only).`
  );
}

// ---------------------------------------------------------------------------
// Output resolution (deterministic, with the false-positive guards)
// ---------------------------------------------------------------------------

const isNonEmptyString = (p: unknown): p is string => typeof p === "string" && p.trim().length > 0;

/** Strip a trailing inline annotation — "(...)", "# ...", "— ..." — from a
 *  context_writes entry, leaving just the path template. */
function stripAnnotation(entry: string): string {
  let cut = entry.length;
  for (const marker of [" (", " #", " —"]) {
    const i = entry.indexOf(marker);
    if (i !== -1 && i < cut) cut = i;
  }
  return entry.slice(0, cut).trim();
}

/** Literal placeholder substitution via split/join — NOT regex, so a value
 *  containing `$`, `$&`, `$1`, etc. can never be mis-interpreted as a
 *  replacement special, and no key needs regex-escaping. */
function substitute(tpl: string, slug: string, vars?: Record<string, string>): string {
  let out = tpl.split("{slug}").join(slug);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(v);
    }
  }
  return out;
}

/** Path.join under BASE that refuses traversal outside the workspace. Returns
 *  null on escape. A deliberate non-throwing variant of doc-paths' `safeAbs`. */
function safeJoin(rel: string): string | null {
  const base = path.resolve(BASE);
  const abs = path.resolve(base, rel.replace(/^\/+/, ""));
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

/** True if `abs` is a directory; result of the non-empty check. */
function dirState(abs: string | null): "absent" | "empty" | "non-empty" {
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return "absent";
  try {
    return fs.readdirSync(abs).length > 0 ? "non-empty" : "empty";
  } catch {
    return "empty";
  }
}

type OutputCheck =
  | { kind: "checked"; path: string }
  | { kind: "skipped"; path: string }
  | { kind: "reason"; reason: GateReason };

/**
 * Verify ONE declared output entry. The guards are what make hard-block safe:
 * anything we can't fully + safely resolve is SKIPPED, never failed.
 *   - unresolved placeholder ({ideaId}, {asset-slug}, {date}…) → skipped
 *   - glob / wildcard (`*.json`)                               → skipped
 *   - trailing slash, or a path that IS a directory            → non-empty dir
 *   - file                                                     → exists + non-empty
 *   - resolves only to a preliminary `lite.md` (fallback)      → MISSING
 */
function checkOutputEntry(rawEntry: string, slug: string, vars?: Record<string, string>): OutputCheck {
  const annotated = stripAnnotation(rawEntry);
  if (!annotated) return { kind: "skipped", path: rawEntry };

  const isDir = annotated.endsWith("/");
  const substituted = substitute(annotated, slug, vars);

  // Unresolved placeholder after substitution → can't assert → N/A.
  if (/\{[^}]*\}/.test(substituted)) return { kind: "skipped", path: substituted };
  // Glob/wildcard → an intent, not a single named deliverable → N/A.
  if (/[*?]/.test(substituted)) return { kind: "skipped", path: substituted };

  if (isDir) {
    const rel = substituted.replace(/\/+$/, "");
    const state = dirState(safeJoin(rel));
    if (state === "absent") {
      return { kind: "reason", reason: { code: "MISSING_OUTPUT", message: `declared output directory does not exist: ${rel}/`, path: `${rel}/` } };
    }
    if (state === "empty") {
      return { kind: "reason", reason: { code: "EMPTY_OUTPUT", message: `declared output directory is empty: ${rel}/`, path: `${rel}/` } };
    }
    return { kind: "checked", path: `${rel}/` };
  }

  // File — resolve via the documents resolver (handles current.* alias drift).
  // No `slug` is passed: we already substituted `{slug}` ourselves, and passing
  // it would force a `brand/<slug>/` prefix onto non-brand roots (campaigns/, …).
  let resolved;
  try {
    resolved = resolveWorkspaceDocPath(BASE, substituted, { requireBrand: false });
  } catch {
    // path traversal / unsafe — don't block on something we can't safely resolve.
    return { kind: "skipped", path: substituted };
  }

  if (!resolved.exists) {
    // The resolver checks isFile(); a deliverable may legitimately be a DIRECTORY
    // of outputs (the old existence check accepted dirs). Accept a non-empty dir.
    const state = dirState(safeJoin(substituted));
    if (state === "non-empty") return { kind: "checked", path: `${substituted}/` };
    if (state === "empty") {
      return { kind: "reason", reason: { code: "EMPTY_OUTPUT", message: `declared output directory is empty: ${substituted}/`, path: `${substituted}/` } };
    }
    return { kind: "reason", reason: { code: "MISSING_OUTPUT", message: `declared output file does not exist: ${resolved.canonicalPath}`, path: resolved.canonicalPath } };
  }

  // A `current.md`↔`x.current.md` canonical-alias fallback is the SAME doc — fine.
  // But a fallback to a preliminary `lite.md` means the DECLARED canonical file
  // was never written (only a kickoff stub exists) — that is NOT "done".
  if (resolved.usedFallback && /(^|\/)lite\.md$/i.test(resolved.canonicalPath)) {
    return { kind: "reason", reason: { code: "MISSING_OUTPUT", message: `declared output resolved only to a preliminary lite.md, not the canonical file: ${substituted}`, path: substituted } };
  }

  let size = 0;
  try {
    size = fs.statSync(resolved.absPath).size;
  } catch {
    /* race — treat as 0 */
  }
  if (size === 0) {
    return { kind: "reason", reason: { code: "EMPTY_OUTPUT", message: `declared output file is empty (0 bytes): ${resolved.canonicalPath}`, path: resolved.canonicalPath } };
  }
  return { kind: "checked", path: resolved.canonicalPath };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Evaluate a deliverable against the deterministic Definition-of-Done. Pure
 * (only reads `fs`), never throws, idempotent — safe to call twice.
 */
export function evaluateDeliverableDone(input: DoneGateInput): GateResult {
  const reasons: GateReason[] = [];
  const advisories: GateReason[] = [];
  const checkedOutputs: string[] = [];
  const skippedOutputs: string[] = [];
  const seen = new Set<string>();

  // 1. Status — reuse the exact predicate the pillar-status API uses, so the
  //    gate is never STRICTER than today's status validation (backwards-compat).
  if (input.status != null && String(input.status).trim() !== "") {
    const s = String(input.status).trim().toLowerCase();
    const valid = (VALID_TASK_STATUSES as readonly string[]).includes(s) || isLegacyStatusAlias(s);
    if (!valid) {
      reasons.push({
        code: "INVALID_STATUS",
        message: `"${input.status}" is not a valid task status (expected one of: ${VALID_TASK_STATUSES.join(", ")})`,
        value: String(input.status),
      });
    }
  }

  // 2. Step — only if the caller asserts one.
  if (input.step != null && String(input.step).trim() !== "") {
    if (normalizePipelineStep(input.step) === null) {
      reasons.push({
        code: "INVALID_STEP",
        message: `"${input.step}" is not a recognized pipeline step`,
        value: String(input.step),
      });
    }
  }

  // 3. Outputs. HARD = the task's own deliverable_file(s). ADVISORY = the skill's
  //    generic context_writes (soft signal — see header). Empty HARD set → N/A
  //    pass (a task may legitimately declare no deliverable). Advisory entries
  //    that duplicate a hard one are dropped so a path isn't reported twice.
  const runChecks = (entries: string[], sink: GateReason[]) => {
    for (const entry of entries) {
      const result = checkOutputEntry(entry, input.slug, input.vars);
      if (result.kind === "checked") {
        if (!seen.has(result.path)) {
          seen.add(result.path);
          checkedOutputs.push(result.path);
        }
      } else if (result.kind === "skipped") {
        skippedOutputs.push(result.path);
      } else {
        sink.push(result.reason);
      }
    }
  };

  const hardOutputs = (input.deliverableFiles ?? []).filter(isNonEmptyString);
  const advisoryOutputs = readSkillContextField(input.skill, "context_writes")
    .filter(isNonEmptyString)
    .filter((e) => !hardOutputs.includes(e));

  runChecks(hardOutputs, reasons);
  runChecks(advisoryOutputs, advisories);

  const stamp: GateStamp = { skill: input.skill, at: new Date().toISOString() };
  if (input.agent) stamp.agent = input.agent;
  if (input.model) stamp.model = input.model;

  return {
    ok: reasons.length === 0,
    reasons,
    advisories,
    checkedOutputs,
    skippedOutputs,
    stamp,
    enforced: DONE_GATE_ENABLED,
  };
}

/**
 * Throwing wrapper for write-path call sites. Throws `DoneGateError` (→ 422)
 * when the HARD checks fail AND the gate is enforced. When `DONE_GATE=off`,
 * never throws (returns the audit-only result). Advisories never throw.
 */
export function assertDeliverableDone(input: DoneGateInput): GateResult {
  const result = evaluateDeliverableDone(input);
  if (!result.ok && result.enforced) {
    throw new DoneGateError(result);
  }
  return result;
}
