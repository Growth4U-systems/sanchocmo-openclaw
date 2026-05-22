"use client";

import { Modal } from "@/components/shared/modal";
import type { ErrorDetail, ErrorCategory } from "@/lib/data/mc-chat";

const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  rate_limit: "Rate limit alcanzado",
  auth: "Credenciales no configuradas",
  context_overflow: "Contexto demasiado largo",
  watchdog_abort: "Sesión sin progreso (timeout)",
  model_unavailable: "Modelo no disponible",
  network: "Error de red",
};

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

interface ErrorDetailModalProps {
  open: boolean;
  onClose: () => void;
  detail: ErrorDetail | null;
}

export function ErrorDetailModal({ open, onClose, detail }: ErrorDetailModalProps) {
  if (!detail) return null;
  const label = CATEGORY_LABEL[detail.category] ?? detail.category;
  return (
    <Modal open={open} onClose={onClose} title={`⚠️ ${label}`} size="lg">
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Clasificado: {formatTimestamp(detail.classifiedAt)}
        </div>

        {(detail.provider || detail.account || detail.model || detail.correlatedWith) && (
          <div className="flex flex-wrap gap-1.5">
            {detail.provider && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#45475a]/60 text-[#cdd6f4]">
                provider · {detail.provider}
              </span>
            )}
            {detail.account && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#45475a]/60 text-[#cdd6f4]">
                cuenta · {detail.account}
              </span>
            )}
            {detail.model && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#45475a]/60 text-[#cdd6f4]">
                modelo · {detail.model}
              </span>
            )}
            {detail.correlatedWith && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
                correlacionado con · {CATEGORY_LABEL[detail.correlatedWith] ?? detail.correlatedWith}
              </span>
            )}
          </div>
        )}

        <pre className="text-[11px] leading-relaxed bg-[#1E1E2E] text-[#cdd6f4] p-3 rounded-md max-h-[60vh] overflow-auto whitespace-pre-wrap break-words border border-[#45475a]/60">
          {detail.raw}
        </pre>
      </div>
    </Modal>
  );
}
