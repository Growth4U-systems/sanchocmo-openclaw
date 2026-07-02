import * as React from "react";
import type { ContentTask } from "@/types";
import { Icon } from "./icons";
import styles from "./editor-v2.module.css";

interface QAReportData {
  score?: number;
  sources?: number;
  searches?: number;
}

interface QAInlineProps {
  ct: ContentTask;
  /** Parsed QA report (only present when the QA-REPORT-research file exists). */
  qaReport: QAReportData | null;
  /** research.md body — used to detect the placeholder text
   *  ("Pendiente. Dulcinea rellenará...") and to gauge real content presence.
   *  Also matches the legacy "Escudero" placeholder for content tasks created
   *  before the rename. */
  researchBody?: string;
  /** Currently-open doc — only used to hide the "Ver reporte" link when already on research. */
  activeDoc?: string;
  /** Switch to the research tab when the user clicks "Ver reporte". */
  onSwitchDoc: (docId: string) => void;
}

const RESEARCH_PLACEHOLDER_RE = /Pendiente\. (?:Dulcinea|Escudero) rellenará/i;

/**
 * Always-visible quality strip. Reports the state of research + QA for *this*
 * ContentTask, independent of which tab is open. Four states:
 *
 *   scored  — research done + QA report parsed → show score + sources + searches.
 *   done    — research done, QA report missing → "Investigación completada".
 *   running — status Approved + pipeline_state "researching" → spinner.
 *   empty   — no research at all → "Sin research aún".
 */
export function QAInline({
  ct,
  qaReport,
  researchBody,
  activeDoc,
  onSwitchDoc,
}: QAInlineProps) {
  // The research file is attached to the ContentTask the moment the idea is
  // approved (see generate-drafts.ts → createSpecialDoc), so the existence of
  // a `research` document is NOT a signal that Sancho has actually done any
  // research. Signal now: body no longer contains the placeholder line and
  // has substantive content.
  const documents = Array.isArray(ct.documents) ? ct.documents : [];
  const hasResearchDoc = documents.some((d) => {
    if (!d || typeof d !== "object") return false;
    return (d as { channel?: unknown }).channel === "research";
  });
  const isStub =
    !researchBody ||
    typeof researchBody !== "string" ||
    researchBody.trim().length < 200 ||
    RESEARCH_PLACEHOLDER_RE.test(researchBody);
  const researchDone = hasResearchDoc && !isStub;

  // ── scored ───────────────────────────────────────────────────────────────
  if (researchDone && qaReport && typeof qaReport.score === "number") {
    return (
      <div className={`${styles.qaInline} ${styles.qaScored}`}>
        <div className={styles.qaInlineNum}>{qaReport.score.toFixed(1)}</div>
        <div className={styles.qaInlineText}>
          <div className={styles.qaInlineLabel}>QA Score</div>
          <div className={styles.qaInlineSub}>
            <strong>{qaReport.sources ?? "—"}</strong> fuentes
            {qaReport.searches != null && (
              <>
                {" "}
                · <strong>{qaReport.searches}</strong> búsquedas
              </>
            )}
          </div>
        </div>
        {activeDoc !== "research" && (
          <button
            type="button"
            className={styles.qaInlineLink}
            onClick={() => onSwitchDoc("research")}
          >
            Ver reporte <Icon name="arrowRight" size={12} />
          </button>
        )}
      </div>
    );
  }

  // ── done (no QA report parsed yet) ───────────────────────────────────────
  if (researchDone) {
    return (
      <div className={`${styles.qaInline} ${styles.qaScored}`}>
        <div className={styles.qaInlineIcon}>
          <Icon name="check" size={14} />
        </div>
        <div className={styles.qaInlineText}>
          <div className={styles.qaInlineLabel}>Research</div>
          <div className={styles.qaInlineSub}>Investigación completada.</div>
        </div>
        {activeDoc !== "research" && (
          <button
            type="button"
            className={styles.qaInlineLink}
            onClick={() => onSwitchDoc("research")}
          >
            Ver research <Icon name="arrowRight" size={12} />
          </button>
        )}
      </div>
    );
  }

  // ── running ──────────────────────────────────────────────────────────────
  if (ct.status === "Approved" && ct.pipeline_state === "researching") {
    return (
      <div className={`${styles.qaInline} ${styles.qaRunning}`}>
        <div className={styles.qaInlineIcon}>
          <span className={styles.qaSpinner} />
        </div>
        <div className={styles.qaInlineText}>
          <div className={styles.qaInlineLabel}>Research</div>
          <div className={styles.qaInlineSub}>Sancho está investigando…</div>
        </div>
        <div className={styles.qaProgress}>
          <div className={styles.qaProgressBar} />
        </div>
      </div>
    );
  }

  // ── empty ────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.qaInline} ${styles.qaEmpty}`}>
      <div className={styles.qaInlineIcon}>
        <Icon name="bulb" size={14} />
      </div>
      <div className={styles.qaInlineText}>
        <div className={styles.qaInlineLabel}>Research</div>
        <div className={styles.qaInlineSub}>
          Sin research aún. Pídeselo a Sancho desde el chat.
        </div>
      </div>
    </div>
  );
}
