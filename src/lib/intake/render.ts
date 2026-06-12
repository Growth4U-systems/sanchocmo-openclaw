/**
 * render.ts — Render an intake submission to its company-brief seed doc (SAN-17).
 *
 * `renderIntakeMarkdown` is pure (unit-tested). `writeIntakeSeedDoc` writes the
 * markdown to `brand/{slug}/company-brief/form-inicial.md` — the company-brief's
 * initial document, which the kickoff skill reads on resume.
 */

import fs from "fs";
import path from "path";
import { brandDir } from "@/lib/data/paths";
import { INTAKE_QUESTIONS, INTAKE_SECTIONS } from "./questions";

export interface IntakeRenderInput {
  clientName: string;
  respondentName: string;
  respondentEmail: string | null;
  submittedAt: Date;
  answers: Record<string, string>;
}

export function renderIntakeMarkdown(input: IntakeRenderInput): string {
  const lines: string[] = [];
  lines.push(`# Formulario inicial — ${input.clientName}`);
  lines.push("");
  lines.push(
    `> Rellenado por **${input.respondentName}**` +
      (input.respondentEmail ? ` (${input.respondentEmail})` : "") +
      ` el ${input.submittedAt.toISOString().slice(0, 10)}.`,
  );
  lines.push(
    "> Documento semilla generado por el formulario público (SAN-17). " +
      "Es la base del company-brief; el kickoff lo consume al reanudar.",
  );
  lines.push("");

  for (const section of INTAKE_SECTIONS) {
    if (section === "Contacto") continue; // respondent already rendered above
    const qs = INTAKE_QUESTIONS.filter(
      (q) => q.section === section && q.pillar !== "meta" && input.answers[q.id],
    );
    if (qs.length === 0) continue;
    lines.push(`## ${section}`);
    lines.push("");
    for (const q of qs) {
      lines.push(`**${q.label}**`);
      lines.push("");
      lines.push(input.answers[q.id]);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** Brand-relative path of the seed doc. */
export function intakeSeedDocPath(slug: string): string {
  return `brand/${slug}/company-brief/form-inicial.md`;
}

/** Write the seed doc to disk (creates the company-brief/ dir if needed). */
export function writeIntakeSeedDoc(slug: string, markdown: string): string {
  const dir = path.join(brandDir(slug), "company-brief");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "form-inicial.md"), markdown, "utf-8");
  return intakeSeedDocPath(slug);
}
