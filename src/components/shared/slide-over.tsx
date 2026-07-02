/** Right-side slide-over panel overlay with backdrop, sticky header, and action slots. */

"use client";

import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  width?: string;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function SlideOver({
  open,
  onClose,
  width,
  title,
  children,
  actions,
}: SlideOverProps) {
  const { sidebarOpen, isFullscreen } = useChatStore((state) => ({
    sidebarOpen: state.sidebarOpen,
    isFullscreen: state.isFullscreen,
  }));
  const offsetForChat = sidebarOpen && !isFullscreen;

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full bg-white border-l border-[#E8E2D9] overflow-y-auto shadow-xl",
          "transform transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          width ?? "w-[75vw] max-w-3xl",
        )}
        style={
          offsetForChat
            ? {
                right: "min(380px, 35vw)",
                maxWidth: "calc(100vw - min(380px, 35vw) - 16px)",
              }
            : undefined
        }
      >
        {/* Header */}
        {(title || actions) && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-white border-b border-[#E8E2D9] px-6 py-4">
            {title && (
              <h2 className="text-lg font-semibold text-foreground truncate">
                {title}
              </h2>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {actions}
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
