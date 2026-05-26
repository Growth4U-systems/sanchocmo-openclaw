type TaskBriefSource = {
  brief?: string | null;
  completion?: string | null;
  execution_notes?: string | null;
  description?: string | null;
  objective?: string | { description?: string | null } | null;
  approach?: string | null;
  deliverable?: string | null;
  done_criteria?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectiveText(objective: TaskBriefSource["objective"]): string {
  if (!objective) return "";
  if (typeof objective === "string") return objective.trim();
  return clean(objective.description);
}

export function taskBriefText(task: TaskBriefSource): string {
  const explicit = clean(task.brief);
  if (explicit) return explicit;

  const description = clean(task.description);
  const objective = objectiveText(task.objective);
  if (description && objective && description !== objective) return `${description}\n\nObjetivo: ${objective}`;
  return description || objective;
}

export function taskCompletionText(task: TaskBriefSource): string {
  const explicit = clean(task.completion);
  if (explicit) return explicit;

  const deliverable = clean(task.deliverable);
  const doneCriteria = clean(task.done_criteria);
  if (deliverable && doneCriteria && deliverable !== doneCriteria) {
    return `Entregable: ${deliverable}\n\nCriterio: ${doneCriteria}`;
  }
  return doneCriteria || deliverable;
}

export function taskExecutionNotesText(task: TaskBriefSource): string {
  return clean(task.execution_notes) || clean(task.approach);
}

export function expandBriefPatch<T extends Record<string, unknown>>(fields: T): T {
  const expanded: Record<string, unknown> = { ...fields };

  if ("brief" in fields && !("description" in fields)) {
    expanded.description = fields.brief;
  }
  if ("completion" in fields) {
    if (!("deliverable" in fields)) expanded.deliverable = fields.completion;
    if (!("done_criteria" in fields)) expanded.done_criteria = fields.completion;
  }
  if ("execution_notes" in fields && !("approach" in fields)) {
    expanded.approach = fields.execution_notes;
  }

  return expanded as T;
}

