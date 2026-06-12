/**
 * validate.ts — Pure validation for an intake POST body (SAN-17).
 *
 * Splits the two META fields (contact_name/contact_email → respondent columns)
 * from the questionnaire answers (→ jsonb). Mirrors comments.ts conventions:
 * trim, required checks, length caps, email regex. Throws IntakeValidationError.
 */

import { INTAKE_QUESTIONS } from "./questions";

export const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
export const MAX_FIELD = 10000;
export const MAX_NAME = 120;

export interface NewIntakeSubmission {
  respondentName: string;
  respondentEmail: string | null;
  answers: Record<string, string>;
}

export class IntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeValidationError";
  }
}

export function validateIntakeSubmission(raw: unknown): NewIntakeSubmission {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new IntakeValidationError("Invalid request body");
  }
  const r = raw as Record<string, unknown>;

  const readField = (id: string): string => {
    const v = r[id];
    return typeof v === "string" ? v.trim() : "";
  };

  const respondentName = readField("contact_name");
  if (!respondentName) throw new IntakeValidationError("contact_name required");
  if (respondentName.length > MAX_NAME) {
    throw new IntakeValidationError(`contact_name too long (max ${MAX_NAME})`);
  }

  const email = readField("contact_email");
  if (!email) throw new IntakeValidationError("contact_email required");
  if (!EMAIL_RE.test(email)) throw new IntakeValidationError("Invalid email format");

  const answers: Record<string, string> = {};
  for (const q of INTAKE_QUESTIONS) {
    if (q.pillar === "meta") continue;
    const value = readField(q.id);
    if (!value) {
      if (q.required) throw new IntakeValidationError(`${q.id} required`);
      continue;
    }
    if (value.length > MAX_FIELD) {
      throw new IntakeValidationError(`${q.id} too long (max ${MAX_FIELD})`);
    }
    answers[q.id] = value;
  }

  return { respondentName, respondentEmail: email, answers };
}
