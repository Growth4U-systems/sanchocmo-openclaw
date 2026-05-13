import * as React from "react";
import type { ContentTaskStatus } from "@/types";
import { Icon } from "./icons";
import styles from "./editor-v2.module.css";

interface StatusStepperProps {
  current: ContentTaskStatus;
  /**
   * Disabled when there's no Aprobar transition for the current status (e.g. `Approved` —
   * the system drives that step). Pass `null` to render a non-current Aprobar disabled.
   */
  onApprove: (() => void) | null;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
  approveLabel?: string;
  onRevert: (() => void) | null;
  revertDisabled?: boolean;
  isPending?: boolean;
}

interface StepDef {
  id: ContentTaskStatus;
  short: string;
}

export const STEPS: StepDef[] = [
  { id: "New", short: "New" },
  { id: "Approved", short: "Approved" },
  { id: "Draft", short: "Draft" },
  { id: "Pending Media", short: "Media" },
  { id: "Ready", short: "Ready" },
  { id: "Published", short: "Live" },
];

export function StatusStepper({
  current,
  onApprove,
  approveDisabled,
  approveDisabledReason,
  approveLabel = "Aprobar",
  onRevert,
  revertDisabled,
  isPending,
}: StatusStepperProps) {
  const idx = STEPS.findIndex((s) => s.id === current);
  if (idx === -1) return null; // Discarded / Deferred — caller renders banner instead.

  return (
    <div className={styles.stepperWrap}>
      <div className={styles.stepper}>
        {STEPS.map((s, i) => {
          const state =
            i < idx ? "done" : i === idx ? "current" : "todo";
          const stepClass =
            state === "done"
              ? styles.stepDone
              : state === "current"
                ? styles.stepCurrent
                : styles.stepTodo;
          return (
            <React.Fragment key={s.id}>
              <div className={`${styles.step} ${stepClass}`} title={s.id}>
                <div className={styles.stepDot}>
                  {state === "done" ? (
                    <Icon name="check" size={11} />
                  ) : state === "current" ? (
                    <span className={styles.stepPulse} />
                  ) : null}
                </div>
                <div className={styles.stepLabel}>{s.short}</div>
                <div className={styles.stepAction}>
                  {state === "current" && onApprove && (
                    <button
                      type="button"
                      className={`${styles.stepBtn} ${styles.stepBtnApprove}`}
                      onClick={onApprove}
                      disabled={!!approveDisabled || !!isPending}
                      title={approveDisabled ? approveDisabledReason : undefined}
                    >
                      {approveLabel} <Icon name="arrowRight" size={11} />
                    </button>
                  )}
                  {state === "done" && i === idx - 1 && onRevert && (
                    <button
                      type="button"
                      className={`${styles.stepBtn} ${styles.stepBtnRevert}`}
                      onClick={onRevert}
                      disabled={!!revertDisabled || !!isPending}
                      title={revertDisabled ? "Transición no soportada" : undefined}
                    >
                      <Icon name="arrowLeft" size={11} /> Volver
                    </button>
                  )}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`${styles.stepLine} ${i < idx ? styles.stepLineDone : ""}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
