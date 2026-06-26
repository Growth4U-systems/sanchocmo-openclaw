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
 * SCOPE (PR1): the deterministic floor ONLY. The qualitative Sansón/qa-bot LLM
 * pass (independent fresh-context verification, soft-flagged) is a LATER tier and
 * is intentionally NOT here. Contract + criteria: skills/_shared/done-gate.md.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { BASE } from "@/lib/data/paths";
import { VALID_TASK_STATUSES, type DoneStamp } from "@/types";
import { isLegacyStatusAlias } from "@/lib/task-status";
import { normalizePipelineStep } from "@/lib/pipeline-steps";
import { parseSkillFrontmatter } from "@/lib/server/skill-frontmatter";
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
  /** Empty iff `ok`. */
  reasons: GateReason[];
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
  /** Owning skill — resolves its `context_writes` from SKILL.md. */
  skill: string;
  agent?: string;
  model?: string;
  /** Task status being written at "done" (e.g. "completed"). Validated if set. */
  status?: string;
  /** Pipeline step being written at "done". Validated if set. */
  step?: string;
  /** Concrete paths the caller already knows (e.g. `task.deliverable_file`).
   *  Checked verbatim, in addition to the skill's declared `context_writes`. */
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
    `The work must exist on disk before "done": every declared output ` +
    `(context_writes / deliverable_file) must be present and non-empty. ` +
    `If this is a false positive, fix the skill's context_writes declaration, ` +
    `or set DONE_GATE=off to bypass (audit-only).`
  );
}

// ---------------------------------------------------------------------------
// Skill context_writes (read-only — mirrors context-pack.ts's reader)
// ---------------------------------------------------------------------------

/** Runtime skills catalog root — same convention as context-pack.ts / skills.ts. */
function skillsRoot(): string {
  return path.join(
    process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
    "skills",
  );
}

/** A skill's declared `context_writes` templates. `[]` when the skill or its
 *  SKILL.md is absent — a missing skill is N/A, not a gate failure. */
function readSkillContextWrites(skill: string | null | undefined): string[] {
  if (!skill) return [];
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(skill)) return [];
  const skillMdPath = path.join(skillsRoot(), skill, "SKILL.md");
  let content: string;
  try {
    content = fs.readFileSync(skillMdPath, "utf-8");
  } catch {
    return [];
  }
  const { meta } = parseSkillFrontmatter(content);
  const writes = Array.isArray(meta.context_writes) ? meta.context_writes : [];
  return writes.filter((p) => typeof p === "string" && p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Output resolution (deterministic, with the false-positive guards)
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function substitute(tpl: string, slug: string, vars?: Record<string, string>): string {
  let out = tpl.replace(/\{slug\}/g, slug);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${escapeRe(k)}\\}`, "g"), v);
    }
  }
  return out;
}

/** Path.join under BASE that refuses traversal outside the workspace. */
function safeJoin(rel: string): string | null {
  const base = path.resolve(BASE);
  const abs = path.resolve(base, rel.replace(/^\/+/, ""));
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

type OutputCheck =
  | { kind: "checked"; path: string }
  | { kind: "skipped"; path: string }
  | { kind: "reason"; reason: GateReason };

/**
 * Verify ONE declared output entry. The guards (below) are what make hard-block
 * safe: anything we can't fully + safely resolve is SKIPPED, never failed.
 *   - unresolved placeholder ({ideaId}, {asset-slug}, {date}…) → skipped
 *   - glob / wildcard (`*.json`)                               → skipped
 *   - trailing slash                                           → directory check
 *   - file                                                     → exists + non-empty
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
    const abs = safeJoin(rel);
    if (!abs) return { kind: "skipped", path: substituted };
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return {
        kind: "reason",
        reason: { code: "MISSING_OUTPUT", message: `declared output directory does not exist: ${rel}/`, path: `${rel}/` },
      };
    }
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      /* unreadable → treat as empty below */
    }
    if (entries.length === 0) {
      return {
        kind: "reason",
        reason: { code: "EMPTY_OUTPUT", message: `declared output directory is empty: ${rel}/`, path: `${rel}/` },
      };
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
    return {
      kind: "reason",
      reason: { code: "MISSING_OUTPUT", message: `declared output file does not exist: ${resolved.canonicalPath}`, path: resolved.canonicalPath },
    };
  }
  let size = 0;
  try {
    size = fs.statSync(resolved.absPath).size;
  } catch {
    /* race — treat as 0 */
  }
  if (size === 0) {
    return {
      kind: "reason",
      reason: { code: "EMPTY_OUTPUT", message: `declared output file is empty (0 bytes): ${resolved.canonicalPath}`, path: resolved.canonicalPath },
    };
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
  const checkedOutputs: string[] = [];
  const skippedOutputs: string[] = [];

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

  // 3. Outputs — union of explicit deliverableFiles + the skill's context_writes.
  //    Empty union → N/A → pass (a skill may legitimately write nothing).
  const declared = [
    ...(input.deliverableFiles ?? []),
    ...readSkillContextWrites(input.skill),
  ].filter((p) => typeof p === "string" && p.trim().length > 0);

  for (const entry of declared) {
    const result = checkOutputEntry(entry, input.slug, input.vars);
    if (result.kind === "checked") checkedOutputs.push(result.path);
    else if (result.kind === "skipped") skippedOutputs.push(result.path);
    else reasons.push(result.reason);
  }

  const stamp: GateStamp = { skill: input.skill, at: new Date().toISOString() };
  if (input.agent) stamp.agent = input.agent;
  if (input.model) stamp.model = input.model;

  return {
    ok: reasons.length === 0,
    reasons,
    checkedOutputs,
    skippedOutputs,
    stamp,
    enforced: DONE_GATE_ENABLED,
  };
}

/**
 * Throwing wrapper for write-path call sites. Throws `DoneGateError` (→ 422)
 * when the deliverable fails AND the gate is enforced. When `DONE_GATE=off`,
 * never throws (returns the audit-only result). No-op-pass when `ok`.
 */
export function assertDeliverableDone(input: DoneGateInput): GateResult {
  const result = evaluateDeliverableDone(input);
  if (!result.ok && result.enforced) {
    throw new DoneGateError(result);
  }
  return result;
}
