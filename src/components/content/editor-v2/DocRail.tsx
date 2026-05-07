import * as React from "react";
import { Icon } from "./icons";
import styles from "./editor-v2.module.css";

export interface RailDoc {
  id: string;        // routes to /draft/[channel]
  label: string;
  done: boolean;
}

export interface RailOutput {
  id: string;
  label: string;
  active: boolean;   // currently selected via URL
  live?: boolean;    // optional: in-progress generation
}

interface DocRailProps {
  documents: RailDoc[];
  outputs: RailOutput[];
  activeDocId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onDocClick: (id: string) => void;
  onOutputClick: (id: string) => void;
  onAddOutput: () => void;
}

export function DocRail({
  documents,
  outputs,
  activeDocId,
  collapsed,
  onToggle,
  onDocClick,
  onOutputClick,
  onAddOutput,
}: DocRailProps) {
  return (
    <aside className={`${styles.rail} ${collapsed ? styles.collapsed : ""}`}>
      <button
        type="button"
        className={styles.railToggle}
        onClick={onToggle}
        title={collapsed ? "Expandir" : "Colapsar"}
        aria-label={collapsed ? "Expandir" : "Colapsar"}
      >
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={12} />
      </button>

      {documents.length > 0 && (
        <div className={styles.railSection}>
          <div className={styles.railHeader}>{collapsed ? "DOC" : "Documentos"}</div>
          <div className={styles.railList}>
            {documents.map((d) => {
              const isActive = activeDocId === d.id;
              return (
                <button
                  type="button"
                  key={d.id}
                  className={`${styles.railItem} ${isActive ? styles.railItemActive : ""} ${d.done ? styles.railItemDone : ""}`}
                  onClick={() => onDocClick(d.id)}
                  title={d.label}
                >
                  <span className={styles.railStatus}>
                    {d.done ? (
                      <Icon name="check" size={10} />
                    ) : (
                      <span className={styles.railEmptyDot} />
                    )}
                  </span>
                  <span className={styles.railLabel}>{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.railSection}>
        <div className={styles.railHeader}>
          {collapsed ? "OUT" : "Outputs"}
          {!collapsed && (
            <button
              type="button"
              className={styles.railAdd}
              title="Editar canales"
              onClick={onAddOutput}
            >
              <Icon name="plus" size={11} />
            </button>
          )}
        </div>
        <div className={styles.railList}>
          {outputs.length === 0 && !collapsed && (
            <div
              style={{
                fontSize: 11,
                color: "#6B5044",
                padding: "6px 8px",
                fontStyle: "italic",
              }}
            >
              Sin canales
            </div>
          )}
          {outputs.map((o) => {
            const isActive = activeDocId === o.id;
            return (
              <button
                type="button"
                key={o.id}
                className={`${styles.railItem} ${styles.railOutput} ${isActive ? styles.railItemActive : ""}`}
                onClick={() => onOutputClick(o.id)}
                title={o.label + (o.live ? " (en curso)" : "")}
              >
                <span className={styles.railStatus}>
                  {o.live ? (
                    <span className={styles.railPulse} />
                  ) : (
                    <span className={styles.railEmptyDot} />
                  )}
                </span>
                <span className={styles.railLabel}>{o.label}</span>
                {o.live && !collapsed && <span className={styles.railTag}>EN CURSO</span>}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
