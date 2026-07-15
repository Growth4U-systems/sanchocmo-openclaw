export interface ContactDraftStep {
  subject: string | null;
  body: string;
  delayDays: number;
}

export interface ContactDraftPreview {
  leadId: string | null;
  displayName: string;
  handle: string | null;
  network: string | null;
  subject: string | null;
  body: string;
  stepCount: number;
  unresolvedVariables: string[];
  ready: boolean;
}

export interface ContactGateDraft {
  leadId: string | null;
  providerId: string | null;
  handle: string | null;
  network: string | null;
  email: string | null;
  displayName: string;
  steps: ContactDraftStep[];
  unresolvedVariables: string[];
  ready: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compactString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicVariableName(rawKey: string): string {
  const key = rawKey.trim().toLowerCase();
  if (key === "nombre_perfil") return "nombre";
  if (key === "sector_plan") return "sector";
  return key;
}

/** Tokens o delimitadores moustache que han sobrevivido al render real de Yalc. */
export function unresolvedTemplateVariables(text: string): string[] {
  const keys = new Set<string>();
  const completeExpression = /\{\{([\s\S]*?)\}\}/g;
  const covered: Array<[number, number]> = [];
  let match: RegExpExecArray | null;

  while ((match = completeExpression.exec(text)) !== null) {
    covered.push([match.index, completeExpression.lastIndex]);
    const rawKey = match[1].split("|")[0].trim();
    keys.add(publicVariableName(rawKey) || "variable_vacía");
  }

  const remainder = [...text]
    .map((char, index) =>
      covered.some(([start, end]) => index >= start && index < end)
        ? " "
        : char,
    )
    .join("");
  if (remainder.includes("{{") || remainder.includes("}}")) {
    keys.add("sintaxis_incompleta");
  }

  return [...keys].sort();
}

function addUnresolvedFromText(target: Set<string>, text: string | null): void {
  if (!text) return;
  for (const key of unresolvedTemplateVariables(text)) target.add(key);
}

function normalizeDraft(draft: unknown): ContactGateDraft {
  if (!isRecord(draft)) {
    return {
      leadId: null,
      providerId: null,
      handle: null,
      network: null,
      email: null,
      displayName: "Creator",
      steps: [],
      unresolvedVariables: ["borrador_no_válido", "sin_pasos"],
      ready: false,
    };
  }

  const unresolved = new Set<string>();
  const steps: ContactDraftStep[] = [];
  if (!Array.isArray(draft.steps) || draft.steps.length === 0) {
    unresolved.add("sin_pasos");
  } else {
    for (const rawStep of draft.steps) {
      if (!isRecord(rawStep)) {
        unresolved.add("paso_no_válido");
        steps.push({ subject: null, body: "", delayDays: 0 });
        continue;
      }

      let subject: string | null = null;
      if (rawStep.subject !== undefined && rawStep.subject !== null) {
        if (typeof rawStep.subject === "string")
          subject = compactString(rawStep.subject);
        else unresolved.add("paso_no_válido");
      }

      const body = compactString(rawStep.body) || "";
      if (!body) unresolved.add("paso_sin_contenido");

      let delayDays = 0;
      if (rawStep.delayDays !== undefined) {
        if (
          typeof rawStep.delayDays === "number" &&
          Number.isFinite(rawStep.delayDays) &&
          rawStep.delayDays >= 0
        ) {
          delayDays = Math.round(rawStep.delayDays);
        } else {
          unresolved.add("paso_no_válido");
        }
      }

      addUnresolvedFromText(unresolved, subject);
      addUnresolvedFromText(unresolved, body);
      steps.push({ subject, body, delayDays });
    }
  }

  const leadId = compactString(draft.leadId);
  const handle = compactString(draft.handle);
  const email = compactString(draft.email);
  const unresolvedVariables = [...unresolved].sort();

  return {
    leadId,
    providerId: compactString(draft.providerId),
    handle,
    network: compactString(draft.network),
    email,
    displayName:
      compactString(draft.displayName) ||
      handle ||
      email ||
      leadId ||
      "Creator",
    steps,
    unresolvedVariables,
    ready: unresolvedVariables.length === 0,
  };
}

/** Conserva una entrada por borrador y una por paso: nada inválido se descarta silenciosamente. */
export function contactGateDraftsFromResponse(
  drafts: unknown,
): ContactGateDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts.map((draft) => normalizeDraft(draft));
}

export function contactDraftPreviewsFromResponse(
  drafts: unknown,
): ContactDraftPreview[] {
  return contactGateDraftsFromResponse(drafts).map((draft) => ({
    leadId: draft.leadId,
    displayName: draft.displayName,
    handle: draft.handle,
    network: draft.network,
    subject: draft.steps[0]?.subject || null,
    body: draft.steps[0]?.body || "",
    stepCount: draft.steps.length,
    unresolvedVariables: draft.unresolvedVariables,
    ready: draft.ready,
  }));
}

export function unresolvedVariablesFromDrafts(
  drafts: readonly ContactGateDraft[],
): string[] {
  return [
    ...new Set(drafts.flatMap((draft) => draft.unresolvedVariables)),
  ].sort();
}
