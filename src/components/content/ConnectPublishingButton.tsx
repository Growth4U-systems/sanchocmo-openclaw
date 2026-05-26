"use client";

import { useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";
import { ConfigSheet } from "@/components/content/config/ConfigSheet";
import { cn } from "@/lib/utils";

/**
 * Reusable button + slide-over for connecting a publishing tool (Metricool
 * by default). Wraps the standalone `ApiConnectPanel`.
 *
 * The slide-over uses `ConfigSheet` so the close button (X), header, and
 * width match the rest of the Engine > Configuración panels.
 *
 * Used in:
 *   - PublishBar.tsx (sticky footer of draft editor)
 *   - PostingCalendarTab.tsx (empty state when no provider configured)
 */
export function ConnectPublishingButton({
  slug,
  apiId = "metricool",
  providerLabel = "Metricool",
  variant = "warning",
  className,
  children,
}: {
  slug: string;
  apiId?: string;
  providerLabel?: string;
  variant?: "warning" | "primary" | "ghost";
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const close = () => {
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["api-health"] });
    qc.invalidateQueries({ queryKey: ["publishProviders"] });
  };

  const variantClass =
    variant === "warning"
      ? "bg-[#FFFBEB] border border-[#FCD34D] text-[#92400E] hover:bg-[#FEF3C7]"
      : variant === "primary"
      ? "bg-rust border-2 border-ink text-white shadow-comic hover:opacity-90"
      : "border border-border text-foreground hover:bg-muted";

  const label = children ?? `⚠️ Conectar ${providerLabel}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
          variantClass,
          className,
        )}
      >
        {label}
      </button>

      <ConfigSheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} icon="🔌" title={`Conectar ${providerLabel}`}>
        <ApiConnectPanel
          slug={slug}
          apiId={apiId}
          onClose={close}
        />
      </ConfigSheet>
    </>
  );
}
