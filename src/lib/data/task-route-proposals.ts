import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, hasDatabase } from "@/db/drizzle";
import { selectDbDriver } from "@/db/driver-select";
import { taskRouteProposals as proposalsTable } from "@/db/schema";
import { MC_TASKS_BACKEND } from "@/lib/config";
import { BASE } from "@/lib/data/paths";

const PROPOSAL_TTL_MS = 30 * 60 * 1_000;
const FILE_LOCK_RETRIES = 100;
const FILE_LOCK_WAIT_MS = 10;
const FILE_LOCK_STALE_MS = 30_000;
const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

export interface TaskRouteProposal {
  id: string;
  clientSlug: string;
  sourceThreadId: string;
  groupId: string;
  agent: string;
  skill?: string;
  skills?: string[];
  name: string;
  brief: string;
  /** Candidate snapshot shown when the proposal was issued. */
  candidateTaskIds?: string[];
  createdAt: number;
  expiresAt: number;
}

interface ProposalFileStore {
  proposals: TaskRouteProposal[];
}

function proposalDatabaseEnabled(): boolean {
  const url = process.env.DATABASE_URL;
  // Production uses the shared Neon source of truth and receives migration
  // 0017. The bundled single-node Postgres/JSON development stack keeps this
  // control record in the durable workspace beside its chat ledger.
  return MC_TASKS_BACKEND === "db"
    && hasDatabase
    && Boolean(url)
    && selectDbDriver(url as string, process.env.DATABASE_DRIVER) === "neon";
}

function key(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function proposalFile(): string {
  return path.join(BASE, "_system", "task-route-proposals.json");
}

function readFileStore(): ProposalFileStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(proposalFile(), "utf8")) as ProposalFileStore;
    return { proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [] };
  } catch {
    return { proposals: [] };
  }
}

function writeFileStore(store: ProposalFileStore): void {
  const file = proposalFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function withFileLock<T>(operation: () => T): T {
  const file = proposalFile();
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let descriptor: number | undefined;
  for (let attempt = 0; attempt < FILE_LOCK_RETRIES; attempt += 1) {
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
      break;
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "";
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > FILE_LOCK_STALE_MS) {
          fs.unlinkSync(lock);
          continue;
        }
      } catch {
        continue;
      }
      Atomics.wait(LOCK_SLEEP, 0, 0, FILE_LOCK_WAIT_MS);
    }
  }
  if (descriptor === undefined) throw new Error("Timed out acquiring task-route proposal lock");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      fs.unlinkSync(lock);
    } catch {
      // A stale-lock cleanup may already have removed it.
    }
  }
}

function pruneFileStore(store: ProposalFileStore, now: number): boolean {
  const active = store.proposals.filter((proposal) => proposal.expiresAt > now);
  if (active.length === store.proposals.length) return false;
  store.proposals = active;
  return true;
}

function rowToProposal(row: typeof proposalsTable.$inferSelect): TaskRouteProposal {
  return {
    id: row.id,
    clientSlug: row.clientSlug,
    sourceThreadId: row.sourceThreadId,
    groupId: row.groupId,
    agent: row.agent,
    skill: row.skill || undefined,
    skills: Array.isArray(row.skills) ? row.skills : undefined,
    name: row.name,
    brief: row.brief,
    candidateTaskIds: Array.isArray(row.candidateTaskIds) ? row.candidateTaskIds : undefined,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

export async function issueTaskRouteProposal(
  input: Omit<TaskRouteProposal, "id" | "createdAt" | "expiresAt">,
  now = Date.now(),
): Promise<TaskRouteProposal> {
  const proposal: TaskRouteProposal = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + PROPOSAL_TTL_MS,
  };
  if (proposalDatabaseEnabled()) {
    await db.delete(proposalsTable).where(lt(proposalsTable.expiresAt, new Date(now)));
    const values = {
      id: proposal.id,
      clientSlug: proposal.clientSlug,
      sourceThreadId: proposal.sourceThreadId,
      groupId: proposal.groupId,
      agent: proposal.agent,
      skill: proposal.skill,
      skills: proposal.skills,
      name: proposal.name,
      brief: proposal.brief,
      candidateTaskIds: proposal.candidateTaskIds,
      createdAt: new Date(proposal.createdAt),
      expiresAt: new Date(proposal.expiresAt),
    };
    const [row] = await db
      .insert(proposalsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [proposalsTable.clientSlug, proposalsTable.sourceThreadId],
        set: values,
      })
      .returning();
    return rowToProposal(row);
  }
  return withFileLock(() => {
    const store = readFileStore();
    pruneFileStore(store, now);
    store.proposals = store.proposals.filter((current) => !(
      key(current.clientSlug) === key(input.clientSlug)
      && key(current.sourceThreadId) === key(input.sourceThreadId)
    ));
    store.proposals.push(proposal);
    writeFileStore(store);
    return proposal;
  });
}

export async function getPendingTaskRouteProposal(
  clientSlug: string,
  sourceThreadId: string,
  now = Date.now(),
): Promise<TaskRouteProposal | undefined> {
  if (proposalDatabaseEnabled()) {
    const [row] = await db
      .select()
      .from(proposalsTable)
      .where(and(
        eq(proposalsTable.clientSlug, clientSlug),
        eq(proposalsTable.sourceThreadId, sourceThreadId),
        gt(proposalsTable.expiresAt, new Date(now)),
      ))
      .limit(1);
    return row ? rowToProposal(row) : undefined;
  }
  return withFileLock(() => {
    const store = readFileStore();
    const changed = pruneFileStore(store, now);
    if (changed) writeFileStore(store);
    return store.proposals.find((proposal) =>
      key(proposal.clientSlug) === key(clientSlug)
      && key(proposal.sourceThreadId) === key(sourceThreadId),
    );
  });
}

export function proposalMatches(
  proposal: TaskRouteProposal,
  expected: Pick<TaskRouteProposal, "clientSlug" | "sourceThreadId" | "groupId" | "agent" | "skill" | "skills" | "name" | "brief" | "candidateTaskIds">,
): boolean {
  const proposalSkills = (proposal.skills ?? []).map(key).filter(Boolean).sort();
  const expectedSkills = (expected.skills ?? []).map(key).filter(Boolean).sort();
  const proposalCandidates = (proposal.candidateTaskIds ?? []).map(key).filter(Boolean).sort();
  const expectedCandidates = (expected.candidateTaskIds ?? []).map(key).filter(Boolean).sort();
  return key(proposal.clientSlug) === key(expected.clientSlug)
    && key(proposal.sourceThreadId) === key(expected.sourceThreadId)
    && key(proposal.groupId) === key(expected.groupId)
    && key(proposal.agent) === key(expected.agent)
    && key(proposal.skill) === key(expected.skill)
    && JSON.stringify(proposalSkills) === JSON.stringify(expectedSkills)
    && JSON.stringify(proposalCandidates) === JSON.stringify(expectedCandidates)
    && proposal.name.trim() === expected.name.trim()
    && proposal.brief.trim() === expected.brief.trim();
}

/** Atomically consumes a proposal. Exactly one concurrent caller can win. */
export async function consumeTaskRouteProposal(
  id: string,
  now = Date.now(),
): Promise<TaskRouteProposal | undefined> {
  if (proposalDatabaseEnabled()) {
    const [row] = await db
      .delete(proposalsTable)
      .where(and(eq(proposalsTable.id, id), gt(proposalsTable.expiresAt, new Date(now))))
      .returning();
    return row ? rowToProposal(row) : undefined;
  }
  return withFileLock(() => {
    const store = readFileStore();
    pruneFileStore(store, now);
    const index = store.proposals.findIndex((proposal) => proposal.id === id);
    if (index < 0) {
      writeFileStore(store);
      return undefined;
    }
    const [proposal] = store.proposals.splice(index, 1);
    writeFileStore(store);
    return proposal;
  });
}

export async function discardPendingTaskRouteProposal(
  clientSlug: string,
  sourceThreadId: string,
): Promise<void> {
  if (proposalDatabaseEnabled()) {
    await db.delete(proposalsTable).where(and(
      eq(proposalsTable.clientSlug, clientSlug),
      eq(proposalsTable.sourceThreadId, sourceThreadId),
    ));
    return;
  }
  withFileLock(() => {
    const store = readFileStore();
    store.proposals = store.proposals.filter((proposal) => !(
      key(proposal.clientSlug) === key(clientSlug)
      && key(proposal.sourceThreadId) === key(sourceThreadId)
    ));
    writeFileStore(store);
  });
}

function normalizedHumanMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

/** Conservative proof that the current human message authorized creation. */
export function isExplicitTaskCreationConfirmation(value: unknown): boolean {
  const normalized = normalizedHumanMessage(value);
  if (!normalized || normalized.length > 1_000) return false;
  if (/\b(no|cancel[ao]|no crear|sin crear)\b/.test(normalized)) return false;
  const answer = normalized.match(/\[ask:q_task_(?:create|route)(?:_[a-z0-9-]+)?\]\s*respuesta:\s*(.+)$/)?.[1]
    ?? normalized;
  return /^(si\b|confirmo\b|dale\b|hazlo\b|crea(?:la|r)?\b|crear (?:una )?tarea nueva\b|crear y ejecutar\b|adelante\b)/.test(answer.trim());
}

/** Exact answer emitted by the task-choice UI when none of the candidates fits. */
export function isExplicitNewTaskSelection(value: unknown): boolean {
  const normalized = normalizedHumanMessage(value);
  return /^\[ask:q_task_route(?:_[a-z0-9-]+)?\]\s*respuesta:\s*crear (?:una )?tarea nueva\s*$/.test(normalized);
}

/** A negative answer invalidates the one-shot proposal immediately. */
export function isExplicitTaskCreationRejection(value: unknown): boolean {
  const normalized = normalizedHumanMessage(value);
  if (!normalized) return false;
  const answer = normalized.match(/\[ask:q_task_(?:create|route)(?:_[a-z0-9-]+)?\]\s*respuesta:\s*(.+)$/)?.[1]
    ?? normalized;
  return /^(no\b|cancel(?:a|ar|ado)\b|seguir aqui\b|no crear\b|sin crear\b)/.test(answer.trim());
}

export function resetTaskRouteProposalsForTests(): void {
  if (proposalDatabaseEnabled()) throw new Error("Cannot reset DB proposals through the test helper");
  try {
    fs.unlinkSync(proposalFile());
  } catch {
    // Already empty.
  }
  try {
    fs.unlinkSync(`${proposalFile()}.lock`);
  } catch {
    // Already unlocked.
  }
}
