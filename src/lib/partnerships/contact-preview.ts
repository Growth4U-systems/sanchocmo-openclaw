export interface ContactDraftPreview {
  leadId: string | null;
  displayName: string;
  handle: string | null;
  network: string | null;
  subject: string | null;
  body: string;
  stepCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compactString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function draftPreview(draft: unknown): ContactDraftPreview | null {
  if (!isRecord(draft)) return null;
  const steps = Array.isArray(draft.steps) ? draft.steps.filter(isRecord) : [];
  const firstStep = steps.find((step) => compactString(step.body));
  if (!firstStep) return null;

  const leadId = compactString(draft.leadId);
  const handle = compactString(draft.handle);
  const network = compactString(draft.network);
  const displayName =
    compactString(draft.displayName) ||
    handle ||
    compactString(draft.email) ||
    leadId ||
    "Creator";

  return {
    leadId,
    displayName,
    handle,
    network,
    subject: compactString(firstStep.subject),
    body: compactString(firstStep.body) || "",
    stepCount: Math.max(steps.length, 1),
  };
}

export function contactDraftPreviewsFromResponse(drafts: unknown): ContactDraftPreview[] {
  if (!Array.isArray(drafts)) return [];
  return drafts
    .map((draft) => draftPreview(draft))
    .filter((preview): preview is ContactDraftPreview => preview !== null);
}
