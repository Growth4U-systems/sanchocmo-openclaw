import { resolveAgentForSkill, resolveThreadSkills } from "@/lib/skill-resolver";

export type TaskDocumentRef = {
  path: string;
  name?: string;
  title?: string;
  kind?: "input" | "output" | "document" | "attachment";
  source?: string;
  status?: string;
};

export type RequiredInputRef = {
  id: string;
  label: string;
  kind?: string;
  optional?: boolean;
  source?: string;
};

export type TaskContractInput = {
  id?: string | null;
  brand_slug?: string | null;
  type?: string | null;
  status?: string | null;
  name?: string | null;
  slug?: string | null;
  owner?: string | null;
  agent?: string | null;
  skill?: string | null;
  skills?: unknown;
  channel?: string | null;
  tool?: string | null;
  strategy?: string | null;
  pillar?: string | null;
  deliverable?: string | null;
  deliverable_file?: unknown;
  output_files?: unknown;
  documents?: unknown;
  attachments?: unknown;
  input_documents?: unknown;
  required_inputs?: unknown;
  output_documents?: unknown;
  depends_on?: unknown;
  idea_id?: string | null;
  target_channels?: unknown;
  target_channel?: string | null;
};

const SKILL_ALIASES: Record<string, string> = {
  "linkedin-content": "social-writer",
  "twitter-content": "social-writer",
  "x-content": "social-writer",
  "escudero-content": "social-writer",
  "email-sequences": "email-sequence",
  "landing-pages": "page-cro",
  // `strategic-plan` is manager-fronted (buildStrategyThread runs it under
  // sancho-manager), so it stays aliased. `kickoff` is NOT: SAN-3 W4 made it a
  // real skill owned by hamete. The old `fast-foundation → sancho-manager` alias
  // (renamed to `kickoff` in the W4 sweep) wrongly sent Kickoff *tasks* to the
  // manager, which improvises and never writes company-brief.current.md.
  "strategic-plan": "sancho-manager",
};

const AGENT_ALIASES: Record<string, string> = {
  alfonso: "sancho",
  "alfonso+martin": "sancho",
  martin: "sancho",
  equipo: "sancho",
  escudero: "dulcinea",
  "escudero content": "dulcinea",
  sancho: "sancho",
  dulcinea: "dulcinea",
  hamete: "hamete",
  rocinante: "rocinante",
  "maese pedro": "maese-pedro",
  "maese-pedro": "maese-pedro",
  mambrino: "mambrino",
  merlin: "merlin",
  "merlín": "merlin",
  sanson: "sanson",
  "sansón": "sanson",
  cervantes: "cervantes",
};

export function normalizeSkillId(value?: string | null): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return SKILL_ALIASES[raw] || raw;
}

export function normalizeAgentSlug(value?: string | null): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return AGENT_ALIASES[raw.toLowerCase()] || raw.toLowerCase().replace(/\s+/g, "-");
}

export function skillListFromUnknown(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeSkillId(String(item))).filter(Boolean) as string[];
  if (typeof value === "string") {
    return value
      .split(/[, \n]+/)
      .map((item) => normalizeSkillId(item))
      .filter(Boolean) as string[];
  }
  return [];
}

export function dependencyIds(value: unknown): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function pushDoc(list: TaskDocumentRef[], pathValue: unknown, source: string, title?: string) {
  if (typeof pathValue !== "string") return;
  const clean = pathValue.trim().replace(/[),.;:]+$/g, "");
  if (!clean || clean.includes("{") || clean.endsWith("/")) return;
  list.push({ path: clean, name: title || clean.split("/").pop() || clean, title, source });
}

export function documentRefsFromUnknown(value: unknown, source = "document"): TaskDocumentRef[] {
  const list: TaskDocumentRef[] = [];
  if (!value) return list;
  if (typeof value === "string") {
    pushDoc(list, value, source);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") pushDoc(list, item, source);
      else if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const path = record.path || record.file || record.href || record.url;
        if (typeof path === "string") {
          list.push({
            path,
            name: typeof record.name === "string" ? record.name : undefined,
            title: typeof record.title === "string" ? record.title : undefined,
            status: typeof record.status === "string" ? record.status : undefined,
            kind: typeof record.kind === "string" ? record.kind as TaskDocumentRef["kind"] : undefined,
            source,
          });
        }
      }
    }
  } else if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const path = record.path || record.file || record.href || record.url;
    if (typeof path === "string") {
      list.push({
        path,
        name: typeof record.name === "string" ? record.name : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
        status: typeof record.status === "string" ? record.status : undefined,
        kind: typeof record.kind === "string" ? record.kind as TaskDocumentRef["kind"] : undefined,
        source,
      });
    }
  }
  return uniqueDocs(list);
}

export function requiredInputsFromUnknown(value: unknown): RequiredInputRef[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === "string") return { id: item, label: item };
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const label = String(record.label || record.name || record.id || `input-${index + 1}`);
        return {
          id: String(record.id || label),
          label,
          kind: typeof record.kind === "string" ? record.kind : undefined,
          optional: typeof record.optional === "boolean" ? record.optional : undefined,
          source: typeof record.source === "string" ? record.source : undefined,
        };
      })
      .filter(Boolean) as RequiredInputRef[];
  }
  if (typeof value === "string" && value.trim()) return [{ id: value.trim(), label: value.trim() }];
  return [];
}

export function uniqueDocs(docs: TaskDocumentRef[]): TaskDocumentRef[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (!doc?.path) return false;
    const key = doc.path.replace(/^\/+/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    doc.path = key;
    return true;
  });
}

export function inferTaskExecutionContract(
  task: TaskContractInput,
  opts: { brandSlug?: string; dependencyOutputs?: TaskDocumentRef[] } = {},
) {
  const type = task.type === "content_subtask" ? "content_task" : String(task.type || "execution");
  const existingSkills = skillListFromUnknown(task.skills)
    .filter((skill) => !(type === "content_task" && skill === "sancho-manager"));
  let primarySkill = normalizeSkillId(task.skill);
  if (type === "content_task" && primarySkill === "sancho-manager") primarySkill = undefined;
  let resolved = resolveThreadSkills({
    taskSkill: primarySkill,
    taskType: type,
    channel: task.channel || undefined,
    tool: task.tool || undefined,
    strategy: task.strategy || undefined,
    pillar: task.pillar || undefined,
  });

  if (type === "project") {
    primarySkill = "sancho-manager";
    resolved = { skill: primarySkill, skills: [primarySkill], agent: "sancho" };
  } else if (type === "content_task" && !primarySkill) {
    const channels = Array.isArray(task.target_channels)
      ? task.target_channels.map((item) => String(item))
      : String(task.target_channel || task.channel || "").split(",");
    primarySkill = writerSkillFor(channels[0] || "");
    resolved = { skill: primarySkill, skills: [primarySkill], agent: "dulcinea" };
  } else if (!primarySkill) {
    primarySkill = normalizeSkillId(resolved.skill) || "sancho-manager";
  }

  const skills = Array.from(new Set([primarySkill, ...existingSkills, ...skillListFromUnknown(resolved.skills)].filter(Boolean) as string[]));
  const existingAgent = normalizeAgentSlug(task.agent);
  const agent =
    (type === "content_task" && existingAgent === "sancho" && primarySkill !== "sancho-manager" ? undefined : existingAgent) ||
    resolveAgentForSkill(primarySkill) ||
    normalizeAgentSlug(resolved.agent) ||
    normalizeAgentSlug(task.owner) ||
    "sancho";

  const outputDocs = documentRefsFromUnknown(task.output_documents, "output_documents");
  if (type === "project") {
    const projectSlug = task.slug || task.id;
    if (opts.brandSlug && projectSlug) {
      outputDocs.push({
        path: `brand/${opts.brandSlug}/projects/${projectSlug}/project-index.md`,
        name: "project-index.md",
        title: "Documento índice del proyecto",
        kind: "output",
        source: "project-index",
      });
    }
  }
  outputDocs.push(...documentRefsFromUnknown(task.deliverable_file, "deliverable_file"));
  outputDocs.push(...documentRefsFromUnknown(task.output_files, "output_files"));
  outputDocs.push(...documentRefsFromUnknown(task.documents, "documents"));
  outputDocs.push(...documentRefsFromUnknown(task.attachments, "attachments"));
  if (opts.brandSlug && task.id && outputDocs.length === 0) {
    const fallbackPath = type === "content_task"
      ? `brand/${opts.brandSlug}/content/drafts/${task.idea_id || task.id}/output.md`
      : `brand/${opts.brandSlug}/tasks/${task.id}/output.md`;
    outputDocs.push({
      path: fallbackPath,
      name: fallbackPath.split("/").pop(),
      title: "Output esperado",
      kind: "output",
      source: "default-output",
    });
  }

  const inputDocs = [
    ...documentRefsFromUnknown(task.input_documents, "input_documents"),
    ...(opts.dependencyOutputs || []).map((doc) => ({ ...doc, kind: "input" as const, source: doc.source || "depends_on" })),
  ];

  return {
    agent,
    skill: primarySkill,
    skills,
    inputDocuments: uniqueDocs(inputDocs),
    requiredInputs: requiredInputsFromUnknown(task.required_inputs),
    outputDocuments: uniqueDocs(outputDocs),
  };
}

/**
 * Select the skill fields that are safe to persist on a task.
 *
 * `inferTaskExecutionContract` intentionally keeps the historical
 * `sancho-manager` fallback for legacy non-task callers. Persisting that
 * fallback, however, silently turns a genuinely skill-less task back into a
 * guided workflow. This boundary preserves explicit/supporting skills and
 * meaningful structured inference (pillar, strategy, web-build, content), but
 * drops the generic manager fallback.
 */
export function persistedTaskSkillFields(
  task: TaskContractInput,
  contract: { skill?: string; skills?: string[] },
): { skill: string | null; skills: string[] } {
  const type = task.type === "content_subtask"
    ? "content_task"
    : String(task.type || "execution");
  const explicitPrimary = normalizeSkillId(task.skill);
  const declaredSkills = skillListFromUnknown(task.skills);
  const inferredPrimary = normalizeSkillId(contract.skill);
  const structuredInference = type === "project"
    || type === "content_task"
    || Boolean(task.pillar)
    || Boolean(task.strategy)
    || Boolean(inferredPrimary && inferredPrimary !== "sancho-manager");
  const primary = explicitPrimary || (structuredInference ? inferredPrimary : undefined);
  const includeInferredPipeline = Boolean(explicitPrimary || structuredInference);
  const skills = Array.from(new Set([
    ...(primary ? [primary] : []),
    ...declaredSkills,
    ...(includeInferredPipeline ? skillListFromUnknown(contract.skills) : []),
  ]));

  return {
    skill: primary || null,
    skills,
  };
}

function writerSkillFor(channel: string): string {
  const c = channel.toLowerCase().trim();
  if (c === "linkedin" || c === "x" || c === "twitter") return "social-writer";
  if (c === "instagram" || c === "ig") return "instagram-content";
  if (c === "blog" || c === "seo") return "seo-content";
  if (c === "newsletter" || c === "email") return "newsletter";
  return "social-writer";
}
