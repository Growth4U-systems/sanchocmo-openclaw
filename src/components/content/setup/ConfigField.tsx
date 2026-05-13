"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ConfigSource } from "@/hooks/useContentConfig";

/**
 * Tri-state row used by the Content Setup panels. Visuals follow the Sancho
 * Comic v2 system used elsewhere in `Engine > Configuración` (rounded-sc-*,
 * inline `var(--sc-*)` tokens, `font-heading uppercase tracking-wider`,
 * `sc-pop-hover` on buttons).
 *
 *   ✓ Brand-book — value derived from brand-book/visual-identity, read-only
 *                   until the user clicks "Override".
 *   ✏️ Custom    — value lives in `content/config.json`. Editable; "Resetear"
 *                   wipes it and we fall through to brand-book.
 *   ⚠ Falta      — neither source has a value. Shows the pending help text +
 *                   inline editor.
 */

export interface ConfigFieldProps {
  label: string;
  hint?: ReactNode;
  source: ConfigSource;
  /** Display value for "auto-detected" / "custom" states (already formatted). */
  display: ReactNode;
  /** Pre-fill for the input when editing. Empty string when none. */
  inputValue: string;
  inputType?: "text" | "color" | "url";
  inputPlaceholder?: string;
  pendingHelp?: ReactNode;
  saving?: boolean;
  /** Fired with the new override value (always a string here; parent coerces). */
  onSave: (value: string) => void;
  /** Fired when the user wants to clear the override and fall through. */
  onReset: () => void;
}

const SC_INK = "var(--sc-ink)";
const SC_PAPER_3 = "var(--sc-paper-3)";

export function ConfigField({
  label,
  hint,
  source,
  display,
  inputValue,
  inputType = "text",
  inputPlaceholder,
  pendingHelp,
  saving = false,
  onSave,
  onReset,
}: ConfigFieldProps) {
  const [editing, setEditing] = useState(source === "default");
  const [draft, setDraft] = useState(inputValue);

  useEffect(() => {
    setDraft(inputValue);
    if (source !== "default") setEditing(false);
  }, [inputValue, source]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          className="font-heading uppercase text-[11px] tracking-wider font-bold"
          style={{ color: "var(--sc-fg-muted)" }}
        >
          {label}
        </label>
        <Badge source={source} />
      </div>
      {hint && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--sc-fg-soft)" }}>
          {hint}
        </p>
      )}

      {!editing && source !== "default" ? (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 min-w-0 px-3 py-2 rounded-sc-md border-2 text-sm font-mono"
            style={{
              background: SC_PAPER_3,
              borderColor: SC_INK,
              color: "var(--sc-ink)",
              boxShadow: "var(--pop-xs)",
            }}
          >
            {display}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover shrink-0"
            style={{ background: SC_PAPER_3, borderColor: SC_INK, color: "var(--sc-ink)" }}
          >
            ✏️ Override
          </button>
          {source === "override" && (
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover shrink-0 disabled:opacity-50"
              style={{ background: SC_PAPER_3, borderColor: SC_INK, color: "var(--sc-ink)" }}
              title="Volver al valor del brand-book"
            >
              ↺
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {source === "default" && pendingHelp && (
            <div
              className="text-xs leading-relaxed px-3 py-2 rounded-sc-md border-2 border-dashed"
              style={{
                background: "var(--sc-sun-50)",
                borderColor: "var(--sc-ink)",
                color: "var(--sc-fg-soft)",
              }}
            >
              {pendingHelp}
            </div>
          )}
          <div className="flex items-center gap-2">
            {inputType === "color" ? (
              <ColorEditor value={draft} onChange={setDraft} />
            ) : (
              <input
                type={inputType}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={inputPlaceholder}
                className="flex-1 min-w-0 px-3 py-2 rounded-sc-md border-2 text-sm focus:outline-none"
                style={{
                  background: SC_PAPER_3,
                  borderColor: SC_INK,
                  color: "var(--sc-ink)",
                  boxShadow: "var(--pop-xs)",
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
              disabled={saving || draft === inputValue}
              className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover shrink-0 disabled:opacity-50"
              style={{
                background: "var(--sc-rust-500)",
                borderColor: SC_INK,
                color: SC_PAPER_3,
              }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {source !== "default" && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(inputValue);
                }}
                className="font-heading uppercase text-[11px] tracking-wider px-2.5 py-1.5 rounded-sc-md border-2 sc-pop-hover shrink-0"
                style={{ background: SC_PAPER_3, borderColor: SC_INK, color: "var(--sc-ink)" }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ source }: { source: ConfigSource }) {
  const cfg = {
    "brand-book": { bg: "var(--sc-sage-100)", color: "var(--sc-ink)", label: "✓ Brand-book" },
    override: { bg: "var(--sc-rust-100)", color: "var(--sc-ink)", label: "✏️ Custom" },
    default: { bg: "var(--sc-sun-100)", color: "var(--sc-ink)", label: "⚠ Falta" },
  } as const;
  const c = cfg[source];
  return (
    <span
      className="font-heading uppercase text-[10px] tracking-wider px-2 py-1 rounded-sc-pill border-2"
      style={{
        background: c.bg,
        color: c.color,
        borderColor: SC_INK,
        boxShadow: "var(--pop-xs)",
      }}
    >
      {c.label}
    </span>
  );
}

function ColorEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="flex gap-2 items-center flex-1">
      <input
        type="color"
        value={isValidHex ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="w-11 h-10 rounded-sc-md border-2 cursor-pointer shrink-0"
        style={{ borderColor: SC_INK, boxShadow: "var(--pop-xs)" }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#032149"
        className="flex-1 min-w-0 px-3 py-2 rounded-sc-md border-2 text-sm font-mono focus:outline-none"
        style={{
          background: SC_PAPER_3,
          borderColor: SC_INK,
          color: "var(--sc-ink)",
          boxShadow: "var(--pop-xs)",
        }}
      />
    </div>
  );
}
