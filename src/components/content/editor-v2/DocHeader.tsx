import * as React from "react";
import { Icon } from "./icons";
import styles from "./editor-v2.module.css";

interface DocHeaderProps {
  title: string;
  path: string;
  /** Omit to hide the Edit button entirely (e.g. on the Media tab). */
  onEdit?: () => void;
  editLabel?: string;
  onHistory?: () => void;
  /** Defer / Discard menu — only shown when not in a terminal state. */
  onDefer?: () => void;
  onDiscard?: () => void;
}

export function DocHeader({
  title,
  path,
  onEdit,
  editLabel = "Editar",
  onHistory,
  onDefer,
  onDiscard,
}: DocHeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className={styles.dochead}>
      <div className={styles.docheadRow1}>
        <div className={styles.docheadTitleWrap}>
          <h2 className={styles.docheadTitle}>{title}</h2>
          <span className={styles.docheadPath}>{path}</span>
        </div>
        <div className={styles.docheadActions}>
          {onHistory && (
            <button type="button" className={styles.actBtn} onClick={onHistory} title="Historial">
              <Icon name="history" size={14} /> Historial
            </button>
          )}
          {onEdit && (
            <button type="button" className={styles.actBtn} onClick={onEdit} title={editLabel}>
              <Icon name="edit" size={14} /> {editLabel}
            </button>
          )}
          {(onDefer || onDiscard) && (
            <div className={styles.actMore}>
              <button
                type="button"
                className={`${styles.actBtn} ${styles.actBtnMore}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Más acciones"
                title="Más acciones"
              >
                <Icon name="more" size={14} />
              </button>
              {menuOpen && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className={styles.actMenu}>
                    {onDefer && (
                      <button
                        type="button"
                        className={styles.actMenuItem}
                        onClick={() => {
                          setMenuOpen(false);
                          onDefer();
                        }}
                      >
                        ⏸ Aplazar
                      </button>
                    )}
                    {onDiscard && (
                      <button
                        type="button"
                        className={`${styles.actMenuItem} ${styles.actMenuItemDanger}`}
                        onClick={() => {
                          setMenuOpen(false);
                          onDiscard();
                        }}
                      >
                        🗑 Descartar
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
