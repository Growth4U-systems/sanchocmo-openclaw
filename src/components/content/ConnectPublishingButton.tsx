"use client";

import { useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiConnectPanel } from "@/components/settings/api-connect-panel";
import { PublishingAccountInfo } from "@/components/content/PublishingAccountInfo";
import { cn } from "@/lib/utils";

/**
 * Reusable button + slide-over for connecting a publishing tool (Metricool
 * by default). Wraps the standalone `ApiConnectPanel` so any view that needs
 * "Conecta tu publishing tool" can drop this in without re-implementing the
 * slider chrome or routing to admin.
 *
 * Used in:
 *   - PublishBar.tsx (sticky footer of draft editor)
 *   - PostingCalendarTab.tsx (empty state when no provider configured)
 *   - EngineTab.tsx (Setup Configurations section)
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-[640px] h-full bg-card shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-heading text-base text-navy">
                🔌 Conectar {providerLabel}
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <ApiConnectPanel slug={slug} apiId={apiId} onClose={close} />
              {apiId === "metricool" && (
                <div className="px-4 pb-4">
                  <PublishingAccountInfo slug={slug} variant="full" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
