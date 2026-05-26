import * as React from "react";
import Link from "next/link";
import { Icon } from "./icons";
import styles from "./editor-v2.module.css";

interface EditorHeaderProps {
  backHref: string;
  taskId: string;
  skill?: string;
  title: string;
  ideaId?: string;
  owner?: string;
  ownerInitials?: string;
  scheduledFor?: string;
  /** Stepper element rendered inline below frontmatter. */
  stepper: React.ReactNode;
  /** Optional banner above the stepper (Discarded / Deferred). */
  banner?: React.ReactNode;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function EditorHeader({
  backHref,
  taskId,
  skill,
  title,
  ideaId,
  owner,
  ownerInitials,
  scheduledFor,
  stepper,
  banner,
}: EditorHeaderProps) {
  const scheduled = formatDate(scheduledFor);

  return (
    <div className={styles.header}>
      <div className={styles.crumbs}>
        <Link href={backHref} className={styles.crumbBack}>
          <Icon name="arrowLeft" size={14} /> Volver a la task
        </Link>
        <span className={styles.crumbSep}>/</span>
        <span className={styles.crumbId}>{taskId}</span>
        {skill && (
          <>
            <span className={styles.crumbSep}>/</span>
            <span className={styles.crumbSkill}>
              <span className={styles.crumbSkillDot} />
              {skill}
            </span>
          </>
        )}
      </div>

      <h1 className={styles.title}>{title}</h1>

      <div className={styles.frontmatter}>
        {ideaId && (
          <span className={styles.fmItem}>
            <span className={styles.fmLabel}>Idea</span>
            <span className={`${styles.fmVal} ${styles.fmValMono}`}>{ideaId}</span>
          </span>
        )}
        {ideaId && owner && <span className={styles.fmSep} />}
        {owner && (
          <span className={styles.fmItem}>
            <span className={styles.fmLabel}>Owner</span>
            <span className={styles.fmVal}>
              {ownerInitials && <span className={styles.avatarSm}>{ownerInitials}</span>}
              {owner}
            </span>
          </span>
        )}
        {(owner || ideaId) && scheduled && <span className={styles.fmSep} />}
        {scheduled && (
          <span className={styles.fmItem}>
            <span className={styles.fmLabel}>Programado</span>
            <span className={styles.fmVal}>
              <Icon name="flag" size={12} />
              {scheduled}
            </span>
          </span>
        )}
      </div>

      {banner}
      {stepper}
    </div>
  );
}
