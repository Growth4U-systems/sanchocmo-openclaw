/**
 * submissions.ts — DB layer for intake_submissions (SAN-17).
 *
 * One row per client (slug is UNIQUE): re-submitting upserts. The canonical
 * record lives here; the markdown seed doc is the derived artifact.
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { intakeSubmissions } from "@/db/schema";
import type { NewIntakeSubmission } from "./validate";
import type { IntakeAttachment } from "./attachments";

export interface IntakeSubmissionRow {
  id: string;
  slug: string;
  respondentName: string;
  respondentEmail: string | null;
  answers: Record<string, string>;
  attachments?: IntakeAttachment[];
  status: string;
  createdAt: Date;
  submittedAt: Date;
}

export async function upsertIntakeSubmission(
  slug: string,
  input: NewIntakeSubmission,
  attachments?: IntakeAttachment[],
): Promise<IntakeSubmissionRow> {
  const now = new Date();
  const [row] = await db
    .insert(intakeSubmissions)
    .values({
      id: `intake_${crypto.randomUUID()}`,
      slug,
      respondentName: input.respondentName,
      respondentEmail: input.respondentEmail,
      answers: input.answers,
      attachments: attachments ?? null,
      status: "submitted",
      submittedAt: now,
    })
    .onConflictDoUpdate({
      target: intakeSubmissions.slug,
      set: {
        respondentName: input.respondentName,
        respondentEmail: input.respondentEmail,
        answers: input.answers,
        attachments: attachments ?? null,
        status: "submitted",
        submittedAt: now,
      },
    })
    .returning();
  return row as IntakeSubmissionRow;
}

export async function loadIntakeSubmission(
  slug: string,
): Promise<IntakeSubmissionRow | null> {
  const rows = await db
    .select()
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.slug, slug))
    .limit(1);
  return (rows[0] as IntakeSubmissionRow) ?? null;
}
