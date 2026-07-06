"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "warning" | "primary";
type Size = "sm" | "md";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Defaults to "Editar →". Pass a custom label only when the action is genuinely different (e.g. "Conectar"). */
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
}

const VARIANT_STYLE: Record<Variant, { background: string; color: string; borderColor: string }> = {
  default: {
    background: "var(--sc-paper-3)",
    color: "var(--sc-ink)",
    borderColor: "var(--sc-ink)",
  },
  warning: {
    background: "var(--sc-rust-100)",
    color: "var(--sc-ink)",
    borderColor: "var(--sc-ink)",
  },
  primary: {
    background: "var(--sc-rust-500)",
    color: "var(--sc-paper-3)",
    borderColor: "var(--sc-ink)",
  },
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "text-[11px] px-2.5 py-1",
  md: "text-[12px] px-3 py-1.5",
};

export function EditButton({
  children = "Editar →",
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...rest
}: Props) {
  const v = VARIANT_STYLE[variant];
  return (
    <button
      type={type}
      className={cn(
        "font-heading uppercase tracking-wider rounded border-2 sc-pop-hover disabled:opacity-50 disabled:pointer-events-none flex-shrink-0",
        SIZE_CLASS[size],
        className,
      )}
      style={{
        background: v.background,
        color: v.color,
        borderColor: v.borderColor,
        boxShadow: "var(--pop-xs)",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
