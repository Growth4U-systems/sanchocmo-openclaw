"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/shared/modal";
import type { ErrorDetail, ErrorCategory } from "@/lib/data/mc-chat";
import { consoleUrlFor, consoleLabelFor } from "@/lib/provider-console";
import { providerDisplayName } from "@/lib/provider-auth-display";

const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  insufficient_quota: "API key OpenAI sin cuota",
  anthropic_billing: "Saldo del proveedor agotado",
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
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  if (!detail) return null;
  const label = CATEGORY_LABEL[detail.category] ?? detail.category;
  // Engine CTA: only for limit/auth/quota/billing failures, and only for admins
  // (the engine and its accounts live in the admin-only Runtime/Motor surface).
  const showEngineCta =
    isAdmin &&
    (detail.category === "rate_limit" ||
      detail.category === "auth" ||
      detail.category === "insufficient_quota" ||
      detail.category === "anthropic_billing");
  // A missing/invalid key or an exhausted quota/balance points at the API-key /
  // billing console; a plain `rate_limit` is most likely the subscription (the
  // engine is subscription-first), so default that one to the subscription console.
  const consoleRoute = detail.category === "rate_limit" ? undefined : "api";
  const consoleUrl = detail.provider ? consoleUrlFor(detail.provider, consoleRoute) : null;
  const consoleHost = detail.provider ? consoleLabelFor(detail.provider, consoleRoute) : null;
  return (
    <Modal open={open} onClose={onClose} title={`⚠️ ${label}`} size="lg">
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Clasificado: {formatTimestamp(detail.classifiedAt)}
        </div>

        {(detail.provider || detail.account || detail.model || detail.authMode || detail.anthropicAuthMode || detail.correlatedWith) && (
          <div className="flex flex-wrap gap-1.5">
            {detail.provider && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chat-surface-2)] text-[var(--chat-text)]">
                provider · {detail.provider}
              </span>
            )}
            {detail.account && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chat-surface-2)] text-[var(--chat-text)]">
                cuenta · {detail.account}
              </span>
            )}
            {detail.model && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chat-surface-2)] text-[var(--chat-text)]">
                modelo · {detail.model}
              </span>
            )}
            {detail.authMode && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chat-surface-2)] text-[var(--chat-text)]">
                OpenAI auth · {detail.authMode}
              </span>
            )}
            {detail.anthropicAuthMode && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--chat-surface-2)] text-[var(--chat-text)]">
                Anthropic auth · {detail.anthropicAuthMode}
              </span>
            )}
            {detail.correlatedWith && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
                correlacionado con · {CATEGORY_LABEL[detail.correlatedWith] ?? detail.correlatedWith}
              </span>
            )}
          </div>
        )}

        {showEngineCta && (
          <div className="rounded-md border-2 border-[var(--chat-link)] bg-[var(--chat-surface-2)] px-3 py-2.5 space-y-2">
            <p className="text-xs leading-relaxed text-[var(--chat-text)]">
              {detail.provider ? (
                <>
                  El motor usa <strong>{providerDisplayName(detail.provider)}</strong> y alcanzó su límite o no tiene
                  credencial. Revisa la cuenta o cambia de motor:
                </>
              ) : (
                <>El motor alcanzó su límite o le falta credencial. Revisa la cuenta o cambia de motor:</>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {consoleUrl && (
                <a
                  href={consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--chat-link)] px-2.5 py-1 text-[11px] font-semibold text-[var(--chat-link)] hover:bg-[var(--chat-link)] hover:text-white transition-colors"
                >
                  🔗 Abrir consola{consoleHost ? ` (${consoleHost})` : ""}
                </a>
              )}
              <Link
                href="/dashboard/admin/settings?tab=apis&cat=runtime"
                onClick={onClose}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--chat-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--chat-text)] hover:bg-[var(--chat-surface)] transition-colors"
              >
                🚂 Cambiar motor →
              </Link>
            </div>
          </div>
        )}

        <pre className="text-[11px] leading-relaxed bg-[var(--chat-bg)] text-[var(--chat-text)] p-3 rounded-md max-h-[60vh] overflow-auto whitespace-pre-wrap break-words border border-[var(--chat-border)]">
          {detail.raw}
        </pre>
      </div>
    </Modal>
  );
}
