export interface ContactDraftPreview {
  leadId: string | null;
  displayName: string;
  handle: string | null;
  network: string | null;
  subject: string | null;
  body: string;
  stepCount: number;
}

export interface ContactDraftStep {
  subject: string | null;
  body: string;
  delayDays: number;
}

export interface ContactGateDraft {
  leadId: string | null;
  providerId: string | null;
  handle: string | null;
  network: string | null;
  email: string | null;
  displayName: string;
  steps: ContactDraftStep[];
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

function draftForApproval(draft: unknown): ContactGateDraft | null {
  if (!isRecord(draft)) return null;
  const steps = Array.isArray(draft.steps)
    ? draft.steps
        .filter(isRecord)
        .map((step) => {
          const body = compactString(step.body);
          if (!body) return null;
          const delayDays =
            typeof step.delayDays === "number" && Number.isFinite(step.delayDays)
              ? Math.max(0, Math.round(step.delayDays))
              : 0;
          return {
            subject: compactString(step.subject),
            body,
            delayDays,
          };
        })
        .filter((step): step is ContactDraftStep => step !== null)
    : [];
  if (steps.length === 0) return null;

  const leadId = compactString(draft.leadId);
  const handle = compactString(draft.handle);
  const email = compactString(draft.email);
  const displayName =
    compactString(draft.displayName) ||
    handle ||
    email ||
    leadId ||
    "Creator";

  return {
    leadId,
    providerId: compactString(draft.providerId),
    handle,
    network: compactString(draft.network),
    email,
    displayName,
    steps,
  };
}

export function contactDraftPreviewsFromResponse(drafts: unknown): ContactDraftPreview[] {
  if (!Array.isArray(drafts)) return [];
  return drafts
    .map((draft) => draftPreview(draft))
    .filter((preview): preview is ContactDraftPreview => preview !== null);
}

export function contactGateDraftsFromResponse(drafts: unknown): ContactGateDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts
    .map((draft) => draftForApproval(draft))
    .filter((draft): draft is ContactGateDraft => draft !== null);
}
