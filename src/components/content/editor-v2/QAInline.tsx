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
  /** Currently-open doc — only used to hide the "Ver reporte" link when already on research. */
  activeDoc?: string;
  /** Switch to the research tab when the user clicks "Ver reporte". */
  onSwitchDoc: (docId: string) => void;
}

/**
 * Always-visible quality strip. Reports the state of research + QA for *this*
 * ContentTask, independent of which tab is open. Four states:
 *
 *   scored  — research done + QA report parsed → show score + sources + searches.
 *   done    — research done, QA report missing → "Investigación completada".
 *   running — status Approved + pipeline_state "researching" → spinner.
 *   empty   — no research at all → "Sin research aún".
 */
export function QAInline({ ct, qaReport, activeDoc, onSwitchDoc }: QAInlineProps) {
  const researchDone = (ct.documents || []).some((d) => d.channel === "research");

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
